/**
 * "Port" flagging: games whose APK needs Steam (PC) game files. The list is
 * maintained by hand in `resources/ports.json` ({ "ports": [...] }). Entries
 * match a game's package name or release name, case-insensitively. Keys
 * starting with "_" are ignored (breadcrumbs).
 */

export function parsePortList(raw: unknown): Set<string> {
  const list = (raw as { ports?: unknown } | null)?.ports
  if (!Array.isArray(list)) return new Set()
  return new Set(
    list
      .filter((s): s is string => typeof s === 'string')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0 && !s.startsWith('_'))
  )
}

export function isPortGame(
  game: { packageName: string; releaseName: string },
  ports: Set<string>
): boolean {
  return [game.packageName, game.releaseName].some((s) => ports.has((s ?? '').trim().toLowerCase()))
}
