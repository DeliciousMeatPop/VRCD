import { describe, expect, it, vi } from 'vitest'
import { GameDescriptionFound, GameDescriptionNotFound, GameDescriptionRequest } from '@shared/types'
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
    set: vi.fn(async (key: string, value: GameDescriptionFound | GameDescriptionNotFound): Promise<void> => {
      values.set(key, value)
    })
  }
}

describe('GameDescriptionService', () => {
  it('background-primes only source-qualified records without web traffic', async () => {
    const cache = createCache()
    const provider = { lookup: vi.fn() }
    const service = new GameDescriptionService({
      cache,
      provider,
      probeImage: vi.fn()
        .mockResolvedValueOnce({ width: 512, height: 512 })
        .mockResolvedValueOnce({ width: 128, height: 128 })
    })

    const snapshot = await service.primeDescriptions([
      sourceQualifiedGame,
      { ...sourceQualifiedGame, key: 'small:en', thumbnailPath: '/tmp/small.jpg' }
    ])

    expect(snapshot['puzzling:en']).toMatchObject({ status: 'found', source: { label: 'VRP metadata' } })
    expect(snapshot['small:en']).toBeUndefined()
    expect(provider.lookup).not.toHaveBeenCalled()
  })

  it('defers weak source records to the lazy Wikipedia path and falls back from Spanish', async () => {
    const cache = createCache()
    const provider = {
      lookup: vi.fn()
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
      provider,
      probeImage: vi.fn(async () => ({ width: 128, height: 128 }))
    })

    await expect(service.getDescription({ ...sourceQualifiedGame, key: 'puzzling:es', language: 'es' }))
      .resolves.toMatchObject({ status: 'found', language: 'en' })

    expect(provider.lookup).toHaveBeenNthCalledWith(1, 'Puzzling Places', 'es')
    expect(provider.lookup).toHaveBeenNthCalledWith(2, 'Puzzling Places', 'en')
  })

  it('requires an explicit library source before background priming', async () => {
    const cache = createCache()
    const provider = { lookup: vi.fn() }
    const service = new GameDescriptionService({
      cache,
      provider,
      probeImage: vi.fn(async () => ({ width: 512, height: 512 }))
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
      provider,
      // No qualifying library image → would normally fall through to Wikipedia.
      probeImage: vi.fn(async () => null)
    })

    await expect(
      service.getDescription({ ...sourceQualifiedGame, allowNetwork: false })
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
      provider,
      probeImage: vi.fn(async () => null)
    })

    await expect(service.getDescription(sourceQualifiedGame)).resolves.toMatchObject({
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
      provider,
      probeImage: vi.fn(async () => null)
    })

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await expect(service.getDescription(sourceQualifiedGame)).resolves.toMatchObject({ status: 'error' })
    expect(cache.set).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
