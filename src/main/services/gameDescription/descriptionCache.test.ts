import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { DescriptionCache } from './descriptionCache'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('DescriptionCache', () => {
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

    now += 8 * 24 * 60 * 60 * 1000
    await expect(cache.get('found')).resolves.toMatchObject({ status: 'found' })
    await expect(cache.get('missing')).resolves.toBeNull()

    now += 23 * 24 * 60 * 60 * 1000
    await expect(cache.get('found')).resolves.toBeNull()
  })
})
