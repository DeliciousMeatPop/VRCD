/**
 * "Port" detection.
 *
 * A port is a game whose APK is an unofficial port that needs the Steam
 * (PC) game files copied in before it will run - the vrsrc server hosts the
 * APK, the user supplies the Steam files. The server's game list has no
 * column for this, so a game is flagged as a port when:
 *
 *   1. it is listed in `resources/ports.json` (`include`), OR
 *   2. its release note mentions needing Steam files (see NOTE_PATTERNS)
 *
 * and it is NOT listed in `ports.json` `exclude` (use that to drop false
 * positives from the note scan). Entries match on package name or release
 * name, case-insensitively.
 */

export interface PortOverrides {
  include: string[]
  exclude: string[]
}

// "steam" within ~120 chars of a word that says files/copy/own/etc. is needed
// (either order), or an explicit "requires steam"/"steam version" phrasing.
const NOTE_PATTERNS: RegExp[] = [
  /\bsteam\b[^]{0,120}\b(files?|copy|folder|directory|assets?|data|vrsrc|own|purchase|bought)\b/i,
  /\b(files?|copy|folder|directory|assets?|data|vrsrc|own|purchase|bought)\b[^]{0,120}\bsteam\b/i,
  /\b(requires?|needs?)\b[^]{0,40}\bsteam\b/i
]

export function noteLooksLikePort(note: string): boolean {
  if (!note) return false
  return NOTE_PATTERNS.some((re) => re.test(note))
}

export function parsePortOverrides(raw: unknown): PortOverrides {
  const empty: PortOverrides = { include: [], exclude: [] }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty
  const obj = raw as Record<string, unknown>
  const clean = (v: unknown): string[] =>
    Array.isArray(v)
      ? v
          .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
          .filter((s) => !s.startsWith('_'))
          .map((s) => s.trim().toLowerCase())
      : []
  return { include: clean(obj.include), exclude: clean(obj.exclude) }
}

export function isPortGame(
  game: { packageName: string; releaseName: string },
  note: string | null,
  overrides: PortOverrides
): boolean {
  const keys = [game.packageName, game.releaseName].map((s) => (s ?? '').trim().toLowerCase())
  if (keys.some((k) => k && overrides.exclude.includes(k))) return false
  if (keys.some((k) => k && overrides.include.includes(k))) return true
  return noteLooksLikePort(note ?? '')
}
