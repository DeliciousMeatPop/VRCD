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
