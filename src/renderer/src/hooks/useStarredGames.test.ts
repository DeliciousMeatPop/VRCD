import { describe, expect, it } from 'vitest'
import {
  STARRED_GAMES_STORAGE_KEY,
  isPackageStarred,
  parseStarredPackages,
  readStarredPackages,
  toggleStarredPackage,
  writeStarredPackages,
  type StarredGamesStorage
} from './useStarredGames'

function createStorage(initialValue: string | null = null): StarredGamesStorage & {
  value: string | null
} {
  return {
    value: initialValue,
    getItem(key) {
      expect(key).toBe(STARRED_GAMES_STORAGE_KEY)
      return this.value
    },
    setItem(key, value) {
      expect(key).toBe(STARRED_GAMES_STORAGE_KEY)
      this.value = value
    }
  }
}

describe('starred games storage', () => {
  it('returns an empty set for empty, malformed, or non-array data', () => {
    expect(parseStarredPackages(null)).toEqual(new Set())
    expect(parseStarredPackages('')).toEqual(new Set())
    expect(parseStarredPackages('{broken')).toEqual(new Set())
    expect(parseStarredPackages('{"package":"com.example"}')).toEqual(
      new Set()
    )
  })

  it('trims, validates, and deduplicates package names', () => {
    const result = parseStarredPackages(
      JSON.stringify([
        ' com.example.one ',
        'com.example.one',
        '',
        42,
        null,
        'com.example.two'
      ])
    )

    expect(result).toEqual(new Set(['com.example.one', 'com.example.two']))
  })

  it('treats unavailable storage as empty and ignores write failures', () => {
    const unavailable: StarredGamesStorage = {
      getItem: () => {
        throw new Error('unavailable')
      },
      setItem: () => {
        throw new Error('unavailable')
      }
    }

    expect(readStarredPackages(unavailable)).toEqual(new Set())
    expect(readStarredPackages(null)).toEqual(new Set())
    expect(() =>
      writeStarredPackages(unavailable, new Set(['com.example']))
    ).not.toThrow()
    expect(() => writeStarredPackages(null, new Set(['com.example']))).not.toThrow()
  })

  it('adds and removes packages without mutating the original set', () => {
    const original = new Set(['com.example.one'])
    const added = toggleStarredPackage(original, 'com.example.two')
    const removed = toggleStarredPackage(added, 'com.example.one')

    expect(original).toEqual(new Set(['com.example.one']))
    expect(added).toEqual(new Set(['com.example.one', 'com.example.two']))
    expect(removed).toEqual(new Set(['com.example.two']))
  })

  it('ignores blank package names', () => {
    const original = new Set(['com.example.one'])
    expect(toggleStarredPackage(original, '   ')).toEqual(original)
  })

  it('applies one package-level star to every release sharing that package', () => {
    const packages = new Set(['com.example.shared'])
    const releases = [
      { releaseName: 'release-one', packageName: 'com.example.shared' },
      { releaseName: 'release-two', packageName: 'com.example.shared' }
    ]

    expect(releases.every((release) => isPackageStarred(packages, release.packageName))).toBe(
      true
    )
  })

  it('retains a star while its package is missing from a refreshed catalog', () => {
    const storage = createStorage('["com.example.returning"]')
    const starred = readStarredPackages(storage)
    const refreshedCatalog = [{ packageName: 'com.example.other' }]

    expect(refreshedCatalog.filter((game) => isPackageStarred(starred, game.packageName))).toEqual(
      []
    )
    expect(isPackageStarred(starred, 'com.example.returning')).toBe(true)
  })

  it('persists package names in deterministic order and reads them back', () => {
    const storage = createStorage()
    writeStarredPackages(storage, new Set(['com.zeta', 'com.alpha']))

    expect(storage.value).toBe('["com.alpha","com.zeta"]')
    expect(readStarredPackages(storage)).toEqual(
      new Set(['com.alpha', 'com.zeta'])
    )
  })
})
