#!/usr/bin/env python3
"""Convert release names in resources/ports.json into package names.

Package names never change between server updates, release names do (the
version is part of them), so the Ports filter works best with package names.

Reads CyberDeck's game list (VRP-GameList.txt) and rewrites the "ports" array
in resources/ports.json. Entries that are already package names are kept.
Release names are matched exactly first, then ignoring the version/tag part
(e.g. "Quake2Quest v21+B1.1.1 -JF" still finds "Quake2Quest v22 -JF").
Anything that cannot be matched is left as-is and listed so you can fix it.

Usage:
    python scripts/ports_to_packages.py
    python scripts/ports_to_packages.py --list path/to/VRP-GameList.txt
    python scripts/ports_to_packages.py --dry-run
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import unquote

SCRIPT_DIR = Path(__file__).resolve().parent
PORTS_JSON = SCRIPT_DIR.parent / "resources" / "ports.json"
APP_FOLDER = "vr-cyberdeck"


def default_list_candidates():
    home = Path.home()
    bases = []
    if os.environ.get("APPDATA"):
        bases.append(Path(os.environ["APPDATA"]))
    bases += [home / "Library" / "Application Support", home / ".config"]
    return [b / APP_FOLDER / "vrp-data" / "VRP-GameList.txt" for b in bases]


def find_list(explicit):
    if explicit:
        return Path(explicit)
    for candidate in default_list_candidates():
        if candidate.is_file():
            return candidate
    sys.exit("Could not find VRP-GameList.txt. Pass its location with --list.")


def base_name(release):
    """'Quake2Quest v21+B1.1.1 -JF' -> 'quake2quest' (drops version and tags)."""
    s = unquote(release).lower().strip()
    s = re.split(r"\s+v\d", s, maxsplit=1)[0]
    s = re.sub(r"\s+-\S.*$", "", s)
    return re.sub(r"[^a-z0-9]+", "", s)


def load_games(path):
    """Return (release_name -> package, base_name -> {packages})."""
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    header = [c.strip() for c in lines[0].split(";")]
    rel_i, pkg_i = header.index("Release Name"), header.index("Package Name")
    by_release, by_base, packages = {}, {}, set()
    for line in lines[1:]:
        parts = line.split(";")
        if len(parts) < len(header):
            continue
        rel, pkg = parts[rel_i].strip(), parts[pkg_i].strip()
        if not rel or not pkg:
            continue
        packages.add(pkg.lower())
        by_release[unquote(rel).lower()] = pkg
        by_base.setdefault(base_name(rel), set()).add(pkg)
    return by_release, by_base, packages


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--list", help="path to VRP-GameList.txt")
    ap.add_argument("--ports", default=str(PORTS_JSON), help="path to ports.json")
    ap.add_argument("--dry-run", action="store_true", help="show the result, don't write")
    args = ap.parse_args()

    by_release, by_base, packages = load_games(find_list(args.list))
    ports_path = Path(args.ports)
    data = json.loads(ports_path.read_text(encoding="utf-8"))

    result, seen, unmatched = [], set(), []

    def add(pkg):
        if pkg.lower() not in seen:
            seen.add(pkg.lower())
            result.append(pkg)

    for entry in data.get("ports", []):
        key = unquote(entry).strip().lower()
        if key in packages:  # already a package name
            add(entry.strip())
        elif key in by_release:
            add(by_release[key])
            print(f"  ok       {entry}  ->  {by_release[key]}")
        elif len(by_base.get(base_name(entry), ())) == 1:
            pkg = next(iter(by_base[base_name(entry)]))
            add(pkg)
            print(f"  ok~      {entry}  ->  {pkg}  (matched ignoring version)")
        elif by_base.get(base_name(entry)):
            print(f"  AMBIGUOUS {entry}  ->  {sorted(by_base[base_name(entry)])}")
            unmatched.append(entry)
            add(entry.strip())
        else:
            print(f"  NOT FOUND {entry}")
            unmatched.append(entry)
            add(entry.strip())

    data["ports"] = result
    if not args.dry_run:
        ports_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\n{len(result) - len(unmatched)} package names, {len(unmatched)} left as-is"
          + (" (dry run, nothing written)" if args.dry_run else f" -> {ports_path}"))


if __name__ == "__main__":
    main()
