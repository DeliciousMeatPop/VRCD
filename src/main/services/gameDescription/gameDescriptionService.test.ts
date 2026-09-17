import { describe, expect, it, vi } from 'vitest'
import {
  GameDescriptionFound,
  GameDescriptionNotFound,
  GameDescriptionRequest
} from '@shared/types'
import { DescriptionCachePort, GameDescriptionService } from './gameDescriptionService'

const sourceQualifiedGame: GameDescriptionRequest = {
  key: 'puzzling:en',
  gameName: 'Puzzling Places',
  packageName: 'com.realities.puzzlingplaces',
  thumbnailPath: '/tmp/puzzling.jpg',
  language: 'en',
  libraryDescription: 'A virtual reality jigsaw puzzle experience designed for Meta Quest players.',
  libraryDescriptionSourceLabel: 'VRP metadata',
  libraryDescriptionSourceUrl: 'https://example.test/puzzling'
}

const createCache = (): DescriptionCachePort => {
  const values = new Map<string, GameDescriptionFound | GameDescriptionNotFound>()
  return {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(
      async (key: string, value: GameDescriptionFound | GameDescriptionNotFound): Promise<void> => {
        values.set(key, value)
      }
    )
  }
}

describe('GameDescriptionService', () => {
  it('background-primes source-qualified records regardless of cover usability', async () => {
    const cache = createCache()
    const provider = { lookup: vi.fn() }
    const service = new GameDescriptionService({
      cache,
      provider
    })

    const snapshot = await service.primeDescriptions([
      { ...sourceQualifiedGame, key: 'missing:en', thumbnailPath: '' },
      { ...sourceQualifiedGame, key: 'tiny:en', thumbnailPath: '/tmp/tiny.jpg' },
      { ...sourceQualifiedGame, key: 'unreadable:en', thumbnailPath: '/tmp/unreadable.jpg' }
    ])

    expect(snapshot['missing:en']).toMatchObject({
      status: 'found',
      source: { label: 'VRP metadata' }
    })
    expect(snapshot['tiny:en']).toMatchObject({ status: 'found' })
    expect(snapshot['unreadable:en']).toMatchObject({ status: 'found' })
    expect(provider.lookup).not.toHaveBeenCalled()
  })

  it('accepts a library description when the game has no thumbnail', async () => {
    const service = new GameDescriptionService({
      cache: createCache(),
      provider: { lookup: vi.fn() }
    })

    await expect(
      service.getDescription({ ...sourceQualifiedGame, thumbnailPath: '' })
    ).resolves.toMatchObject({ status: 'found', source: { label: 'VRP metadata' } })
  })

  it('defers weak source records to the lazy Wikipedia path and falls back from Spanish', async () => {
    const cache = createCache()
    const provider = {
      lookup: vi
        .fn()
        .mockResolvedValueOnce({ status: 'not-found', language: 'es', fetchedAt: 1 })
        .mockResolvedValueOnce({
          status: 'found',
          text: 'A virtual reality game.',
          source: { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Test' },
          language: 'en',
          fetchedAt: 2
        })
    }
    const service = new GameDescriptionService({
      cache,
      provider
    })

    await expect(
      service.getDescription({
        ...sourceQualifiedGame,
        key: 'puzzling:es',
        language: 'es',
        libraryDescription: undefined
      })
    ).resolves.toMatchObject({ status: 'found', language: 'en' })

    expect(provider.lookup).toHaveBeenNthCalledWith(
      1,
      'Puzzling Places',
      'es',
      'com.realities.puzzlingplaces'
    )
    expect(provider.lookup).toHaveBeenNthCalledWith(
      2,
      'Puzzling Places',
      'en',
      'com.realities.puzzlingplaces'
    )
  })

  it('requires an explicit library source before background priming', async () => {
    const cache = createCache()
    const provider = { lookup: vi.fn() }
    const service = new GameDescriptionService({
      cache,
      provider
    })

    const snapshot = await service.primeDescriptions([
      { ...sourceQualifiedGame, libraryDescriptionSourceLabel: undefined }
    ])

    expect(snapshot).toEqual({})
    expect(provider.lookup).not.toHaveBeenCalled()
  })

  it('skips the network lookup when allowNetwork is false (Disable All Extras)', async () => {
    const cache = createCache()
    const provider = { lookup: vi.fn() }
    const service = new GameDescriptionService({
      cache,
      provider
    })

    await expect(
      service.getDescription({
        ...sourceQualifiedGame,
        libraryDescription: undefined,
        allowNetwork: false
      })
    ).resolves.toMatchObject({ status: 'not-found' })

    // Never reached the network, and did not negative-cache the skip.
    expect(provider.lookup).not.toHaveBeenCalled()
    expect(cache.set).not.toHaveBeenCalled()
  })

  it('still performs the lookup when allowNetwork is unset (default allowed)', async () => {
    const cache = createCache()
    const provider = {
      lookup: vi.fn(async () => ({
        status: 'found' as const,
        text: 'A virtual reality game.',
        source: { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Test' },
        language: 'en' as const,
        fetchedAt: 3
      }))
    }
    const service = new GameDescriptionService({
      cache,
      provider
    })

    await expect(
      service.getDescription({ ...sourceQualifiedGame, libraryDescription: undefined })
    ).resolves.toMatchObject({
      status: 'found',
      source: { label: 'Wikipedia' }
    })
    expect(provider.lookup).toHaveBeenCalledTimes(1)
  })

  it('does not negative-cache temporary provider failures', async () => {
    const cache = createCache()
    const provider = { lookup: vi.fn().mockRejectedValue(new Error('offline')) }
    const service = new GameDescriptionService({
      cache,
      provider
    })

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await expect(
      service.getDescription({ ...sourceQualifiedGame, libraryDescription: undefined })
    ).resolves.toMatchObject({ status: 'error' })
    expect(cache.set).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
