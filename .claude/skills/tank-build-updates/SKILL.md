---
name: tank-build-updates
description: Keep the user informed about Roam Tank build queues over WhatsApp. It checks the queue on a timer and sends short progress messages (step done, 19%, 6 of 31, phase 1 at 6 of 11, ETA about 5 h), alerts when a step fails, stalls or needs input, and a final summary when the queue finishes. Use this whenever the user asks to watch, monitor or babysit a Tank project or build queue, wants progress, % or ETA updates on WhatsApp, says "keep me informed", "tell me when it's done" or "WhatsApp me as each phase finishes", or starts a Tank build and is going to be away. Use it even if they don't name the skill or WhatsApp explicitly.
---

# Tank build updates

Tank runs coding agents through a project's build queue unattended, often for hours. This skill keeps the owner informed while they're away: one short WhatsApp message each time a step finishes, with progress, a realistic ETA and phase milestones. Problems get raised quickly, and when nothing has changed the skill sends nothing.

## What you need

- **Roam Tank MCP:** `tank_get_project`, `tank_list_tasks`, `tank_get_task` (and `tank_queue_start` if the user allows auto-resume).
- **WhatsApp Gateway MCP:** `whatsapp_send_message`. Leave out `to` to message the user's own number, or use a group name if they ask for one.
- **A way to schedule the next check-in:**
  - `send_later` in Claude Code cloud sessions;
  - `ScheduleWakeup` (or `/loop`) in the Claude Code CLI;
  - `CronCreate` where that exists.

  Never poll with `sleep`; it ties up the session and dies with it.
- `scripts/progress.py` (Python 3.11+) builds the message, so %, phase and ETA come out the same way every time.

If a connector is missing, tell the user which one, and offer chat-only updates (no WhatsApp) instead of silently skipping messages.

## 1. Set up the watch

1. **Find the project.** Call `tank_get_project(<name>)`, which also accepts a partial name. Check `build_queue`:
   - `running`: good.
   - Idle with pending items: tell the user and ask whether to start it.
   - No queue items: this skill doesn't apply, so say so.
2. **Work out the settings.** Use these defaults and ask only about what you can't infer:

   | Setting | Default | Notes |
   |---|---|---|
   | interval | 10 min | Match the pace: about a third of a typical step's duration, between 5 and 30 min. |
   | timezone | the user's local zone | If you don't know it, ask once. Phone numbers and domains often hint at it (e.g. `.na` and `081…` mean Namibia, `Africa/Windhoek`). |
   | phases | none | Use them if the user or the project's plan defines them, e.g. "Phase 1 = items 1–11". Item titles like `WP07` or `[queue 7]` map to positions. Add a `done_note` per phase saying what the user can do once it's finished. That's the most useful line they'll get. |
   | recipient | the user's own WhatsApp | Or a group they name. |
   | auto-fix | off | If the user asked you to fix problems (not just report them), you may diagnose failures and resume a paused queue. Otherwise report and suggest. |

3. **Find the start time.** Call `tank_list_tasks(project=…, limit=50)` and take the `created` time of the `[queue 1] …` task (`tank_get_task` shows `created`). The ETA comes from real elapsed time divided by finished steps, so a wrong start time skews every ETA.
4. **Send a first message** with the current state, so the user knows the watch is live. Then schedule the first check-in (§3).

## 2. Each check-in

1. Call `tank_get_project` and read `build_queue.items` (`done`, `failed`, `running`, `pending`; there may be others). `total` is the sum of all of them.
   - `completed` = `done`, plus any failed items the user or an earlier check-in confirmed were recovered. Carry those in state as `recovered`.
2. **What changed since the last check-in?** Compare with the state you carried forward. Use `tank_list_tasks(project=…, limit=20)` to see which `[queue N]` tasks finished, failed or are `awaiting_input` since then.
3. **Nothing new finished and nothing went wrong:** send nothing. Schedule the next check-in and stop. A message every 10 minutes saying "still running" trains people to ignore the channel.
4. **Something finished:** run the script and send its text as one message, even if several steps finished:
   ```bash
   echo '<json>' | python3 <skill-dir>/scripts/progress.py
   ```
   Input fields are documented at the top of the script. Pass `finished_titles` (short names, without the `[queue N]` prefix), `now_title` (`now_or_next`), `start`, `tz`, `tz_label`, `phases`, `completed`, `failed` and `total`. If Python isn't available, follow the format in §4 by hand.
5. **A step failed:** read it with `tank_get_task(task, turns=4)` and turn the error into one plain line, e.g. "⚠️ WP07 failed: connection to the model dropped mid-run. The queue carried on with WP08."
   - Check whether the work actually landed. A later step may report that the files exist and pass, as happens with connection drops. If it did, count the step as recovered and say so.
   - If it needs the owner (a key, DNS, a licence, a decision), say exactly what to do.
6. **A task is waiting for input:** send the question in one or two lines, and say how to answer: reply in this chat, or in Tank.
7. **The queue is stalled** (no `running` items, `pending` above 0, state not `running`): alert the user. Resume with `tank_queue_start` only if auto-fix is on.
8. **The queue finished** (nothing running or pending): send the final summary from the script (it shows 100% or the failures, and the total time), add one line on what to do next, and stop scheduling.

## 3. Scheduling the next check-in

Carry the state inside the scheduled message, because the next check-in may start with no memory of this one. Use this shape:

```
[tank-build-updates check-in] Use the tank-build-updates skill.
project=whisper-mcp-voice total=31 completed=6 recovered=fdb48df7(WP00) failed_seen=fdb48df7
last_title="WP05 Audio processing" start=2026-10-31T10:48:00Z tz=Africa/Windhoek tz_label=Namibia
interval=10 recipient=me auto_fix=on
phases=Phase 1:1-11 "Claude Code can voice game lines; /admin is live" | Phase 2:12-22 | Phase 3:23-26 | Phase 4:27-31
```

- **Cloud session:** `send_later(delay_minutes=<interval>, message=<that block>)`.
- **CLI:** `ScheduleWakeup(delaySeconds=<interval×60>, prompt=<that block>)`.
- **Keep one pending check-in per watch.** When the user changes the settings (adds % or ETA, a new interval, another recipient), delete the pending one first (`delete_trigger` with its id), then schedule the new one. Otherwise both fire and the user gets duplicate messages.
- **Stopping:** if the user says stop, delete the pending check-in and confirm in one line.
- **Several projects:** one check-in can cover several projects. Send one message per project that changed.

## 4. Message format

WhatsApp formatting: `*bold*`, `_italic_`. Keep messages to 2–7 short lines, readable at a glance on a lock screen.

```
🔨 *<Project>*
✅ <step> done                      (or "✅ Done: A, B" for several)
📊 *<pct>%* · <completed> of <total> · <phase>: a/b
⏱️ ETA ≈ <h> h <m> min (around <HH:MM> <place> time)
🎉 *<Phase> complete*: <what now works>        (only when a phase ends)
▶️ Now: <next step>
⚠️ <one-line problem and what happens next>     (only when needed)
```

- **ETA** = steps remaining × (minutes since start ÷ steps completed). Show it only after 2 steps have finished; before that it is noise.
- Later steps (deploys, big features) are often slower. Mention this once in the first message, not every time.
- Use the user's local clock and name the place ("Namibia time"), because "UTC+2" is easy to misread.

**Example:** a phase just finished, and so did the step after it.

> 🔨 *Whisper MCP Voice*
> ✅ Done: WP09 Script sync, WP10 Deploy M1
> 📊 *35%* · 11 of 31 · Phase 2: 0/11
> ⏱️ ETA ≈ 6 h 44 min (around 23:14 Namibia time)
> 🎉 *Phase 1 complete*: Claude Code can voice game lines; /admin is live
> ▶️ Now: WP11 Transcribe

## Good judgement

- Never paste secrets, tokens or `.env` values into messages. Tank task output sometimes contains them, e.g. git remote URLs with an embedded token. If you see one, tell the user privately in chat that it is exposed, and keep it out of WhatsApp.
- WhatsApp messages can't be unsent. Check the numbers before sending; don't guess.
- If a check-in fails (Tank unreachable, connector down), retry once at the next interval. If it fails twice, send one heads-up so the user knows the updates have stopped.
