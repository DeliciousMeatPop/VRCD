import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { DescriptionCache } from './descriptionCache'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('DescriptionCache', () => {
  it('makes concurrent cold readers wait for the same persisted entries', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vrcd-description-cache-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'cache.json')
    const writer = new DescriptionCache(path, () => 1000)
    await writer.set('game', {
      status: 'found',
      text: 'A game description.',
      source: { label: 'Meta Store' },
      language: 'en',
      fetchedAt: 1000
    })
    const reader = new DescriptionCache(path, () => 1000)
    const results = await Promise.all([reader.get('game'), reader.get('game')])
    expect(results.map((result) => result?.status)).toEqual(['found', 'found'])
  })

  it('preserves concurrent writes while migrating a legacy cache', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vrcd-description-cache-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'cache.json')
    await writeFile(path, JSON.stringify({ version: 1, entries: {} }))
    const cache = new DescriptionCache(path, () => 1000)
    await Promise.all([
      cache.get('old'),
      ...['a', 'b', 'c'].map((key) =>
        cache.set(key, {
          status: 'found',
          text: `Description for ${key}`,
          source: { label: 'Meta Store' },
          language: 'en',
          fetchedAt: 1000
        })
      )
    ])
    const reloaded = new DescriptionCache(path, () => 1000)
    expect(
      (await Promise.all(['a', 'b', 'c'].map((key) => reloaded.get(key)))).map(
        (result) => result?.status
      )
    ).toEqual(['found', 'found', 'found'])
  })
  it('uses distinct TTLs for found and not-found results', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vrcd-description-cache-'))
    temporaryDirectories.push(directory)
    let now = 1_000
    const cache = new DescriptionCache(join(directory, 'cache.json'), () => now)

    await cache.set('found', {
      status: 'found',
      text: 'A virtual reality game.',
      source: { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Test' },
      language: 'en',
      fetchedAt: now
    })
    await cache.set('missing', { status: 'not-found', language: 'en', fetchedAt: now })

    now += 25 * 60 * 60 * 1000
    await expect(cache.get('found')).resolves.toMatchObject({ status: 'found' })
    await expect(cache.get('missing')).resolves.toBeNull()

    now += 29 * 24 * 60 * 60 * 1000
    await expect(cache.get('found')).resolves.toBeNull()
  })

  it('writes the current cache version', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vrcd-description-cache-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'cache.json')
    const cache = new DescriptionCache(path, () => 1_000)

    await cache.set('missing', { status: 'not-found', language: 'en', fetchedAt: 1_000 })

    await expect(readFile(path, 'utf8').then(JSON.parse)).resolves.toMatchObject({ version: 2 })
  })

  it('migrates valid legacy successes while invalidating legacy misses', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vrcd-description-cache-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'cache.json')
    const now = 10_000
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        entries: {
          found: {
            result: {
              status: 'found',
              text: 'A virtual reality game.',
              source: { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Test' },
              language: 'en',
              fetchedAt: 1_000
            },
            expiresAt: now + 1_000
          },
          missing: {
            result: { status: 'not-found', language: 'en', fetchedAt: 1_000 },
            expiresAt: now + 1_000
          },
          expired: {
            result: {
              status: 'found',
              text: 'An expired description.',
              source: { label: 'Wikipedia' },
              language: 'en',
              fetchedAt: 1_000
            },
            expiresAt: now - 1
          }
        }
      }),
      'utf8'
    )

    const cache = new DescriptionCache(path, () => now)
    await expect(cache.get('found')).resolves.toMatchObject({ status: 'found' })
    await expect(cache.get('missing')).resolves.toBeNull()
    await expect(cache.get('expired')).resolves.toBeNull()

    const migrated = JSON.parse(await readFile(path, 'utf8'))
    expect(migrated).toMatchObject({ version: 2 })
    expect(Object.keys(migrated.entries)).toEqual(['found'])
  })
})
