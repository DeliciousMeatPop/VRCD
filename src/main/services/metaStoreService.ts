import { app } from 'electron'
import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import axios, { type AxiosRequestConfig } from 'axios'
import { normalizeGameTitle, titlesMatch } from './gameDescription/descriptionText'
import { isSpecificGameTitle, parseYoutubeTrailerSearch } from './gameMetadata/trailerCandidates'
import {
  playableStoreVideo,
  signedUrlExpiry,
  type StoreMetadata
} from './gameMetadata/storeMetadata'
import { getStoreMetadataProvider } from './gameMetadata/storeMetadataProvider'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const YT_SEARCH_URL = 'https://www.youtube.com/results'
const CACHE_VERSION = 4
const YOUTUBE_TTL = 30 * 24 * 60 * 60_000
const MISS_TTL = 24 * 60 * 60_000

interface CacheEntry {
  requestedTitle: string
  trailerUrl: string | null
  resolvedAt: number
  expiresAt: number
  source: 'store' | 'youtube' | 'miss'
}

interface OverrideEntry {
  url?: string | null
  youtubeId?: string
}

export type TrailerGet = (url: string, config?: AxiosRequestConfig) => Promise<{ data: unknown }>

export type StoreLookup = (
  gameName: string,
  language: 'en',
  packageName?: string
) => Promise<StoreMetadata | null>

export interface MetaStoreServiceOptions {
  /** Directory containing VRP's metadata cache and explicit trailer overrides. */
  dataDir?: string
  get?: TrailerGet
  storeLookup?: StoreLookup
  clock?: () => number
}

function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

function normalizedOverride(entry: OverrideEntry): string | null {
  if (entry.url === null) return null
  if (entry.youtubeId && /^[\w-]{11}$/.test(entry.youtubeId)) {
    return youtubeWatchUrl(entry.youtubeId)
  }
  if (!entry.url) return null

  try {
    const url = new URL(entry.url)
    const hostname = url.hostname.toLowerCase()
    let videoId: string | null = null
    if (hostname === 'youtu.be') videoId = url.pathname.split('/').filter(Boolean)[0] ?? null
    else if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com')) {
      videoId = url.pathname === '/watch' ? url.searchParams.get('v') : null
    }
    if (videoId && /^[\w-]{11}$/.test(videoId)) return youtubeWatchUrl(videoId)
    return entry.url
  } catch {
    return entry.url
  }
}

function verifiedNativeUrl(value: string | undefined): string | null {
  if (!value) return null
  return playableStoreVideo(value, 'meta') ?? playableStoreVideo(value, 'steam') ?? null
}

/** Resolves a verified native or YouTube trailer for a library game. */
export class MetaStoreService {
  private readonly cache = new Map<string, CacheEntry>()
  private readonly overrides = new Map<string, OverrideEntry>()
  private readonly inFlight = new Map<string, Promise<string | null>>()
  private readonly cachePath: string
  private readonly overridesPath: string
  private readonly get: TrailerGet
  private readonly storeLookup: StoreLookup
  private readonly clock: () => number
  private readonly loaded: Promise<void>
  private writes: Promise<void> = Promise.resolve()

  constructor(options: MetaStoreServiceOptions = {}) {
    const dataDir = options.dataDir ?? join(app.getPath('userData'), 'vrp-data')
    this.cachePath = join(dataDir, 'meta-trailer-cache.json')
    this.overridesPath = join(dataDir, 'trailer-overrides.json')
    this.get = options.get ?? axios.get
    this.clock = options.clock ?? Date.now
    if (options.storeLookup) this.storeLookup = options.storeLookup
    else {
      const provider = getStoreMetadataProvider(join(dataDir, 'store-identities-v1.json'))
      this.storeLookup = (gameName, language, packageName) =>
        provider.lookup(gameName, language, packageName)
    }
    this.loaded = this.load()
  }

  private async load(): Promise<void> {
    try {
      const raw = JSON.parse(await fs.readFile(this.cachePath, 'utf8')) as {
        __version?: number
        entries?: Record<string, CacheEntry>
      }
      if (raw.__version === CACHE_VERSION && raw.entries && typeof raw.entries === 'object') {
        for (const [key, entry] of Object.entries(raw.entries)) {
          if (
            entry &&
            typeof entry.requestedTitle === 'string' &&
            (typeof entry.trailerUrl === 'string' || entry.trailerUrl === null) &&
            typeof entry.resolvedAt === 'number' &&
            typeof entry.expiresAt === 'number'
          ) {
            this.cache.set(key, entry)
          }
        }
      }
    } catch {
      // A missing, legacy, or malformed cache is a fresh cache.
    }

    try {
      const raw = JSON.parse(await fs.readFile(this.overridesPath, 'utf8')) as Record<
        string,
        OverrideEntry | string | null
      >
      for (const [key, value] of Object.entries(raw)) {
        if (value === null) this.overrides.set(key, { url: null })
        else if (typeof value === 'string') this.overrides.set(key, { url: value })
        else if (value && typeof value === 'object') this.overrides.set(key, value)
      }
    } catch {
      // Overrides are optional.
    }
  }

  private cacheKey(gameName: string, packageName: string | undefined): string {
    return `${packageName ?? ''}\n${normalizeGameTitle(gameName)}`
  }

  private async persistCache(): Promise<void> {
    this.writes = this.writes
      .then(async () => {
        const entries = Object.fromEntries(this.cache)
        const temporaryPath = `${this.cachePath}.tmp`
        await fs.mkdir(dirname(this.cachePath), { recursive: true })
        await fs.writeFile(
          temporaryPath,
          JSON.stringify({ __version: CACHE_VERSION, entries }, null, 2)
        )
        await fs.rename(temporaryPath, this.cachePath)
      })
      .catch((error) => {
        console.warn('[MetaStoreService] Failed to persist trailer cache:', error)
      })
    await this.writes
  }

  private async remember(
    key: string,
    requestedTitle: string,
    trailerUrl: string | null,
    source: CacheEntry['source'],
    expiresAt: number
  ): Promise<void> {
    this.cache.set(key, {
      requestedTitle,
      trailerUrl,
      source,
      resolvedAt: this.clock(),
      expiresAt
    })
    await this.persistCache()
  }

  public async getTrailerUrl(
    gameName: string,
    packageName: string | undefined
  ): Promise<string | null> {
    await this.loaded
    const requestedTitle = normalizeGameTitle(gameName)

    if (packageName && this.overrides.has(packageName)) {
      return normalizedOverride(this.overrides.get(packageName)!)
    }
    if (!isSpecificGameTitle(gameName)) return null

    const key = this.cacheKey(gameName, packageName)
    const cached = this.cache.get(key)
    const now = this.clock()
    if (cached && cached.requestedTitle === requestedTitle && cached.expiresAt > now) {
      return cached.trailerUrl
    }
    if (cached) this.cache.delete(key)

    const pending = this.inFlight.get(key)
    if (pending) return pending
    const lookup = this.resolve(gameName, packageName, key, requestedTitle).finally(() => {
      this.inFlight.delete(key)
    })
    this.inFlight.set(key, lookup)
    return lookup
  }

  private async resolve(
    gameName: string,
    packageName: string | undefined,
    key: string,
    requestedTitle: string
  ): Promise<string | null> {
    let failed = false
    try {
      const metadata = await this.storeLookup(gameName, 'en', packageName)
      if (metadata?.trailerUrl) {
        const trailerUrl = verifiedNativeUrl(metadata.trailerUrl)
        const expiresAt = trailerUrl ? signedUrlExpiry(trailerUrl, this.clock()) : null
        if (trailerUrl && expiresAt && titlesMatch(gameName, metadata.title)) {
          await this.remember(key, requestedTitle, trailerUrl, 'store', expiresAt)
          return trailerUrl
        }
        failed = true
      } else if (metadata?.incomplete) {
        failed = true
      }
    } catch (error) {
      failed = true
      console.warn('[MetaStoreService] Store trailer lookup failed:', error)
    }

    const baseName = gameName
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const queries = baseName
      ? [
          `${baseName} oculus quest trailer`,
          `${baseName} meta quest trailer`,
          `${baseName} trailer`
        ]
      : []

    for (const query of queries) {
      try {
        const response = await this.get(YT_SEARCH_URL, {
          params: { search_query: query, sp: 'EgIQAQ%253D%253D' },
          timeout: 10_000,
          maxContentLength: 5_000_000,
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        })
        if (typeof response.data !== 'string') {
          failed = true
          continue
        }
        const selection = parseYoutubeTrailerSearch(response.data, gameName)
        if (selection.status === 'malformed') {
          failed = true
          continue
        }
        if (selection.candidate) {
          const trailerUrl = youtubeWatchUrl(selection.candidate.videoId)
          await this.remember(
            key,
            requestedTitle,
            trailerUrl,
            'youtube',
            this.clock() + YOUTUBE_TTL
          )
          return trailerUrl
        }
      } catch (error) {
        failed = true
        console.warn(`[MetaStoreService] YouTube search failed for "${query}":`, error)
      }
    }

    if (!failed) {
      await this.remember(key, requestedTitle, null, 'miss', this.clock() + MISS_TTL)
    }
    return null
  }
}

export default new MetaStoreService()
