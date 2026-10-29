#!/usr/bin/env python3
"""OpenRouter helper CLI for the `openrouter` Claude skill.

Text-to-speech, speech-to-text, a TTS -> STT round-trip check with word error
rate, model and voice listing, chat, image generation, key/credit and cost
lookups. Python 3.8+, standard library only.

The API key is read from the environment variable OPENROUTER_API_KEY and is
never printed. OPENROUTER_BASE_URL overrides the API base URL (the tests point
it at a local mock server).

The key is only ever sent to https://openrouter.ai (or a loopback test server), and
redirects are never followed, so it cannot be forwarded to another host.

Exit codes: 0 ok | 1 check found WER failures or missing clips, or batch stopped by
--max-chars | 2 usage or input error | 3 OPENROUTER_API_KEY missing or malformed
| 4 API error (including STT errors in check) | 5 network error | 70 internal bug.

Run `python3 openrouter.py <command> --help` for each command's options.
"""

from __future__ import annotations

import argparse
import base64
import binascii
import email.utils
import hashlib
import http.client
import io
import json
import math
import os
import random
import re
import sys
import time
import traceback
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import wave
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Sequence, Tuple

# --------------------------------------------------------------------------
# Constants
# --------------------------------------------------------------------------

DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
APP_TITLE = "Claude openrouter skill"
USER_AGENT = "claude-openrouter-skill/1.0"
KEY_ENV = "OPENROUTER_API_KEY"

EXIT_OK = 0
EXIT_INCOMPLETE = 1  # check found failing clips, or batch stopped by --max-chars
EXIT_USAGE = 2
EXIT_NO_KEY = 3
EXIT_API = 4
EXIT_NETWORK = 5
EXIT_INTERNAL = 70

RETRY_STATUSES = frozenset({408, 429, 500, 502, 503, 524, 529})
IN_FLIGHT_LIMIT = "openrouter_in_flight_budget"
MAX_RETRIES = 3
MAX_RETRY_WAIT_S = 120.0
FATAL_BATCH_STATUSES = frozenset({401, 402, 403})  # every later clip would fail too
FATAL_CHECK_STATUSES = FATAL_BATCH_STATUSES | {404}  # 404 = unknown STT model: all clips fail

OPENROUTER_HOST = "openrouter.ai"
LOOPBACK_HOSTS = ("127.0.0.1", "localhost", "::1")
KEY_SHAPE = re.compile(r"[!-~]+\Z")  # printable ASCII, no whitespace

TIMEOUT_SHORT_S = 30
TIMEOUT_MODELS_S = 60
TIMEOUT_AUDIO_S = 120
TIMEOUT_IMAGE_S = 180

TTS_CHUNK_CHARS = 3000  # Seed Audio's documented input limit; safe for the others
PCM_DEFAULT_RATE = 24000
PCM_DEFAULT_CHANNELS = 1
PCM_SAMPLE_WIDTH = 2  # 16-bit little-endian
TTS_EXTENSIONS = {".mp3": "mp3", ".wav": "pcm"}
FORMAT_EXTENSIONS = {"mp3": ".mp3", "pcm": ".wav"}

STT_MAX_BYTES = 25 * 1000 * 1000
# The docs list wav..aac; the spec's `format` is a free token and "supported formats vary by
# provider", so opus is passed through as well.
STT_FORMATS = ("wav", "mp3", "flac", "m4a", "ogg", "webm", "aac", "opus")
AUDIO_CONTENT_TYPES = ("audio/", "application/octet-stream")
REFERENCE_MAX_BYTES = 15 * 1024 * 1024
REFERENCE_MIME = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".flac": "audio/flac",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".webm": "audio/webm",
}

MODEL_OUTPUTS = (
    "speech",
    "transcription",
    "image",
    "text",
    "audio",
    "video",
    "embeddings",
    "rerank",
    "all",
)
MODEL_INPUTS = ("audio", "image", "text", "file")
ASPECT_RATIOS = (
    "1:1",
    "1:2",
    "1:4",
    "1:8",
    "2:1",
    "2:3",
    "2.35:1",
    "3:2",
    "3:4",
    "4:1",
    "4:3",
    "4:5",
    "5:2",
    "5:4",
    "5:7",
    "7:5",
    "8:1",
    "9:16",
    "16:9",
    "9:19.5",
    "19.5:9",
    "9:20",
    "20:9",
    "9:21",
    "21:9",
    "auto",
)
PRICE_FIELDS = ("prompt", "completion", "request", "image", "audio", "audio_output")
ENDPOINT_FLAGS = (
    "supports_voice_cloning",
    "supports_multiple_audio_references",
    "supports_image_reference",
    "supports_diarization",
)

CLIP_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
CLIP_TEXT_FIELDS = ("voice", "instructions", "out", "language")
KEY_PATTERN = re.compile(r"sk-or-[A-Za-z0-9_-]{8,}")
SENTENCE_BREAK = re.compile(r"(?<=[.!?\u2026])\s+|\n\s*\n")
APOSTROPHES = re.compile("['\u2018\u2019\u02bc`\u00b4]")
NON_WORD = re.compile(r"[^\w\s]|_")
WORD_HYPHEN = re.compile(r"(?<=\w)[-\u2010\u2011](?=\w)")

# Number words 0-20 (diacritics folded) -> digits, for the lenient WER. English, Afrikaans and
# German; "ein" is left out because it is also the German article.
NUMBER_WORDS = {
    word: str(value)
    for words in (
        "zero one two three four five six seven eight nine ten eleven twelve thirteen "
        "fourteen fifteen sixteen seventeen eighteen nineteen twenty",
        "nul een twee drie vier vyf ses sewe agt nege tien elf twaalf dertien veertien "
        "vyftien sestien sewentien agtien negentien twintig",
        "null eins zwei drei vier funf sechs sieben acht neun zehn elf zwolf dreizehn "
        "vierzehn funfzehn sechzehn siebzehn achtzehn neunzehn zwanzig",
    )
    for value, word in enumerate(words.split())
}

BLOCKED_HINT = (
    "the environment may block openrouter.ai - add it to the allowed domains "
    "(Claude Code cloud: environment settings -> Network access -> Allowed domains)"
)
MISSING_KEY_MESSAGE = """OPENROUTER_API_KEY is not set.
Add it where this command runs (never paste the key into a chat):
  - Claude Code cloud: environment settings (cloud environment menu -> Edit) ->
    Network secrets, or an environment variable named OPENROUTER_API_KEY;
    a new session picks it up
  - GitHub Actions: repository secret OPENROUTER_API_KEY, passed to the step via env:
  - your own machine: export OPENROUTER_API_KEY=... in your shell profile, not in the repo
Create the key at https://openrouter.ai/keys with a small credit limit."""

STATUS_HINTS = {
    400: (
        "bad request: check the model slug (`models`), the voice (`voices MODEL`) and the format "
        "(Gemini TTS and HeyGen are pcm-only -> use a .wav out path; MiniMax is mp3-only)"
    ),
    401: (
        "the key is invalid, disabled or expired: create a new one at https://openrouter.ai/keys "
        "and update OPENROUTER_API_KEY where it is stored (never in chat)"
    ),
    403: (
        "blocked by a budget, guardrail or moderation rule, or the endpoint needs a management key"
    ),
    404: "not found: check the model slug with `models` (full slug, e.g. openai/whisper-1)",
    408: "the request timed out upstream; retried - try again later or shorten the input",
    413: "request too large: shorten the text or send a smaller, compressed audio file",
    429: "rate limited (free models allow about 20 requests/min); retried - wait and try again",
    500: "server error; retried - try again later",
    502: "the provider failed or is down; retried - try later or pick another model",
    503: (
        "no provider can serve this model with these parameters right now; "
        "try later or another model"
    ),
    504: "the provider timed out; try again or shorten the input",
    524: "the provider timed out; retried - try again or shorten the input",
    529: "the provider is overloaded; retried - try again later",
}
LIMIT_SOURCE_HINTS = {
    "openrouter_key_limit": (
        "this key's credit limit is used up: raise it at https://openrouter.ai/keys "
        "or wait for its reset (`key` shows limit_reset)"
    ),
    "openrouter_credits": (
        "the account balance cannot cover this request: add credits at "
        "https://openrouter.ai/settings/credits"
    ),
    IN_FLIGHT_LIMIT: "transient: recent requests fill the in-flight budget; wait and retry",
}

# --------------------------------------------------------------------------
# Errors, output and redaction
# --------------------------------------------------------------------------


class CliError(Exception):
    """A failure with a user-facing message and an exit code."""

    def __init__(self, message: str, exit_code: int = EXIT_USAGE):
        super().__init__(message)
        self.exit_code = exit_code


class ApiError(CliError):
    """A non-2xx answer from the OpenRouter API (or an error object in a 200 body)."""

    def __init__(
        self,
        status: int,
        message: str,
        limit_source: Optional[str] = None,
        remedy_hint: Optional[str] = None,
        retry_after: Optional[float] = None,
    ):
        super().__init__(message, EXIT_API)
        self.status = status
        self.message = message
        self.limit_source = limit_source
        self.remedy_hint = remedy_hint
        self.retry_after = retry_after
        self.in_body = False  # an error object inside a 200 body: never retried

    def retryable(self) -> bool:
        if self.status in RETRY_STATUSES:
            return True
        return self.status == 402 and self.limit_source == IN_FLIGHT_LIMIT

    def describe(self) -> str:
        line = "HTTP {}: {}".format(self.status, self.message)
        if self.limit_source:
            line += " (limit_source: {})".format(self.limit_source)
        hint = (
            self.remedy_hint
            or LIMIT_SOURCE_HINTS.get(self.limit_source or "")
            or STATUS_HINTS.get(self.status)
        )
        if hint and self.in_body:
            hint = hint.replace("retried - ", "")
        return line + ("\nhint: " + hint if hint else "")


def secret_forms() -> List[str]:
    """The key as it could appear in text: raw, stripped, repr/JSON-escaped, and its pieces."""
    raw = os.environ.get(KEY_ENV, "")
    forms = set()
    for value in (raw, raw.strip()):
        if len(value) < 8:
            continue
        forms.update(
            {
                value,
                repr(value)[1:-1],
                json.dumps(value)[1:-1],
                repr(value.encode("utf-8", "replace"))[2:-1],
            }
        )
        forms.update(piece for piece in value.split() if len(piece) >= 8)
    return sorted(forms, key=len, reverse=True)


def redact(text: str) -> str:
    """Remove the API key (and anything shaped like an OpenRouter key) from text."""
    for form in secret_forms():
        text = text.replace(form, "[REDACTED]")
    return KEY_PATTERN.sub("sk-or-[REDACTED]", text)


def say(text: str = "") -> None:
    print(redact(str(text)))


def warn(text: str) -> None:
    print(redact(str(text)), file=sys.stderr)


def sleep(seconds: float) -> None:
    """Indirection so tests can record waits instead of sleeping."""
    time.sleep(seconds)


def dump_json(data: Any) -> None:
    say(json.dumps(data, ensure_ascii=False, indent=2))


def snippet(body: bytes, limit: int = 200) -> str:
    """A short, printable excerpt of a response body (binary data is only described)."""
    text = body.decode("utf-8", "replace").strip()
    if any(ord(c) < 32 and c not in "\t\n\r" for c in text) or "\ufffd" in text:
        return "{:,} bytes of binary data".format(len(body))
    text = re.sub(r"\s+", " ", text)
    return text if len(text) <= limit else text[:limit] + "..."


def to_float(value: Any) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def fmt_usd(value: Any) -> str:
    amount = to_float(value)
    if amount is None:
        return "?"
    if abs(amount) >= 1:
        return "${:,.2f}".format(amount)
    text = "{:.8f}".format(amount).rstrip("0").rstrip(".")
    return "$" + (text if text not in ("", "-0") else "0")


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------


@dataclass
class Response:
    status: int
    headers: Dict[str, str]
    body: bytes

    def header(self, name: str, default: str = "") -> str:
        return self.headers.get(name.lower(), default)

    def json(self) -> Any:
        try:
            data = json.loads(self.body.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            raise CliError(
                "unexpected non-JSON response: " + snippet(self.body), EXIT_API
            ) from None
        if isinstance(data, dict) and data.get("error"):
            raise api_error(self.status, self.body, self.headers)
        return data


def api_base() -> str:
    """The API base URL. Only OpenRouter itself (or a loopback test server) gets the key."""
    base = os.environ.get("OPENROUTER_BASE_URL", "").strip().rstrip("/") or DEFAULT_BASE_URL
    parts = urllib.parse.urlsplit(base)
    host = (parts.hostname or "").lower()
    official = parts.scheme == "https" and (
        host == OPENROUTER_HOST or host.endswith("." + OPENROUTER_HOST)
    )
    loopback = parts.scheme in ("http", "https") and host in LOOPBACK_HOSTS
    if not (official or loopback) or parts.username or parts.password:
        raise CliError(
            "OPENROUTER_BASE_URL must be https://openrouter.ai/... (or a localhost test server); "
            "refusing to send the key to {!r}. Unset OPENROUTER_BASE_URL to use the default "
            "{}.".format(parts.netloc or base, DEFAULT_BASE_URL)
        )
    return base


def api_key() -> str:
    key = os.environ.get(KEY_ENV, "").strip()
    if not key:
        raise CliError(MISSING_KEY_MESSAGE, EXIT_NO_KEY)
    if not KEY_SHAPE.match(key):
        raise CliError(
            "OPENROUTER_API_KEY contains spaces, line breaks or non-ASCII characters, so it "
            "cannot be a valid key (the value is not shown). Copy the key again from "
            "https://openrouter.ai/keys and store it as one line.",
            EXIT_NO_KEY,
        )
    return key


def request(
    method: str,
    path: str,
    params: Optional[Dict[str, Any]] = None,
    payload: Optional[Dict[str, Any]] = None,
    timeout: float = TIMEOUT_SHORT_S,
) -> Response:
    """Call the API, retrying transient failures (honouring Retry-After)."""
    url = api_base() + path
    query = {k: v for k, v in (params or {}).items() if v is not None}
    if query:
        url += "?" + urllib.parse.urlencode(query)
    headers = {
        "Authorization": "Bearer " + api_key(),
        "X-OpenRouter-Title": APP_TITLE,
        "User-Agent": USER_AGENT,
        "Accept": "*/*",
    }
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    for attempt in range(MAX_RETRIES + 1):
        try:
            return send_once(method, url, headers, data, timeout)
        except ApiError as err:
            if attempt >= MAX_RETRIES or not err.retryable():
                raise
            wait = retry_wait(attempt, err.retry_after)
            warn(
                "HTTP {}: retrying in {:.1f}s (retry {}/{})".format(
                    err.status, wait, attempt + 1, MAX_RETRIES
                )
            )
            sleep(wait)
    raise AssertionError("unreachable")  # pragma: no cover


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Never follow redirects: urllib would copy the Authorization header to the new URL."""

    def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str):
        return None  # the 3xx then surfaces as an HTTPError


def send_once(
    method: str, url: str, headers: Dict[str, str], data: Optional[bytes], timeout: float
) -> Response:
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    opener = urllib.request.build_opener(NoRedirect())  # per call, so proxy env changes apply
    try:
        with opener.open(req, timeout=timeout) as resp:
            resp_headers = {k.lower(): v for k, v in resp.headers.items()}
            return Response(resp.getcode(), resp_headers, resp.read())
    except urllib.error.HTTPError as exc:
        body = exc.read() if exc.fp is not None else b""
        raise http_error(exc.code, body, exc.headers or {}) from None
    except (urllib.error.URLError, http.client.HTTPException, OSError) as exc:
        raise network_error(exc) from None


def retry_wait(attempt: int, retry_after: Optional[float]) -> float:
    if retry_after is not None:
        return min(retry_after, MAX_RETRY_WAIT_S)
    return min(2.0**attempt + random.uniform(0, 0.5), MAX_RETRY_WAIT_S)


def parse_retry_after(value: Optional[str]) -> Optional[float]:
    """Seconds to wait from a Retry-After header (delta-seconds or an HTTP date)."""
    if not value:
        return None
    try:
        seconds = float(value)
        return max(0.0, seconds) if math.isfinite(seconds) else None
    except ValueError:
        pass
    try:
        when = email.utils.parsedate_to_datetime(value)
        return max(0.0, when.timestamp() - time.time())
    except (TypeError, ValueError, IndexError, OverflowError):
        return None


def parse_json_bytes(body: bytes) -> Any:
    try:
        return json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return None


def http_error(status: int, body: bytes, headers: Any) -> CliError:
    if 300 <= status < 400:
        target = urllib.parse.urlsplit(str(headers.get("Location") or "")).netloc if headers else ""
        return ApiError(
            status,
            "the server answered with a redirect{}; refusing to follow it, because the key "
            "would be sent along".format(" to " + target if target else ""),
        )
    data = parse_json_bytes(body)
    looks_like_api = isinstance(data, dict) and "error" in data
    if status in (403, 405, 407) and not looks_like_api:
        return CliError(
            "network error: HTTP {} from a proxy or firewall, not from the OpenRouter API ({})"
            "\nhint: {}".format(status, snippet(body, 120) or "empty body", BLOCKED_HINT),
            EXIT_NETWORK,
        )
    return api_error(status, body, headers)


def api_error(status: int, body: bytes, headers: Any) -> ApiError:
    """Build an ApiError from either documented error shape:
    {"error": {"code", "message", "metadata"}}, or
    {"success": false, "error": {"name", "message"}} (validation errors)."""
    data = parse_json_bytes(body)
    message, limit_source, remedy = None, None, None
    in_body = status < 400
    if isinstance(data, dict):
        err = data.get("error")
        if isinstance(err, dict):
            if status < 400:  # an error object inside a 200 body
                status = err["code"] if isinstance(err.get("code"), int) else 500
            message = err.get("message")
            if err.get("name") and message:
                message = "{}: {}".format(err["name"], message)
            meta = err.get("metadata")
            if isinstance(meta, dict):
                limit_source = meta.get("limit_source")
                remedy = meta.get("remedy_hint")
        elif isinstance(err, str):
            message = err
        if not message and isinstance(data.get("message"), str):
            message = data["message"]
    if not message:
        message = snippet(body) or http.client.responses.get(status, "error")
    message = " ".join(str(message).split())  # e.g. ZodError's pretty-printed JSON
    if len(message) > 600:
        message = message[:600] + "..."
    retry_after = None
    if headers:
        retry_after = parse_retry_after(headers.get("Retry-After") or headers.get("retry-after"))
    error = ApiError(status, message, limit_source, remedy, retry_after)
    error.in_body = in_body
    return error


def network_error(exc: BaseException) -> CliError:
    reason = getattr(exc, "reason", exc)
    text = str(reason)
    lowered = text.lower()
    if "tunnel connection failed" in lowered:
        detail, hint = "the proxy refused the connection ({})".format(text), BLOCKED_HINT
    elif (
        "name or service not known" in lowered
        or "nodename nor servname" in lowered
        or "getaddrinfo" in lowered
        or "name resolution" in lowered
    ):
        detail, hint = "DNS lookup failed ({})".format(text), BLOCKED_HINT
    elif "certificate_verify_failed" in lowered or "certificate verify failed" in lowered:
        detail = "TLS certificate verification failed"
        hint = (
            "if a proxy intercepts HTTPS, point SSL_CERT_FILE at its CA bundle "
            "(never disable verification)"
        )
    elif "timed out" in lowered:
        detail, hint = "the request timed out", "retry, or shorten the text / audio"
    else:
        detail = "could not reach {} ({})".format(urllib.parse.urlsplit(api_base()).netloc, text)
        hint = "check the connection; " + BLOCKED_HINT
    return CliError("network error: {}\nhint: {}".format(detail, hint), EXIT_NETWORK)


# --------------------------------------------------------------------------
# Models, prices, generations
# --------------------------------------------------------------------------

_MODEL_CACHE: Dict[str, List[Dict[str, Any]]] = {}


def list_models(
    output: Optional[str] = None, input_: Optional[str] = None, query: Optional[str] = None
) -> List[Dict[str, Any]]:
    cache_key = json.dumps([output, input_, query])
    if cache_key not in _MODEL_CACHE:
        params = {"output_modalities": output, "input_modalities": input_, "q": query}
        data = request("GET", "/models", params=params, timeout=TIMEOUT_MODELS_S).json()
        models = data.get("data") if isinstance(data, dict) else None
        _MODEL_CACHE[cache_key] = [m for m in (models or []) if isinstance(m, dict)]
    return _MODEL_CACHE[cache_key]


def find_model(model_id: str, output: str) -> Optional[Dict[str, Any]]:
    """Look the model up under one output modality, then under all models."""
    for modality in (output, "all"):
        for model in list_models(output=modality):
            if model_id in (model.get("id"), model.get("canonical_slug")):
                return model
    return None


def price_summary(pricing: Any) -> str:
    if not isinstance(pricing, dict):
        return "-"
    parts = []
    for name in PRICE_FIELDS:
        amount = to_float(pricing.get(name))
        if amount:
            parts.append("{}={}".format(name, pricing.get(name)))
    return " ".join(parts) or "free/0"


@dataclass
class CharPrice:
    """Best-effort TTS price per input character, and what it leaves out."""

    per_char: Optional[float]  # None: no estimate possible
    note: str
    output_price: Optional[str] = None  # set when the model also bills output (completion)


def char_price(model_id: str) -> CharPrice:
    model = find_model(model_id, "speech")
    if model is None:
        return CharPrice(None, "model {} not found in /models".format(model_id))
    pricing = model.get("pricing") or {}
    per_char = to_float(pricing.get("prompt"))
    per_output = to_float(pricing.get("completion"))
    output = str(pricing.get("completion")) if per_output else None
    if per_char:
        note = "pricing.prompt of {} read as USD per input character".format(model_id)
        return CharPrice(per_char, note, output)
    if per_output:
        return CharPrice(
            None,
            "{} is priced per unit of output audio (pricing.completion={}); "
            "a text-only estimate is not possible".format(model_id, output),
        )
    return CharPrice(0.0, "{} lists no per-character price (free or unpublished)".format(model_id))


def fetch_generation(gen_id: str, attempts: int = 3) -> Dict[str, Any]:
    """GET /generation; stats can lag a few seconds behind the request, so retry 404s."""
    for attempt in range(attempts):
        try:
            data = request("GET", "/generation", params={"id": gen_id}).json()
            info = data.get("data") if isinstance(data, dict) else None
            return info if isinstance(info, dict) else {}
        except ApiError as err:
            if err.status != 404 or attempt == attempts - 1:
                raise
            sleep(2.0)
    return {}


def report_costs(gen_ids: Sequence[str]) -> None:
    """Print the summed real cost; a failed lookup only warns (the audio is already written)."""
    total, found = 0.0, 0
    for gen_id in gen_ids:
        try:
            cost = to_float(fetch_generation(gen_id).get("total_cost"))
        except CliError as err:
            warn(
                "cost lookup failed for {} ({}) - try `cost {}` later".format(
                    gen_id, str(err).splitlines()[0], gen_id
                )
            )
            continue
        if cost is not None:
            total += cost
            found += 1
    if found:
        say("cost: {} ({} generation{})".format(fmt_usd(total), found, "" if found == 1 else "s"))


# --------------------------------------------------------------------------
# Text-to-speech
# --------------------------------------------------------------------------


@dataclass
class Reference:
    """A voice-cloning reference clip (sent as input_references)."""

    data_uri: str
    transcript: Optional[str]
    digest: str


@dataclass
class TtsOptions:
    model: str
    fmt: str
    voice: Optional[str] = None
    instructions: Optional[str] = None
    speed: Optional[float] = None
    reference: Optional[Reference] = None
    provider: Optional[Dict[str, Any]] = None  # the request's `provider` object


@dataclass
class TtsResult:
    audio: bytes  # mp3 bytes, or raw s16le frames for pcm
    rate: Optional[int]
    channels: Optional[int]
    gen_ids: List[str] = field(default_factory=list)
    chars: int = 0
    requests: int = 0


def resolve_tts_format(out_path: Path, fmt: Optional[str]) -> str:
    expected = TTS_EXTENSIONS.get(out_path.suffix.lower())
    if expected is None:
        raise CliError(
            "output must end in .mp3 (mp3) or .wav (pcm wrapped as WAV): {}".format(out_path)
        )
    if fmt and fmt != expected:
        raise CliError(
            "--format {} does not match {}: use .mp3 for mp3 and .wav for pcm".format(
                fmt, out_path.name
            )
        )
    return expected


def split_text(text: str, limit: int = TTS_CHUNK_CHARS) -> List[str]:
    """Split text into chunks of at most `limit` chars at sentence boundaries."""
    text = text.strip()
    if len(text) <= limit:
        return [text] if text else []
    chunks: List[str] = []
    current = ""
    for piece in sentence_pieces(text, limit):
        candidate = current + " " + piece if current else piece
        if len(candidate) <= limit:
            current = candidate
        else:
            chunks.append(current)
            current = piece
    if current:
        chunks.append(current)
    return chunks


def sentence_pieces(text: str, limit: int) -> Iterator[str]:
    for sentence in SENTENCE_BREAK.split(text):
        sentence = sentence.strip()
        while len(sentence) > limit:  # one very long sentence: break at a comma or space
            cut = max(sentence.rfind(", ", 0, limit), sentence.rfind("; ", 0, limit))
            cut = cut + 1 if cut > 0 else sentence.rfind(" ", 0, limit)
            if cut <= 0:
                cut = limit
            yield sentence[:cut].strip()
            sentence = sentence[cut:].strip()
        if sentence:
            yield sentence


def load_reference(path_text: Optional[str], transcript: Optional[str]) -> Optional[Reference]:
    if not path_text:
        if transcript:
            raise CliError("--ref-text needs --ref-audio")
        return None
    path = Path(path_text)
    mime = REFERENCE_MIME.get(path.suffix.lower())
    if mime is None:
        raise CliError(
            "unsupported reference audio type {!r}; use one of {}".format(
                path.suffix, ", ".join(sorted(REFERENCE_MIME))
            )
        )
    if not path.is_file():
        raise CliError("reference audio not found: {}".format(path))
    raw = path.read_bytes()
    if len(raw) > REFERENCE_MAX_BYTES:
        raise CliError("reference audio is over 15 MiB; trim it to a short, clean sample")
    encoded = base64.b64encode(raw).decode("ascii")
    digest = hashlib.sha256(raw + (transcript or "").encode("utf-8")).hexdigest()[:16]
    return Reference("data:{};base64,{}".format(mime, encoded), transcript, digest)


def speech_payload(opts: TtsOptions, text: str) -> Dict[str, Any]:
    payload: Dict[str, Any] = {"model": opts.model, "input": text, "response_format": opts.fmt}
    if opts.voice:
        payload["voice"] = opts.voice
    if opts.instructions:
        payload["instructions"] = opts.instructions
    if opts.speed is not None:
        payload["speed"] = opts.speed
    if opts.reference:
        parts: List[Dict[str, Any]] = [
            {"type": "input_audio", "input_audio": {"data": opts.reference.data_uri}}
        ]
        if opts.reference.transcript:
            parts.append({"type": "text", "text": opts.reference.transcript})
        payload["input_references"] = parts
    if opts.provider:
        payload["provider"] = opts.provider
    return payload


def parse_provider_options(text: Optional[str]) -> Optional[Dict[str, Any]]:
    """--provider-options: a JSON object keyed by provider slug, e.g. {"heygen": {...}}."""
    if not text:
        return None
    try:
        options = json.loads(text)
    except ValueError as exc:
        raise CliError("--provider-options is not valid JSON: {}".format(exc)) from None
    if not isinstance(options, dict) or not all(isinstance(v, dict) for v in options.values()):
        raise CliError(
            "--provider-options must be a JSON object of objects keyed by provider slug, "
            'e.g. {"heygen": {"language": "af"}}'
        )
    return options


def provider_prefs(args: argparse.Namespace, cloning: bool = False) -> Optional[Dict[str, Any]]:
    """The `provider` object: data policy (zdr, data_collection) and passthrough options.

    A voice-cloning reference is someone's voice, so with --ref-audio the strict data policy
    is on unless --no-ref-privacy is given."""
    strict = cloning and not getattr(args, "no_ref_privacy", False)
    prefs: Dict[str, Any] = {}
    if args.zdr or strict:
        prefs["zdr"] = True
    if args.deny_data_collection or strict:
        prefs["data_collection"] = "deny"
    options = parse_provider_options(args.provider_options)
    if options:
        prefs["options"] = options
    return prefs or None


def pcm_params(content_type: str) -> Tuple[int, int]:
    """Sample rate and channels from e.g. `audio/pcm;rate=24000;channels=1`."""
    rate, channels = PCM_DEFAULT_RATE, PCM_DEFAULT_CHANNELS
    for part in content_type.split(";")[1:]:
        name, _, value = part.partition("=")
        name, value = name.strip().lower(), value.strip().strip('"')
        if name == "rate" and value.isdigit():
            rate = int(value)
        elif name == "channels" and value.isdigit():
            channels = int(value)
    return rate, channels


def is_wav(body: bytes) -> bool:
    return body[:4] == b"RIFF" and body[8:12] == b"WAVE"


def is_mp3(body: bytes) -> bool:
    """An ID3 tag or an MPEG frame sync (11 set bits) at the start."""
    return body[:3] == b"ID3" or (len(body) > 1 and body[0] == 0xFF and body[1] & 0xE0 == 0xE0)


def ensure_audio(resp: Response) -> None:
    """Refuse anything that is not audio: JSON errors, HTML portals, empty bodies.

    Nothing is written for a refused response, so a later batch run retries the clip."""
    ctype = resp.header("content-type").lower()
    if ctype.startswith("application/json"):
        resp.json()  # raises ApiError when the body carries an error
        raise CliError("expected audio but got JSON: " + snippet(resp.body), EXIT_API)
    if not ctype.startswith(AUDIO_CONTENT_TYPES):
        raise CliError(
            "expected audio but got Content-Type {!r} ({}); nothing was written. A captive "
            "portal or proxy may be answering instead of OpenRouter.".format(
                ctype or "(none)", snippet(resp.body, 80) or "empty body"
            ),
            EXIT_API,
        )
    if not resp.body:
        raise CliError("the API returned an empty audio body; nothing was written", EXIT_API)


def unwrap_wav(body: bytes) -> Tuple[bytes, int, int]:
    try:
        with wave.open(io.BytesIO(body)) as wav:
            width = wav.getsampwidth()
            frames = wav.readframes(wav.getnframes())
            rate, channels = wav.getframerate(), wav.getnchannels()
    except (wave.Error, EOFError) as exc:
        raise CliError(
            "the API returned a WAV this tool cannot read ({}); try a .mp3 out path".format(exc),
            EXIT_API,
        ) from None
    if width != PCM_SAMPLE_WIDTH:
        raise CliError("unexpected WAV sample width {} bytes".format(width), EXIT_API)
    return frames, rate, channels


def decode_pcm(resp: Response) -> Tuple[bytes, int, int]:
    ensure_audio(resp)
    ctype = resp.header("content-type").lower()
    if is_wav(resp.body):
        frames, rate, channels = unwrap_wav(resp.body)
    elif ctype.startswith(("audio/mpeg", "audio/mp3")) or is_mp3(resp.body):
        raise CliError("asked for pcm but the API returned mp3; use a .mp3 out path", EXIT_API)
    else:
        rate, channels = pcm_params(ctype)
        frame = PCM_SAMPLE_WIDTH * channels
        usable = len(resp.body) - len(resp.body) % frame
        if usable != len(resp.body):
            warn(
                "warning: dropped {} trailing byte(s) that do not fill a sample frame".format(
                    len(resp.body) - usable
                )
            )
        frames = resp.body[:usable]
    if not frames:
        raise CliError("the API returned no audio samples; nothing was written", EXIT_API)
    return frames, rate, channels


def check_mp3(resp: Response) -> bytes:
    ensure_audio(resp)
    ctype = resp.header("content-type").lower()
    if ctype.startswith("audio/pcm") or is_wav(resp.body):
        raise CliError(
            "asked for mp3 but the model returned pcm - it may be pcm-only "
            "(e.g. Gemini TTS, HeyGen): use a .wav out path",
            EXIT_API,
        )
    if not is_mp3(resp.body):
        raise CliError(
            "the response is not mp3 data (no ID3 tag or MPEG frame sync: {}); "
            "nothing was written".format(snippet(resp.body, 40)),
            EXIT_API,
        )
    return resp.body


def synthesize(opts: TtsOptions, text: str) -> TtsResult:
    """Run TTS, chunking long text, and return the joined audio."""
    chunks = split_text(text)
    if not chunks:
        raise CliError("the text is empty")
    result = TtsResult(b"", None, None, chars=sum(len(c) for c in chunks), requests=len(chunks))
    pieces: List[bytes] = []
    for index, chunk in enumerate(chunks, 1):
        if len(chunks) > 1:
            warn("chunk {}/{} ({} chars)".format(index, len(chunks), len(chunk)))
        resp = request(
            "POST", "/audio/speech", payload=speech_payload(opts, chunk), timeout=TIMEOUT_AUDIO_S
        )
        if resp.header("x-generation-id"):
            result.gen_ids.append(resp.header("x-generation-id"))
        if opts.fmt == "mp3":
            pieces.append(check_mp3(resp))
            continue
        frames, rate, channels = decode_pcm(resp)
        if result.rate is None:
            result.rate, result.channels = rate, channels
        elif (rate, channels) != (result.rate, result.channels):
            raise CliError(  # joining them would play at the wrong speed; no resampling here
                "chunks came back with different sample formats ({} Hz/{} ch vs {} Hz/{} ch); "
                "refusing to join them - nothing was written".format(
                    result.rate, result.channels, rate, channels
                ),
                EXIT_API,
            )
        pieces.append(frames)
    result.audio = b"".join(pieces)
    return result


def atomic_write(path: Path, data: bytes) -> None:
    """Write via a temp file so an interrupted run never leaves a half clip behind."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".part")
    try:
        tmp.write_bytes(data)
        os.replace(str(tmp), str(path))
    finally:
        if tmp.exists():
            tmp.unlink()


def wav_bytes(frames: bytes, rate: int, channels: int) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(PCM_SAMPLE_WIDTH)
        wav.setframerate(rate)
        wav.writeframes(frames)
    return buffer.getvalue()


def save_audio(result: TtsResult, path: Path, fmt: str) -> str:
    """Write the clip and return a short description of it."""
    if fmt == "mp3":
        atomic_write(path, result.audio)
        return "{:,} bytes mp3".format(len(result.audio))
    rate = result.rate or PCM_DEFAULT_RATE
    channels = result.channels or PCM_DEFAULT_CHANNELS
    atomic_write(path, wav_bytes(result.audio, rate, channels))
    seconds = len(result.audio) / float(rate * channels * PCM_SAMPLE_WIDTH)
    return "{:.2f} s, {} Hz, {}".format(
        seconds, rate, "mono" if channels == 1 else "{} channels".format(channels)
    )


def enforce_max_chars(chars: int, max_chars: Optional[int]) -> None:
    if max_chars is not None and chars > max_chars:
        raise CliError(
            "text is {} chars, over --max-chars {}; nothing was sent".format(chars, max_chars)
        )


def read_text(args: argparse.Namespace) -> str:
    if args.text is not None:
        return args.text
    if args.text_file == "-":
        return sys.stdin.read()
    try:
        return Path(args.text_file).read_text(encoding="utf-8-sig")
    except OSError as exc:
        raise CliError("cannot read --text-file: {}".format(exc)) from None


# --------------------------------------------------------------------------
# Speech-to-text and word error rate
# --------------------------------------------------------------------------


def audio_format(path: Path) -> str:
    ext = path.suffix.lower().lstrip(".")
    if ext not in STT_FORMATS:
        raise CliError(
            "unsupported audio type {!r}; use one of: {}".format(
                path.suffix or path.name, ", ".join(STT_FORMATS)
            )
        )
    return ext


@dataclass
class SttOptions:
    model: str
    language: Optional[str] = None
    verbose: bool = False
    keyterms: Optional[List[str]] = None
    provider: Optional[Dict[str, Any]] = None


def parse_keyterms(text: Optional[str]) -> Optional[List[str]]:
    if not text:
        return None
    terms = [term.strip() for term in text.split(",") if term.strip()]
    too_long = [term for term in terms if len(term) > 100]
    if too_long:
        raise CliError("--keyterms entries must be at most 100 characters: " + too_long[0][:40])
    return terms or None


def transcribe(opts: SttOptions, path: Path) -> Tuple[Dict[str, Any], str]:
    """POST /audio/transcriptions; returns (response JSON, generation id)."""
    if not path.is_file():
        raise CliError("audio file not found: {}".format(path))
    fmt = audio_format(path)
    size = path.stat().st_size
    if size > STT_MAX_BYTES:
        raise CliError(
            "{} is {:.1f} MB; transcription accepts at most 25 MB. Convert it to a compressed "
            "format or split it, e.g. ffmpeg -i in.wav -f segment -segment_time 60 "
            "-ac 1 -b:a 64k part_%03d.mp3".format(path, size / 1e6)
        )
    payload: Dict[str, Any] = {
        "model": opts.model,
        "input_audio": {"data": base64.b64encode(path.read_bytes()).decode("ascii"), "format": fmt},
    }
    if opts.language:
        payload["language"] = opts.language
    if opts.verbose:
        payload["response_format"] = "verbose_json"
    if opts.keyterms:
        payload["keyterms"] = opts.keyterms
    if opts.provider:
        payload["provider"] = opts.provider
    resp = request("POST", "/audio/transcriptions", payload=payload, timeout=TIMEOUT_AUDIO_S)
    data = resp.json()
    if not isinstance(data, dict) or not isinstance(data.get("text"), str):
        raise CliError(
            "unexpected transcription response (no 'text'): " + snippet(resp.body), EXIT_API
        )
    return data, resp.header("x-generation-id")


def normalise_text(text: str) -> str:
    """Lower case, no punctuation, single spaces; keeps letters like ê ë ô û ß."""
    text = unicodedata.normalize("NFC", unicodedata.normalize("NFC", text).casefold())
    text = APOSTROPHES.sub("", text)
    text = NON_WORD.sub(" ", text)
    return " ".join(text.split())


def edit_rate(ref: Sequence[str], hyp: Sequence[str]) -> float:
    """Word-level Levenshtein distance divided by the reference length."""
    if not ref:
        return 0.0 if not hyp else 1.0
    previous = list(range(len(hyp) + 1))
    for i, ref_word in enumerate(ref, 1):
        current = [i] + [0] * len(hyp)
        for j, hyp_word in enumerate(hyp, 1):
            current[j] = min(
                previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ref_word != hyp_word)
            )
        previous = current
    return previous[-1] / float(len(ref))


def word_error_rate(reference: str, hypothesis: str) -> float:
    """Strict WER: only case, punctuation and apostrophes are ignored (ê differs from e)."""
    return edit_rate(normalise_text(reference).split(), normalise_text(hypothesis).split())


def fold_diacritics(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def canonical_word(word: str) -> str:
    if word.isdigit():
        return str(int(word))
    return NUMBER_WORDS.get(word, word)


def lenient_variants(text: str) -> List[List[str]]:
    """Word lists with diacritics folded, '+' read as plus, number words 0-20 as digits;
    one variant with hyphenated words split, one with them joined."""
    base = unicodedata.normalize("NFC", text).casefold().replace("+", " plus ")
    base = fold_diacritics(APOSTROPHES.sub("", base))
    variants = []
    for joiner in (" ", ""):
        words = NON_WORD.sub(" ", WORD_HYPHEN.sub(joiner, base)).split()
        variants.append([canonical_word(word) for word in words])
    return variants


def lenient_error_rate(reference: str, hypothesis: str) -> float:
    """WER that forgives spelling-level differences STT often makes: Môre/More, 10/tien,
    +5/plus vyf, Bosveld-legende/Bosveldlegende/Bosveld legende."""
    refs, hyps = lenient_variants(reference), lenient_variants(hypothesis)
    if "".join(refs[1]) == "".join(hyps[1]):  # the same letters, only spacing differs
        return 0.0
    return min(edit_rate(ref, hyp) for ref in refs for hyp in hyps)


def usage_line(data: Dict[str, Any], gen_id: str) -> str:
    usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
    parts = []
    if usage.get("cost") is not None:
        parts.append("cost " + fmt_usd(usage.get("cost")))
    if usage.get("seconds") is not None:
        parts.append("{} s audio".format(usage.get("seconds")))
    if gen_id:
        parts.append("generation id " + gen_id)
    return " | ".join(parts)


# --------------------------------------------------------------------------
# Manifests (batch + check)
# --------------------------------------------------------------------------


@dataclass
class Clip:
    id: str
    text: str
    voice: Optional[str] = None
    instructions: Optional[str] = None
    out: Optional[str] = None
    language: Optional[str] = None


def load_manifest(path: Path) -> List[Clip]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8-sig"))
    except OSError as exc:
        raise CliError("cannot read manifest {}: {}".format(path, exc)) from None
    except ValueError as exc:
        raise CliError("manifest {} is not valid JSON: {}".format(path, exc)) from None
    if not isinstance(raw, list):
        raise CliError('manifest must be a JSON list: [{"id": "...", "text": "..."}, ...]')
    clips, problems, seen = [], [], set()
    for index, item in enumerate(raw, 1):
        clip = parse_clip(item, index, problems)
        if clip is None:
            continue
        if clip.id in seen:
            problems.append("clip #{}: duplicate id {!r}".format(index, clip.id))
        seen.add(clip.id)
        clips.append(clip)
    if problems:
        raise CliError("manifest problems:\n  " + "\n  ".join(problems))
    return clips


def parse_clip(item: Any, index: int, problems: List[str]) -> Optional[Clip]:
    where = "clip #{}".format(index)
    if not isinstance(item, dict):
        problems.append(where + ": must be an object")
        return None
    clip_id, text = item.get("id"), item.get("text")
    ok = True
    if not isinstance(clip_id, str) or not CLIP_ID_RE.match(clip_id):
        problems.append(where + ": 'id' must use only letters, digits, '.', '_' and '-'")
        ok = False
    if not isinstance(text, str) or not text.strip():
        problems.append(where + ": 'text' must be a non-empty string")
        ok = False
    for name in CLIP_TEXT_FIELDS:
        if item.get(name) is not None and not isinstance(item.get(name), str):
            problems.append("{}: '{}' must be a string".format(where, name))
            ok = False
    if not ok:
        return None
    extras = {name: item.get(name) or None for name in CLIP_TEXT_FIELDS}
    return Clip(id=clip_id, text=text.strip(), **extras)


def select_clips(clips: List[Clip], only: Optional[str]) -> List[Clip]:
    if not only:
        return clips
    wanted = [part.strip() for part in only.split(",") if part.strip()]
    known = {clip.id for clip in clips}
    unknown = [clip_id for clip_id in wanted if clip_id not in known]
    if unknown:
        raise CliError("--only names unknown clip ids: " + ", ".join(unknown))
    return [clip for clip in clips if clip.id in wanted]


def clip_path(clip: Clip, out_dir: Path, ext: str) -> Path:
    if clip.out:
        path = Path(clip.out)
        return path if path.is_absolute() else out_dir / path
    return out_dir / (clip.id + ext)


def other_format_file(clip: Clip, out_dir: Path, ext: str) -> Optional[Path]:
    """The clip saved under the other format's extension, if the expected file is missing."""
    if clip.out:
        return None
    for other in FORMAT_EXTENSIONS.values():
        alt = out_dir / (clip.id + other)
        if other != ext and alt.is_file():
            return alt
    return None


def out_dir_for(args: argparse.Namespace) -> Path:
    return Path(args.out_dir) if args.out_dir else Path(args.manifest).resolve().parent


STATE_VERSION = 2  # v2: entries keyed by output path (v1 keyed by clip id is ignored)


def state_path(manifest: Path) -> Path:
    """`oupa-af.json` -> `oupa-af.state.json`, next to the manifest."""
    return manifest.with_name(manifest.stem + ".state.json")


def state_key(path: Path, manifest: Path) -> str:
    """A clip's output path relative to the manifest's folder, so the same manifest rendered
    into different --out-dir folders (one per trial model) keeps separate fingerprints."""
    base = manifest.resolve().parent
    try:
        return Path(os.path.relpath(str(path.resolve()), str(base))).as_posix()
    except ValueError:  # another drive on Windows
        return path.resolve().as_posix()


def load_state(path: Path) -> Dict[str, Any]:
    if not path.is_file():
        return {}
    data = parse_json_bytes(path.read_bytes())
    if not isinstance(data, dict) or data.get("version") != STATE_VERSION:
        return {}
    clips = data.get("clips")
    return clips if isinstance(clips, dict) else {}


def save_state(path: Path, clips: Dict[str, Any]) -> None:
    body = json.dumps(
        {"version": STATE_VERSION, "clips": clips}, ensure_ascii=False, indent=2, sort_keys=True
    )
    atomic_write(path, (body + "\n").encode("utf-8"))


def fingerprint(opts: TtsOptions, text: str) -> str:
    """What decides the audio. Data-policy routing (zdr, data_collection) is left out;
    provider passthrough options are in, because they can change the sound."""
    ref = opts.reference.digest if opts.reference else None
    options = (opts.provider or {}).get("options")
    blob = json.dumps(
        [opts.model, opts.fmt, opts.voice, opts.instructions, opts.speed, ref, text, options],
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


# --------------------------------------------------------------------------
# Commands
# --------------------------------------------------------------------------


def cmd_key(args: argparse.Namespace) -> int:
    data = request("GET", "/key").json()
    info = data.get("data") if isinstance(data, dict) else None
    info = info if isinstance(info, dict) else {}
    if args.json:
        dump_json(info)
        return EXIT_OK
    limit = info.get("limit")
    if limit is None:
        limit_text = "none - set a small credit limit at https://openrouter.ai/keys"
    else:
        limit_text = fmt_usd(limit) + (
            " (resets {})".format(info["limit_reset"]) if info.get("limit_reset") else ""
        )
    rows = [
        ("label", info.get("label") or "-"),
        ("limit", limit_text),
        (
            "limit_remaining",
            fmt_usd(info.get("limit_remaining"))
            if info.get("limit_remaining") is not None
            else "-",
        ),
        (
            "usage",
            "{} total | {} today | {} this week | {} this month".format(
                fmt_usd(info.get("usage")),
                fmt_usd(info.get("usage_daily")),
                fmt_usd(info.get("usage_weekly")),
                fmt_usd(info.get("usage_monthly")),
            ),
        ),
        ("is_free_tier", str(info.get("is_free_tier"))),
        ("expires_at", info.get("expires_at") or "never"),
    ]
    budget = info.get("effective_budget")
    if isinstance(budget, dict) and budget.get("limit_usd") is not None:
        rows.append(
            (
                "effective_budget",
                "{} of {} left ({}, resets {})".format(
                    fmt_usd(budget.get("remaining_usd")),
                    fmt_usd(budget.get("limit_usd")),
                    budget.get("reset_interval") or "no reset",
                    budget.get("resets_at") or "never",
                ),
            )
        )
    for name, value in rows:
        say("{:<17} {}".format(name + ":", value))
    return EXIT_OK


def cmd_models(args: argparse.Namespace) -> int:
    models = list_models(output=args.output, input_=args.input, query=args.q)
    if args.json:
        dump_json(models)
        return EXIT_OK
    rows = []
    for model in sorted(models, key=lambda m: str(m.get("id"))):
        voices = model.get("supported_voices")
        rows.append(
            (
                str(model.get("id")),
                str(len(voices)) if isinstance(voices, list) else "-",
                price_summary(model.get("pricing")),
            )
        )
    if rows:
        print_table(("id", "voices", "prices (USD per unit)"), rows)
    warn(
        "{} model(s). Units: text models per token; speech per input character (`prompt`, "
        "assumed) or per output second (`completion`); see references/api.md.".format(len(rows))
    )
    return EXIT_OK


def print_table(headers: Sequence[str], rows: Sequence[Sequence[str]]) -> None:
    widths = [max(len(str(row[i])) for row in [headers] + list(rows)) for i in range(len(headers))]
    for row in [headers] + list(rows):
        say("  ".join(str(cell).ljust(width) for cell, width in zip(row, widths)).rstrip())


def cmd_voices(args: argparse.Namespace) -> int:
    model = find_model(args.model, "speech")
    if model is None:
        raise CliError(
            "model {} not found in /models; list TTS models with: models --output speech".format(
                args.model
            )
        )
    voices = model.get("supported_voices")
    if args.json:
        dump_json(voices or [])
        return EXIT_OK
    if not voices:
        say("{} publishes no voice list (it may use a provider default voice).".format(args.model))
        return EXIT_OK
    for voice in voices:
        say(voice)
    warn("{} voice(s) for {}".format(len(voices), args.model))
    return EXIT_OK


def cmd_endpoints(args: argparse.Namespace) -> int:
    author, _, slug = args.model.partition("/")
    if not author or not slug or "/" in slug:
        raise CliError("model must look like author/slug, e.g. fish-audio/s2.1-pro")
    path = "/models/{}/{}/endpoints".format(
        urllib.parse.quote(author, safe=""), urllib.parse.quote(slug, safe=":")
    )
    data = request("GET", path).json()
    info = data.get("data") if isinstance(data, dict) else None
    info = info if isinstance(info, dict) else {}
    if args.json:
        dump_json(info)
        return EXIT_OK
    rows = []
    for endpoint in info.get("endpoints") or []:
        if not isinstance(endpoint, dict):
            continue
        flags = [name.replace("supports_", "") for name in ENDPOINT_FLAGS if endpoint.get(name)]
        status = endpoint.get("status")
        rows.append(
            (
                str(endpoint.get("provider_name") or "-"),
                str(endpoint.get("tag") or "-"),
                "-" if status is None else str(status),
                ",".join(flags) or "-",
                price_summary(endpoint.get("pricing")),
            )
        )
    if rows:
        print_table(
            ("provider", "tag", "status (raw)", "capabilities", "prices (USD per unit)"), rows
        )
        warn(
            "status is the API's raw code; the spec lists 0, -1, -2, -3, -5 and -10 without "
            "saying what they mean (its examples use 0)"
        )
    else:
        say("no endpoints listed for {}".format(args.model))
    return EXIT_OK


def cmd_tts(args: argparse.Namespace) -> int:
    out = Path(args.out)
    fmt = resolve_tts_format(out, args.format)
    text = read_text(args).strip()
    enforce_max_chars(len(text), args.max_chars)
    reference = load_reference(args.ref_audio, args.ref_text)
    opts = TtsOptions(
        args.model,
        fmt,
        args.voice,
        args.instructions,
        args.speed,
        reference,
        provider_prefs(args, cloning=reference is not None),
    )
    result = synthesize(opts, text)
    info = save_audio(result, out, fmt)
    say(
        "wrote {} ({}; {} chars, {} request{})".format(
            out, info, result.chars, result.requests, "" if result.requests == 1 else "s"
        )
    )
    for gen_id in result.gen_ids:
        say("generation id: " + gen_id)
    if args.cost:
        report_costs(result.gen_ids)
    return EXIT_OK


def stt_options(args: argparse.Namespace, model: str, verbose: bool = False) -> SttOptions:
    return SttOptions(
        model,
        args.language,
        verbose,
        parse_keyterms(args.keyterms),
        provider_prefs(args),
    )


def cmd_stt(args: argparse.Namespace) -> int:
    data, gen_id = transcribe(stt_options(args, args.model, args.verbose), Path(args.file))
    if args.json:
        dump_json(data)
    else:
        say(data["text"].strip())
        if args.verbose:
            print_verbose(data)
    line = usage_line(data, gen_id)
    if line:
        warn(line)
    return EXIT_OK


def print_verbose(data: Dict[str, Any]) -> None:
    facts = [
        "{}: {}".format(name, data[name])
        for name in ("language", "duration", "confidence")
        if data.get(name) is not None
    ]
    if facts:
        say("-- " + " | ".join(facts))
    for seg in data.get("segments") or []:
        if isinstance(seg, dict):
            speaker = " [{}]".format(seg["speaker"]) if seg.get("speaker") else ""
            say(
                "[{:>7.2f} - {:>7.2f}]{} {}".format(
                    to_float(seg.get("start")) or 0.0,
                    to_float(seg.get("end")) or 0.0,
                    speaker,
                    str(seg.get("text", "")).strip(),
                )
            )


@dataclass
class PlannedClip:
    clip: Clip
    path: Path
    opts: TtsOptions
    reason: str  # new | changed | forced
    digest: str
    key: str  # state key: the output path relative to the manifest


def plan_batch(
    args: argparse.Namespace, clips: List[Clip], state: Dict[str, Any]
) -> Tuple[List[PlannedClip], List[Clip]]:
    manifest = Path(args.manifest)
    out_dir = out_dir_for(args)
    default_ext = FORMAT_EXTENSIONS[args.format or "mp3"]
    reference = load_reference(args.ref_audio, args.ref_text)
    provider = provider_prefs(args, cloning=reference is not None)
    todo: List[PlannedClip] = []
    skipped: List[Clip] = []
    for clip in clips:
        path = clip_path(clip, out_dir, default_ext)
        try:
            fmt = resolve_tts_format(path, None)
        except CliError as err:
            raise CliError("clip {}: {}".format(clip.id, err)) from None
        opts = TtsOptions(
            args.model,
            fmt,
            clip.voice or args.voice,
            clip.instructions or args.instructions,
            args.speed,
            reference,
            provider,
        )
        digest = fingerprint(opts, clip.text)
        key = state_key(path, manifest)
        entry = state.get(key)
        previous = entry.get("fingerprint") if isinstance(entry, dict) else None
        if args.force:
            reason = "forced"
        elif not path.exists():
            reason = "new"
        elif previous and previous != digest:
            reason = "changed"
        else:
            skipped.append(clip)
            continue
        todo.append(PlannedClip(clip, path, opts, reason, digest, key))
    return todo, skipped


def within_budget(todo: List[PlannedClip], max_chars: Optional[int]) -> int:
    """How many clips, in order, fit under --max-chars."""
    if max_chars is None:
        return len(todo)
    used = 0
    for count, item in enumerate(todo):
        used += len(item.clip.text)
        if used > max_chars:
            return count
    return len(todo)


def cmd_batch(args: argparse.Namespace) -> int:
    manifest = Path(args.manifest)
    clips = select_clips(load_manifest(manifest), args.only)
    state_file = state_path(manifest)
    state = load_state(state_file)
    todo, skipped = plan_batch(args, clips, state)
    if args.dry_run:
        return dry_run(args, todo, skipped)
    if skipped:
        say("skipping {} existing clip(s) (use --force to regenerate)".format(len(skipped)))
    fit = within_budget(todo, args.max_chars)
    run = BatchRun()
    for number, item in enumerate(todo[:fit], 1):
        if not generate_clip(
            args, item, "[{}/{}] {}".format(number, len(todo), item.clip.id), state, state_file, run
        ):
            break
    code = finish_batch(args, todo, fit, run)
    if args.cost and run.gen_ids:
        report_costs(run.gen_ids)  # after the summary; a failed lookup only warns
    return code


@dataclass
class BatchRun:
    generated: int = 0
    chars: int = 0
    failures: List[str] = field(default_factory=list)
    gen_ids: List[str] = field(default_factory=list)


def generate_clip(
    args: argparse.Namespace,
    item: PlannedClip,
    tag: str,
    state: Dict[str, Any],
    state_file: Path,
    run: BatchRun,
) -> bool:
    """Generate one clip; returns False when the batch should stop."""
    try:
        result = synthesize(item.opts, item.clip.text)
        info = save_audio(result, item.path, item.opts.fmt)
    except ApiError as err:
        warn("{} FAILED: {}".format(tag, err.describe()))
        run.failures.append(item.clip.id)
        if err.status in FATAL_BATCH_STATUSES:
            warn("stopping: this error would repeat for every remaining clip")
            return False
        return True
    except CliError as err:
        if err.exit_code in (EXIT_NETWORK, EXIT_NO_KEY):
            raise
        warn("{} FAILED: {}".format(tag, err))
        run.failures.append(item.clip.id)
        return True
    run.generated += 1
    run.chars += result.chars
    run.gen_ids.extend(result.gen_ids)
    state[item.key] = {
        "id": item.clip.id,
        "fingerprint": item.digest,
        "model": args.model,
        "voice": item.opts.voice,
        "generation_ids": result.gen_ids,
        "chars": result.chars,
    }
    save_state(state_file, state)
    say(
        "{} ({}) -> {} ({}) {}".format(
            tag, item.reason, item.path, info, " ".join(result.gen_ids)
        ).rstrip()
    )
    return True


def finish_batch(args: argparse.Namespace, todo: List[PlannedClip], fit: int, run: BatchRun) -> int:
    say(
        "done: {} generated, {} failed, {} chars sent".format(
            run.generated, len(run.failures), run.chars
        )
    )
    if run.failures:
        warn("failed clips: " + ",".join(run.failures))
        return EXIT_API
    if fit < len(todo):
        warn(
            "stopped before clip {} ({}): it would exceed --max-chars {}; {} clip(s) not "
            "generated. Raise --max-chars or split the manifest.".format(
                fit + 1, todo[fit].clip.id, args.max_chars, len(todo) - fit
            )
        )
        return EXIT_INCOMPLETE
    return EXIT_OK


def dry_run(args: argparse.Namespace, todo: List[PlannedClip], skipped: List[Clip]) -> int:
    chars = sum(len(item.clip.text) for item in todo)
    requests_needed = sum(len(split_text(item.clip.text)) for item in todo)
    say("dry run - nothing is sent to the TTS endpoint")
    say(
        "to generate: {} clip(s), {} chars, {} request(s); skipped (exist): {}".format(
            len(todo), chars, requests_needed, len(skipped)
        )
    )
    for item in todo:
        say(
            "  {:<8} {:>5} chars  {} -> {}".format(
                item.reason, len(item.clip.text), item.clip.id, item.path
            )
        )
    fit = within_budget(todo, args.max_chars)
    if fit < len(todo):
        say("--max-chars {}: a real run would stop after {} clip(s)".format(args.max_chars, fit))
    say(cost_estimate(args, chars))
    return EXIT_OK


def cost_estimate(args: argparse.Namespace, chars: int) -> str:
    if args.price_per_char is not None:
        price = CharPrice(args.price_per_char, "--price-per-char")
    else:
        try:
            price = char_price(args.model)
        except CliError as err:
            return "estimated cost: unknown (price lookup failed: {})".format(
                str(err).splitlines()[0]
            )
    if price.per_char is None:
        return "estimated cost: unknown ({})".format(price.note)
    amount = "{} chars x {}/char; {}".format(chars, fmt_usd(price.per_char), price.note)
    if price.output_price:
        return (
            "estimated cost: at least ~{} - a LOWER BOUND ({}). The model also bills output "
            "(pricing.completion={}), which the text length cannot predict. Confirm with "
            "`cost <generation-id>` after one test clip.".format(
                fmt_usd(chars * price.per_char), amount, price.output_price
            )
        )
    return (
        "estimated cost: ~{} - an ESTIMATE ({}). Some providers also bill instructions. "
        "Confirm with `cost <generation-id>` after one test clip.".format(
            fmt_usd(chars * price.per_char), amount
        )
    )


@dataclass
class CheckResult:
    id: str
    status: str  # pass | fail (WER) | missing (no clip file) | error (the STT request failed)
    expected: str
    transcript: str = ""
    wer: Optional[float] = None  # lenient WER, decides pass/fail
    strict_wer: Optional[float] = None
    file: str = ""
    language: Optional[str] = None
    generation_id: str = ""
    note: str = ""


CHECK_STATUSES = ("pass", "fail", "missing", "error")


def cmd_check(args: argparse.Namespace) -> int:
    report = Path(args.report) if args.report else None
    if report and report.suffix.lower() not in (".json", ".md"):
        raise CliError("--report must end in .json or .md")
    clips = select_clips(load_manifest(Path(args.manifest)), args.only)
    out_dir = out_dir_for(args)
    ext = FORMAT_EXTENSIONS[args.format or "mp3"]
    stt = stt_options(args, args.stt_model)
    results = [check_clip(args, stt, clip, out_dir, ext) for clip in clips]
    by_status = {name: [r for r in results if r.status == name] for name in CHECK_STATUSES}
    say(
        "{} passed, {} failed (WER over {}), {} missing, {} STT errors".format(
            len(by_status["pass"]),
            len(by_status["fail"]),
            args.max_wer,
            len(by_status["missing"]),
            len(by_status["error"]),
        )
    )
    if report:
        write_report(report, args, results)
        say("report: {}".format(report))
    print_check_advice(args, by_status)
    if by_status["error"]:
        return EXIT_API
    if by_status["fail"] or by_status["missing"]:
        return EXIT_INCOMPLETE
    return EXIT_OK


def print_check_advice(args: argparse.Namespace, by_status: Dict[str, List[CheckResult]]) -> None:
    def ids(name: str) -> str:
        return ",".join(r.id for r in by_status[name])

    if by_status["error"]:
        say(
            "STT errors: the transcription request failed, so these clips were not judged "
            "({}). Fix the STT model or options (`models --output transcription`) and run "
            "check again - do not regenerate the clips for this.".format(ids("error"))
        )
    if by_status["missing"]:
        say(
            "missing clips: generate them with (no --force needed):\n"
            "  batch --manifest {} --model <tts-model> --only {}".format(
                args.manifest, ids("missing")
            )
        )
    if by_status["fail"]:
        say(
            "WER failures: listen first (the STT can be the one that is wrong); only if the TTS "
            "is wrong, regenerate them with:\n"
            "  batch --manifest {} --model <tts-model> --only {} --force".format(
                args.manifest, ids("fail")
            )
        )


def check_clip(
    args: argparse.Namespace, stt: SttOptions, clip: Clip, out_dir: Path, ext: str
) -> CheckResult:
    language = clip.language or args.language
    result = CheckResult(clip.id, "missing", clip.text, language=language)
    path = clip_path(clip, out_dir, ext)
    if not path.is_file():
        other = other_format_file(clip, out_dir, ext)
        if other is not None:
            result.note = "found {} instead - pass --format {}".format(
                other.name, "pcm" if other.suffix == ".wav" else "mp3"
            )
        say("MISSING {}  ({}){}".format(clip.id, path, "; " + result.note if result.note else ""))
        return result
    result.file = str(path)
    try:
        opts = SttOptions(stt.model, language, False, stt.keyterms, stt.provider)
        data, result.generation_id = transcribe(opts, path)
    except ApiError as err:
        if err.status in FATAL_CHECK_STATUSES:  # every clip would fail the same way
            raise
        return check_error(result, err.describe().splitlines()[0])
    except CliError as err:
        if err.exit_code in (EXIT_NETWORK, EXIT_NO_KEY):
            raise
        return check_error(result, str(err).splitlines()[0])
    result.transcript = data["text"].strip()
    result.wer = lenient_error_rate(clip.text, result.transcript)
    result.strict_wer = word_error_rate(clip.text, result.transcript)
    result.status = "pass" if result.wer <= args.max_wer else "fail"
    say(
        "{:<7} {}  WER {:.2f} (strict {:.2f})  heard: {}".format(
            result.status.upper(), clip.id, result.wer, result.strict_wer, result.transcript
        )
    )
    return result


def check_error(result: CheckResult, message: str) -> CheckResult:
    result.status, result.note = "error", message
    say("ERROR   {}  {}".format(result.id, message))
    return result


def write_report(path: Path, args: argparse.Namespace, results: List[CheckResult]) -> None:
    counts = {name: sum(1 for r in results if r.status == name) for name in CHECK_STATUSES}
    if path.suffix.lower() == ".json":
        body = json.dumps(
            {
                "stt_model": args.stt_model,
                "language": args.language,
                "max_wer": args.max_wer,
                "wer_note": "wer is lenient (diacritics, numbers 0-20, hyphens); strict_wer is not",
                "counts": counts,
                "clips": [asdict(r) for r in results],
            },
            ensure_ascii=False,
            indent=2,
        )
    else:
        body = markdown_report(args, results, counts)
    atomic_write(path, redact(body + "\n").encode("utf-8"))


def markdown_report(
    args: argparse.Namespace, results: List[CheckResult], counts: Dict[str, int]
) -> str:
    def cell(text: str) -> str:
        return text.replace("|", "\\|").replace("\n", " ")

    def rate(value: Optional[float]) -> str:
        return "{:.2f}".format(value) if value is not None else "-"

    lines = [
        "# Voice clip check",
        "",
        "STT model `{}`, language `{}`, max WER {}: **{} passed, {} failed, {} missing, "
        "{} STT errors**.".format(
            args.stt_model,
            args.language or "auto",
            args.max_wer,
            *(counts[name] for name in CHECK_STATUSES),
        ),
        "",
        "WER is lenient (diacritics folded, numbers 0-20 as digits, hyphens and spacing "
        "forgiven); strict WER only ignores case and punctuation.",
        "",
        "| id | status | WER | strict WER | expected | heard / note |",
        "|---|---|---|---|---|---|",
    ]
    for r in results:
        heard = r.transcript or r.note
        lines.append(
            "| {} | {} | {} | {} | {} | {} |".format(
                cell(r.id), r.status, rate(r.wer), rate(r.strict_wer), cell(r.expected), cell(heard)
            )
        )
    return "\n".join(lines)


def cmd_chat(args: argparse.Namespace) -> int:
    prompt = sys.stdin.read() if args.prompt == "-" else args.prompt
    messages = [{"role": "system", "content": args.system}] if args.system else []
    messages.append({"role": "user", "content": prompt})
    payload: Dict[str, Any] = {"model": args.model, "messages": messages}
    if args.max_tokens:
        payload["max_tokens"] = args.max_tokens
    data = request("POST", "/chat/completions", payload=payload, timeout=TIMEOUT_AUDIO_S).json()
    say(reply_text(data))
    usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
    if usage.get("cost") is not None:
        warn("cost " + fmt_usd(usage.get("cost")))
    return EXIT_OK


def reply_text(data: Any) -> str:
    """The reply text; an error raised mid-generation arrives in a 200 body and exits 4."""
    try:
        choice = data["choices"][0]
    except (KeyError, IndexError, TypeError):
        raise CliError("unexpected chat response: no choices[0]", EXIT_API) from None
    error = choice.get("error") if isinstance(choice, dict) else None
    if error:
        body = json.dumps({"error": error if isinstance(error, dict) else {"message": str(error)}})
        raise api_error(200, body.encode("utf-8"), {})
    try:
        content = choice["message"]["content"]
    except (KeyError, TypeError):
        raise CliError("unexpected chat response: no choices[0].message", EXIT_API) from None
    if isinstance(content, list):
        return "".join(str(p.get("text", "")) for p in content if isinstance(p, dict))
    return str(content or "")


def cmd_image(args: argparse.Namespace) -> int:
    payload: Dict[str, Any] = {"model": args.model, "prompt": args.prompt}
    if args.aspect_ratio:
        payload["aspect_ratio"] = args.aspect_ratio
    data = request("POST", "/images", payload=payload, timeout=TIMEOUT_IMAGE_S).json()
    items = data.get("data") if isinstance(data, dict) else None
    first = items[0] if isinstance(items, list) and items and isinstance(items[0], dict) else {}
    encoded = str(first.get("b64_json") or "")
    if not encoded:
        raise CliError("the response contained no image", EXIT_API)
    if encoded.startswith("data:"):
        encoded = encoded.split(",", 1)[-1]
    out = Path(args.out)
    try:
        image = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        raise CliError(
            "the image in the response is not valid base64; nothing was written", EXIT_API
        ) from None
    if not image:
        raise CliError("the response contained an empty image; nothing was written", EXIT_API)
    atomic_write(out, image)
    media = first.get("media_type") or "unknown type"
    say("wrote {} ({:,} bytes, {})".format(out, len(image), media))
    usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
    if usage.get("cost") is not None:
        warn("cost " + fmt_usd(usage.get("cost")))
    return EXIT_OK


def cmd_cost(args: argparse.Namespace) -> int:
    info = fetch_generation(args.gen_id)
    if args.json:
        dump_json(info)
        return EXIT_OK
    for name in (
        "id",
        "model",
        "provider_name",
        "total_cost",
        "created_at",
        "latency",
        "generation_time",
    ):
        if info.get(name) is not None:
            value = fmt_usd(info[name]) if name == "total_cost" else info[name]
            say("{:<16} {}".format(name + ":", value))
    return EXIT_OK


# --------------------------------------------------------------------------
# Argument parsing
# --------------------------------------------------------------------------

PROG = "openrouter.py"


def positive_int(text: str) -> int:
    value = int(text)
    if value <= 0:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return value


def add_command(subparsers: Any, name: str, summary: str, examples: str) -> argparse.ArgumentParser:
    return subparsers.add_parser(
        name,
        help=summary,
        description=summary,
        epilog="examples:\n" + examples,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )


def add_tts_voice_args(parser: argparse.ArgumentParser, batch: bool) -> None:
    scope = " (default for clips without their own)" if batch else ""
    parser.add_argument(
        "--model",
        metavar="MODEL",
        required=True,
        help="TTS model slug, e.g. "
        "openai/gpt-4o-mini-tts-2025-12-15 (see `models --output speech`)",
    )
    parser.add_argument("--voice", metavar="VOICE", help="voice id from `voices MODEL`" + scope)
    parser.add_argument(
        "--instructions",
        metavar="TEXT",
        help="delivery/character notes (honoured by OpenAI "
        "gpt-4o-mini-tts, Gemini TTS, Fish Audio; ignored elsewhere)" + scope,
    )
    parser.add_argument(
        "--speed",
        metavar="X",
        type=float,
        help="speed multiplier (OpenAI honours it; others ignore it or reject non-1.0)",
    )
    parser.add_argument(
        "--max-chars",
        metavar="N",
        type=positive_int,
        help="cost guard: refuse/stop before sending more than N characters",
    )
    parser.add_argument(
        "--ref-audio",
        metavar="FILE",
        help="voice cloning: a short reference clip of a speaker "
        "who CONSENTED to cloning (wav/mp3/...; models with voice cloning only)",
    )
    parser.add_argument("--ref-text", metavar="TEXT", help="transcript of --ref-audio (optional)")
    parser.add_argument(
        "--no-ref-privacy",
        action="store_true",
        help="with --ref-audio, do NOT force --zdr and --deny-data-collection (only if the "
        "speaker's consent covers the provider keeping the clip, or no private endpoint exists)",
    )
    add_provider_args(parser)
    parser.add_argument(
        "--cost", action="store_true", help="look up the real cost afterwards (GET /generation)"
    )


def add_provider_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--zdr",
        action="store_true",
        help="route only to Zero Data Retention endpoints (provider.zdr); on by default with "
        "--ref-audio",
    )
    parser.add_argument(
        "--deny-data-collection",
        action="store_true",
        help="route only to providers that do not store or train on the data "
        "(provider.data_collection=deny); on by default with --ref-audio",
    )
    parser.add_argument(
        "--provider-options",
        metavar="JSON",
        help="provider passthrough options keyed by provider slug (provider.options), e.g. "
        '\'{"heygen": {"language": "af"}}\'',
    )


def add_keyterms_arg(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--keyterms",
        metavar="TERMS",
        help="comma-separated names/words to bias recognition toward, e.g. 'Oupa,tarentaal' "
        "(only some providers support it; others answer HTTP 400)",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog=PROG,
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description=__doc__.split("\n\n")[0] + "\nThe key comes from OPENROUTER_API_KEY "
        "and is never printed.",
        epilog="exit codes: 0 ok, 1 check found WER failures or missing clips / batch stopped "
        "by --max-chars, 2 usage, 3 key missing or malformed, 4 API error (incl. STT errors in "
        "check), 5 network error, 70 internal bug",
    )
    sub = parser.add_subparsers(dest="command", metavar="COMMAND", required=True)
    add_key_parser(sub)
    add_models_parsers(sub)
    add_tts_parser(sub)
    add_stt_parser(sub)
    add_batch_parser(sub)
    add_check_parser(sub)
    add_misc_parsers(sub)
    return parser


def add_key_parser(sub: Any) -> None:
    p = add_command(
        sub,
        "key",
        "Show the key's label, credit limit, remaining credit and usage (never the key itself).",
        "  openrouter.py key\n  openrouter.py key --json",
    )
    p.add_argument("--json", action="store_true", help="print the raw /key data")
    p.set_defaults(handler=cmd_key)


def add_models_parsers(sub: Any) -> None:
    p = add_command(
        sub,
        "models",
        "List models with voice counts and prices.",
        "  openrouter.py models --output speech\n"
        "  openrouter.py models --output transcription\n"
        "  openrouter.py models --output image --q flux --json",
    )
    p.add_argument(
        "--output", choices=MODEL_OUTPUTS, help="output modality filter (the API default is text)"
    )
    p.add_argument("--input", choices=MODEL_INPUTS, help="input modality filter")
    p.add_argument("--q", metavar="TEXT", help="search text")
    p.add_argument("--json", action="store_true", help="print the raw model objects")
    p.set_defaults(handler=cmd_models)
    p = add_command(
        sub,
        "voices",
        "List a TTS model's supported voice ids.",
        "  openrouter.py voices openai/gpt-4o-mini-tts-2025-12-15",
    )
    p.add_argument("model", help="model slug")
    p.add_argument("--json", action="store_true", help="print the voices as JSON")
    p.set_defaults(handler=cmd_voices)
    p = add_command(
        sub,
        "endpoints",
        "List a model's provider endpoints with status, prices and capability flags "
        "(e.g. voice_cloning). Status is the API's raw code: the spec lists 0, -1, -2, -3, -5 "
        "and -10 without explaining them.",
        "  openrouter.py endpoints fish-audio/s2.1-pro",
    )
    p.add_argument("model", help="model slug, author/slug")
    p.add_argument("--json", action="store_true", help="print the raw endpoint data")
    p.set_defaults(handler=cmd_endpoints)


def add_tts_parser(sub: Any) -> None:
    p = add_command(
        sub,
        "tts",
        "Text to speech: write one .mp3 (mp3) or .wav (pcm) file. "
        "Long text is split at sentence boundaries and joined.",
        "  openrouter.py tts --model openai/gpt-4o-mini-tts-2025-12-15 --voice ash \\\n"
        "      --text 'Môre! Lekker dag vir tarentale.' --out oupa_test_af.mp3\n"
        "  openrouter.py tts --model google/gemini-3.8-flash-tts --voice Puck \\\n"
        "      --text-file line.txt --out line.wav --instructions 'warm, dry humour'",
    )
    text = p.add_mutually_exclusive_group(required=True)
    text.add_argument("--text", metavar="TEXT", help="the text to speak")
    text.add_argument("--text-file", metavar="FILE", help="UTF-8 file with the text ('-' = stdin)")
    p.add_argument(
        "--out", metavar="FILE", required=True, help="output path ending in .mp3 or .wav"
    )
    p.add_argument(
        "--format",
        choices=("mp3", "pcm"),
        help="must match --out; .wav implies pcm (wrapped as 16-bit WAV)",
    )
    add_tts_voice_args(p, batch=False)
    p.set_defaults(handler=cmd_tts)


def add_stt_parser(sub: Any) -> None:
    p = add_command(
        sub,
        "stt",
        "Speech to text: transcribe one audio file (max 25 MB).",
        "  openrouter.py stt --model openai/whisper-large-v3 --file clip.wav --language af\n"
        "  openrouter.py stt --model openai/whisper-1 --file talk.mp3 --verbose --json",
    )
    p.add_argument(
        "--model",
        metavar="MODEL",
        required=True,
        help="STT model slug (see `models --output transcription`)",
    )
    p.add_argument(
        "--file",
        metavar="FILE",
        required=True,
        help="audio file: "
        + ", ".join(STT_FORMATS)
        + " (the format is taken from the extension; support varies by provider, opus "
        "especially)",
    )
    p.add_argument(
        "--language",
        metavar="CODE",
        help="ISO-639-1 code, e.g. af, en, de (auto-detected if omitted)",
    )
    p.add_argument(
        "--verbose",
        action="store_true",
        help="request verbose_json (language, duration, timed segments)",
    )
    p.add_argument("--json", action="store_true", help="print the full JSON response")
    add_keyterms_arg(p)
    add_provider_args(p)
    p.set_defaults(handler=cmd_stt)


def add_manifest_args(p: argparse.ArgumentParser) -> None:
    p.add_argument(
        "--manifest",
        metavar="FILE",
        required=True,
        help='JSON list of {"id", "text", "voice"?, "instructions"?, "out"?, "language"?}',
    )
    p.add_argument(
        "--out-dir",
        metavar="DIR",
        help="where clips live (default: the manifest's folder); "
        "relative clip 'out' paths resolve against it",
    )
    p.add_argument(
        "--format",
        choices=("mp3", "pcm"),
        help="extension for clips without 'out': mp3 -> .mp3 (default), pcm -> .wav "
        "(check looks only for this extension)",
    )
    p.add_argument("--only", metavar="IDS", help="comma-separated clip ids to process")


def add_batch_parser(sub: Any) -> None:
    p = add_command(
        sub,
        "batch",
        "Generate every clip in a manifest. Skips clips whose file exists, unless their "
        "text/voice/settings changed since the last batch run or --force is given. The record "
        "of past runs is <manifest-name>.state.json next to the manifest (oupa-af.json -> "
        "oupa-af.state.json), keyed by output path, so separate --out-dir folders do not "
        "interfere.",
        "  openrouter.py batch --manifest voice/oupa.json --model M --voice V --dry-run\n"
        "  openrouter.py batch --manifest voice/oupa.json --model M --voice V \\\n"
        "      --format pcm --out-dir tmp/voice/af --max-chars 5000\n"
        "  openrouter.py batch --manifest voice/oupa.json --model M --only a,b --force",
    )
    add_manifest_args(p)
    add_tts_voice_args(p, batch=True)
    p.add_argument("--force", action="store_true", help="regenerate even if the file exists")
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="print clip count, characters and an estimated cost; send nothing",
    )
    p.add_argument(
        "--price-per-char",
        metavar="USD",
        type=float,
        help="USD per character for the dry-run estimate (overrides the /models price)",
    )
    p.set_defaults(handler=cmd_batch)


def add_check_parser(sub: Any) -> None:
    p = add_command(
        sub,
        "check",
        "Round-trip check: transcribe each generated clip and compare it with its text. "
        "Pass/fail uses a lenient word error rate (diacritics folded, numbers 0-20 in "
        "en/af/de as digits, '+' as plus, hyphens and spacing forgiven); the strict WER is "
        "shown too. Exit 1 for WER failures or missing clips, 4 if the STT requests failed.",
        "  openrouter.py check --manifest voice/oupa.json --stt-model openai/whisper-large-v3 \\\n"
        "      --language af --report voice/check-report.md",
    )
    add_manifest_args(p)
    p.add_argument("--stt-model", metavar="MODEL", required=True, help="STT model slug")
    p.add_argument(
        "--language",
        metavar="CODE",
        help="ISO-639-1 code for all clips (a clip's own 'language' wins)",
    )
    p.add_argument(
        "--max-wer",
        metavar="X",
        type=float,
        default=0.2,
        help="highest word error rate that passes (default 0.2)",
    )
    p.add_argument("--report", metavar="FILE", help="write a report: path ending in .json or .md")
    add_keyterms_arg(p)
    add_provider_args(p)
    p.set_defaults(handler=cmd_check)


def add_misc_parsers(sub: Any) -> None:
    p = add_command(
        sub,
        "chat",
        "Send one prompt to a chat model and print the reply.",
        "  openrouter.py chat --model google/gemini-2.5-flash 'Translate to Afrikaans: "
        "Good morning'\n  cat notes.txt | openrouter.py chat --model M -",
    )
    p.add_argument("prompt", help="the prompt ('-' reads stdin)")
    p.add_argument("--model", metavar="MODEL", required=True, help="chat model slug")
    p.add_argument("--system", metavar="TEXT", help="system message")
    p.add_argument(
        "--max-tokens", metavar="N", type=positive_int, help="cap the reply length (and its cost)"
    )
    p.set_defaults(handler=cmd_chat)
    p = add_command(
        sub,
        "image",
        "Generate an image (POST /images) and write the first one.",
        "  openrouter.py image --model bytedance-seed/seedream-4.5 \\\n"
        "      --prompt 'helmeted guineafowl, flat vector icon' --out icon.png",
    )
    p.add_argument(
        "--model",
        metavar="MODEL",
        required=True,
        help="image model slug (see `models --output image`)",
    )
    p.add_argument("--prompt", metavar="TEXT", required=True, help="image description")
    p.add_argument(
        "--out", metavar="FILE", required=True, help="output file (extension should match the type)"
    )
    p.add_argument(
        "--aspect-ratio", choices=ASPECT_RATIOS, metavar="RATIO", help="e.g. 1:1, 16:9, 9:16, auto"
    )
    p.set_defaults(handler=cmd_image)
    p = add_command(
        sub,
        "cost",
        "Show a generation's real cost (GET /generation).",
        "  openrouter.py cost gen-tts-1234567890-abcdef",
    )
    p.add_argument("gen_id", help="generation id (printed by tts/batch, X-Generation-Id)")
    p.add_argument("--json", action="store_true", help="print the raw generation data")
    p.set_defaults(handler=cmd_cost)


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:  # --help (0) or a usage error (2)
        return exc.code if isinstance(exc.code, int) else EXIT_USAGE
    try:
        return args.handler(args)
    except ApiError as err:
        warn(err.describe())
        return EXIT_API
    except CliError as err:
        text = str(err)
        warn(text if text.startswith(("network error", "OPENROUTER_API_KEY")) else "error: " + text)
        return err.exit_code
    except KeyboardInterrupt:
        warn("interrupted")
        return 130
    except Exception as exc:  # no raw traceback: nothing secret can leak through one
        warn("internal error: {}: {}".format(type(exc).__name__, exc))
        if os.environ.get("OPENROUTER_DEBUG"):
            warn(traceback.format_exc())
        return EXIT_INTERNAL


if __name__ == "__main__":
    sys.exit(main())
