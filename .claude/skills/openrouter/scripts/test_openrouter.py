"""Offline tests for openrouter.py against a local mock HTTP server.

Run: python3 -m unittest discover -s .claude/skills/openrouter/scripts -v
No network access and no real key are needed.
"""

from __future__ import annotations

import base64
import importlib.util
import io
import json
import os
import shutil
import re
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import unittest
import wave
from contextlib import ExitStack, redirect_stderr, redirect_stdout
from email.utils import format_datetime
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from unittest import mock
from urllib.parse import parse_qs, urlsplit

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "openrouter.py"
_spec = importlib.util.spec_from_file_location("openrouter_cli", str(SCRIPT))
orcli = importlib.util.module_from_spec(_spec)
sys.modules["openrouter_cli"] = orcli  # dataclasses look their module up while it executes
assert _spec.loader is not None  # spec_from_file_location always sets a loader for .py files
_spec.loader.exec_module(orcli)

FAKE_KEY = "sk-or-v1-" + "0123456789abcdef" * 4
PROXY_VARS = ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy")
TTS_MODEL = "openai/gpt-4o-mini-tts-2025-12-15"
STT_MODEL = "openai/whisper-large-v3"

# --------------------------------------------------------------------------
# Mock server
# --------------------------------------------------------------------------

Reply = Tuple[int, Dict[str, str], bytes]


@dataclass
class Seen:
    method: str
    path: str
    query: Dict[str, List[str]]
    headers: Dict[str, str]
    body: bytes

    def json(self) -> Any:
        return json.loads(self.body.decode("utf-8"))


def json_reply(obj: Any, status: int = 200, headers: Optional[Dict[str, str]] = None) -> Reply:
    merged = {"Content-Type": "application/json"}
    merged.update(headers or {})
    return status, merged, json.dumps(obj).encode("utf-8")


def raw_reply(
    body: bytes, content_type: str, status: int = 200, headers: Optional[Dict[str, str]] = None
) -> Reply:
    merged = {"Content-Type": content_type}
    merged.update(headers or {})
    return status, merged, body


def error_reply(
    status: int,
    message: str,
    metadata: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
) -> Reply:
    error: Dict[str, Any] = {"code": status, "message": message}
    if metadata:
        error["metadata"] = metadata
    return json_reply({"error": error}, status, headers)


class MockOpenRouter:
    """Serves queued replies per (method, path) and records every request."""

    def __init__(self) -> None:
        self.routes: Dict[Tuple[str, str], List[Any]] = {}
        self.seen: List[Seen] = []
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), self._handler_class())
        self.thread = threading.Thread(
            target=self.server.serve_forever, kwargs={"poll_interval": 0.02}, daemon=True
        )
        self.thread.start()
        self.base_url = "http://127.0.0.1:{}/api/v1".format(self.server.server_address[1])

    def add(self, method: str, path: str, *replies: Any) -> None:
        """Replies are Reply tuples or callables(Seen) -> Reply; the last one repeats."""
        self.routes[(method, "/api/v1" + path)] = list(replies)

    def requests_to(self, path: str) -> List[Seen]:
        return [s for s in self.seen if s.path == "/api/v1" + path]

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()

    def _reply(self, seen: Seen) -> Reply:
        self.seen.append(seen)
        queue = self.routes.get((seen.method, seen.path))
        if not queue:
            return error_reply(404, "no mock route for {} {}".format(seen.method, seen.path))
        reply = queue.pop(0) if len(queue) > 1 else queue[0]
        return reply(seen) if callable(reply) else reply

    def _handler_class(self) -> type:
        mock_server = self

        class Handler(BaseHTTPRequestHandler):
            def _handle(self) -> None:
                parts = urlsplit(self.path)
                length = int(self.headers.get("Content-Length") or 0)
                seen = Seen(
                    self.command,
                    parts.path,
                    parse_qs(parts.query),
                    {k.lower(): v for k, v in self.headers.items()},
                    self.rfile.read(length) if length else b"",
                )
                status, headers, body = mock_server._reply(seen)
                self.send_response(status)
                for name, value in headers.items():
                    self.send_header(name, value)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            do_GET = _handle
            do_POST = _handle

            def log_message(self, *args: Any) -> None:  # keep test output clean
                pass

        return Handler


# --------------------------------------------------------------------------
# Test base
# --------------------------------------------------------------------------


@dataclass
class Run:
    code: int
    out: str
    err: str


class CliTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.mock = MockOpenRouter()
        self.addCleanup(self.mock.close)
        self.tmp = Path(tempfile.mkdtemp(prefix="or-test-"))
        self.addCleanup(shutil.rmtree, str(self.tmp), True)
        env = mock.patch.dict(
            os.environ,
            {
                "OPENROUTER_API_KEY": FAKE_KEY,
                "OPENROUTER_BASE_URL": self.mock.base_url,
                "NO_PROXY": "*",
                "no_proxy": "*",
            },
        )
        env.start()
        self.addCleanup(env.stop)
        for name in PROXY_VARS:
            os.environ.pop(name, None)
        self.secrets: List[str] = [FAKE_KEY, FAKE_KEY[10:30]]
        self.sleeps: List[float] = []
        sleeper = mock.patch.object(orcli, "sleep", side_effect=self.sleeps.append)
        sleeper.start()
        self.addCleanup(sleeper.stop)
        orcli._MODEL_CACHE.clear()

    def run_cli(self, *argv: Any, stdin: Optional[str] = None) -> Run:
        out, err = io.StringIO(), io.StringIO()
        with ExitStack() as stack:
            stack.enter_context(redirect_stdout(out))
            stack.enter_context(redirect_stderr(err))
            if stdin is not None:
                stack.enter_context(mock.patch.object(sys, "stdin", io.StringIO(stdin)))
            code = orcli.main([str(a) for a in argv])
        result = Run(code, out.getvalue(), err.getvalue())
        self.assert_no_secret(result)
        return result

    def assert_no_secret(self, result: Run) -> None:
        """No form of the key in stdout/stderr, nor in any file the CLI wrote under tmp."""
        forms = set(self.secrets)
        for secret in self.secrets:
            forms.update({repr(secret)[1:-1], json.dumps(secret)[1:-1]})
        for stream in (result.out, result.err):
            for form in forms:
                self.assertNotIn(form, stream)
            self.assertNotIn("Traceback", stream)
        for path in self.tmp.rglob("*"):
            if path.is_file():
                data = path.read_bytes()
                for form in forms:
                    self.assertNotIn(form.encode("utf-8"), data, str(path))

    def write_manifest(self, clips: List[Dict[str, Any]], name: str = "lines.json") -> Path:
        path = self.tmp / name
        path.write_text(json.dumps(clips, ensure_ascii=False), encoding="utf-8")
        return path


def pcm_reply(
    nbytes: int = 480,
    content_type: str = "audio/pcm;rate=24000;channels=1",
    gen_id: str = "gen-tts-1",
) -> Reply:
    return raw_reply(b"\x01\x00" * (nbytes // 2), content_type, headers={"X-Generation-Id": gen_id})


def speech_models_reply(seen: Seen) -> Reply:
    return json_reply(
        {
            "data": [
                {
                    "id": TTS_MODEL,
                    "name": "GPT-4o mini TTS",
                    "supported_voices": ["alloy", "ash", "nova"],
                    "pricing": {"prompt": "0.000015", "completion": "0"},
                }
            ]
        }
    )


# --------------------------------------------------------------------------
# key / models / voices
# --------------------------------------------------------------------------


class KeyAndModelsTests(CliTestCase):
    def test_key_info_shows_limits_but_never_the_key(self) -> None:
        self.mock.add(
            "GET",
            "/key",
            json_reply(
                {
                    "data": {
                        "label": "sk-or-v1-au7...890",
                        "limit": 10,
                        "limit_remaining": 7.5,
                        "limit_reset": "monthly",
                        "usage": 2.5,
                        "usage_daily": 0.25,
                        "usage_weekly": 1,
                        "usage_monthly": 2.5,
                        "is_free_tier": False,
                        "expires_at": None,
                    }
                }
            ),
        )
        run = self.run_cli("key")
        self.assertEqual(run.code, 0, run.err)
        for text in (
            "sk-or-v1-au7...890",
            "$10.00 (resets monthly)",
            "$7.50",
            "$0.25 today",
            "$2.50 this month",
            "is_free_tier:",
            "False",
            "never",
        ):
            self.assertIn(text, run.out)
        seen = self.mock.requests_to("/key")[0]
        self.assertEqual(seen.headers["authorization"], "Bearer " + FAKE_KEY)
        self.assertEqual(seen.headers["x-openrouter-title"], "Claude openrouter skill")

    def test_key_without_limit_suggests_setting_one(self) -> None:
        self.mock.add("GET", "/key", json_reply({"data": {"label": "ci", "limit": None}}))
        run = self.run_cli("key")
        self.assertIn("set a small credit limit", run.out)

    def test_models_sends_filters_and_prints_table(self) -> None:
        self.mock.add("GET", "/models", speech_models_reply)
        run = self.run_cli("models", "--output", "speech", "--input", "text", "--q", "tts")
        self.assertEqual(run.code, 0, run.err)
        query = self.mock.requests_to("/models")[0].query
        self.assertEqual(
            query, {"output_modalities": ["speech"], "input_modalities": ["text"], "q": ["tts"]}
        )
        self.assertIn(TTS_MODEL, run.out)
        self.assertRegex(run.out, r"openai/gpt-4o-mini-tts-2025-12-15\s+3\s+prompt=0.000015")

    def test_models_without_filters_sends_no_query(self) -> None:
        self.mock.add("GET", "/models", json_reply({"data": []}))
        self.assertEqual(self.run_cli("models").code, 0)
        self.assertEqual(self.mock.requests_to("/models")[0].query, {})

    def test_voices_falls_back_to_all_models(self) -> None:
        def reply(seen: Seen) -> Reply:
            if seen.query.get("output_modalities") == ["all"]:
                return json_reply(
                    {"data": [{"id": "fish-audio/s1", "supported_voices": ["v1", "v2"]}]}
                )
            return json_reply({"data": []})

        self.mock.add("GET", "/models", reply)
        run = self.run_cli("voices", "fish-audio/s1")
        self.assertEqual(run.code, 0, run.err)
        self.assertEqual(run.out.split(), ["v1", "v2"])
        asked = [s.query["output_modalities"][0] for s in self.mock.requests_to("/models")]
        self.assertEqual(asked, ["speech", "all"])

    def test_endpoints_lists_capabilities(self) -> None:
        self.mock.add(
            "GET",
            "/models/fish-audio/s2.1-pro/endpoints",
            json_reply(
                {
                    "data": {
                        "id": "fish-audio/s2.1-pro",
                        "endpoints": [
                            {
                                "provider_name": "Fish Audio",
                                "tag": "fish-audio",
                                "status": 0,
                                "supports_voice_cloning": True,
                                "supports_multiple_audio_references": False,
                                "pricing": {"prompt": "0.000015", "completion": "0"},
                            }
                        ],
                    }
                }
            ),
        )
        run = self.run_cli("endpoints", "fish-audio/s2.1-pro")
        self.assertEqual(run.code, 0, run.err)
        self.assertRegex(run.out, r"Fish Audio\s+fish-audio\s+0\s+voice_cloning\s+prompt=0.000015")
        self.assertEqual(self.run_cli("endpoints", "no-slash").code, 2)

    def test_voices_unknown_model_is_usage_error(self) -> None:
        self.mock.add("GET", "/models", json_reply({"data": []}))
        run = self.run_cli("voices", "nope/nothing")
        self.assertEqual(run.code, 2)
        self.assertIn("not found", run.err)


# --------------------------------------------------------------------------
# tts
# --------------------------------------------------------------------------


class TtsTests(CliTestCase):
    def test_mp3_bytes_written_and_request_shape(self) -> None:
        self.mock.add(
            "POST",
            "/audio/speech",
            raw_reply(b"ID3-fake-mp3", "audio/mpeg", headers={"X-Generation-Id": "gen-tts-42"}),
        )
        out = self.tmp / "clips" / "hello.mp3"
        run = self.run_cli(
            "tts",
            "--model",
            TTS_MODEL,
            "--voice",
            "ash",
            "--text",
            "Môre, Oupa!",
            "--out",
            out,
            "--instructions",
            "warm, dry humour",
            "--speed",
            "0.9",
        )
        self.assertEqual(run.code, 0, run.err)
        self.assertEqual(out.read_bytes(), b"ID3-fake-mp3")
        self.assertIn("gen-tts-42", run.out)
        body = self.mock.requests_to("/audio/speech")[0].json()
        self.assertEqual(
            body,
            {
                "model": TTS_MODEL,
                "input": "Môre, Oupa!",
                "voice": "ash",
                "response_format": "mp3",
                "instructions": "warm, dry humour",
                "speed": 0.9,
            },
        )
        self.assertFalse((out.parent / "hello.mp3.part").exists())

    def test_pcm_wrapped_as_valid_wav_with_rate_and_channels(self) -> None:
        self.mock.add("POST", "/audio/speech", pcm_reply(4000, "audio/pcm;rate=16000;channels=2"))
        out = self.tmp / "line.wav"
        run = self.run_cli(
            "tts",
            "--model",
            "google/gemini-3.8-flash-tts",
            "--text",
            "Hallo.",
            "--out",
            out,
            "--format",
            "pcm",
        )
        self.assertEqual(run.code, 0, run.err)
        with wave.open(str(out)) as wav:
            self.assertEqual(
                (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()), (16000, 2, 2)
            )
            self.assertEqual(wav.getnframes(), 1000)

    def test_wav_out_implies_pcm_with_default_rate(self) -> None:
        self.mock.add("POST", "/audio/speech", pcm_reply(960, "audio/pcm"))
        out = self.tmp / "line.wav"
        run = self.run_cli("tts", "--model", TTS_MODEL, "--text", "Hallo.", "--out", out)
        self.assertEqual(run.code, 0, run.err)
        self.assertEqual(self.mock.requests_to("/audio/speech")[0].json()["response_format"], "pcm")
        with wave.open(str(out)) as wav:
            self.assertEqual((wav.getframerate(), wav.getnchannels()), (24000, 1))
            self.assertEqual(wav.getnframes(), 480)

    def test_format_mismatch_is_usage_error(self) -> None:
        run = self.run_cli(
            "tts",
            "--model",
            TTS_MODEL,
            "--text",
            "x",
            "--format",
            "mp3",
            "--out",
            self.tmp / "x.wav",
        )
        self.assertEqual(run.code, 2)
        self.assertEqual(self.mock.seen, [])

    def test_pcm_only_model_answering_mp3_request_is_explained(self) -> None:
        self.mock.add("POST", "/audio/speech", pcm_reply())
        run = self.run_cli(
            "tts", "--model", "heygen/heygen-voice-1", "--text", "Hi.", "--out", self.tmp / "x.mp3"
        )
        self.assertEqual(run.code, 4)
        self.assertIn("pcm-only", run.err)

    def test_long_text_is_chunked_at_sentences_and_joined(self) -> None:
        sentence = "Die tarentaal hardloop vinnig oor die veld en die oupa lag. "
        text = (sentence * 160).strip()  # 9,759 characters -> 4 chunks of at most 3,000
        self.mock.add("POST", "/audio/speech", pcm_reply(480))
        out = self.tmp / "long.wav"
        run = self.run_cli("tts", "--model", TTS_MODEL, "--text", text, "--out", out)
        self.assertEqual(run.code, 0, run.err)
        inputs = [s.json()["input"] for s in self.mock.requests_to("/audio/speech")]
        self.assertEqual(orcli.TTS_CHUNK_CHARS, 3000)
        self.assertEqual(len(inputs), 4)
        for chunk in inputs:
            self.assertLessEqual(len(chunk), orcli.TTS_CHUNK_CHARS)
            self.assertTrue(chunk.endswith("lag."), chunk[-20:])
        self.assertEqual(" ".join(inputs), text)
        with wave.open(str(out)) as wav:
            self.assertEqual(wav.getnframes(), 4 * 240)

    def test_max_chars_refuses_before_sending(self) -> None:
        run = self.run_cli(
            "tts",
            "--model",
            TTS_MODEL,
            "--text",
            "x" * 50,
            "--max-chars",
            "10",
            "--out",
            self.tmp / "x.mp3",
        )
        self.assertEqual(run.code, 2)
        self.assertIn("--max-chars", run.err)
        self.assertEqual(self.mock.seen, [])

    def test_cost_flag_looks_up_generation(self) -> None:
        self.mock.add(
            "POST",
            "/audio/speech",
            raw_reply(b"ID3", "audio/mpeg", headers={"X-Generation-Id": "gen-tts-9"}),
        )
        self.mock.add("GET", "/generation", json_reply({"data": {"total_cost": 0.00042}}))
        run = self.run_cli(
            "tts", "--model", TTS_MODEL, "--text", "Hi.", "--out", self.tmp / "x.mp3", "--cost"
        )
        self.assertEqual(run.code, 0, run.err)
        self.assertEqual(self.mock.requests_to("/generation")[0].query, {"id": ["gen-tts-9"]})
        self.assertIn("cost: $0.00042", run.out)

    def test_voice_cloning_reference_is_sent_as_input_references(self) -> None:
        ref = self.tmp / "consented.wav"
        ref.write_bytes(b"RIFF-ref")
        self.mock.add("POST", "/audio/speech", raw_reply(b"ID3", "audio/mpeg"))
        run = self.run_cli(
            "tts",
            "--model",
            "fish-audio/s2.1-pro",
            "--text",
            "Hi.",
            "--out",
            self.tmp / "x.mp3",
            "--ref-audio",
            ref,
            "--ref-text",
            "Sample.",
        )
        self.assertEqual(run.code, 0, run.err)
        refs = self.mock.requests_to("/audio/speech")[0].json()["input_references"]
        self.assertEqual(
            refs[0]["input_audio"]["data"],
            "data:audio/wav;base64," + base64.b64encode(b"RIFF-ref").decode(),
        )
        self.assertEqual(refs[1], {"type": "text", "text": "Sample."})
        provider = self.mock.requests_to("/audio/speech")[0].json()["provider"]
        self.assertEqual(provider, {"zdr": True, "data_collection": "deny"})


class SplitTextTests(unittest.TestCase):
    def test_short_text_is_one_chunk(self) -> None:
        self.assertEqual(orcli.split_text("  Hallo daar.  "), ["Hallo daar."])

    def test_long_sentence_without_punctuation_breaks_at_spaces(self) -> None:
        words = ["woord{}".format(i) for i in range(2000)]
        chunks = orcli.split_text(" ".join(words), limit=500)
        self.assertTrue(all(len(c) <= 500 for c in chunks))
        self.assertEqual(" ".join(chunks).split(), words)

    def test_pcm_params(self) -> None:
        self.assertEqual(orcli.pcm_params("audio/pcm;rate=44100;channels=2"), (44100, 2))
        self.assertEqual(orcli.pcm_params("audio/pcm"), (24000, 1))

    def test_retry_after_parsing(self) -> None:
        self.assertEqual(orcli.parse_retry_after("3"), 3.0)
        self.assertIsNone(orcli.parse_retry_after("soon"))
        self.assertIsNone(orcli.parse_retry_after(None))


# --------------------------------------------------------------------------
# stt
# --------------------------------------------------------------------------


class SttTests(CliTestCase):
    def test_request_uses_raw_base64_format_and_language(self) -> None:
        audio = self.tmp / "clip.wav"
        audio.write_bytes(b"RIFF....WAVEfake")
        self.mock.add(
            "POST",
            "/audio/transcriptions",
            json_reply(
                {"text": " Môre, Oupa! ", "usage": {"seconds": 1.5, "cost": 0.0001}},
                headers={"X-Generation-Id": "gen-stt-1"},
            ),
        )
        run = self.run_cli("stt", "--model", STT_MODEL, "--file", audio, "--language", "af")
        self.assertEqual(run.code, 0, run.err)
        self.assertEqual(run.out.strip(), "Môre, Oupa!")
        self.assertIn("cost $0.0001", run.err)
        body = self.mock.requests_to("/audio/transcriptions")[0].json()
        self.assertEqual(
            body,
            {
                "model": STT_MODEL,
                "language": "af",
                "input_audio": {
                    "data": base64.b64encode(b"RIFF....WAVEfake").decode("ascii"),
                    "format": "wav",
                },
            },
        )
        self.assertFalse(body["input_audio"]["data"].startswith("data:"))

    def test_verbose_and_json_output(self) -> None:
        audio = self.tmp / "talk.m4a"
        audio.write_bytes(b"m4a")
        reply = {
            "text": "Hallo",
            "language": "af",
            "duration": 1.2,
            "segments": [{"start": 0, "end": 1.2, "text": "Hallo"}],
            "usage": {"cost": 0},
        }
        self.mock.add("POST", "/audio/transcriptions", json_reply(reply))
        run = self.run_cli("stt", "--model", STT_MODEL, "--file", audio, "--verbose")
        body = self.mock.requests_to("/audio/transcriptions")[0].json()
        self.assertEqual(body["response_format"], "verbose_json")
        self.assertEqual(body["input_audio"]["format"], "m4a")
        self.assertIn("[   0.00 -    1.20] Hallo", run.out)
        run = self.run_cli("stt", "--model", STT_MODEL, "--file", audio, "--json")
        self.assertEqual(json.loads(run.out)["language"], "af")

    def test_unknown_extension_and_missing_file_are_usage_errors(self) -> None:
        odd = self.tmp / "clip.xyz"
        odd.write_bytes(b"x")
        self.assertEqual(self.run_cli("stt", "--model", STT_MODEL, "--file", odd).code, 2)
        self.assertEqual(
            self.run_cli("stt", "--model", STT_MODEL, "--file", self.tmp / "none.wav").code, 2
        )
        self.assertEqual(self.mock.seen, [])

    def test_file_over_25_mb_is_refused(self) -> None:
        big = self.tmp / "big.wav"
        with open(str(big), "wb") as handle:
            handle.truncate(orcli.STT_MAX_BYTES + 1)  # sparse: no real disk use
        run = self.run_cli("stt", "--model", STT_MODEL, "--file", big)
        self.assertEqual(run.code, 2)
        self.assertIn("at most 25 MB", run.err)
        self.assertEqual(self.mock.seen, [])


# --------------------------------------------------------------------------
# batch
# --------------------------------------------------------------------------


class BatchTests(CliTestCase):
    CLIPS = [
        {"id": "oupa_hello_en", "text": "Hello there."},
        {"id": "oupa_more_af", "text": "Môre, Oupa!", "voice": "nova"},
        {"id": "oupa_nag_af", "text": "Goeie nag.", "instructions": "sleepy"},
    ]

    def setUp(self) -> None:
        super().setUp()
        self.out_dir = self.tmp / "clips"
        self.manifest = self.write_manifest(self.CLIPS)
        self.mock.add(
            "POST",
            "/audio/speech",
            lambda seen: raw_reply(
                b"ID3:" + seen.json()["input"].encode("utf-8"),
                "audio/mpeg",
                headers={"X-Generation-Id": "gen-tts-" + str(len(self.mock.seen))},
            ),
        )
        self.mock.add("GET", "/models", speech_models_reply)

    def batch(self, *extra: Any) -> Run:
        return self.run_cli(
            "batch",
            "--manifest",
            self.manifest,
            "--model",
            TTS_MODEL,
            "--voice",
            "alloy",
            "--out-dir",
            self.out_dir,
            *extra,
        )

    def spoken(self) -> List[Dict[str, Any]]:
        return [s.json() for s in self.mock.requests_to("/audio/speech")]

    def test_generates_missing_clips_and_skips_existing(self) -> None:
        self.out_dir.mkdir()
        (self.out_dir / "oupa_hello_en.mp3").write_bytes(b"old")
        run = self.batch()
        self.assertEqual(run.code, 0, run.err)
        bodies = self.spoken()
        self.assertEqual([b["input"] for b in bodies], ["Môre, Oupa!", "Goeie nag."])
        self.assertEqual(bodies[0]["voice"], "nova")
        self.assertEqual(bodies[1]["voice"], "alloy")
        self.assertEqual(bodies[1]["instructions"], "sleepy")
        self.assertEqual((self.out_dir / "oupa_hello_en.mp3").read_bytes(), b"old")
        self.assertEqual((self.out_dir / "oupa_nag_af.mp3").read_bytes(), b"ID3:Goeie nag.")
        self.assertIn("skipping 1 existing", run.out)

    def test_force_regenerates_everything(self) -> None:
        self.out_dir.mkdir()
        (self.out_dir / "oupa_hello_en.mp3").write_bytes(b"old")
        run = self.batch("--force")
        self.assertEqual(run.code, 0, run.err)
        self.assertEqual(len(self.spoken()), 3)
        self.assertEqual((self.out_dir / "oupa_hello_en.mp3").read_bytes(), b"ID3:Hello there.")

    def test_dry_run_counts_and_estimates_without_speaking(self) -> None:
        run = self.batch("--dry-run")
        self.assertEqual(run.code, 0, run.err)
        self.assertEqual(self.spoken(), [])
        chars = sum(len(c["text"]) for c in self.CLIPS)
        self.assertIn("3 clip(s), {} chars".format(chars), run.out)
        self.assertIn("ESTIMATE", run.out)
        self.assertIn("${}".format(round(chars * 0.000015, 8)), run.out)

    def test_dry_run_with_explicit_price_needs_no_network(self) -> None:
        run = self.batch("--dry-run", "--price-per-char", "0.00003")
        self.assertEqual(run.code, 0, run.err)
        self.assertEqual(self.mock.seen, [])
        self.assertIn("--price-per-char", run.out)

    def test_max_chars_stops_before_exceeding(self) -> None:
        run = self.batch("--max-chars", "15")  # 12 chars fit; 12 + 11 would not
        self.assertEqual(run.code, 1)
        self.assertEqual([b["input"] for b in self.spoken()], ["Hello there."])
        self.assertIn("would exceed --max-chars 15", run.err)
        self.assertFalse((self.out_dir / "oupa_more_af.mp3").exists())

    def test_changed_text_is_regenerated_on_the_next_run(self) -> None:
        self.assertEqual(self.batch().code, 0)
        clips = [dict(c) for c in self.CLIPS]
        clips[2]["text"] = "Slaap lekker."
        self.write_manifest(clips)
        run = self.batch()
        self.assertEqual(run.code, 0, run.err)
        self.assertEqual([b["input"] for b in self.spoken()][3:], ["Slaap lekker."])
        self.assertIn("(changed)", run.out)
        state = json.loads((self.tmp / "lines.state.json").read_text(encoding="utf-8"))
        self.assertEqual(state["version"], 2)
        self.assertEqual(state["clips"]["clips/oupa_nag_af.mp3"]["id"], "oupa_nag_af")

    def test_only_selects_clips(self) -> None:
        run = self.batch("--only", "oupa_nag_af")
        self.assertEqual(run.code, 0, run.err)
        self.assertEqual([b["input"] for b in self.spoken()], ["Goeie nag."])
        self.assertEqual(self.batch("--only", "nope").code, 2)

    def test_bad_manifest_is_reported(self) -> None:
        self.write_manifest([{"id": "bad id!", "text": ""}, {"text": 3}])
        run = self.batch()
        self.assertEqual(run.code, 2)
        self.assertIn("manifest problems", run.err)

    def test_fatal_api_error_stops_the_batch(self) -> None:
        self.mock.add(
            "POST",
            "/audio/speech",
            error_reply(402, "Insufficient credits", {"limit_source": "openrouter_key_limit"}),
        )
        run = self.batch()
        self.assertEqual(run.code, 4)
        self.assertEqual(len(self.spoken()), 1)
        self.assertIn("limit_source: openrouter_key_limit", run.err)


# --------------------------------------------------------------------------
# check (round trip)
# --------------------------------------------------------------------------


class CheckTests(CliTestCase):
    HEARD = {"a": "Môre oupa, hoe gaan dit", "b": "Die tarentale loop weg", "d": "Guten Morgen!"}

    def setUp(self) -> None:
        super().setUp()
        self.manifest = self.write_manifest(
            [
                {"id": "a", "text": "Môre, Oupa! Hoe gaan dit?"},
                {"id": "b", "text": "Die tarentaal hardloop weg."},
                {"id": "c", "text": "Waar is my geweer?"},
                {"id": "d", "text": "Guten Morgen.", "language": "de"},
            ]
        )
        for clip_id in ("a", "b", "d"):
            (self.tmp / (clip_id + ".mp3")).write_bytes(("FAKE:" + clip_id).encode())

        def transcribe(seen: Seen) -> Reply:
            data = base64.b64decode(seen.json()["input_audio"]["data"]).decode()
            return json_reply({"text": self.HEARD[data.split(":")[1]], "usage": {"cost": 0}})

        self.mock.add("POST", "/audio/transcriptions", transcribe)

    def test_wer_pass_fail_missing_and_json_report(self) -> None:
        report = self.tmp / "report.json"
        run = self.run_cli(
            "check",
            "--manifest",
            self.manifest,
            "--stt-model",
            STT_MODEL,
            "--language",
            "af",
            "--report",
            report,
        )
        self.assertEqual(run.code, 1)
        data = json.loads(report.read_text(encoding="utf-8"))
        status = {c["id"]: (c["status"], c["wer"]) for c in data["clips"]}
        self.assertEqual(status["a"], ("pass", 0.0))
        self.assertEqual(status["b"], ("fail", 0.5))
        self.assertEqual(status["c"], ("missing", None))
        self.assertEqual(status["d"], ("pass", 0.0))
        self.assertEqual(data["counts"], {"pass": 2, "fail": 1, "missing": 1, "error": 0})
        self.assertIn("2 passed, 1 failed (WER over 0.2), 1 missing, 0 STT errors", run.out)
        languages = [s.json()["language"] for s in self.mock.requests_to("/audio/transcriptions")]
        self.assertEqual(languages, ["af", "af", "de"])
        self.assertIn("--only b --force", run.out)  # WER failure: regenerate after listening
        self.assertRegex(run.out, r"--only c\n")  # missing: plain batch, no --force

    def test_markdown_report_and_all_pass_exit_zero(self) -> None:
        report = self.tmp / "report.md"
        run = self.run_cli(
            "check",
            "--manifest",
            self.manifest,
            "--stt-model",
            STT_MODEL,
            "--only",
            "a,d",
            "--report",
            report,
        )
        self.assertEqual(run.code, 0, run.err)
        text = report.read_text(encoding="utf-8")
        self.assertIn("| a | pass | 0.00 | 0.00 |", text)
        self.assertIn("2 passed, 0 failed, 0 missing, 0 STT errors", text)

    def test_max_wer_threshold(self) -> None:
        run = self.run_cli(
            "check",
            "--manifest",
            self.manifest,
            "--stt-model",
            STT_MODEL,
            "--only",
            "b",
            "--max-wer",
            "0.5",
        )
        self.assertEqual(run.code, 0, run.err)


class WerTests(unittest.TestCase):
    def test_normalise_keeps_diacritics_and_drops_punctuation(self) -> None:
        self.assertEqual(orcli.normalise_text("Sê jy, 'n  Oupa—ja!  Môre?"), "sê jy n oupa ja môre")
        self.assertEqual(orcli.normalise_text("Ê Ë Ô Û"), "ê ë ô û")

    def test_word_error_rate(self) -> None:
        self.assertEqual(orcli.word_error_rate("Hoe gaan dit?", "hoe gaan dit"), 0.0)
        self.assertEqual(orcli.word_error_rate("een twee drie vier", "een twee drie"), 0.25)
        self.assertEqual(orcli.word_error_rate("se", "sê"), 1.0)
        self.assertEqual(orcli.word_error_rate("", ""), 0.0)


# --------------------------------------------------------------------------
# chat / image / cost
# --------------------------------------------------------------------------


class OtherCommandTests(CliTestCase):
    def test_chat_prints_reply(self) -> None:
        self.mock.add(
            "POST",
            "/chat/completions",
            json_reply(
                {
                    "choices": [{"message": {"role": "assistant", "content": "Goeie môre"}}],
                    "usage": {"cost": 0.00001},
                }
            ),
        )
        run = self.run_cli(
            "chat",
            "--model",
            "google/gemini-2.5-flash",
            "--system",
            "Translate.",
            "-",
            stdin="Good morning",
        )
        self.assertEqual(run.code, 0, run.err)
        self.assertEqual(run.out.strip(), "Goeie môre")
        body = self.mock.requests_to("/chat/completions")[0].json()
        self.assertEqual(
            body["messages"],
            [
                {"role": "system", "content": "Translate."},
                {"role": "user", "content": "Good morning"},
            ],
        )

    def test_image_writes_first_image(self) -> None:
        self.mock.add(
            "POST",
            "/images",
            json_reply(
                {
                    "created": 1,
                    "data": [
                        {
                            "b64_json": base64.b64encode(b"\x89PNG-fake").decode(),
                            "media_type": "image/png",
                        }
                    ],
                    "usage": {"cost": 0.04},
                }
            ),
        )
        out = self.tmp / "icon.png"
        run = self.run_cli(
            "image",
            "--model",
            "bytedance-seed/seedream-4.5",
            "--prompt",
            "bird",
            "--out",
            out,
            "--aspect-ratio",
            "1:1",
        )
        self.assertEqual(run.code, 0, run.err)
        self.assertEqual(out.read_bytes(), b"\x89PNG-fake")
        self.assertEqual(self.mock.requests_to("/images")[0].json()["aspect_ratio"], "1:1")

    def test_cost_command(self) -> None:
        self.mock.add(
            "GET",
            "/generation",
            json_reply({"data": {"id": "gen-1", "model": TTS_MODEL, "total_cost": 0.0015}}),
        )
        run = self.run_cli("cost", "gen-1")
        self.assertEqual(run.code, 0, run.err)
        self.assertIn("$0.0015", run.out)


# --------------------------------------------------------------------------
# errors, retries, secrets
# --------------------------------------------------------------------------


class ErrorTests(CliTestCase):
    def test_401_message_and_exit_code(self) -> None:
        self.mock.add("GET", "/key", error_reply(401, "User not found."))
        run = self.run_cli("key")
        self.assertEqual(run.code, 4)
        self.assertIn("HTTP 401: User not found.", run.err)
        self.assertIn("https://openrouter.ai/keys", run.err)
        self.assertEqual(len(self.mock.seen), 1)

    def test_402_shows_limit_source_and_is_not_retried(self) -> None:
        self.mock.add(
            "GET",
            "/key",
            error_reply(402, "Key limit exceeded", {"limit_source": "openrouter_key_limit"}),
        )
        run = self.run_cli("key")
        self.assertEqual(run.code, 4)
        self.assertIn("HTTP 402: Key limit exceeded (limit_source: openrouter_key_limit)", run.err)
        self.assertEqual(len(self.mock.seen), 1)

    def test_429_retried_with_retry_after_then_succeeds(self) -> None:
        self.mock.add(
            "GET",
            "/key",
            error_reply(429, "Rate limited", headers={"Retry-After": "2"}),
            json_reply({"data": {"label": "ok-key"}}),
        )
        run = self.run_cli("key")
        self.assertEqual(run.code, 0, run.err)
        self.assertEqual(self.sleeps, [2.0])
        self.assertEqual(len(self.mock.seen), 2)
        self.assertIn("ok-key", run.out)

    def test_in_flight_402_is_retried(self) -> None:
        self.mock.add(
            "GET",
            "/key",
            error_reply(
                402,
                "busy",
                {"limit_source": "openrouter_in_flight_budget"},
                headers={"Retry-After": "1"},
            ),
            json_reply({"data": {"label": "ok-key"}}),
        )
        run = self.run_cli("key")
        self.assertEqual(run.code, 0, run.err)
        self.assertEqual(self.sleeps, [1.0])

    def test_persistent_503_gives_up_after_three_retries(self) -> None:
        self.mock.add("GET", "/key", error_reply(503, "No provider"))
        run = self.run_cli("key")
        self.assertEqual(run.code, 4)
        self.assertEqual(len(self.mock.seen), 4)
        self.assertEqual(len(self.sleeps), 3)

    def test_zod_error_shape(self) -> None:
        self.mock.add(
            "POST",
            "/audio/speech",
            json_reply(
                {"success": False, "error": {"name": "ZodError", "message": "voice: Required"}}, 400
            ),
        )
        run = self.run_cli("tts", "--model", TTS_MODEL, "--text", "x", "--out", self.tmp / "x.mp3")
        self.assertEqual(run.code, 4)
        self.assertIn("HTTP 400: ZodError: voice: Required", run.err)

    def test_proxy_403_is_a_network_error(self) -> None:
        self.mock.add("GET", "/key", raw_reply(b"<html>blocked by policy</html>", "text/html", 403))
        run = self.run_cli("key")
        self.assertEqual(run.code, 5)
        self.assertIn("allowed domains", run.err)

    def test_api_403_stays_an_api_error(self) -> None:
        self.mock.add(
            "GET",
            "/key",
            error_reply(
                403,
                "Budget limit exceeded",
                {"limit_source": "openrouter_guardrail_budget", "remedy_hint": "Ask your admin."},
            ),
        )
        run = self.run_cli("key")
        self.assertEqual(run.code, 4)
        self.assertIn("hint: Ask your admin.", run.err)

    def test_unreachable_host_is_network_error(self) -> None:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        os.environ["OPENROUTER_BASE_URL"] = "http://127.0.0.1:{}/api/v1".format(port)
        run = self.run_cli("key")
        self.assertEqual(run.code, 5)
        self.assertIn("network error", run.err)

    def test_plain_http_base_url_is_refused(self) -> None:
        os.environ["OPENROUTER_BASE_URL"] = "http://example.com/api/v1"
        run = self.run_cli("key")
        self.assertEqual(run.code, 2)
        self.assertIn("OPENROUTER_BASE_URL must be https://openrouter.ai", run.err)
        self.assertEqual(self.mock.seen, [])

    def test_key_echoed_by_server_is_redacted(self) -> None:
        self.mock.add("GET", "/key", error_reply(401, "Invalid key " + FAKE_KEY))
        run = self.run_cli("key")  # run_cli asserts the key is absent
        self.assertIn("[REDACTED]", run.err)

    def test_missing_key_exits_3_in_process(self) -> None:
        del os.environ["OPENROUTER_API_KEY"]
        run = self.run_cli("key")
        self.assertEqual(run.code, 3)
        self.assertIn("OPENROUTER_API_KEY is not set", run.err)
        self.assertEqual(self.mock.seen, [])


# --------------------------------------------------------------------------
# review fixes: key safety
# --------------------------------------------------------------------------


class KeySafetyTests(CliTestCase):
    def test_redirect_is_refused_and_the_key_never_reaches_the_new_host(self) -> None:
        thief = MockOpenRouter()
        self.addCleanup(thief.close)
        thief.add("GET", "/key", json_reply({"data": {"label": "stolen"}}))
        thief.add("POST", "/chat/completions", json_reply({"choices": []}))
        moved = {"Location": thief.base_url + "/key"}
        self.mock.add("GET", "/key", raw_reply(b"", "text/plain", 302, headers=moved))
        self.mock.add("POST", "/chat/completions", raw_reply(b"", "text/plain", 303, headers=moved))
        run = self.run_cli("key")
        self.assertEqual(run.code, 4)
        self.assertIn("redirect", run.err)
        run = self.run_cli("chat", "--model", "m", "hi")
        self.assertEqual(run.code, 4)
        self.assertEqual(thief.seen, [])

    def test_base_url_allowlist(self) -> None:
        allowed = (
            "https://openrouter.ai/api/v1",
            "https://eu.openrouter.ai/api/v1",
            "http://localhost:8080/api/v1",
            "http://127.0.0.1:9/api/v1",
            "https://[::1]:8443/api/v1",
        )
        refused = (
            "https://evil.example/api/v1",
            "https://openrouter.ai.evil.example/api/v1",
            "https://evilopenrouter.ai/api/v1",
            "http://openrouter.ai/api/v1",
            "https://user:pw@openrouter.ai/api/v1",
            "ftp://openrouter.ai/api/v1",
        )
        for url in allowed:
            os.environ["OPENROUTER_BASE_URL"] = url
            self.assertEqual(orcli.api_base(), url)
        for url in refused:
            with self.subTest(url=url):
                os.environ["OPENROUTER_BASE_URL"] = url
                with self.assertRaises(orcli.CliError) as caught:
                    orcli.api_base()
                self.assertEqual(caught.exception.exit_code, 2)
                self.assertIn("OPENROUTER_BASE_URL", str(caught.exception))

    def test_non_openrouter_base_url_never_gets_a_request(self) -> None:
        os.environ["OPENROUTER_BASE_URL"] = "https://mirror.example.com/api/v1"
        run = self.run_cli("key")
        self.assertEqual(run.code, 2)
        self.assertIn("OPENROUTER_BASE_URL", run.err)
        self.assertEqual(self.mock.seen, [])

    def test_malformed_key_exits_3_without_echoing_it(self) -> None:
        for bad in ("sk-or-v1-abcdefgh12345678\nSECRETPART99999", "sk-or-v1-ünïcode12345678"):
            with self.subTest(key=repr(bad)):
                os.environ["OPENROUTER_API_KEY"] = bad
                self.secrets = [bad] + [part for part in bad.split() if len(part) >= 8]
                run = self.run_cli("key")
                self.assertEqual(run.code, 3)
                self.assertIn("value is not shown", run.err)
        self.assertEqual(self.mock.seen, [])

    def test_redaction_covers_escaped_forms(self) -> None:
        key = "sk-or-v1-abcdefgh12345678\nSECRETPART99999"
        os.environ["OPENROUTER_API_KEY"] = key
        for text in (
            key,
            repr(key),
            json.dumps(key),
            "Invalid header value " + repr(("Bearer " + key).encode()),
        ):
            cleaned = orcli.redact(text)
            self.assertNotIn("abcdefgh12345678", cleaned)
            self.assertNotIn("SECRETPART99999", cleaned)


# --------------------------------------------------------------------------
# review fixes: audio validation
# --------------------------------------------------------------------------


def float_wav() -> bytes:
    """A 32-bit float WAV (format tag 3), which the wave module cannot read."""
    data = b"\x00\x00\x80\x3f" * 10
    fmt = struct.pack("<HHIIHH", 3, 1, 8000, 32000, 4, 32)
    body = b"WAVE" + b"fmt " + struct.pack("<I", len(fmt)) + fmt
    body += b"data" + struct.pack("<I", len(data)) + data
    return b"RIFF" + struct.pack("<I", len(body)) + body


class AudioValidationTests(CliTestCase):
    def tts(self, out: Path, *extra: Any, text: str = "Hi.") -> Run:
        return self.run_cli("tts", "--model", TTS_MODEL, "--text", text, "--out", out, *extra)

    def test_empty_200_body_is_refused(self) -> None:
        for name, ctype in (("e.mp3", "audio/mpeg"), ("e.wav", "audio/pcm")):
            with self.subTest(name=name):
                self.mock.add("POST", "/audio/speech", raw_reply(b"", ctype))
                run = self.tts(self.tmp / name)
                self.assertEqual(run.code, 4)
                self.assertIn("nothing was written", run.err)
                self.assertFalse((self.tmp / name).exists())

    def test_binary_body_is_described_not_dumped(self) -> None:
        self.mock.add("POST", "/audio/speech", (200, {}, b"\x01\x00" * 100))
        run = self.tts(self.tmp / "n.wav")
        self.assertEqual(run.code, 4)
        self.assertIn("'(none)' (200 bytes of binary data)", run.err)
        self.assertNotIn("\x01", run.err)

    def test_non_audio_200_is_refused(self) -> None:
        self.mock.add("POST", "/audio/speech", raw_reply(b"<html>login</html>", "text/html"))
        for name in ("p.mp3", "p.wav"):
            run = self.tts(self.tmp / name)
            self.assertEqual(run.code, 4)
            self.assertIn("text/html", run.err)
            self.assertFalse((self.tmp / name).exists())

    def test_audio_mpeg_without_mp3_magic_is_refused(self) -> None:
        self.mock.add("POST", "/audio/speech", raw_reply(b"hello world", "audio/mpeg"))
        run = self.tts(self.tmp / "x.mp3")
        self.assertEqual(run.code, 4)
        self.assertIn("not mp3 data", run.err)
        self.mock.add("POST", "/audio/speech", raw_reply(b"\xff\xfb\x90\x00data", "audio/mpeg"))
        self.assertEqual(self.tts(self.tmp / "x.mp3").code, 0)  # a bare MPEG frame sync is fine

    def test_error_object_in_a_200_json_body(self) -> None:
        self.mock.add(
            "POST", "/audio/speech", json_reply({"error": {"code": 502, "message": "upstream"}})
        )
        run = self.tts(self.tmp / "x.mp3")
        self.assertEqual(run.code, 4)
        self.assertIn("HTTP 502: upstream", run.err)

    def test_wav_body_is_unwrapped(self) -> None:
        body = orcli.wav_bytes(b"\x02\x00" * 400, 8000, 1)
        self.mock.add("POST", "/audio/speech", raw_reply(body, "audio/wav"))
        out = self.tmp / "w.wav"
        run = self.tts(out)
        self.assertEqual(run.code, 0, run.err)
        with wave.open(str(out)) as wav:
            self.assertEqual(
                (wav.getframerate(), wav.getnchannels(), wav.getnframes()), (8000, 1, 400)
            )

    def test_unreadable_wav_is_an_api_error_not_a_crash(self) -> None:
        self.mock.add("POST", "/audio/speech", raw_reply(float_wav(), "audio/wav"))
        run = self.tts(self.tmp / "f.wav")
        self.assertEqual(run.code, 4)
        self.assertIn("cannot read", run.err)

    def test_chunks_with_different_sample_formats_are_not_joined(self) -> None:
        text = ("Die oupa lag vir die tarentale wat oor die veld hardloop. " * 60).strip()
        self.mock.add(
            "POST",
            "/audio/speech",
            pcm_reply(480, "audio/pcm;rate=24000;channels=1"),
            pcm_reply(480, "audio/pcm;rate=16000;channels=1"),
        )
        out = self.tmp / "long.wav"
        run = self.tts(out, text=text)
        self.assertEqual(run.code, 4)
        self.assertIn("refusing to join", run.err)
        self.assertFalse(out.exists())

    def test_mp3_chunks_are_joined_in_order(self) -> None:
        text = ("Die oupa lag vir die tarentale wat oor die veld hardloop. " * 60).strip()
        counter = iter(range(1, 10))
        self.mock.add(
            "POST",
            "/audio/speech",
            lambda seen: raw_reply("ID3-part{}|".format(next(counter)).encode(), "audio/mpeg"),
        )
        out = self.tmp / "long.mp3"
        run = self.tts(out, text=text)
        self.assertEqual(run.code, 0, run.err)
        self.assertEqual(out.read_bytes(), b"ID3-part1|ID3-part2|")

    def test_refused_audio_leaves_no_file_and_no_state_entry(self) -> None:
        manifest = self.write_manifest([{"id": "a", "text": "Hallo."}])
        self.mock.add("POST", "/audio/speech", raw_reply(b"", "audio/mpeg"))
        args = ("batch", "--manifest", manifest, "--model", TTS_MODEL, "--voice", "ash")
        self.assertEqual(self.run_cli(*args).code, 4)
        self.assertFalse((self.tmp / "a.mp3").exists())
        self.assertFalse((self.tmp / "lines.state.json").exists())
        self.mock.add("POST", "/audio/speech", raw_reply(b"ID3-ok", "audio/mpeg"))
        run = self.run_cli(*args)
        self.assertEqual(run.code, 0, run.err)
        self.assertIn("(new)", run.out)


# --------------------------------------------------------------------------
# review fixes: batch state, costs, provider preferences
# --------------------------------------------------------------------------


class BatchReviewTests(CliTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.manifest = self.write_manifest(
            [
                {"id": "a", "text": "Hallo."},
                {"id": "b", "text": "Môre."},
                {"id": "c", "text": "Nag."},
            ]
        )
        self.mock.add(
            "POST",
            "/audio/speech",
            lambda seen: raw_reply(
                b"ID3:" + seen.json()["input"].encode("utf-8"),
                "audio/mpeg",
                headers={"X-Generation-Id": "gen-tts-{}".format(len(self.mock.seen))},
            ),
        )

    def batch(self, model: str, out_dir: str, *extra: Any) -> Run:
        return self.run_cli(
            "batch", "--manifest", self.manifest, "--model", model, "--voice", "v",
            "--out-dir", self.tmp / out_dir, *extra,
        )  # fmt: skip

    def speech_count(self) -> int:
        return len(self.mock.requests_to("/audio/speech"))

    def test_trial_out_dirs_keep_separate_state(self) -> None:
        self.assertEqual(self.batch("vendor/model-a", "trial-a").code, 0)
        self.assertEqual(self.batch("vendor/model-b", "trial-b").code, 0)
        self.assertEqual(self.speech_count(), 6)
        run = self.batch("vendor/model-a", "trial-a")  # nothing changed for trial A
        self.assertEqual(run.code, 0, run.err)
        self.assertEqual(self.speech_count(), 6)
        self.assertIn("skipping 3 existing", run.out)
        state = json.loads((self.tmp / "lines.state.json").read_text(encoding="utf-8"))
        self.assertIn("trial-a/a.mp3", state["clips"])
        self.assertIn("trial-b/a.mp3", state["clips"])
        self.assertFalse(any(Path(key).is_absolute() for key in state["clips"]))

    def test_one_failing_clip_does_not_stop_the_batch(self) -> None:
        def reply(seen: Seen) -> Reply:
            if seen.json()["input"] == "Môre.":
                return error_reply(400, "voice not supported")
            return raw_reply(b"ID3:" + seen.json()["input"].encode("utf-8"), "audio/mpeg")

        self.mock.add("POST", "/audio/speech", reply)
        run = self.batch("vendor/model-a", "out")
        self.assertEqual(run.code, 4)
        self.assertTrue((self.tmp / "out" / "a.mp3").exists())
        self.assertTrue((self.tmp / "out" / "c.mp3").exists())
        self.assertFalse((self.tmp / "out" / "b.mp3").exists())
        self.assertIn("failed clips: b", run.err)
        self.assertIn("done: 2 generated, 1 failed", run.out)

    def test_failed_cost_lookup_only_warns(self) -> None:
        self.mock.add("GET", "/generation", raw_reply(b"<html>blocked</html>", "text/html", 403))
        run = self.batch("vendor/model-a", "out", "--cost")
        self.assertEqual(run.code, 0, run.err)
        self.assertIn("done: 3 generated", run.out)
        self.assertIn("cost lookup failed", run.err)
        run = self.run_cli(
            "tts", "--model", "m", "--text", "Hi.", "--out", self.tmp / "t.mp3", "--cost"
        )
        self.assertEqual(run.code, 0, run.err)

    def test_generation_404_is_retried(self) -> None:
        self.mock.add(
            "GET",
            "/generation",
            error_reply(404, "Generation not found"),
            json_reply({"data": {"total_cost": 0.002}}),
        )
        run = self.run_cli("cost", "gen-x")
        self.assertEqual(run.code, 0, run.err)
        self.assertEqual(self.sleeps, [2.0])
        self.assertIn("$0.002", run.out)

    def test_dry_run_is_a_lower_bound_when_output_is_billed_too(self) -> None:
        pricing = {"prompt": "0.000015", "completion": "0.00002"}
        self.mock.add("GET", "/models", json_reply({"data": [{"id": "m/x", "pricing": pricing}]}))
        run = self.batch("m/x", "out", "--dry-run")
        self.assertIn("LOWER BOUND", run.out)
        self.assertIn("completion=0.00002", run.out)
        orcli._MODEL_CACHE.clear()
        pricing = {"prompt": "0", "completion": "0.0001"}
        self.mock.add("GET", "/models", json_reply({"data": [{"id": "m/x", "pricing": pricing}]}))
        run = self.batch("m/x", "out", "--dry-run")
        self.assertIn("estimated cost: unknown", run.out)

    def test_provider_preferences_and_options_in_the_payload(self) -> None:
        run = self.batch(
            "m", "out", "--zdr", "--deny-data-collection",
            "--provider-options", '{"heygen": {"language": "af"}}',
        )  # fmt: skip
        self.assertEqual(run.code, 0, run.err)
        provider = self.mock.requests_to("/audio/speech")[0].json()["provider"]
        self.assertEqual(
            provider,
            {"zdr": True, "data_collection": "deny", "options": {"heygen": {"language": "af"}}},
        )
        self.assertEqual(self.batch("m", "out2", "--provider-options", "[1]").code, 2)

    def test_reference_clip_privacy_defaults_can_be_turned_off(self) -> None:
        ref = self.tmp / "consented.wav"
        ref.write_bytes(b"RIFF-ref")
        out = self.tmp / "r.mp3"
        base = ("tts", "--model", "m", "--text", "Hi.", "--out", out, "--ref-audio", ref)
        self.assertEqual(self.run_cli(*base).code, 0)
        self.assertEqual(self.run_cli(*base, "--no-ref-privacy").code, 0)
        bodies = [s.json() for s in self.mock.requests_to("/audio/speech")]
        self.assertEqual(bodies[0]["provider"], {"zdr": True, "data_collection": "deny"})
        self.assertNotIn("provider", bodies[1])


# --------------------------------------------------------------------------
# review fixes: check, STT, lenient WER
# --------------------------------------------------------------------------


class CheckReviewTests(CliTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.manifest = self.write_manifest(
            [
                {"id": "a", "text": "Tien sekondes!"},
                {"id": "b", "text": "Bosveld-legende!"},
                {"id": "e", "text": "Ag nee man!"},
            ]
        )
        for clip_id in ("a", "b"):
            (self.tmp / (clip_id + ".mp3")).write_bytes(("FAKE:" + clip_id).encode())
        (self.tmp / "e.wav").write_bytes(b"FAKE:e")

    def check(self, *extra: Any) -> Run:
        return self.run_cli("check", "--manifest", self.manifest, "--stt-model", STT_MODEL, *extra)

    def test_unknown_stt_model_exits_4_without_regenerate_advice(self) -> None:
        self.mock.add(
            "POST",
            "/audio/transcriptions",
            error_reply(404, "Model openai/whisper-larg-v3 does not exist"),
        )
        run = self.check("--only", "a,b")
        self.assertEqual(run.code, 4)
        self.assertIn("does not exist", run.err)
        self.assertNotIn("--force", run.out)
        self.assertEqual(len(self.mock.requests_to("/audio/transcriptions")), 1)

    def test_per_clip_stt_error_is_an_error_not_a_failure(self) -> None:
        def reply(seen: Seen) -> Reply:
            clip = base64.b64decode(seen.json()["input_audio"]["data"]).decode()
            if clip == "FAKE:b":
                return error_reply(400, "audio could not be decoded")
            return json_reply({"text": "10 sekondes"})

        self.mock.add("POST", "/audio/transcriptions", reply)
        report = self.tmp / "r.json"
        run = self.check("--only", "a,b", "--report", report)
        self.assertEqual(run.code, 4)
        self.assertIn("1 passed, 0 failed (WER over 0.2), 0 missing, 1 STT errors", run.out)
        self.assertIn("do not regenerate", run.out)
        self.assertNotIn("--force", run.out)
        counts = json.loads(report.read_text(encoding="utf-8"))["counts"]
        self.assertEqual(counts, {"pass": 1, "fail": 0, "missing": 0, "error": 1})

    def test_lenient_wer_decides_and_strict_wer_is_shown(self) -> None:
        heard = {"FAKE:a": "10 sekondes", "FAKE:b": "Bosveldlegende"}
        self.mock.add(
            "POST",
            "/audio/transcriptions",
            lambda seen: json_reply(
                {"text": heard[base64.b64decode(seen.json()["input_audio"]["data"]).decode()]}
            ),
        )
        report = self.tmp / "r.md"
        run = self.check("--only", "a,b", "--report", report)
        self.assertEqual(run.code, 0, run.out)
        self.assertIn("WER 0.00 (strict 0.50)", run.out)
        self.assertIn("| a | pass | 0.00 | 0.50 |", report.read_text(encoding="utf-8"))

    def test_check_uses_only_the_requested_format(self) -> None:
        self.mock.add("POST", "/audio/transcriptions", json_reply({"text": "Ag nee man"}))
        run = self.check("--only", "e")
        self.assertEqual(run.code, 1)
        self.assertIn("found e.wav instead - pass --format pcm", run.out)
        self.assertEqual(self.mock.requests_to("/audio/transcriptions"), [])
        self.assertEqual(self.check("--only", "e", "--format", "pcm").code, 0)

    def test_keyterms_and_provider_are_sent(self) -> None:
        self.mock.add("POST", "/audio/transcriptions", json_reply({"text": "Tien sekondes"}))
        run = self.check("--only", "a", "--keyterms", "Oupa, tarentaal", "--zdr")
        self.assertEqual(run.code, 0, run.err)
        body = self.mock.requests_to("/audio/transcriptions")[0].json()
        self.assertEqual(body["keyterms"], ["Oupa", "tarentaal"])
        self.assertEqual(body["provider"], {"zdr": True})


class SttReviewTests(CliTestCase):
    def test_opus_is_passed_through(self) -> None:
        audio = self.tmp / "note.opus"
        audio.write_bytes(b"OggS")
        self.mock.add("POST", "/audio/transcriptions", json_reply({"text": "hallo"}))
        run = self.run_cli("stt", "--model", STT_MODEL, "--file", audio, "--deny-data-collection")
        self.assertEqual(run.code, 0, run.err)
        body = self.mock.requests_to("/audio/transcriptions")[0].json()
        self.assertEqual(body["input_audio"]["format"], "opus")
        self.assertEqual(body["provider"], {"data_collection": "deny"})


class LenientWerTests(unittest.TestCase):
    def test_reviewer_examples_pass_leniently_but_not_strictly(self) -> None:
        for expected, heard in (
            ("Môre, my kind!", "More my kind"),
            ("Tien sekondes!", "10 sekondes"),
            ("plus vyf sekondes", "+5 sekondes"),
            ("Bosveld-legende", "Bosveldlegende"),
            ("Bosveldlegende", "Bosveld legende"),
            ("Tsk-tsk-tsk! Los ons nes!", "Tsk tsk tsk, los ons nes"),
            ("Zwölf Sekunden!", "12 Sekunden"),
        ):
            with self.subTest(expected=expected):
                self.assertEqual(orcli.lenient_error_rate(expected, heard), 0.0)
        self.assertGreater(orcli.word_error_rate("Môre, my kind!", "More my kind"), 0.3)

    def test_real_errors_still_count(self) -> None:
        self.assertEqual(
            orcli.lenient_error_rate("Die tarentaal hardloop weg.", "Die tarentale loop weg"), 0.5
        )
        self.assertEqual(orcli.lenient_error_rate("Tien sekondes", "11 sekondes"), 0.5)


# --------------------------------------------------------------------------
# review fixes: nits
# --------------------------------------------------------------------------


class NitTests(CliTestCase):
    def test_multiline_error_messages_are_collapsed(self) -> None:
        zod = '[\n  {\n    "path": ["voice"],\n    "message": "Required"\n  }\n]'
        self.mock.add(
            "POST",
            "/audio/speech",
            json_reply({"success": False, "error": {"name": "ZodError", "message": zod}}, 400),
        )
        run = self.run_cli("tts", "--model", "m", "--text", "x", "--out", self.tmp / "x.mp3")
        self.assertEqual(run.code, 4)
        self.assertIn('ZodError: [ { "path": ["voice"], "message": "Required" } ]', run.err)

    def test_500_is_retried(self) -> None:
        self.mock.add(
            "GET", "/key", error_reply(500, "boom"), json_reply({"data": {"label": "ok-key"}})
        )
        run = self.run_cli("key")
        self.assertEqual(run.code, 0, run.err)
        self.assertEqual(len(self.sleeps), 1)

    def test_retry_after_http_date(self) -> None:
        when = datetime.now(timezone.utc) + timedelta(seconds=30)
        wait = orcli.parse_retry_after(format_datetime(when, usegmt=True))
        self.assertIsNotNone(wait)
        self.assertTrue(25 <= wait <= 31, wait)
        self.assertIsNone(orcli.parse_retry_after("nan"))

    def test_invalid_image_base64_is_an_api_error(self) -> None:
        self.mock.add("POST", "/images", json_reply({"created": 1, "data": [{"b64_json": "@@@"}]}))
        run = self.run_cli("image", "--model", "m", "--prompt", "p", "--out", self.tmp / "i.png")
        self.assertEqual(run.code, 4)
        self.assertFalse((self.tmp / "i.png").exists())

    def test_chat_errors_in_a_200_body_exit_4(self) -> None:
        self.mock.add(
            "POST",
            "/chat/completions",
            json_reply({"choices": [{"error": {"code": 502, "message": "provider died"}}]}),
            json_reply({"error": {"code": 429, "message": "slow down"}}),
        )
        run = self.run_cli("chat", "--model", "m", "hi")
        self.assertEqual(run.code, 4)
        self.assertIn("HTTP 502: provider died", run.err)
        self.assertNotIn("retried", run.err)  # an error inside a 200 body is not retried
        self.assertEqual(len(self.sleeps), 0)
        run = self.run_cli("chat", "--model", "m", "hi")
        self.assertEqual(run.code, 4)
        self.assertIn("slow down", run.err)

    def test_endpoints_status_is_labelled_raw(self) -> None:
        self.mock.add(
            "GET",
            "/models/a/b/endpoints",
            json_reply({"data": {"endpoints": [{"provider_name": "P", "status": -2}]}}),
        )
        run = self.run_cli("endpoints", "a/b")
        self.assertIn("status (raw)", run.out)
        self.assertIn("-2", run.out)


class DocSyncTests(unittest.TestCase):
    """Every flag in SKILL.md's command table must exist in that command's --help."""

    def test_skill_md_flags_exist(self) -> None:
        skill = (HERE.parent / "SKILL.md").read_text(encoding="utf-8")
        rows = re.findall(r"^\| `([a-z]+)([^`]*)` \|", skill, re.M)
        self.assertGreaterEqual(len(rows), 10)
        for command, rest in rows:
            out = io.StringIO()
            with redirect_stdout(out):
                self.assertEqual(orcli.main([command, "--help"]), 0)
            for flag in re.findall(r"--[a-z][a-z-]*", rest):
                with self.subTest(command=command, flag=flag):
                    self.assertIn(flag, out.getvalue())


class SubprocessTests(unittest.TestCase):
    """The script as a real process: exit codes and --help for every command."""

    COMMANDS = (
        "key",
        "models",
        "voices",
        "endpoints",
        "tts",
        "stt",
        "batch",
        "check",
        "chat",
        "image",
        "cost",
    )

    def run_script(self, *argv: str, key: bool = False) -> subprocess.CompletedProcess:
        env = {
            k: v for k, v in os.environ.items() if k not in PROXY_VARS and k != "OPENROUTER_API_KEY"
        }
        env["OPENROUTER_BASE_URL"] = "http://127.0.0.1:9/api/v1"
        if key:
            env["OPENROUTER_API_KEY"] = FAKE_KEY
        return subprocess.run(
            [sys.executable, str(SCRIPT)] + list(argv),
            env=env,
            capture_output=True,
            text=True,
            timeout=60,
        )

    def test_missing_key_exit_code_3(self) -> None:
        proc = self.run_script("key")
        self.assertEqual(proc.returncode, 3)
        self.assertIn("never paste the key into a chat", proc.stderr)
        self.assertNotIn("Traceback", proc.stderr)

    def test_help_for_every_command(self) -> None:
        for command in self.COMMANDS:
            with self.subTest(command=command):
                proc = self.run_script(command, "--help", key=True)
                self.assertEqual(proc.returncode, 0, proc.stderr)
                self.assertIn("usage: openrouter.py " + command, proc.stdout)
                self.assertIn("examples:", proc.stdout)
                self.assertNotIn(FAKE_KEY, proc.stdout + proc.stderr)

    def test_usage_error_exit_code_2(self) -> None:
        proc = self.run_script("tts", "--model", "m", key=True)
        self.assertEqual(proc.returncode, 2)


if __name__ == "__main__":
    unittest.main()
