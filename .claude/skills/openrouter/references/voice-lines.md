# Game voice lines with OpenRouter

A practical guide to making a character's lines (for example Oupa in Tarantal Madness, in
English, Afrikaans and German) with the `openrouter` CLI. Below, `openrouter.py` means
`python3 .claude/skills/openrouter/scripts/openrouter.py`.

Contents: 1 The loop · 2 Tarantal specifics · 3 Choosing models and voices · 4 Voice cloning ·
5 Directing the character · 6 Manifest and file names · 7 Dry run and cost · 8 Generate, check,
fix · 9 Loudness and formats · 10 Keys out of repos and logs · 11 GitHub Actions

## 1. The loop

1. `openrouter.py key`: confirm that the key and network work, and check the remaining credit.
2. Choose a model and voice for each language with a short trial (§3), and let the user listen.
3. Write the manifest (§6), with the spoken text for each line.
4. `batch --dry-run` and show the estimate (§7).
5. Run `batch --max-chars N` into a staging folder.
6. Run `check`, listen to the failures, and regenerate only those (§8).
7. A person listens to everything. Then deliver the clips the way the project expects (§2).

## 2. Tarantal specifics (read before touching voice assets)

The rules live in `docs/03-ART-AUDIO-BIBLE.md` §10.1, `docs/06-ASSET-DELIVERY.md` ("Voices" and
"How to deliver final voice packs") and decision D-041. In short:
- Lines are i18n keys (`bark.<id>`). There is one folder per voice language,
  `art-source/audio/voice/<lang>/<key>.wav`, for `en`, `af` and `de`. The text to read is in
  `src/i18n/<lang>.json`. Oupa's Afrikaans exclamations ("Mooi skoot", "my kind", "Jinne") stay
  Afrikaans in every language.
- Today's packs are **interim**: open-source TTS from `npm run audio:voice`, each WAV with a
  `<key>.json` sidecar `{"origin": "interim", …}`. **A WAV without a sidecar is final**, and the
  interim generator never overwrites it. Final voices are the **product owner's decision**.
- So generate into a **staging folder** (e.g. `tmp/voice/<lang>/`, which is git-ignored), never
  straight into `art-source/`. Only once the product owner approves, copy each WAV in and delete
  that key's interim WAV and sidecar, as docs/06 describes. Then run `npm run assets:pack`,
  `npm run assets:audit` and `npm run size -- --strict` (each voice group ≤ 1.5 MB gzip).
- Masters: the delivery spec asks for 44.1 or 48 kHz WAV, mono is fine, about 1 dB of headroom
  and **no normalising**: the pack tool measures loudness and sets −16 LUFS / −1 dBTP itself.
  TTS pcm usually arrives at 24 kHz, so it **must be resampled** to make a master that meets
  the spec (`ffmpeg -i in.wav -ar 48000 out.wav`). Also tell the product owner that the source
  is only 24 kHz: resampling does not add detail, which matters when they decide whether these
  clips are final.
- Use `--format pcm` (WAV) for masters. The pack tool makes the Ogg and MP3 files.
- Some captions are not speakable as written, e.g. `bark.sign` is "Windpompbord: +5 s!".
  `tools/audio/voice.config.json → say` holds spoken versions for the interim voices; its `/…/`
  parts are eSpeak IPA, which cloud TTS cannot read. Put a speakable text in the manifest
  ("Windpompbord: plus vyf sekondes!"). That text is what gets spoken and what `check` compares.
- Not every key is Oupa. `bark.weavers` (the weavers scolding), `bark.meerkat_scold` and
  `bark.kwaak` (a frog) need their own voice and instructions.
- Licences matter here: D-041 rejected every NonCommercial model. Each provider behind OpenRouter
  has its own terms for commercial use of the generated audio. Check them for the chosen model
  before shipping, and record the model, provider, voice and terms in a decision entry
  (`docs/05`) and in the bible's §10.1 table, as CLAUDE.md requires for rule changes.

## 3. Choosing models and voices

Never pick from memory. List what exists today:

```bash
openrouter.py models --output speech          # TTS models, voice counts, prices
openrouter.py voices <model>                  # that model's voice ids
openrouter.py models --output transcription   # STT models for the check
```

Candidates named in OpenRouter's docs (verify that each still exists, and its price):

| Model | Why try it | Watch out for |
|---|---|---|
| `openai/gpt-4o-mini-tts-2025-12-15` | Honours `instructions` (character direction) and `speed`; mp3 or pcm | Language follows the text; Afrikaans quality unknown |
| `google/gemini-3.8-flash-tts`, `…-flash-lite-tts` | Honours `instructions`; Google lists `af-ZA` (Preview) upstream | pcm only (use `.wav`); reads the text verbatim, so no stage directions in it |
| `microsoft/mai-voice-2.1` (also `-2`, `-2.1-flash`) | The voice's locale sets the language | Look in `voices` for an `af-ZA…` voice; if none exists, skip it for Afrikaans |
| `fish-audio/s2.1-pro` | Voice cloning (§4); honours `instructions`; `[bracket]` directions | Check `endpoints` for `voice_cloning` |
| `mistralai/voxtral-mini-tts-2603` | Voice IDs carry a language prefix (`en_paul_neutral`) | Check that the voice list has the languages you need |
| ElevenLabs | Advertises Afrikaans upstream | Not documented as an OpenRouter TTS model: `models --output speech --q eleven` |

Trial protocol (run it first for Afrikaans, the riskiest language):
1. Pick 5–6 real lines that cover ê, ô, ë, "'n", the guttural g and rolled r, plus the game's own
   words. For example: "Mooi skoot, my kind!", "Ag nee man!", "Jinne, kyk hoe hardloop hulle!",
   "Twee vlieë met een klap!", "Laai, laai, laai!", "Stadsjapie…".
2. Put them in a trial manifest and run `batch` once per candidate (2–3 models × 1–2 voices),
   each with its own `--out-dir tmp/voice-trials/<model>-<voice>`. That is about 1,000
   characters in total: cents. The state file records each output path separately, so
   re-running one candidate's folder does not regenerate (and re-buy) the others.
3. Run `check --language af` on each folder for a rough intelligibility signal.
4. A native speaker listens and scores each set: understandable? does it sound Afrikaans (not
   Dutch or English)? does it fit Oupa? The ear decides; WER only narrows the field.
5. For one consistent character, prefer one model and voice for all three languages, as long as
   it passes in each. If one language fails, try a voice native to that language, or cloning
   (§4), before mixing very different voices.

Kokoro voice IDs start with a language and gender code: `af_…` means **American female**, not
Afrikaans.

For STT, Whisper models (`openai/whisper-large-v3`, `openai/whisper-1`) accept `--language af`.
Expect them to be weaker on Afrikaans than on English or German, so treat their errors as a
reason to listen, not as a verdict.

## 4. Voice cloning (only with consent)

Some endpoints clone a voice from a reference recording sent with each request
(`input_references`; the CLI's `--ref-audio` and `--ref-text`).
- **Consent first.** Use only a recording of a person who has explicitly agreed, preferably in
  writing (e.g. a voice actor's contract that covers AI voice cloning for this game), to have
  their voice cloned. Never clone a celebrity, a public figure, an old family recording or
  anything found online.
- Check support: `openrouter.py endpoints <model>` must show `voice_cloning`.
- With `--ref-audio`, the CLI asks only for endpoints with Zero Data Retention that do not
  collect data (`--zdr`, `--deny-data-collection`), because the clip is someone's voice. If no
  such endpoint serves the model, the request fails. Then pick another model, or use
  `--no-ref-privacy` only if the speaker's consent covers the provider storing the clip.
- Use a short, clean recording of a single speaker with no music. Pass its transcript with
  `--ref-text`. Formats and ideal length depend on the provider; the inline limit is 15 MiB.
- One reference across all three languages keeps the character's voice consistent.
- The reference clip is personal data. Keep it out of the repository unless the speaker agreed
  to that, and never in a public one.

```bash
openrouter.py tts --model fish-audio/s2.1-pro --ref-audio ~/consented/oupa_ref.wav \
  --ref-text "Exact words spoken in the reference." --text "Mooi skoot, my kind!" \
  --out tmp/voice-trials/clone_test.mp3 --cost
```

## 5. Directing the character

Write one instruction text per character and reuse it everywhere (`--instructions` on `batch`).
Override it per line in the manifest only for a different emotion. Example for Oupa, built from
the bible's character notes:

```text
Oupa: an older Afrikaner farmer in his seventies, from a farm in Namibia. Warm, low, slightly
gravelly voice. Dry humour and quiet pride; sometimes scandalised, never shrill. Unhurried,
with small pauses at commas. These are short game call-outs: lively, but not shouted.
```

Add one sentence per language and test with and without it, because accents can come out
strange:
- English: "South African English accent; Afrikaans words such as 'Mooi skoot', 'my kind' and
  'Jinne' are pronounced in Afrikaans."
- German: "Fluent German with a light Afrikaans accent; the Afrikaans words stay Afrikaans."

Per-line overrides: "scandalised, a long drawn-out 'ag'" for `bark.ag_nee`; "gently teasing" for
`bark.stadsjapie`.

Writing speakable text:
- Write numbers, units and symbols as words ("plus vyf sekondes", not "+5 s"). `check` forgives
  digits versus words only for 0–20 in English, Afrikaans and German, so "25" against
  "vyf-en-twintig" still counts as an error.
- Use punctuation for rhythm: an ellipsis to trail off, a comma for a breath. One or two short
  sentences per line (most barks are 1–3 s).
- Gemini TTS speaks everything in the text, so put direction in `instructions`. Fish Audio also
  understands `[whispering]`-style directions inside the text.
- Mixed-language lines (Afrikaans words in English or German) will score worse in `check`,
  because the STT spells those words its own way. `--keyterms "Mooi skoot,Jinne,Oupa"` can help
  on providers that support it (others answer 400). Otherwise, listen instead of chasing the
  WER.

## 6. Manifest and file names

A manifest is a JSON list. Only `id` and `text` are required; unknown fields such as `note` are
ignored.

```json
[
  {"id": "bark.mooi_skoot", "text": "Mooi skoot, my kind!", "language": "af"},
  {"id": "bark.ag_nee", "text": "Ag nee man!", "language": "af",
   "instructions": "Scandalised, a long drawn-out 'ag'. Older Afrikaner farmer, dry humour."},
  {"id": "bark.sign", "text": "Windpompbord: plus vyf sekondes!", "language": "af",
   "note": "caption is 'Windpompbord: +5 s!'"},
  {"id": "bark.weavers", "text": "Tsk-tsk-tsk! Los ons nes!", "language": "af",
   "voice": "<a lighter voice from `voices`>", "instructions": "A small, indignant weaver bird: quick and high.",
   "note": "not Oupa"}
]
```

- `id` becomes the file name (`<id>.wav` with `--format pcm`, `<id>.mp3` otherwise). Use the
  project's own keys, here the i18n key, so files drop into place. IDs may contain letters,
  digits, `.`, `_` and `-`.
- Keep one manifest per language (or a mixed one with a `language` on every clip); `check` uses
  each clip's `language`.
- `out` sets an explicit path, relative to `--out-dir`.
- `batch` keeps a state file next to the manifest (`oupa-af.json` → `oupa-af.state.json`). It
  is keyed by each clip's output path relative to the manifest, and is used to notice changed
  lines. Keep it with the manifest.

Building a Tarantal manifest from the i18n file, for the keys that already have a voice file:

```bash
python3 - <<'EOF'
import json, pathlib
lang = "af"
text = json.loads(pathlib.Path(f"src/i18n/{lang}.json").read_text(encoding="utf-8"))
keys = sorted(p.stem for p in pathlib.Path(f"art-source/audio/voice/{lang}").glob("bark.*.wav"))
clips = [{"id": k, "text": text[k], "language": lang} for k in keys if k in text]
out = pathlib.Path(f"tmp/voice/oupa-{lang}.json")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(clips, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(len(clips), "clips ->", out)
EOF
```

Then fix the unspeakable lines by hand (see §2) and set the non-Oupa voices.

## 7. Dry run and cost

```bash
openrouter.py batch --manifest tmp/voice/oupa-af.json --model <tts-model> --voice <voice> \
  --instructions "$(cat tmp/voice/oupa-direction.txt)" --format pcm --out-dir tmp/voice/af --dry-run
```

This prints the clip count, the characters, the requests, and an **estimated** cost from the
model's listed price (assumed to be per character in `pricing.prompt`, which OpenRouter does not
document). Models priced per second of audio cannot be estimated. Treat the number as a rough
guide, and confirm it with `--cost` on a single test clip. At typical per-character prices, a
full set of short barks costs cents per language; the real risk is regenerating in loops or
sending long texts by mistake. Always pass `--max-chars` (about 1.2× the dry-run total). A key
with a small credit limit caps the worst case.

## 8. Generate, check, fix

```bash
openrouter.py batch --manifest tmp/voice/oupa-af.json --model <tts-model> --voice <voice> \
  --instructions "$(cat tmp/voice/oupa-direction.txt)" --format pcm --out-dir tmp/voice/af \
  --max-chars 2500 --cost
openrouter.py check --manifest tmp/voice/oupa-af.json --stt-model <stt-model> --language af \
  --format pcm --out-dir tmp/voice/af --report tmp/voice/af-check.md
```

- `check` decides pass or fail on a **lenient** word error rate: case, punctuation, apostrophes
  and diacritics are ignored (Môre = More), number words 0–20 equal their digits (tien = 10),
  `+` equals "plus", and hyphens or spacing in compounds are forgiven
  (Bosveld-legende = Bosveldlegende = Bosveld legende). The **strict** WER, where ê ≠ e, is
  shown next to it. Above `--max-wer` (0.2) a clip fails.
- Results have four states. **fail**: listen first. **missing**: no file in the requested
  `--format`, so run `batch` for it without `--force`. **error**: the STT request failed (exit
  4), so fix the STT model or options and do not regenerate. **pass**: still listen.
- Short lines are harsh: one wrong word in "Ag nee man!" is 0.33. Read the report as a list of
  clips to listen to.
- To fix a failed clip, first listen. If the STT is wrong, leave the clip. If the TTS is wrong,
  rewrite the text (spelling, punctuation) or adjust the instructions, then regenerate only
  that clip with `batch … --only bark.ag_nee --force` (`check` prints this command for WER
  failures only).
- Editing a line's text, voice or instructions in the manifest regenerates just that line on the
  next `batch`, without `--force`. Changing the shared `--instructions` or the model regenerates
  every clip that uses it, so run `--dry-run` first.
- Nothing ships on the WER alone. A person listens to every clip, because WER cannot hear accent,
  tone or timing.

## 9. Loudness and formats

- **Tarantal:** do not normalise; `npm run assets:pack` measures loudness and normalises voice to
  −16 LUFS / −1 dBTP. Deliver WAV masters (§2).
- **Other projects:** keep every line at one loudness. If `ffmpeg` is available
  (`command -v ffmpeg`), this is a reasonable one-pass normalisation for spoken lines:

  ```bash
  ffmpeg -hide_banner -i in.wav -af loudnorm=I=-16:TP=-1.5:LRA=11 -ar 48000 -ac 1 out.wav
  ```

  The loudness measurement needs a few seconds of audio, so check very short clips by ear (or
  use one fixed gain for the whole set). For the web, mono mp3 at 64–96 kbps or Ogg Vorbis is
  plenty for speech. Keep the WAV as the master.
- To trim leading and trailing silence, if a model pads its output:
  `ffmpeg -i in.wav -af silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse out.wav`.

## 10. Keys out of repos and logs

- The key lives only in the environment: the cloud environment's settings, a CI secret, or the
  local shell profile. It never goes into the repo, a manifest, a report, a commit message, an
  issue or the chat. If a local `.env` file is used, it must be git-ignored.
- The CLI never prints the key, and it removes the key from any server message that echoes it.
  Do not undo that: no `echo $OPENROUTER_API_KEY`, no `set -x` around commands that use the key,
  no `env` dumps, no curl command lines with the key in logs or transcripts.
- If a key leaks, delete it at https://openrouter.ai/keys, create a new one with a small credit
  limit, and update the stored secret.

## 11. Running it in GitHub Actions

Add the key as a repository secret: Settings → Secrets and variables → Actions → New
repository secret, named `OPENROUTER_API_KEY`. GitHub masks secrets in logs, and workflows
triggered from forks do not receive them. A manually triggered workflow means only maintainers
can spend credit. GitHub-hosted runners can reach openrouter.ai.

This is an example only; it is not installed in the repo. Workflow inputs go through `env:`
rather than straight into `run:` lines, which avoids shell injection. The manifest must be
committed (the `tmp/` folder is not), for example next to the other voice sources.

```yaml
# .github/workflows/voice-lines.yml  (example - not part of the repo)
name: Voice lines (OpenRouter)
on:
  workflow_dispatch:
    inputs:
      manifest: { description: "Manifest path (committed JSON)", required: true }
      tts_model: { description: "TTS model slug", required: true }
      voice: { description: "Voice id", required: true }
      stt_model: { description: "STT model slug for the check", required: true }
      language: { description: "ISO-639-1 code for the check", default: "af" }
      only: { description: "Comma-separated clip ids (empty = all)", default: "" }
      max_chars: { description: "Character cap for this run", default: "3000" }
permissions:
  contents: read
concurrency: voice-lines # one paid run at a time
jobs:
  voice:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
      CLI: .claude/skills/openrouter/scripts/openrouter.py
      OUT: out/voice
      MANIFEST: ${{ inputs.manifest }}
      TTS_MODEL: ${{ inputs.tts_model }}
      VOICE: ${{ inputs.voice }}
      STT_MODEL: ${{ inputs.stt_model }}
      LANG_CODE: ${{ inputs.language }}
      ONLY: ${{ inputs.only }}
      MAX_CHARS: ${{ inputs.max_chars }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - name: Key and credit (never prints the key)
        run: python3 "$CLI" key
      - name: Dry run (estimate)
        run: >
          python3 "$CLI" batch --manifest "$MANIFEST" --model "$TTS_MODEL" --voice "$VOICE"
          --format pcm --out-dir "$OUT" --max-chars "$MAX_CHARS" ${ONLY:+--only "$ONLY"} --dry-run
      - name: Generate
        run: >
          python3 "$CLI" batch --manifest "$MANIFEST" --model "$TTS_MODEL" --voice "$VOICE"
          --format pcm --out-dir "$OUT" --max-chars "$MAX_CHARS" ${ONLY:+--only "$ONLY"} --cost
      - name: Round-trip check (fails the job if a clip fails)
        run: >
          python3 "$CLI" check --manifest "$MANIFEST" --stt-model "$STT_MODEL"
          --language "$LANG_CODE" --format pcm --out-dir "$OUT" ${ONLY:+--only "$ONLY"}
          --report "$OUT/check-report.md"
      - name: Upload clips and report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: voice-lines
          path: out/voice/
          if-no-files-found: warn
```

Notes:
- Each run starts with an empty `out/voice`, so it regenerates every selected clip. Use `only`
  for partial runs.
- The check step exits with 1 for WER failures or missing clips, and with 4 if the STT
  requests failed. Either way the job is marked failed. The upload still
  runs, so the clips and `check-report.md` can be heard and read.
- Download the artifact, listen, and deliver approved clips as in §2. CI never writes into
  `art-source/`.
