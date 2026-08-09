import { useCallback, useState } from 'react'

export const STARRED_GAMES_STORAGE_KEY = 'vrcyberdeck:starredPackages:v1'

export interface StarredGamesStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function parseStarredPackages(raw: string | null): Set<string> {
  if (!raw) return new Set()

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()

    return new Set(
      parsed
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  } catch {
    return new Set()
  }
}

export function readStarredPackages(storage: StarredGamesStorage | null | undefined): Set<string> {
  if (!storage) return new Set()
  try {
    return parseStarredPackages(storage.getItem(STARRED_GAMES_STORAGE_KEY))
  } catch {
    return new Set()
  }
}

export function writeStarredPackages(
  storage: StarredGamesStorage | null | undefined,
  packages: ReadonlySet<string>
): void {
  if (!storage) return
  try {
    storage.setItem(STARRED_GAMES_STORAGE_KEY, JSON.stringify(Array.from(packages).sort()))
  } catch {
    /* localStorage can be unavailable or full; keep the in-memory state usable */
  }
}

export function toggleStarredPackage(
  packages: ReadonlySet<string>,
  packageName: string
): Set<string> {
  const normalized = packageName.trim()
  const next = new Set(packages)
  if (!normalized) return next

  if (next.has(normalized)) next.delete(normalized)
  else next.add(normalized)
  return next
}

export function isPackageStarred(packages: ReadonlySet<string>, packageName: string): boolean {
  return packages.has(packageName.trim())
}

function getBrowserStorage(): StarredGamesStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export interface StarredGamesState {
  starredPackages: ReadonlySet<string>
  isStarred: (packageName: string) => boolean
  toggleStarred: (packageName: string) => void
}

export function useStarredGames(): StarredGamesState {
  const [starredPackages, setStarredPackages] = useState<Set<string>>(() =>
    readStarredPackages(getBrowserStorage())
  )

  const isStarred = useCallback(
    (packageName: string): boolean => isPackageStarred(starredPackages, packageName),
    [starredPackages]
  )

  const toggleStarred = useCallback((packageName: string): void => {
    if (!packageName.trim()) return
    setStarredPackages((current) => {
      const next = toggleStarredPackage(current, packageName)
      writeStarredPackages(getBrowserStorage(), next)
      return next
    })
  }, [])

  return { starredPackages, isStarred, toggleStarred }
}
