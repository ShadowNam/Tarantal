# OpenRouter API reference (for the `openrouter` skill)

Researched on 29 Oct 2026 from OpenRouter's own sources (listed below). The live model and voice
lists were **not** retrieved, because openrouter.ai was blocked from the research sandbox.
Always query them at run time with `models`, `voices` and `endpoints`. Model slugs below are
examples named in the docs, not a promise that they exist today.

Contents: 1 Auth and headers · 2 CLI to endpoint map · 3 Text-to-speech · 4 Speech-to-text ·
5 Models and endpoints · 6 Chat · 7 Images · 8 Key, credits and cost · 9 Errors and retries ·
10 Unverified points and conflicts · 11 Sources

## 1. Auth and headers

- Base URL: `https://openrouter.ai/api/v1`. The CLI reads `OPENROUTER_BASE_URL` to override it,
  but accepts only `https://openrouter.ai` or `https://*.openrouter.ai`, plus `http(s)` on
  `localhost`/`127.0.0.1`/`::1` for the offline tests. Anything else is refused with exit 2, so a
  "mirror" URL can never receive the key. Redirects are never followed (urllib would copy the
  `Authorization` header to the new host); a 3xx answer becomes an error (exit 4).
- `Authorization: Bearer <key>`. Keys look like `sk-or-v1-…`; create them at
  https://openrouter.ai/keys. OpenRouter recommends a credit limit on every key.
- Optional app attribution: `X-OpenRouter-Title` (the older `X-Title` still works),
  `HTTP-Referer`, `X-OpenRouter-Categories`, and `X-OpenRouter-App-Visibility: hidden`. The CLI
  sends `X-OpenRouter-Title: Claude openrouter skill`.
- An optional `x-session-id` header (or `session_id` in the body, up to 256 chars) groups
  requests. The CLI does not send it.

## 2. CLI to endpoint map

| CLI command | Endpoint |
|---|---|
| `key` | `GET /key` |
| `models` | `GET /models?output_modalities=…&input_modalities=…&q=…` |
| `voices` | `GET /models?output_modalities=speech`, then `=all` if the model is not found; reads `supported_voices` |
| `endpoints` | `GET /models/{author}/{slug}/endpoints` |
| `tts` and `batch` | `POST /audio/speech` (one request per chunk of at most 3,000 chars) |
| `stt` and `check` | `POST /audio/transcriptions` (JSON body with base64 audio) |
| `chat` | `POST /chat/completions` (not streamed) |
| `image` | `POST /images` |
| `cost` and `--cost` | `GET /generation?id=…` |

## 3. Text-to-speech: `POST /audio/speech`

The endpoint is compatible with OpenAI's speech API. The request body is JSON:

| Field | Notes |
|---|---|
| `model` | Required. The full slug, e.g. `openai/gpt-4o-mini-tts-2025-12-15`. |
| `input` | Required. A string. Gemini TTS and Fish Audio (except S1) also accept a list of turns `[{text, voice?, instructions?}]` for several speakers; other providers return 400. The CLI sends a string only. |
| `voice` | A provider-specific ID; take the exact IDs from `supported_voices` in `/models`. It may be left out only when the provider has a default voice, otherwise the request fails validation. |
| `instructions` | Tone, pacing and emotion. Honoured by OpenAI gpt-4o-mini-tts, Gemini TTS and Fish Audio; ignored elsewhere. The docs use the top-level field; OpenRouter's agent skill shows `provider.options.openai.instructions` instead (see §10). |
| `response_format` | `mp3` or `pcm`. **The default is `pcm`**, so the CLI always sets it. Gemini TTS and HeyGen return pcm only, MiniMax mp3 only; the wrong one gives 400. |
| `speed` | Default 1.0. OpenAI honours it. Other providers ignore it or return 400 for a value other than 1.0. Seed Audio accepts 0.5–2.0. |
| `input_references` | Voice cloning or design, with no saved state. 1–3 parts `{"type":"input_audio","input_audio":{"data":"data:audio/wav;base64,…"}}` (or `{"url": …}`), each optionally followed by `{"type":"text","text":"<transcript>"}`; optionally one `image_url` part on providers that support it. Each inline reference is limited to 20 MiB of base64 (15 MiB decoded); a transcript to 10,000 chars. Only endpoints with `supports_voice_cloning` receive these. The CLI sends one clip plus an optional transcript (`--ref-audio`, `--ref-text`). |
| `provider` | `{zdr?, data_collection?: "allow"\|"deny", options?: {<provider-tag>: {…}}}`. `data_collection` defaults to `allow` (providers may store and train on the data); `zdr: true` routes only to Zero Data Retention endpoints. `order`, `only` and `ignore` are **not** applied to speech. CLI: `--zdr`, `--deny-data-collection`, `--provider-options JSON`; with `--ref-audio`, zdr and deny are on unless `--no-ref-privacy`. |
| `session_id`, `user`, `trace` | Optional; not used by the CLI. |

Response:
- HTTP 200 returns **raw audio bytes**, not JSON. `Content-Type` is `audio/mpeg` for mp3, and
  `audio/pcm` (optionally with `;rate=24000;channels=1`) for pcm, which is 16-bit little-endian.
  The CLI reads `rate` and `channels` when they are present and otherwise assumes 24,000 Hz
  mono, then writes a WAV header. If the body is already a RIFF/WAVE file, the CLI unwraps it.
- The `X-Generation-Id: gen-tts-…` header can be passed to `GET /generation` for the cost.
- Any other status returns a JSON error (§9).

Provider notes from the TTS guide:
- **Gemini TTS** reads `input` word for word, so stage directions in the text get spoken. Put
  them in `instructions` (OpenRouter sends that upstream as the speech style).
- **Fish Audio** takes delivery directions in square brackets inside the text, e.g.
  `[whispering] …`. OpenRouter adds `instructions` to the text this way, and Fish bills those
  added characters.
- **Azure MAI-Voice** (`microsoft/mai-voice-2`, `mai-voice-2.1`, `mai-voice-2.1-flash`) takes a
  full voice ID with a model suffix, e.g. `en-US-Harper:MAI-Voice-2.1`. The voice's locale sets
  the language. pcm output is 24 kHz mono.
- **Seed Audio 1.0** (`bytedance-seed/seed-audio-1-0`) is limited to 3,000 input chars and 120 s
  of output. It treats `input` as a prompt, so it can also make sound effects and ambience. It
  is priced per second of output, and `voice` cannot be combined with `input_references`.
- **HeyGen Voice** returns pcm only. With a reference recording, leave out `voice`; the language
  can be set with `provider.options.heygen.language`.
- **Voxtral** voice IDs carry a language prefix (e.g. `en_paul_neutral`). **Kokoro**'s `af_…`
  means American female, not Afrikaans.

Language: TTS has **no `language` parameter**; the language follows the text (with the
exceptions above). Afrikaans is not documented on OpenRouter. Upstream, Google lists `af-ZA`
for Gemini TTS as Preview, and ElevenLabs advertises Afrikaans, but whether OpenRouter serves an
ElevenLabs TTS model is unverified. Test it.

Length: there is no documented global character limit (Seed Audio's is 3,000). The CLI splits
text longer than 3,000 chars at sentence boundaries. It joins pcm by concatenating frames, and
refuses to join chunks that come back with different sample rates or channel counts (nothing is
written; it does not resample). It joins mp3 by concatenating bytes, which plays but can leave
tiny seams; re-encode with ffmpeg for a cleaner join.

What the CLI accepts as audio: a `Content-Type` of `audio/*` or `application/octet-stream`, a
non-empty body, and for mp3 an `ID3` tag or an MPEG frame sync at the start. Anything else
(JSON, an HTML captive portal, an empty body) exits 4 with nothing written, so `batch` retries
that clip on its next run.

Speech models named in the docs (verify them live): `openai/gpt-4o-mini-tts-2025-12-15`,
`mistralai/voxtral-mini-tts-2603`, `google/gemini-3.8-flash-tts`,
`google/gemini-3.8-flash-lite-tts`, `microsoft/mai-voice-2`, `microsoft/mai-voice-2.1`,
`microsoft/mai-voice-2.1-flash`, `fish-audio/s1`, `fish-audio/s2.1-pro`,
`heygen/heygen-voice-1`, `bytedance-seed/seed-audio-1-0`.

Pricing: most TTS models charge per input character; Seed Audio charges per output second and
reports that rate in `pricing.completion`. **Which `/models` field holds the per-character rate
is not documented.** The CLI's dry run assumes `pricing.prompt` and labels the result an
estimate. Compare it with the real `total_cost` of one test clip.

## 4. Speech-to-text: `POST /audio/transcriptions`

JSON body:

```json
{"model": "openai/whisper-large-v3",
 "input_audio": {"data": "<raw base64 - NOT a data: URI>", "format": "wav"},
 "language": "af"}
```

| Field | Notes |
|---|---|
| `model` | Required. The full slug. |
| `input_audio` | `{data, format}`, or `{url, format?}` (some providers only). The format must match the bytes. The docs list `wav`, `mp3`, `flac`, `m4a`, `ogg`, `webm` and `aac`; the spec's `format` is a free short token ("supported formats vary by provider"), so the CLI also passes `opus`. `pcm` means headerless s16le mono at 16 kHz. |
| `language` | ISO-639-1 (`af`, `en`, `de`…). Auto-detected if left out. |
| `temperature` | 0–1. |
| `response_format` | `json` (default) or `verbose_json`, which adds `task`, `language`, `duration`, `confidence` and `segments[]` (plus `words[]` with `timestamp_granularities: ["word"]`). `text`, `srt` and `vtt` return 400. Some models reject `verbose_json` (e.g. `openai/gpt-4o-transcribe`, `microsoft/mai-transcribe-1.5`). |
| `keyterms` | Spec only: up to 1,000 terms of at most 100 chars to bias recognition toward (names, game words). Only some providers support it; others answer 400. CLI: `--keyterms "Oupa,tarentaal"`. |
| `diarize` | Spec only: speaker labels on `words`; needs `verbose_json`. Not used by the CLI. |
| `provider` | As for TTS (`zdr`, `data_collection`, `options`); provider-specific options such as diarisation go in `provider.options`. |

Multipart `multipart/form-data` uploads in the OpenAI SDK style (`file`, `model`, …) are also
accepted, up to 25 MB. The CLI uses JSON.

Limits: 25 MB. Base64 JSON larger than that works only on OpenAI and Groq models. Providers time
out after about 60 s of processing, so split long recordings. The CLI refuses files over
25,000,000 bytes and prints an ffmpeg split command.

The 200 response is `{"text": "…", "usage": {"cost": 0.000508, "seconds"?: 9.2,
"total_tokens"?: …}}` plus `X-Generation-Id`. `usage.cost` is always present; `seconds` or the
token counts depend on how the provider bills.

Models named in the docs: `openai/whisper-1`, `openai/whisper-large-v3`,
`openai/gpt-4o-transcribe`, `google/chirp-3`, `microsoft/mai-transcribe-1.5`,
`microsoft/mai-transcribe-2`, `elevenlabs/scribe-v2`.

Alternative: send a chat completion with a content part
`{"type":"input_audio","input_audio":{"data":"<base64>","format":"wav"}}` to a model whose
input modalities include audio. The CLI does not do this.

## 5. Models and endpoints

`GET /models` query parameters: `output_modalities` (text, image, embeddings, audio, video,
rerank, speech, transcription, all; **the default is `text`**), `input_modalities` (text, image,
audio, file), `q`, `sort`, `supported_parameters`, `providers`, `model_authors`, `zdr=true`,
`region=eu|us`, and `offset`/`limit` (at most 1,000; leave both out for the full list).
Send the bearer key, because the spec marks the endpoint as secured.

The response is `{data: [Model], total_count, links: {next}}`. Fields on Model include `id`,
`canonical_slug`, `name`, `description`, `created`, `context_length`,
`architecture {modality, input_modalities[], output_modalities[]}`, `pricing`,
`supported_parameters[]`, `supported_voices` (a list of strings, or null) and `top_provider`.
`pricing` values are **strings in USD per unit**: `prompt` and `completion` (per token for text
models), `request`, `image`, `audio`, `audio_output`, cache fields, `discount` and `overrides`.

`GET /models/{author}/{slug}/endpoints` returns `{data: {id, name, architecture, endpoints:
[{provider_name, tag, pricing, status, supports_voice_cloning,
supports_multiple_audio_references, supports_image_reference, supports_diarization, …}]}}`.
`status` is an integer enum (0, -1, -2, -3, -5, -10) that the spec does not explain; its
examples use 0. The CLI prints it as "status (raw)".

## 6. Chat: `POST /chat/completions`

`{"model": "…", "messages": [{"role": "user", "content": "Hi"}], "max_tokens"?: N}` returns
`{choices: [{message: {role, content}}], usage: {…, cost}}`. The docs say an error raised after the
model started producing output comes back with HTTP 200 and the error in the body; the CLI
treats such a body as an API error. Streaming (`stream: true`) uses SSE `data:` lines ending in
`data: [DONE]`; lines starting with `:` are comments. The CLI does not stream. Audio output from
chat (`modalities: ["text","audio"]`, `audio: {voice, format}`) needs streaming and is described
in the guide but missing from the OpenAPI ChatRequest; it is not used here.

## 7. Images: `POST /images`

Body: `model` and `prompt` (required); `n` (1–10, an upper bound); `aspect_ratio` (`1:1`,
`16:9`, `9:16`, `4:3`, `3:2`, `21:9`, `auto` and more; the CLI validates against the spec's
list); `resolution` (`512`…`4K`); `size`; `quality`; `output_format` (`png`, `jpeg`, `webp`,
`svg`); `background` (`transparent` needs png or webp); `seed`; `input_references` (up to 16
images); `provider`.

The response is `{"created": …, "data": [{"b64_json": "…", "media_type"?: "image/png"}],
"usage": {…, "cost"}}`. The CLI writes `data[0]`.

## 8. Key, credits and cost

- `GET /key` (any key) returns `{data: {label, limit, limit_remaining, limit_reset, usage,
  usage_daily, usage_weekly, usage_monthly, is_free_tier, is_management_key, expires_at,
  budgets[], effective_budget, …}}`. `label` defaults to a masked form of the key
  (`sk-or-v1-au7...890`). `rate_limit` is deprecated. The CLI prints the label but never the key.
- `GET /credits` returns `{data: {total_credits, total_usage}}` but needs a **management** key;
  a normal key gets 403. The CLI does not call it; `key` covers per-key spend.
- To make a limited key, use the dashboard (https://openrouter.ai/keys), or `POST /keys` with a
  management key, e.g. `{"name": "…", "limit": 10, "limit_reset": "monthly"}`. The new key is
  shown only once.
- `GET /generation?id=gen-…` returns `data.total_cost`, `model`, `provider_name`, `latency`,
  `created_at` and more. Stats can lag the request by a few seconds, so the CLI retries a 404
  twice, 2 s apart (this lag is assumed, not documented).

## 9. Errors and retries

There are two error body shapes, and the CLI handles both:
- `{"error": {"code": 402, "message": "…", "metadata": {…}}}`
- `{"success": false, "error": {"name": "ZodError", "message": "…"}}` (validation; the message
  names the bad field)

| Status | Meaning |
|---|---|
| 400 | Bad or missing parameters |
| 401 | Invalid, disabled or expired key |
| 402 | Not enough credit; see `metadata.limit_source` below |
| 403 | Budget limit (guardrail, workspace or key; carries `limit_source` and `remedy_hint`), moderation or guardrail block, or a management-only endpoint |
| 404 | Unknown model or route |
| 408 | Upstream timeout |
| 413 | Payload too large |
| 429 | Rate limited (free models: 20 requests/min; paid models have no platform cap) |
| 502 | The provider failed or returned an invalid response |
| 503 | No provider meets the routing requirements |
| 504, 524 | Timeout |
| 529 | Provider overloaded |

`limit_source` on a 402: `openrouter_key_limit` (the key's cap is used up),
`openrouter_credits` (the balance is too low, or one request is bigger than the whole in-flight
budget), and `openrouter_in_flight_budget` (temporary: recent requests fill the budget; comes
with `Retry-After`). On a 403: `openrouter_guardrail_budget`, `openrouter_workspace_budget` or
`openrouter_key_limit`. Branch on `limit_source`, not on the `remedy_hint` text.

`Retry-After` (in seconds, or an HTTP date) may come with 429, 503 and in-flight 402 responses.

What the CLI does: it retries 408, 429, 500, 502, 503, 524, 529 and in-flight 402 up to 3 times
(500 is listed for the audio endpoints in the spec). It
waits for `Retry-After` when that header is present (capped at 120 s), otherwise for 1, 2 and
4 s plus jitter. It prints `HTTP <code>: <message> (limit_source: …)` and a `hint:` line to
stderr and exits with 4. A 403, 405 or 407 whose body is not an OpenRouter JSON error is treated
as a proxy or firewall block (exit 5), as are a failed proxy CONNECT tunnel and DNS errors.
Timeouts are 30 s for small calls, 60 s for model lists, 120 s for TTS, STT and chat, and 180 s
for images. The key is removed from every message the CLI prints, including any server text
that echoes it and repr- or JSON-escaped forms; a key with whitespace or non-ASCII characters is
refused (exit 3) before any request, without showing it. Error messages are collapsed to one
line (a ZodError's pretty-printed JSON included). A failed `--cost` lookup after audio was
written only warns.

## 10. Unverified points and conflicts

- The live model list, voice lists and prices: query them, never assume them.
- Which pricing field holds the TTS per-character rate (`pricing.prompt` is assumed).
- A global TTS character limit (none is documented; the CLI chunks at 3,000, Seed Audio's limit).
- What the endpoint `status` codes mean, and which providers honour `keyterms`, `zdr` and
  `data_collection: deny` for speech (a strict policy can leave no endpoint, so the request
  fails).
- The TTS `response_format` enum is only `mp3|pcm`, although one spec description also mentions
  wav, so do not rely on wav. pcm `Content-Type` may arrive with or without `rate` and
  `channels`.
- `instructions`: the top-level field (the docs) versus `provider.options.openai.instructions`
  (the older official skill). The CLI uses the top-level field.
- STT: the docs accept multipart, but an older official skill says "JSON only". The CLI uses
  JSON.
- The chat `audio` parameter is in the guide but not in the OpenAPI ChatRequest.
- How well any model handles Afrikaans, for TTS or STT.
- Whether `GET /generation` returns 404 for a few seconds after a request (the CLI assumes it may).
- None of these were tried live: openrouter.ai was blocked from the sandbox where this skill was
  built. The CLI was tested against a local mock server only.

## 11. Sources

- OpenRouter documentation source, `OpenRouterTeam/docs` @ `df475e9` (the MDX behind
  openrouter.ai/docs): `guides/overview/multimodal/tts.mdx`, `stt.mdx`,
  `api_reference/errors-and-debugging.mdx` and `api_reference/limits.mdx`.
- OpenAPI spec, `OpenRouterTeam/python-sdk/.speakeasy/in.openapi.yaml` @ `c8939a7` (Apache-2.0):
  `/audio/speech`, `/audio/transcriptions`, `/models`, `/key`, `/generation`, `/images`, and
  the `PublicPricing` and `ImageGenerationRequest` schemas.
- OpenRouter's official agent skills, `OpenRouterTeam/skills` @ `fc4b230` (`openrouter-tts`,
  `-stt`, `-models`, `-images`). They were read for ideas and cross-checks only; no text or code
  was copied, because that repository has no licence file.
- Web pages: https://openrouter.ai/docs/guides/overview/multimodal/tts ·
  https://openrouter.ai/docs/guides/overview/multimodal/stt · https://openrouter.ai/keys
