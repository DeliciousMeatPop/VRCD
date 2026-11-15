#!/usr/bin/env python3
"""Go through games with no trailer, one at a time, and save the ones you pick.

Reads the report written by CyberDeck's Settings > Find missing trailers scan
(trailer-scan-report.json) or by list_missing_trailers.py (missing-trailers.json).
For each game it opens a YouTube search in your browser and asks you to paste the
link of the right video. Every answer is saved straight away to
data/trailer-overrides.json (created if it doesn't exist), so you can quit any
time and pick up where you left off.

At each prompt:
    <YouTube link>  save it as this game's trailer
    Enter or s      skip for now (asked again next run)
    x               never ask about this game again
    n               save "no trailer" (hides the trailer for this game)
    o               open the search again
    q               quit

Usage:
    python scripts/review_missing_trailers.py
    python scripts/review_missing_trailers.py --report path/to/report.json
    python scripts/review_missing_trailers.py --overrides path/to/trailer-overrides.json
"""
import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
APP_FOLDER = "vr-cyberdeck"
REPORT_NAMES = ("trailer-scan-report.json", "missing-trailers.json")
IGNORED_FILE = SCRIPT_DIR / "trailer-review-ignored.json"
VIDEO_ID = r"([A-Za-z0-9_-]{11})"
LINK_PATTERNS = (
    re.compile(r"(?:youtube\.com|youtube-nocookie\.com)/watch\?(?:[^#\s]*&)?v=" + VIDEO_ID),
    re.compile(r"youtu\.be/" + VIDEO_ID),
    re.compile(r"youtube\.com/(?:shorts|embed|live|v)/" + VIDEO_ID),
)


def default_report_candidates():
    home = Path.home()
    bases = []
    if os.environ.get("APPDATA"):
        bases.append(Path(os.environ["APPDATA"]))
    bases += [home / "Library" / "Application Support", home / ".config"]
    found = []
    for base in bases:
        for name in REPORT_NAMES:
            found.append(base / APP_FOLDER / "vrp-data" / name)
    found += [SCRIPT_DIR / name for name in REPORT_NAMES[1:]]
    return found


def find_report(explicit):
    if explicit:
        return Path(explicit)
    existing = [c for c in default_report_candidates() if c.is_file()]
    if existing:
        # Use whichever was written most recently.
        return max(existing, key=lambda c: c.stat().st_mtime)
    sys.exit(
        "Could not find a report. Run the scan in CyberDeck (Settings > Find missing trailers)\n"
        "or list_missing_trailers.py first, or pass the file with --report."
    )


def load_json(path, fallback):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return fallback


def save_json(path, data):
    """Write atomically so a crash can never leave a half-written overrides file."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(path)


def youtube_id(text):
    text = text.strip()
    for pattern in LINK_PATTERNS:
        match = pattern.search(text)
        if match:
            return match.group(1)
    return None


def video_title(video_id):
    """Best-effort title lookup so you can see what you pasted. Never required."""
    url = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(
        f"https://www.youtube.com/watch?v={video_id}", safe=""
    )
    try:
        with urllib.request.urlopen(url, timeout=8) as response:
            return json.load(response).get("title")
    except Exception:
        return None


def search_url(game_name):
    query = urllib.parse.quote_plus(f"{game_name} VR trailer")
    return f"https://www.youtube.com/results?search_query={query}"


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--report", help="scan report to read (auto-detected by default)")
    parser.add_argument(
        "--overrides",
        default=str(SCRIPT_DIR.parent / "data" / "trailer-overrides.json"),
        help="trailer-overrides.json to add to (default: the repo's data folder)",
    )
    args = parser.parse_args()

    report_path = find_report(args.report)
    report = load_json(report_path, {})
    games = report.get("noTrailerFound", {})
    if not games:
        sys.exit(f"No games listed under 'noTrailerFound' in {report_path}")

    overrides_path = Path(args.overrides)
    overrides = load_json(overrides_path, {})
    ignored = set(load_json(IGNORED_FILE, []))

    todo = [
        (package, info.get("gameName") or package)
        for package, info in games.items()
        if package not in overrides and package not in ignored
    ]
    todo.sort(key=lambda item: item[1].lower())
    print(f"Report: {report_path}")
    print(f"Saving to: {overrides_path}")
    print(f"{len(todo)} game(s) to go through ({len(games) - len(todo)} already handled).\n")

    saved = 0
    for index, (package, name) in enumerate(todo, start=1):
        print(f"[{index}/{len(todo)}] {name}  ({package})")
        webbrowser.open(search_url(name))
        while True:
            try:
                answer = input("  link / Enter=skip / x=never / n=no trailer / o=reopen / q=quit > ")
            except (EOFError, KeyboardInterrupt):
                answer = "q"
            answer = answer.strip()
            lowered = answer.lower()

            if lowered == "q":
                print(f"\nSaved {saved} this session. Run again to continue.")
                return
            if lowered in ("", "s"):
                break
            if lowered == "o":
                webbrowser.open(search_url(name))
                continue
            if lowered == "x":
                ignored.add(package)
                save_json(IGNORED_FILE, sorted(ignored))
                print("  Won't ask about this one again.")
                break
            if lowered == "n":
                overrides[package] = None
                save_json(overrides_path, overrides)
                saved += 1
                print("  Saved: no trailer.")
                break
            video_id = youtube_id(answer)
            if not video_id:
                print("  That doesn't look like a YouTube link. Try again, or Enter to skip.")
                continue
            title = video_title(video_id)
            overrides[package] = f"https://www.youtube.com/watch?v={video_id}"
            save_json(overrides_path, overrides)
            saved += 1
            print(f"  Saved{': ' + title if title else '.'}")
            break

    print(f"\nAll done. Saved {saved} this session.")


if __name__ == "__main__":
    main()
