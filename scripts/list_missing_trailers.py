#!/usr/bin/env python3
"""List games that CyberDeck could not find a trailer for.

Reads CyberDeck's trailer cache (meta-trailer-cache.json), picks the games whose
lookup came back empty, drops any that already have an entry in
data/trailer-overrides.json, and writes the rest to data/missing-trailers.json.
Fill the good ones into trailer-overrides.json by hand.

Only games that have been looked up are in the cache (opening a game's details
looks its trailer up), so browse the library first for wider coverage.

Usage:
    python scripts/list_missing_trailers.py
    python scripts/list_missing_trailers.py --cache path/to/meta-trailer-cache.json
"""
import argparse
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
APP_FOLDER = "vr-cyberdeck"


def default_cache_candidates():
    home = Path.home()
    bases = []
    if os.environ.get("APPDATA"):
        bases.append(Path(os.environ["APPDATA"]))
    bases += [home / "Library" / "Application Support", home / ".config"]
    return [b / APP_FOLDER / "vrp-data" / "meta-trailer-cache.json" for b in bases]


def find_cache(explicit):
    if explicit:
        return Path(explicit)
    for candidate in default_cache_candidates():
        if candidate.is_file():
            return candidate
    sys.exit("Could not find meta-trailer-cache.json. Pass its location with --cache.")


def load_json(path, fallback):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return fallback


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--cache", help="path to meta-trailer-cache.json (auto-detected by default)")
    parser.add_argument("--overrides", default=str(REPO_ROOT / "data" / "trailer-overrides.json"))
    parser.add_argument("--out", default=str(REPO_ROOT / "data" / "missing-trailers.json"))
    args = parser.parse_args()

    cache_path = find_cache(args.cache)
    entries = load_json(cache_path, {}).get("entries", {})
    overrides = load_json(args.overrides, {})

    missing = {}
    for key, entry in entries.items():
        if entry.get("trailerUrl"):
            continue
        # Cache keys are "<packageName>\n<normalized title>".
        package_name = key.split("\n", 1)[0]
        if not package_name or package_name in overrides:
            continue
        missing[package_name] = {
            "gameName": entry.get("requestedTitle", ""),
            "lastChecked": entry.get("resolvedAt"),
        }

    ordered = dict(sorted(missing.items(), key=lambda item: item[1]["gameName"]))
    Path(args.out).write_text(json.dumps(ordered, indent=2) + "\n", encoding="utf-8")
    print(f"{len(ordered)} games without a trailer -> {args.out}")


if __name__ == "__main__":
    main()
