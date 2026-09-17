import { describe, expect, it, vi } from 'vitest'
import { StoreMetadataProvider, type MetadataGet } from './storeMetadataProvider'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { DescriptionCache } from '../gameDescription/descriptionCache'
import { GameDescriptionService } from '../gameDescription/gameDescriptionService'
import {
  MultiSourceDescriptionProvider,
  StoreDescriptionProvider
} from '../gameDescription/multiSourceProvider'

const meta = (id: string, name: string, description?: string): string =>
  `<script type="application/ld+json">${JSON.stringify({
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        '@id': `app-${id}`,
        name,
        sku: id,
        url: `https://www.meta.com/experiences/${id}/`,
        availableOnDevice: ['Quest 3'],
        description
      }
    ]
  })}</script>`

const steam = {
  '123': {
    success: true,
    data: {
      steam_appid: 123,
      type: 'game',
      name: 'Breachers',
      categories: [{ description: 'VR Only' }],
      short_description:
        'Plan your assault in a tactical virtual reality team shooter for VR players.'
    }
  }
}

describe('StoreMetadataProvider', () => {
  it('finds a Quest store page by vetted package identity without depending on artwork', async () => {
    const get: MetadataGet = async (url) => {
      if (url === 'https://www.meta.com/experiences/456/')
        return {
          data: meta(
            '456',
            'Breachers',
            'Plan an assault in a tactical team shooter built for virtual reality.'
          )
        }
      throw new Error(`unexpected request ${url}`)
    }
    const provider = new StoreMetadataProvider({
      get,
      identities: { 'com.test': { title: 'Breachers', metaIds: ['456'] } }
    })
    expect((await provider.lookup('Breachers', 'en', 'com.test'))?.description?.source.label).toBe(
      'Meta Store'
    )
  })

  it('fails closed before discovery when a known package conflicts with the requested title', async () => {
    let requests = 0
    const provider = new StoreMetadataProvider({
      get: async () => {
        requests += 1
        throw new Error('known identities must not be rebound through discovery')
      },
      identities: {
        'com.ivanovichgames.motionsoccer': {
          title: 'Motion Soccer',
          metaIds: ['28642850658635318']
        }
      }
    })

    await expect(
      provider.lookup('Motion Soccer PRO', 'en', 'com.ivanovichgames.motionsoccer')
    ).resolves.toBeNull()
    expect(requests).toBe(0)
  })

  it('continues to Steam when Meta is unavailable', async () => {
    const get: MetadataGet = async (url) => {
      if (url.includes('meta.com')) throw new Error('temporarily unavailable')
      if (url.includes('/api/appdetails')) return { data: steam }
      throw new Error(`unexpected request ${url}`)
    }
    const provider = new StoreMetadataProvider({
      get,
      identities: { 'com.test': { title: 'Breachers', metaIds: ['456'], steamIds: ['123'] } }
    })
    expect(await provider.lookup('Breachers', 'en', 'com.test')).toMatchObject({
      description: { source: { label: 'Steam' } },
      incomplete: true
    })
  })

  it('does not negative-cache network failures', async () => {
    let online = false
    const get: MetadataGet = async () => {
      if (!online) throw new Error('offline')
      return {
        data: meta(
          '456',
          'Breachers',
          'Plan an assault in a tactical team shooter built for virtual reality.'
        )
      }
    }
    const provider = new StoreMetadataProvider({
      get,
      identities: { 'com.test': { title: 'Breachers', metaIds: ['456'] } }
    })
    await expect(provider.lookup('Breachers', 'en', 'com.test')).rejects.toThrow()
    online = true
    expect((await provider.lookup('Breachers', 'en', 'com.test'))?.description?.status).toBe(
      'found'
    )
  })

  it('rejects ambiguous Steam names instead of choosing the first result', async () => {
    const get: MetadataGet = async (url) => ({
      data: url.includes('wikidata.org')
        ? { search: [] }
        : '<a data-ds-appid="1"><span class="title">Breachers</span></a><a data-ds-appid="2"><span class="title">Breachers</span></a>'
    })
    const provider = new StoreMetadataProvider({ get, identities: {} })
    await expect(provider.lookup('Breachers', 'en')).resolves.toBeNull()
  })

  it('gets a missing description from Steam even when a Meta identity was found', async () => {
    const get: MetadataGet = async (url) => ({
      data: url.includes('meta.com') ? meta('456', 'Breachers') : steam
    })
    const provider = new StoreMetadataProvider({
      get,
      identities: { 'com.test': { title: 'Breachers', metaIds: ['456'], steamIds: ['123'] } }
    })
    expect((await provider.lookup('Breachers', 'en', 'com.test'))?.description?.source.label).toBe(
      'Steam'
    )
  })

  it('gets missing native media from Steam without replacing the Meta description', async () => {
    const steamTrailer = 'https://video.steamstatic.com/breachers-trailer.mp4'
    const get: MetadataGet = async (url) => ({
      data: url.includes('meta.com')
        ? meta(
            '456',
            'Breachers',
            'A tactical virtual reality game for teams of competitive players.'
          )
        : {
            '123': {
              success: true,
              data: {
                ...steam['123'].data,
                movies: [{ name: 'Launch trailer', mp4: { max: steamTrailer } }]
              }
            }
          }
    })
    const provider = new StoreMetadataProvider({
      get,
      identities: { 'com.test': { title: 'Breachers', metaIds: ['456'], steamIds: ['123'] } }
    })

    await expect(provider.lookup('Breachers', 'en', 'com.test')).resolves.toMatchObject({
      description: { source: { label: 'Meta Store' } },
      trailerUrl: steamTrailer
    })
  })

  it('remembers only page-verified discovered identities across restarts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vrcd-identities-'))
    const path = join(directory, 'identities.json')
    try {
      const get: MetadataGet = async (url, config) => {
        if (config?.params?.action === 'wbsearchentities')
          return { data: { search: [{ id: 'Q123', label: 'Breachers' }] } }
        if (config?.params?.action === 'wbgetentities')
          return {
            data: {
              entities: {
                Q123: {
                  claims: {
                    P11088: [{ mainsnak: { datavalue: { value: '456' } } }],
                    P1733: [{ mainsnak: { datavalue: { value: '123' } } }]
                  }
                }
              }
            }
          }
        if (url.includes('meta.com'))
          return {
            data: meta(
              '456',
              'Breachers',
              'A tactical virtual reality game for teams of competitive players.'
            )
          }
        throw new Error('unexpected lookup')
      }
      const first = new StoreMetadataProvider({ get, identities: {}, identityCachePath: path })
      expect((await first.lookup('Breachers', 'en', 'com.test'))?.description?.status).toBe('found')
      expect(JSON.parse(await readFile(path, 'utf8')).identities['com.test']).toEqual({
        title: 'Breachers',
        metaIds: ['456']
      })
      const second = new StoreMetadataProvider({
        identities: {},
        identityCachePath: path,
        get: async (url) => {
          if (!url.includes('meta.com')) throw new Error('Identity was not retained')
          return {
            data: meta(
              '456',
              'Breachers',
              'A tactical virtual reality game for teams of competitive players.'
            )
          }
        }
      })
      expect((await second.lookup('Breachers', 'en', 'com.test'))?.description?.status).toBe(
        'found'
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('persists a discovered Steam ID without the rejected Meta candidate', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vrcd-identities-'))
    const path = join(directory, 'identities.json')
    try {
      const get: MetadataGet = async (url, config) => {
        if (config?.params?.action === 'wbsearchentities')
          return { data: { search: [{ id: 'Q123', label: 'Breachers' }] } }
        if (config?.params?.action === 'wbgetentities')
          return {
            data: {
              entities: {
                Q123: {
                  claims: {
                    P11088: [{ mainsnak: { datavalue: { value: '456' } } }],
                    P1733: [{ mainsnak: { datavalue: { value: '123' } } }]
                  }
                }
              }
            }
          }
        if (url.includes('meta.com')) return { data: meta('456', 'Breachers 2') }
        if (url.includes('/api/appdetails')) return { data: steam }
        throw new Error(`unexpected lookup ${url}`)
      }
      const provider = new StoreMetadataProvider({ get, identities: {}, identityCachePath: path })

      expect((await provider.lookup('Breachers', 'en', 'com.test'))?.description?.status).toBe(
        'found'
      )
      expect(JSON.parse(await readFile(path, 'utf8')).identities['com.test']).toEqual({
        title: 'Breachers',
        steamIds: ['123']
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('preserves a curated cross-store ID while persisting a verified Meta page', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vrcd-identities-'))
    const path = join(directory, 'identities.json')
    try {
      const provider = new StoreMetadataProvider({
        identityCachePath: path,
        identities: {
          'com.test': { title: 'Breachers', metaIds: ['456'], steamIds: ['123'] }
        },
        get: async () => ({
          data: meta(
            '456',
            'Breachers',
            'A tactical virtual reality game for teams of competitive players.'
          )
        })
      })

      await provider.lookup('Breachers', 'en', 'com.test')
      expect(JSON.parse(await readFile(path, 'utf8')).identities['com.test']).toEqual({
        title: 'Breachers',
        metaIds: ['456'],
        steamIds: ['123']
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('does not cache a description miss when Meta fails and Steam has only a teaser', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vrcd-description-integration-'))
    const cachePath = join(directory, 'descriptions.json')
    let recovered = false
    try {
      const provider = new StoreMetadataProvider({
        identities: {
          'com.test': { title: 'Breachers', metaIds: ['456'], steamIds: ['123'] }
        },
        get: async (url) => {
          if (url.includes('meta.com')) {
            if (!recovered) throw new Error('Meta offline')
            return {
              data: meta(
                '456',
                'Breachers',
                'A tactical virtual reality game for teams of competitive players.'
              )
            }
          }
          if (url.includes('/api/appdetails'))
            return {
              data: {
                '123': {
                  success: true,
                  data: {
                    steam_appid: 123,
                    type: 'game',
                    name: 'Breachers',
                    categories: [{ description: 'VR Only' }],
                    short_description: 'A short VR teaser.'
                  }
                }
              }
            }
          throw new Error(`unexpected lookup ${url}`)
        }
      })
      const service = new GameDescriptionService({
        cache: new DescriptionCache(cachePath),
        provider: new MultiSourceDescriptionProvider([
          new StoreDescriptionProvider(provider),
          { lookup: async () => ({ status: 'not-found', language: 'en', fetchedAt: 1 }) }
        ])
      })
      const request = {
        key: 'breachers:en',
        gameName: 'Breachers',
        packageName: 'com.test',
        thumbnailPath: '',
        language: 'en' as const
      }
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      await expect(service.getDescription(request)).resolves.toMatchObject({ status: 'error' })
      await expect(readFile(cachePath, 'utf8')).rejects.toThrow()
      recovered = true
      await expect(service.getDescription(request)).resolves.toMatchObject({
        status: 'found',
        source: { label: 'Meta Store' }
      })
      warn.mockRestore()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('does not cache a description miss when a Steam detail response is corrupt', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vrcd-description-integration-'))
    const cachePath = join(directory, 'descriptions.json')
    let recovered = false
    try {
      const provider = new StoreMetadataProvider({
        identities: {
          'com.test': { title: 'Breachers', metaIds: ['456'], steamIds: ['123'] }
        },
        get: async (url) => {
          if (url.includes('meta.com'))
            return {
              data: meta(
                '456',
                'Breachers',
                recovered
                  ? 'A tactical virtual reality game for teams of competitive players.'
                  : undefined
              )
            }
          if (url.includes('/api/appdetails')) return { data: { corrupt: true } }
          throw new Error(`unexpected lookup ${url}`)
        }
      })
      const service = new GameDescriptionService({
        cache: new DescriptionCache(cachePath),
        provider: new MultiSourceDescriptionProvider([
          new StoreDescriptionProvider(provider),
          { lookup: async () => ({ status: 'not-found', language: 'en', fetchedAt: 1 }) }
        ])
      })
      const request = {
        key: 'breachers:en',
        gameName: 'Breachers',
        packageName: 'com.test',
        thumbnailPath: '',
        language: 'en' as const
      }
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      await expect(service.getDescription(request)).resolves.toMatchObject({ status: 'error' })
      await expect(readFile(cachePath, 'utf8')).rejects.toThrow()
      recovered = true
      await expect(service.getDescription(request)).resolves.toMatchObject({ status: 'found' })
      warn.mockRestore()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('shares simultaneous description and trailer metadata requests', async () => {
    const requests: string[] = []
    const provider = new StoreMetadataProvider({
      identities: { 'com.test': { title: 'Breachers', metaIds: ['456'] } },
      get: async (url) => {
        requests.push(url)
        if (url.includes('/search/')) return { data: '' }
        return {
          data: meta(
            '456',
            'Breachers',
            'A tactical virtual reality game for teams of competitive players.'
          )
        }
      }
    })
    const [a, b] = await Promise.all([
      provider.lookup('Breachers', 'en', 'com.test'),
      provider.lookup('Breachers', 'en', 'com.test')
    ])
    expect(a?.description?.status).toBe('found')
    expect(b).toEqual(a)
    expect(requests).toEqual([
      'https://www.meta.com/experiences/456/',
      'https://store.steampowered.com/search/'
    ])
  })
})
