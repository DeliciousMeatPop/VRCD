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
import type { TrailerScanProgress } from '@shared/types'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const YT_SEARCH_URL = 'https://www.youtube.com/results'
const CACHE_VERSION = 4
const YOUTUBE_TTL = 30 * 24 * 60 * 60_000
const MISS_TTL = 24 * 60 * 60_000
/** Maintainer-curated trailer fixes, published from the repo and fetched on every launch. */
const REMOTE_OVERRIDES_URL =
  'https://raw.githubusercontent.com/DeliciousMeatPop/VRCD/main/data/trailer-overrides.json'
const REMOTE_OVERRIDES_MAX_BYTES = 2_000_000
const PACKAGE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const YOUTUBE_WATCH_PATTERN = /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/

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

export interface TrailerScanTarget {
  gameName: string
  packageName: string
}

export interface TrailerScanOptions {
  /** Pause between lookups that hit the network, to stay polite to the store/YouTube. */
  delayMs?: number
  onProgress?: (progress: TrailerScanProgress) => void
  shouldCancel?: () => boolean
  sleep?: (ms: number) => Promise<void>
}

export interface TrailerScanSummary {
  total: number
  checked: number
  found: number
  missing: number
  cancelled: boolean
  missingGames: TrailerScanTarget[]
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
  /** Where `refreshRemoteOverrides` downloads fixes from; `null` disables the download. */
  remoteOverridesUrl?: string | null
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

/**
 * Reduces a downloaded override map to entries that are safe to apply for every
 * user: a disabled trailer (`null`) or a plain YouTube video. Anything else
 * (other hosts, local-video://, malformed keys) is dropped.
 */
function sanitizeRemoteOverrides(raw: unknown): Map<string, OverrideEntry> {
  const result = new Map<string, OverrideEntry>()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result

  for (const [packageName, value] of Object.entries(raw)) {
    if (!PACKAGE_NAME_PATTERN.test(packageName)) continue
    if (value === null) {
      result.set(packageName, { url: null })
      continue
    }
    const entry: OverrideEntry | null =
      typeof value === 'string'
        ? { url: value }
        : value && typeof value === 'object'
          ? (value as OverrideEntry)
          : null
    if (!entry) continue
    if (entry.url === null && !entry.youtubeId) {
      result.set(packageName, { url: null })
      continue
    }
    const normalized = normalizedOverride(entry)
    if (normalized && YOUTUBE_WATCH_PATTERN.test(normalized)) {
      result.set(packageName, { url: normalized })
    }
  }
  return result
}

function verifiedNativeUrl(value: string | undefined): string | null {
  if (!value) return null
  return playableStoreVideo(value, 'meta') ?? playableStoreVideo(value, 'steam') ?? null
}

/** Resolves a verified native or YouTube trailer for a library game. */
export class MetaStoreService {
  private readonly cache = new Map<string, CacheEntry>()
  private readonly overrides = new Map<string, OverrideEntry>()
  private remoteOverrides = new Map<string, OverrideEntry>()
  private readonly inFlight = new Map<string, Promise<string | null>>()
  private readonly cachePath: string
  private readonly reportPath: string
  private readonly overridesPath: string
  private readonly remoteOverridesPath: string
  private readonly remoteOverridesUrl: string | null
  private readonly get: TrailerGet
  private readonly storeLookup: StoreLookup
  private readonly clock: () => number
  private readonly loaded: Promise<void>
  private writes: Promise<void> = Promise.resolve()

  constructor(options: MetaStoreServiceOptions = {}) {
    const dataDir = options.dataDir ?? join(app.getPath('userData'), 'vrp-data')
    this.cachePath = join(dataDir, 'meta-trailer-cache.json')
    this.reportPath = join(dataDir, 'trailer-scan-report.json')
    this.overridesPath = join(dataDir, 'trailer-overrides.json')
    this.remoteOverridesPath = join(dataDir, 'trailer-overrides-remote.json')
    this.remoteOverridesUrl =
      options.remoteOverridesUrl === undefined ? REMOTE_OVERRIDES_URL : options.remoteOverridesUrl
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

    try {
      const raw = JSON.parse(await fs.readFile(this.remoteOverridesPath, 'utf8')) as unknown
      this.remoteOverrides = sanitizeRemoteOverrides(raw)
    } catch {
      // No downloaded overrides yet (first launch, or offline since install).
    }
  }

  /**
   * Downloads the maintainer's trailer fixes and keeps the last good copy on
   * disk. Failures are non-fatal: the previously downloaded copy stays active.
   */
  public async refreshRemoteOverrides(): Promise<boolean> {
    await this.loaded
    if (!this.remoteOverridesUrl) return false

    try {
      const response = await this.get(this.remoteOverridesUrl, {
        timeout: 10_000,
        maxContentLength: REMOTE_OVERRIDES_MAX_BYTES,
        responseType: 'json',
        headers: { 'User-Agent': USER_AGENT, 'Cache-Control': 'no-cache' }
      })
      const raw = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('Remote trailer overrides are not a JSON object')
      }

      const overrides = sanitizeRemoteOverrides(raw)
      const serialized = Object.fromEntries(
        [...overrides].map(([packageName, entry]) => [packageName, entry.url ?? null])
      )
      const temporaryPath = `${this.remoteOverridesPath}.tmp`
      await fs.mkdir(dirname(this.remoteOverridesPath), { recursive: true })
      await fs.writeFile(temporaryPath, JSON.stringify(serialized, null, 2))
      await fs.rename(temporaryPath, this.remoteOverridesPath)
      this.remoteOverrides = overrides
      return true
    } catch (error) {
      console.warn('[MetaStoreService] Failed to refresh remote trailer overrides:', error)
      return false
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

  /** Where `writeScanReport` puts the list of games with no trailer. */
  public get scanReportPath(): string {
    return this.reportPath
  }

  private hasFreshAnswer(gameName: string, packageName: string): boolean {
    if (this.overrides.has(packageName) || this.remoteOverrides.has(packageName)) return true
    const cached = this.cache.get(this.cacheKey(gameName, packageName))
    return !!cached && cached.expiresAt > this.clock()
  }

  /**
   * Look up a trailer for every target, one at a time with a pause after each real network
   * lookup. Results land in the normal trailer cache, so the game list shows them afterwards.
   * Games with an override or a fresh cached answer are counted without touching the network.
   */
  public async scanTrailers(
    targets: TrailerScanTarget[],
    options: TrailerScanOptions = {}
  ): Promise<TrailerScanSummary> {
    await this.loaded
    const delayMs = options.delayMs ?? 1500
    const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
    const seen = new Set<string>()
    const unique = targets.filter((t) => {
      if (!t.packageName || seen.has(t.packageName)) return false
      seen.add(t.packageName)
      return true
    })
    const summary: TrailerScanSummary = {
      total: unique.length,
      checked: 0,
      found: 0,
      missing: 0,
      cancelled: false,
      missingGames: []
    }
    for (const target of unique) {
      if (options.shouldCancel?.()) {
        summary.cancelled = true
        break
      }
      const needsNetwork = !this.hasFreshAnswer(target.gameName, target.packageName)
      let url: string | null = null
      try {
        url = await this.getTrailerUrl(target.gameName, target.packageName)
      } catch (error) {
        console.warn(`[MetaStoreService] Scan lookup failed for ${target.packageName}:`, error)
      }
      summary.checked++
      if (url) summary.found++
      else {
        summary.missing++
        summary.missingGames.push(target)
      }
      options.onProgress?.({
        checked: summary.checked,
        total: summary.total,
        found: summary.found,
        missing: summary.missing,
        current: target.gameName
      })
      if (needsNetwork && delayMs > 0) await sleep(delayMs)
    }
    return summary
  }

  /** Write the games a scan found no trailer for, as JSON ready to copy entries from. */
  public async writeScanReport(summary: TrailerScanSummary): Promise<string | null> {
    try {
      const noTrailerFound = Object.fromEntries(
        [...summary.missingGames]
          .sort((a, b) => a.gameName.localeCompare(b.gameName))
          .map((g) => [g.packageName, { gameName: g.gameName }])
      )
      await fs.mkdir(dirname(this.reportPath), { recursive: true })
      await fs.writeFile(
        this.reportPath,
        JSON.stringify(
          {
            generatedAt: new Date(this.clock()).toISOString(),
            scanned: summary.checked,
            total: summary.total,
            cancelled: summary.cancelled,
            noTrailerFound
          },
          null,
          2
        ) + '\n'
      )
      return this.reportPath
    } catch (error) {
      console.warn('[MetaStoreService] Failed to write trailer scan report:', error)
      return null
    }
  }

  public async getTrailerUrl(
    gameName: string,
    packageName: string | undefined
  ): Promise<string | null> {
    await this.loaded
    const requestedTitle = normalizeGameTitle(gameName)

    // A user's own overrides beat the maintainer's downloaded fixes, which beat automatic lookup.
    if (packageName && this.overrides.has(packageName)) {
      return normalizedOverride(this.overrides.get(packageName)!)
    }
    if (packageName && this.remoteOverrides.has(packageName)) {
      return normalizedOverride(this.remoteOverrides.get(packageName)!)
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
          `${baseName} VR trailer`,
          `${baseName} oculus quest trailer`,
          `${baseName} meta quest trailer`,
          `${baseName} trailer`
        ]
      : []

    for (const query of queries) {
      try {
        const response = await this.get(YT_SEARCH_URL, {
          params: { search_query: query, sp: 'EgIQAQ==' },
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
