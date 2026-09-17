import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => join(tmpdir(), 'vrcd-default-test') } }))

import { MetaStoreService } from './metaStoreService'
import { StoreMetadataProvider } from './gameMetadata/storeMetadataProvider'

const directories: string[] = []
async function temporaryDataDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'vrcd-trailer-test-'))
  directories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

const youtubeSearchPage = (title?: string, videoId = 'trailer0001'): string =>
  `<script>var ytInitialData = ${JSON.stringify({
    contents: {
      twoColumnSearchResultsRenderer: {
        primaryContents: {
          sectionListRenderer: {
            contents: [
              {
                itemSectionRenderer: {
                  contents: title
                    ? [{ videoRenderer: { videoId, title: { simpleText: title } } }]
                    : []
                }
              }
            ]
          }
        }
      }
    }
  })};</script>`

describe('MetaStoreService', () => {
  it('does not resolve empty or generic headset names', async () => {
    let lookups = 0
    const service = new MetaStoreService({
      dataDir: await temporaryDataDir(),
      storeLookup: async () => {
        lookups += 1
        return {
          title: 'Meta Quest',
          sourceUrl: 'https://www.meta.com/',
          trailerUrl: 'https://video.oculuscdn.com/generic.mp4'
        }
      },
      get: async () => {
        lookups += 1
        return { data: youtubeSearchPage('Meta Quest 3 Official Trailer', 'generic0001') }
      }
    })

    await expect(service.getTrailerUrl('', 'com.empty')).resolves.toBeNull()
    await expect(service.getTrailerUrl('Meta Quest', 'com.generic')).resolves.toBeNull()
    expect(lookups).toBe(0)
  })

  it('prefers a verified native store trailer over YouTube search', async () => {
    const dataDir = await temporaryDataDir()
    let youtubeRequests = 0
    const service = new MetaStoreService({
      dataDir,
      get: async () => {
        youtubeRequests += 1
        throw new Error('YouTube should not be requested')
      },
      storeLookup: async () => ({
        title: 'Breachers',
        sourceUrl: 'https://www.meta.com/experiences/5740397619319389/',
        trailerUrl: 'https://video.oculuscdn.com/breachers.mp4?token=signed'
      })
    })

    await expect(service.getTrailerUrl('Breachers', 'com.trianglefactory.breachers')).resolves.toBe(
      'https://video.oculuscdn.com/breachers.mp4?token=signed'
    )
    expect(youtubeRequests).toBe(0)
  })

  it('falls back to a title-verified YouTube result when the store is unavailable', async () => {
    const service = new MetaStoreService({
      dataDir: await temporaryDataDir(),
      storeLookup: async () => {
        throw new Error('store offline')
      },
      get: async () => ({ data: youtubeSearchPage('Med Valley - Official Trailer', 'medvalley01') })
    })

    await expect(service.getTrailerUrl('Med Valley', 'com.test.medvalley')).resolves.toBe(
      'https://www.youtube.com/watch?v=medvalley01'
    )
  })

  it('rejects native-looking store URLs outside known media CDNs', async () => {
    const service = new MetaStoreService({
      dataDir: await temporaryDataDir(),
      storeLookup: async () => ({
        title: 'Breachers',
        sourceUrl: 'https://www.meta.com/experiences/5740397619319389/',
        trailerUrl: 'https://untrusted.example/breachers.mp4'
      }),
      get: async () => ({
        data: youtubeSearchPage('Breachers - Official Trailer', 'breachers01')
      })
    })

    await expect(service.getTrailerUrl('Breachers', 'com.breachers')).resolves.toBe(
      'https://www.youtube.com/watch?v=breachers01'
    )
  })

  it('keeps explicit overrides above cached and automatic results', async () => {
    const dataDir = await temporaryDataDir()
    await writeFile(
      join(dataDir, 'trailer-overrides.json'),
      JSON.stringify({
        'com.youtube': 'http://youtu.be/manual00001?t=2',
        'com.disabled': null,
        'com.http-native': 'http://media.lan/trailer.mp4',
        'com.local-native': 'local-video://trailers/manual.mp4'
      })
    )
    let automaticLookups = 0
    const service = new MetaStoreService({
      dataDir,
      storeLookup: async () => {
        automaticLookups += 1
        return null
      },
      get: async () => {
        automaticLookups += 1
        return { data: youtubeSearchPage('Manual - Official Trailer') }
      }
    })

    await expect(service.getTrailerUrl('Manual', 'com.youtube')).resolves.toBe(
      'https://www.youtube.com/watch?v=manual00001'
    )
    await expect(service.getTrailerUrl('Disabled', 'com.disabled')).resolves.toBeNull()
    await expect(service.getTrailerUrl('HTTP Native', 'com.http-native')).resolves.toBe(
      'http://media.lan/trailer.mp4'
    )
    await expect(service.getTrailerUrl('Local Native', 'com.local-native')).resolves.toBe(
      'local-video://trailers/manual.mp4'
    )
    expect(automaticLookups).toBe(0)
  })

  it('invalidates version 3 cache data and persists version 4 entries with requested titles', async () => {
    const dataDir = await temporaryDataDir()
    await writeFile(
      join(dataDir, 'meta-trailer-cache.json'),
      JSON.stringify({
        __version: 3,
        'com.test': {
          trailerUrl: 'https://www.youtube.com/watch?v=stale000001',
          resolvedAt: 1
        }
      })
    )
    const service = new MetaStoreService({
      dataDir,
      storeLookup: async () => null,
      get: async () => ({ data: youtubeSearchPage('Breachers - Official Trailer', 'breachers01') }),
      clock: () => 10_000
    })

    await expect(service.getTrailerUrl('Breachers', 'com.test')).resolves.toBe(
      'https://www.youtube.com/watch?v=breachers01'
    )
    const persisted = JSON.parse(await readFile(join(dataDir, 'meta-trailer-cache.json'), 'utf8'))
    expect(persisted.__version).toBe(4)
    expect(Object.values(persisted.entries)).toContainEqual(
      expect.objectContaining({ requestedTitle: 'breachers', source: 'youtube' })
    )
  })

  it('does not reuse a package cache entry for a different requested title', async () => {
    const dataDir = await temporaryDataDir()
    let requests = 0
    const service = new MetaStoreService({
      dataDir,
      storeLookup: async () => null,
      get: async (_url, config) => {
        requests += 1
        const query = String(config?.params?.search_query)
        const title = query.startsWith('RUMBLE 2')
          ? 'RUMBLE 2 - Official Trailer'
          : 'RUMBLE - Official Trailer'
        const id = query.startsWith('RUMBLE 2') ? 'rumble00002' : 'rumble00001'
        return { data: youtubeSearchPage(title, id) }
      }
    })

    await expect(service.getTrailerUrl('RUMBLE', 'com.test')).resolves.toContain('rumble00001')
    await expect(service.getTrailerUrl('RUMBLE 2', 'com.test')).resolves.toContain('rumble00002')
    expect(requests).toBe(2)
  })

  it('expires YouTube successes after 30 days and native URLs after at most 15 minutes', async () => {
    const dataDir = await temporaryDataDir()
    let now = 1_800_000_000_000
    let storeCalls = 0
    const native = 'https://video.oculuscdn.com/breachers.mp4?token=signed'
    const storeService = new MetaStoreService({
      dataDir: join(dataDir, 'store'),
      clock: () => now,
      storeLookup: async () => {
        storeCalls += 1
        return { title: 'Breachers', sourceUrl: 'https://www.meta.com/', trailerUrl: native }
      },
      get: async () => {
        throw new Error('unexpected YouTube request')
      }
    })
    await storeService.getTrailerUrl('Breachers', 'com.store')
    now += 15 * 60_000 - 1
    await storeService.getTrailerUrl('Breachers', 'com.store')
    expect(storeCalls).toBe(1)
    now += 2
    await storeService.getTrailerUrl('Breachers', 'com.store')
    expect(storeCalls).toBe(2)

    let youtubeCalls = 0
    const youtubeService = new MetaStoreService({
      dataDir: join(dataDir, 'youtube'),
      clock: () => now,
      storeLookup: async () => null,
      get: async () => {
        youtubeCalls += 1
        return { data: youtubeSearchPage('Breachers - Official Trailer', 'breachers01') }
      }
    })
    await youtubeService.getTrailerUrl('Breachers', 'com.youtube')
    now += 30 * 24 * 60 * 60_000 - 1
    await youtubeService.getTrailerUrl('Breachers', 'com.youtube')
    expect(youtubeCalls).toBe(1)
    now += 2
    await youtubeService.getTrailerUrl('Breachers', 'com.youtube')
    expect(youtubeCalls).toBe(2)
  })

  it('uses a shorter expiry carried by a signed native URL', async () => {
    let now = 1_800_000_000_000
    let storeCalls = 0
    const service = new MetaStoreService({
      dataDir: await temporaryDataDir(),
      clock: () => now,
      storeLookup: async () => {
        storeCalls += 1
        return {
          title: 'Breachers',
          sourceUrl: 'https://www.meta.com/',
          trailerUrl: `https://video.oculuscdn.com/breachers.mp4?Expires=${Math.floor((now + 60_000) / 1000)}`
        }
      },
      get: async () => {
        throw new Error('unexpected YouTube request')
      }
    })

    await service.getTrailerUrl('Breachers', 'com.store')
    now += 60_001
    await service.getTrailerUrl('Breachers', 'com.store')
    expect(storeCalls).toBe(2)
  })

  it('refreshes signed media after expiry through the shared store provider cache', async () => {
    let now = 1_800_000_000_000
    let storeRequests = 0
    const store = new StoreMetadataProvider({
      clock: () => now,
      identities: { 'com.test': { title: 'Breachers', metaIds: ['456'] } },
      get: async () => {
        storeRequests += 1
        const trailer = `https://video.oculuscdn.com/breachers-${storeRequests}.mp4?Expires=${Math.floor((now + 60_000) / 1000)}`
        return {
          data: `<script type="application/ld+json">${JSON.stringify({
            '@graph': [
              {
                '@type': 'ItemPage',
                url: 'https://www.meta.com/experiences/456/',
                mainEntity: { '@id': 'app-456' },
                video: { '@id': trailer }
              },
              {
                '@type': 'SoftwareApplication',
                '@id': 'app-456',
                name: 'Breachers',
                sku: '456',
                url: 'https://www.meta.com/experiences/456/',
                availableOnDevice: ['Quest 3'],
                description: 'A tactical virtual reality game for teams of competitive players.'
              }
            ]
          })}</script>`
        }
      }
    })
    const service = new MetaStoreService({
      dataDir: await temporaryDataDir(),
      clock: () => now,
      storeLookup: (name, language, packageName) => store.lookup(name, language, packageName),
      get: async () => {
        throw new Error('unexpected YouTube request')
      }
    })

    await expect(service.getTrailerUrl('Breachers', 'com.test')).resolves.toContain(
      'breachers-1.mp4'
    )
    now += 60_001
    await expect(service.getTrailerUrl('Breachers', 'com.test')).resolves.toContain(
      'breachers-2.mp4'
    )
    expect(storeRequests).toBe(2)
  })

  it('caches confident misses for 24 hours', async () => {
    let now = 1_800_000_000_000
    let requests = 0
    const service = new MetaStoreService({
      dataDir: await temporaryDataDir(),
      clock: () => now,
      storeLookup: async () => null,
      get: async () => {
        requests += 1
        return { data: youtubeSearchPage() }
      }
    })

    await service.getTrailerUrl('Unknown Game', 'com.unknown')
    await service.getTrailerUrl('Unknown Game', 'com.unknown')
    expect(requests).toBe(3)
    now += 24 * 60 * 60_000 + 1
    await service.getTrailerUrl('Unknown Game', 'com.unknown')
    expect(requests).toBe(6)
  })

  it('retries after transport, malformed-response, and incomplete-store failures', async () => {
    let attempt = 0
    let storeCalls = 0
    const service = new MetaStoreService({
      dataDir: await temporaryDataDir(),
      storeLookup: async () => {
        storeCalls += 1
        return attempt === 0
          ? { title: 'Puzzleverse', sourceUrl: 'https://www.meta.com/', incomplete: true }
          : null
      },
      get: async () => {
        if (attempt === 0) return { data: '<html>consent page</html>' }
        return { data: youtubeSearchPage('Puzzleverse - Official Trailer', 'puzzlevers1') }
      }
    })

    await expect(service.getTrailerUrl('Puzzleverse', 'com.puzzleverse')).resolves.toBeNull()
    attempt += 1
    await expect(service.getTrailerUrl('Puzzleverse', 'com.puzzleverse')).resolves.toContain(
      'puzzlevers1'
    )
    expect(storeCalls).toBe(2)
  })

  it('does not negative-cache a miss when the store and one search request fail', async () => {
    let retry = false
    let requests = 0
    let storeCalls = 0
    const service = new MetaStoreService({
      dataDir: await temporaryDataDir(),
      storeLookup: async () => {
        storeCalls += 1
        if (!retry) throw new Error('store temporarily unavailable')
        return null
      },
      get: async () => {
        requests += 1
        if (!retry && requests === 1) throw new Error('YouTube temporarily unavailable')
        return {
          data: retry
            ? youtubeSearchPage('Puzzleverse - Official Trailer', 'puzzlevers1')
            : youtubeSearchPage()
        }
      }
    })

    await expect(service.getTrailerUrl('Puzzleverse', 'com.puzzleverse')).resolves.toBeNull()
    retry = true
    await expect(service.getTrailerUrl('Puzzleverse', 'com.puzzleverse')).resolves.toContain(
      'puzzlevers1'
    )
    expect(storeCalls).toBe(2)
    expect(requests).toBe(4)
  })

  it('deduplicates concurrent lookups and serializes atomic cache persistence', async () => {
    const dataDir = await temporaryDataDir()
    let requests = 0
    const service = new MetaStoreService({
      dataDir,
      storeLookup: async () => null,
      get: async (_url, config) => {
        requests += 1
        await new Promise((resolve) => setTimeout(resolve, 5))
        const game = String(config?.params?.search_query).startsWith('Breachers')
          ? 'Breachers'
          : 'RUMBLE'
        return {
          data: youtubeSearchPage(
            `${game} - Official Trailer`,
            game === 'Breachers' ? 'breachers01' : 'rumble00001'
          )
        }
      }
    })

    await Promise.all([
      service.getTrailerUrl('Breachers', 'com.breachers'),
      service.getTrailerUrl('Breachers', 'com.breachers'),
      service.getTrailerUrl('RUMBLE', 'com.rumble')
    ])
    expect(requests).toBe(2)
    const persisted = JSON.parse(await readFile(join(dataDir, 'meta-trailer-cache.json'), 'utf8'))
    expect(Object.values(persisted.entries)).toHaveLength(2)
    await expect(readFile(join(dataDir, 'meta-trailer-cache.json.tmp'))).rejects.toThrow()
  })
})
