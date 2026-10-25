"""v1.5 (D-041) interim voice for Oupa: offline text-to-speech, run by `npm run audio:voice`.

tools/audio/voice.ts writes the jobs (one per voice language and line: the text, the output WAV)
and calls this script with the Python of a virtual environment set up as docs/06 §5 says.
Every engine and model here is open source with a licence that allows commercial use of the
audio (docs/05 D-041 has the table). Nothing is called over the network except the one-time
model download from the public URLs below (no account, no key).

  en, af  Kokoro-82M v1.0 (Apache-2.0) through kokoro-onnx (MIT). Afrikaans has no
          commercially usable neural model, so the same voice reads eSpeak NG's Afrikaans
          phonemes (rule-based, GPL-3.0 tool; its output is not covered by the GPL).
  de      Thorsten-Voice's German fine-tune of Kokoro-82M (Apache-2.0, trained on the CC0
          Thorsten-Voice dataset) through the kokoro package (Apache-2.0).

Usage: python voice_tts.py <jobs.json> <config.json> <models dir>
"""

import hashlib
import json
import os
import sys
import urllib.request
import wave

import numpy as np

MODELS = {
    "kokoro-v1.0.int8.onnx": (
        "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx",
        "6e742170d309016e5891a994e1ce1559c702a2ccd0075e67ef7157974f6406cb",
    ),
    "voices-v1.0.bin": (
        "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
        "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
    ),
    "thorsten/config.json": (
        "https://huggingface.co/Thorsten-Voice/Kokoro/resolve/main/config.json",
        "5abb01e2403b072bf03d04fde160443e209d7a0dad49a423be15196b9b43c17f",
    ),
    "thorsten/model.pth": (
        "https://huggingface.co/Thorsten-Voice/Kokoro/resolve/main/model.pth",
        "36dde15c4a800cfd1ab540ccb4476dbab604fe03ff7c937d976ebbf3b49e59ce",
    ),
    "thorsten/voices/thorsten.pt": (
        "https://huggingface.co/Thorsten-Voice/Kokoro/resolve/main/voices/thorsten.pt",
        "9d98b775ebce1cfc369e8f9a3ee8ee260cd612dffb477cba85749112362306d7",
    ),
}
KOKORO_RATE = 24000


def model(models_dir, name):
    """A model file, downloaded once from its public URL and checked against its SHA-256."""
    path = os.path.join(models_dir, name)
    url, sha = MODELS[name]
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        print(f"voice: downloading {url}", flush=True)
        urllib.request.urlretrieve(url, path + ".part")
        os.replace(path + ".part", path)
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    if h.hexdigest() != sha:
        sys.exit(f"voice: {name} has the wrong checksum (delete it to download again)")
    return path


def espeak_setup():
    """eSpeak NG from espeakng-loader. Its data path must be short (eSpeak's path buffer)."""
    import espeakng_loader
    from phonemizer.backend.espeak.wrapper import EspeakWrapper

    data = espeakng_loader.get_data_path()
    if len(data) > 120:
        short = os.path.join(os.path.expanduser("~"), ".cache", "tarantal-espeak-ng-data")
        os.makedirs(os.path.dirname(short), exist_ok=True)
        if not os.path.islink(short):
            if os.path.exists(short):
                os.remove(short)
            os.symlink(data, short)
        data = short
    os.environ["ESPEAK_DATA_PATH"] = data
    EspeakWrapper.set_library(espeakng_loader.get_library_path())
    EspeakWrapper.set_data_path(data)


def segments(text, lang_espeak, af_phrases, ipa):
    """Splits a line into (text, language) parts: /…/ is raw IPA, a word in `ipa` is read as
    written there, and Oupa's Afrikaans words in an English or German line are read as Afrikaans."""
    out = []
    for n, part in enumerate(text.split("/")):
        if n % 2 == 1:
            out.append((part, "ipa"))
            continue
        out.extend(words(part, lang_espeak, [] if lang_espeak == "af" else af_phrases, ipa))
    return [(t, l) for t, l in out if t.strip()]


def words(text, lang_espeak, af_phrases, ipa):
    out, i, low = [], 0, text.lower()
    phrases = sorted([*af_phrases, *ipa.keys()], key=len, reverse=True)
    while i < len(text):
        hit = None
        for p in phrases:
            j = low.find(p.lower(), i)
            while j >= 0:
                end = j + len(p)
                # Whole words only.
                if (j == 0 or not text[j - 1].isalpha()) and (end >= len(text) or not text[end].isalpha()):
                    break
                j = low.find(p.lower(), j + 1)
            if j >= 0 and (hit is None or j < hit[0]):
                hit = (j, j + len(p), p)
        if hit is None:
            out.append((text[i:], lang_espeak))
            break
        if hit[0] > i:
            out.append((text[i : hit[0]], lang_espeak))
        if hit[2] in ipa:
            out.append((ipa[hit[2]], "ipa"))
        else:
            out.append((text[hit[0] : hit[1]], "af"))
        i = hit[1]
    return out


def phonemes(text, lang_espeak, af_phrases, ipa, vocab):
    from phonemizer import phonemize

    parts = []
    for seg, lang in segments(text, lang_espeak, af_phrases, ipa):
        if lang == "ipa":
            parts.append(seg.strip())
            continue
        ps = phonemize(seg, language=lang, backend="espeak", preserve_punctuation=True, with_stress=True)
        parts.append(ps.strip())
    ps = " ".join(p for p in parts if p)
    # Kokoro has no short ü (ʏ): its long y is the nearest (the Thorsten-Voice model card).
    ps = ps.replace("ʏ", "y")
    # No gap before punctuation (the parts were joined with spaces).
    for mark in ",.!?…:":
        ps = ps.replace(" " + mark, mark)
    return "".join(c for c in ps if c in vocab).strip()


def resample(x, n):
    """FFT resample to n samples (band-limited; fine for short lines)."""
    if n == len(x):
        return x
    spec = np.fft.rfft(x)
    m = n // 2 + 1
    out = np.zeros(m, dtype=complex)
    k = min(m, len(spec))
    out[:k] = spec[:k]
    return np.fft.irfft(out, n) * (n / len(x))


def finish(audio, rate_in, cfg, pitch):
    x = np.asarray(audio, dtype=np.float64)
    # Pitch by resampling: a lower voice, slower by the same ratio (Oupa's dry, unhurried pace).
    ratio = 2 ** (pitch / 12)
    x = resample(x, int(round(len(x) / ratio)))
    rate = cfg["sampleRate"]
    x = resample(x, int(round(len(x) * rate / rate_in)))
    # Trim the model's own silence, then a short fixed lead-in and tail.
    thr = 10 ** (-45 / 20) * max(1e-9, np.max(np.abs(x)))
    loud = np.nonzero(np.abs(x) > thr)[0]
    if len(loud) > 0:
        x = x[max(0, loud[0] - int(0.01 * rate)) : loud[-1] + int(0.03 * rate)]
    fade = int(0.008 * rate)
    if len(x) > 2 * fade:
        ramp = np.linspace(0, 1, fade)
        x[:fade] *= ramp
        x[-fade:] *= ramp[::-1]
    lead = np.zeros(int(cfg["leadMs"] / 1000 * rate))
    tail = np.zeros(int(cfg["tailMs"] / 1000 * rate))
    x = np.concatenate([lead, x, tail])
    # Headroom only; the pack tool normalises to −16 LUFS (docs/06 §5).
    peak = np.max(np.abs(x))
    if peak > 0:
        x = x * (0.8 / peak)
    return x, rate


def write_wav(path, x, rate):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    pcm = np.clip(np.round(x * 32767), -32768, 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())


class KokoroOnnx:
    def __init__(self, models_dir, voice):
        from kokoro_onnx import EspeakConfig, Kokoro
        import espeakng_loader

        self.k = Kokoro(
            model(models_dir, "kokoro-v1.0.int8.onnx"),
            model(models_dir, "voices-v1.0.bin"),
            espeak_config=EspeakConfig(
                lib_path=espeakng_loader.get_library_path(), data_path=os.environ["ESPEAK_DATA_PATH"]
            ),
        )
        self.vocab = self.k.tokenizer.vocab
        # A weighted blend of Kokoro voices (style vectors), e.g. 0.7 bm_george + 0.3 am_fenrir.
        self.style = sum(w * self.k.get_voice_style(n) for n, w in voice.items())
        self.label = "Kokoro-82M v1.0 (Apache-2.0) " + "+".join(f"{n}×{w}" for n, w in voice.items())

    def say(self, ps, speed):
        audio, rate = self.k.create(ps, voice=self.style, speed=speed, is_phonemes=True)
        return audio, rate


class KokoroThorsten:
    def __init__(self, models_dir, _voice):
        import torch
        from kokoro import KModel

        self.torch = torch
        torch.manual_seed(0)
        self.m = KModel(
            repo_id="hexgrad/Kokoro-82M",
            config=model(models_dir, "thorsten/config.json"),
            model=model(models_dir, "thorsten/model.pth"),
        ).eval()
        self.pack = torch.load(model(models_dir, "thorsten/voices/thorsten.pt"), map_location="cpu", weights_only=True)
        self.vocab = self.m.vocab
        self.label = "Thorsten-Voice/Kokoro (Apache-2.0, CC0 data)"

    def say(self, ps, speed):
        n = len([c for c in ps if c in self.vocab])
        ref = self.pack[min(n, len(self.pack)) - 1]
        with self.torch.no_grad():
            audio = self.m(ps, ref, speed)
        return audio.numpy(), KOKORO_RATE


ENGINES = {"kokoro-onnx": KokoroOnnx, "kokoro-thorsten": KokoroThorsten}


def main():
    jobs = json.load(open(sys.argv[1], encoding="utf-8"))
    cfg = json.load(open(sys.argv[2], encoding="utf-8"))
    models_dir = sys.argv[3]
    espeak_setup()
    engines = {}
    for job in jobs:
        lang = job["lang"]
        lc = cfg["languages"][lang]
        if lang not in engines:
            engines[lang] = ENGINES[lc["engine"]](models_dir, lc["voice"])
        eng = engines[lang]
        line = cfg["lines"].get(job["key"], {})
        text = cfg["say"].get(lang, {}).get(job["key"], job["text"])
        for a, b in cfg.get("sayAll", {}).get(lang, {}).items():
            text = text.replace(a, b)
        ps = phonemes(text, lc["espeak"], cfg["afPhrases"], cfg.get("ipa", {}), eng.vocab)
        audio, rate = eng.say(ps, line.get("speed", 1) * lc["speed"])
        x, out_rate = finish(audio, rate, cfg, lc["pitch"] + line.get("pitch", 0))
        write_wav(job["out"], x, out_rate)
        side = {
            "origin": "interim",
            "source": f"{eng.label}; phonemes eSpeak NG {lc['espeak']}; speed {lc['speed']}, pitch {lc['pitch'] + line.get('pitch', 0)} st",
        }
        with open(job["out"][:-4] + ".json", "w", encoding="utf-8") as f:
            f.write(json.dumps(side, ensure_ascii=False, indent=2) + "\n")
        print(f"voice: {lang} {job['key']} {len(x) / out_rate:.2f} s", flush=True)


if __name__ == "__main__":
    main()
