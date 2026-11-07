---
name: whatsapp-feedback
description: The owner's format for every WhatsApp progress update — emojis, a progress bar for the current build and one for the whole project, ETAs for both, what comes next, test links and test logins, and a screenshot when there is something to see. Use it every time you send the owner a WhatsApp with whatsapp_send_message about a project or build (a task finished, a build live, a blocker, a decision needed, a "keep me updated" check-in), and whenever the owner says "WhatsApp me", "notify me" or "keep me updated".
---

# WhatsApp feedback

The owner reads these on a phone, often between other things. Each message must answer at a
glance: what just happened, how far the current build and the whole project are, when each will
be done, what is next, and anything they need to test or decide.

## When to send

- A task or build stage finished, a build went live on the test site, or a release is ready.
- A blocker you can't clear yourself, or a decision only the owner can make.
- When asked for status.

Don't message for small steps (a single commit, a re-run, a lint fix). Several stages done in a
short time go into one message. A WhatsApp can't be unsent: check the facts before sending.

## The format

Short lines, one fact each, 5–9 lines. Every line starts with its emoji. Plain text with
WhatsApp formatting only: *bold*, _italic_, ```mono```. No Markdown links, tables or headings;
paste URLs bare.

```
<topic emoji> *<Project> — <current build>*: <one-line outcome>
🏗️ Build: 🟩🟩🟩⬜ <Stage> ✓ → <Stage> ✓ → <Stage> ✓ → <Stage>
🗺️ Project: 🟩🟩🟩🟩🟩🟩🟩⬜⬜⬜ 70 % (<done>/<total> <unit>)
✅ <the evidence: tests, checks, devices — numbers, not "looks good">
⏱️ ETA: build ~<time> · project ~<day date>
🔜 Next: <the next step, one line>
🔗 Test: <url>   👤 <test login, if the project has one>
🙋 Need from you: <only when blocked or a decision is needed>
```

Example:

```
🐕 *Tarantal — v1.12 Brakkie*: fetch test fixed, full CI running
🏗️ Build: 🟩🟩🟩⬜ Built ✓ → Review ✓ → Fix ✓ → Full CI/merge
🗺️ Project: 🟩🟩🟩🟩🟩🟩🟩🟩🟩⬜ 91 % (56/62 steps)
✅ 1,980 unit tests pass; fetch test green on Pixel 7 + desktop
⏱️ ETA: live ~13:00 · all builds ~Wed 11 Nov
🔜 Next: English start + new baboons (Tank's branch)
🔗 Test: https://shadownam.github.io/Tarantal/
```

### The lines

- **Topic emoji**: one that fits the build (🐕 a dog feature, 🐒 baboons, 🌍 languages,
  🎙️ voices, 📱 phone/app, 🚀 a release, 🛑 a blocker, 🎉 live). Then project, build and the
  outcome in a few words.
- **🏗️ Build bar**: one square per stage of the current build: 🟩 done, 🟨 running now (when
  it helps), ⬜ to do; then the stage names with ✓ after the done ones. Use the same stage
  names in every message about that build so the owner sees it move.
- **🗺️ Project bar**: always 10 squares, rounded from the real count — finished roadmap
  steps out of all steps (from the project's status board or plan), plus the percentage and
  the counts. Never guess the count: read it from the board or plan.
- **✅ Evidence**: what was checked and the result, with numbers (tests passed, devices,
  sizes). A red check is ❌, with what failed.
- **⏱️ ETA**: the current build's finish and the whole project's, in the owner's time zone
  (see Project facts). Honest estimates; if an earlier ETA slipped, say so and why in a few
  words ("⏱️ ETA: ~15:00 (was 13:00: CI re-run)").
- **🔜 Next**: the step that starts after this one.
- **🔗 Test / 👤 login**: see "Links and logins".
- **🙋 Need from you**: what exactly the owner must do or decide, with the options and your
  recommendation. Leave the line out when nothing is needed.

## Links and logins

Share what the owner needs to try the build: the test site URL, a preview or admin URL, an
app download link, and logins made only for testing (a demo account, a tester password the
project set up for previews).

Never send secrets over WhatsApp: API keys, tokens (GitHub PATs, OpenRouter keys), signing
keys, private keys, or the owner's own account passwords. For those, say where they live
("the key is in the repo secret OPENROUTER_API_KEY") or which settings page to open.

## Screenshots

When there is something to see (a new feature, art, a layout fix), attach one screenshot: pass
`file_url` with a public https link to a PNG or JPEG. The message text becomes the caption, so
the same format applies.

- A file committed to a public GitHub repo:
  `https://raw.githubusercontent.com/<owner>/<repo>/<branch-or-commit>/<path>`. Prefer a
  commit SHA over a branch name, so the link keeps showing the same picture.
- Anything else: a Dropbox share link with `?raw=1` (not `dl=0`).
- Check the link first: `curl -sI <url>` must give 200 and an `image/png` or `image/jpeg`
  content type.
- One picture per message; send a second message for a second picture, without repeating the
  bars.

## Project facts

Fill these from the project; keep them current. Facts for other projects go in their own
section.

### Tarantal Madness (ShadowNam/Tarantal)

- Owner: 0811276620. Omit `to` (it defaults to the owner).
- Time zone: Namibia, UTC+2. Write times as "13:00" today, or "Tue 10 Nov 15:00".
- Test site (main): https://shadownam.github.io/Tarantal/
- Admin / progress sheets: https://shadownam.github.io/Tarantal/?admin=1&project=1
- Android test app: the APK from the latest "Android test app" workflow run on main
  (docs/ANDROID-TEST-APP.md).
- Project bar: the build board's done steps out of done + open.
- Screenshots: `docs/art-preview/compare/*.png`, at a raw.githubusercontent.com link.
