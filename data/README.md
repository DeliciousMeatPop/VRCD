# Trailer fixes

VR CyberDeck downloads `trailer-overrides.json` from this folder every time it starts and applies it
on top of its automatic trailer lookup.

## `trailer-overrides.json` (hand-maintained)

Maps a package name to the trailer that should be shown:

```json
{
  "com.example.game": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "com.example.other": { "youtubeId": "dQw4w9WgXcQ" },
  "com.example.nothing-good": null
}
```

- A YouTube URL or `youtubeId` pins that video.
- `null` hides the trailer entirely.
- Only YouTube videos are accepted from this file; anything else is ignored by the app.
- A user's own local `trailer-overrides.json` still wins over this file.

## `trailer-reports.json` (generated, do not edit)

Rebuilt by the **Trailer Reports** workflow from issues made with the _Wrong trailer_ issue form. It lists, per
package, how many people reported it, the trailer they saw, and any better trailers they suggested. Review it, then
copy the good suggestions into `trailer-overrides.json`.

## Finding games that need a trailer

**In the app (whole library):** Settings > _Find missing trailers_ > _Scan all games_. It looks up a trailer
for every game, one at a time (about 1-2 seconds each, so it takes a while; Cancel keeps what it found). When it
finishes, _Show report_ opens `trailer-scan-report.json` (next to the trailer cache), listing every game with no
trailer found. A lookup that hit a network error is not remembered as a miss, so run the scan again later to
retry those.

## `missing-trailers.json` (generated locally)

Run `python scripts/list_missing_trailers.py` (it works from any folder; the list is written next to the script)
on a machine where CyberDeck has been used. It reads the app's trailer cache and the game list and writes two
lists: `noTrailerFound` (lookup came back empty) and `neverChecked` (in the library but not looked up yet, so
run the in-app scan first to shrink this). Games already in `trailer-overrides.json` are skipped. Add a trailer
for each one you want covered.
