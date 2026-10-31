#!/usr/bin/env python3
"""Build a WhatsApp progress message for a Roam Tank build queue.

Reads one JSON object on stdin and prints the message text. With --json it
prints {"text": ..., "pct": ..., "eta_minutes": ..., "eta_local": ...,
"finished": ...} instead, which is handy for carrying state forward.

Input fields (only total and completed are required):
  project         Display name, e.g. "Whisper MCP Voice"
  total           Number of items in the queue
  completed       Items finished (done, plus any failed items the user
                  counts as recovered)
  failed          Failed items still counted as failed (default 0)
  finished_titles Titles that finished since the last message
  now_title       Title of the item running now (or next up)
  start           ISO time the queue started, e.g. "2026-10-31T10:48:00Z"
  now             ISO time for "now" (default: current UTC time)
  tz              IANA time zone for the clock time, e.g. "Africa/Windhoek"
  tz_label        Label for that clock time (default: the zone's city name)
  phases          [{"name": "Phase 1", "first": 1, "last": 11,
                    "done_note": "what now works"}], 1-based queue positions
  extra_lines     Lines to append, e.g. failure heads-ups
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo


def parse_time(value: str | None) -> datetime:
    if not value:
        return datetime.now(UTC)
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def fmt_duration(minutes: float) -> str:
    minutes = max(1, round(minutes))
    hours, mins = divmod(minutes, 60)
    if hours and mins:
        return f"{hours} h {mins} min"
    if hours:
        return f"{hours} h"
    return f"{mins} min"


def phase_lines(phases: list[dict], completed: int, newly: int) -> list[str]:
    """Return the phase progress line plus a celebration line for any
    phase that completed with this update."""
    lines: list[str] = []
    current = None
    for ph in phases:
        first, last = int(ph["first"]), int(ph["last"])
        size = last - first + 1
        done_in = min(max(completed - first + 1, 0), size)
        # A phase completed in this update if its last item falls in the
        # window of items that just finished.
        if completed - newly < last <= completed:
            note = ph.get("done_note")
            lines.append(f"🎉 *{ph['name']} complete*" + (f": {note}" if note else ""))
        if current is None and done_in < size:
            current = (ph["name"], done_in, size)
    if current:
        lines.insert(0, f"{current[0]}: {current[1]}/{current[2]}")
    return lines


def build(data: dict) -> dict:
    total = int(data["total"])
    completed = int(data["completed"])
    failed = int(data.get("failed", 0))
    finished_titles = data.get("finished_titles") or []
    newly = len(finished_titles)
    pct = math.floor(completed / total * 100) if total else 0
    finished = completed + failed >= total

    now = parse_time(data.get("now"))
    tz = ZoneInfo(data["tz"]) if data.get("tz") else UTC
    tz_label = data.get("tz_label") or (data["tz"].split("/")[-1].replace("_", " ") if data.get("tz") else "UTC")

    lines = [f"🔨 *{data.get('project', 'Tank build')}*"]
    if finished_titles:
        if newly == 1:
            lines.append(f"✅ {finished_titles[0]} done")
        else:
            lines.append("✅ Done: " + ", ".join(finished_titles))

    progress = f"📊 *{pct}%* · {completed} of {total}"
    if failed:
        progress += f" · {failed} failed"
    phases = data.get("phases") or []
    ph_lines = phase_lines(phases, completed, newly) if phases else []
    if ph_lines and not ph_lines[0].startswith("🎉"):
        progress += f" · {ph_lines.pop(0)}"
    lines.append(progress)

    eta_minutes = None
    eta_local = None
    start = data.get("start")
    if finished:
        if start:
            lines.append(f"🏁 Finished in {fmt_duration((now - parse_time(start)).total_seconds() / 60)}")
    elif start and completed >= 2:
        elapsed = (now - parse_time(start)).total_seconds() / 60
        per_item = elapsed / completed
        remaining = total - completed - failed
        eta_minutes = round(per_item * remaining)
        eta_at = (now + timedelta(minutes=eta_minutes)).astimezone(tz)
        eta_local = eta_at.strftime("%H:%M")
        day = ""
        if eta_at.date() != now.astimezone(tz).date():
            day = eta_at.strftime(" %a")
        lines.append(f"⏱️ ETA ≈ {fmt_duration(eta_minutes)} (around {eta_local}{day} {tz_label} time)")
    elif not finished:
        lines.append("⏱️ ETA after 2 steps finish")

    lines.extend(ph_lines)
    if data.get("now_title") and not finished:
        lines.append(f"▶️ Now: {data['now_title']}")
    lines.extend(data.get("extra_lines") or [])

    return {
        "text": "\n".join(lines),
        "pct": pct,
        "eta_minutes": eta_minutes,
        "eta_local": eta_local,
        "finished": finished,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--json", action="store_true", help="print a JSON result instead of the text")
    args = parser.parse_args()
    result = build(json.load(sys.stdin))
    print(json.dumps(result, ensure_ascii=False) if args.json else result["text"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
