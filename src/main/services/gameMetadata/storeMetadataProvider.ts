import axios, { type AxiosRequestConfig } from 'axios'
import { promises as fs } from 'fs'
import { dirname } from 'path'
import type { GameDescriptionLanguage } from '@shared/types'
import { normalizeGameTitle, titlesMatch } from '../gameDescription/descriptionText'
import {
  parseMetaMetadata,
  parseSteamMetadata,
  signedUrlExpiry,
  steamSearchCandidates,
  type StoreMetadata
} from './storeMetadata'
import { storeIdentities } from './storeIdentities'

export interface StoreIdentity {
  title: string
  metaIds?: string[]
  steamIds?: string[]
}
export type MetadataGet = (url: string, config?: AxiosRequestConfig) => Promise<{ data: unknown }>
export interface StoreProviderOptions {
  get?: MetadataGet
  identities?: Record<string, StoreIdentity>
  identityCachePath?: string
  clock?: () => number
}

const TIMEOUT = 6000
const USER_AGENT = 'VR-CyberDeck/metadata (https://github.com/DeliciousMeatPop/VRCD)'
const validIds = (ids: unknown): string[] =>
  Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === 'string' && /^\d+$/.test(id)).slice(0, 3)
    : []

export class StoreMetadataProvider {
  private readonly get: MetadataGet
  private readonly identities: Record<string, StoreIdentity>
  private readonly loaded: Promise<void>
  private readonly clock: () => number
  private readonly inFlight = new Map<string, Promise<StoreMetadata | null>>()
  private readonly cache = new Map<string, { value: StoreMetadata | null; expiresAt: number }>()
  private writes: Promise<void> = Promise.resolve()

  constructor(private readonly options: StoreProviderOptions = {}) {
    this.get = options.get ?? axios.get
    this.clock = options.clock ?? Date.now
    this.identities = { ...(options.identities ?? storeIdentities) }
    this.loaded = this.loadIdentities()
  }

  async lookup(
    gameName: string,
    language: GameDescriptionLanguage,
    packageName?: string
  ): Promise<StoreMetadata | null> {
    await this.loaded
    const key = `${packageName ?? ''}:${normalizeGameTitle(gameName)}:${language}`
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt > this.clock()) return cached.value
    const pending = this.inFlight.get(key)
    if (pending) return pending
    const lookup = this.resolve(gameName, language, packageName)
      .then((value) => {
        // Native store URLs can be signed; never keep them for days.
        if (!value?.incomplete) {
          const now = this.clock()
          const expiresAt = value?.trailerUrl
            ? signedUrlExpiry(value.trailerUrl, now)
            : now + (value ? 15 * 60_000 : 60_000)
          if (expiresAt) this.cache.set(key, { value, expiresAt })
        }
        return value
      })
      .finally(() => this.inFlight.delete(key))
    this.inFlight.set(key, lookup)
    return lookup
  }

  private async request(url: string, params: Record<string, string> = {}): Promise<unknown> {
    const response = await this.get(url, {
      params,
      timeout: TIMEOUT,
      maxContentLength: 5_000_000,
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' }
    })
    return response.data
  }

  private async resolve(
    gameName: string,
    language: GameDescriptionLanguage,
    packageName?: string
  ): Promise<StoreMetadata | null> {
    const stored = packageName ? this.identities[packageName] : undefined
    if (stored && !titlesMatch(gameName, stored.title)) return null
    let identity = stored
    let failed = false
    if (!identity) {
      try {
        identity = await this.discoverIdentity(gameName)
      } catch {
        failed = true
      }
    }

    const metaResults = await Promise.all(
      validIds(identity?.metaIds).map(async (id) => {
        try {
          const data = await this.request(`https://www.meta.com/experiences/${id}/`, {
            locale: language === 'es' ? 'es_ES' : 'en_US'
          })
          const result = parseMetaMetadata(
            typeof data === 'string' ? data : '',
            gameName,
            language,
            id
          )
          if (!result) failed = true // A changed/blocked page is not evidence the game lacks metadata.
          return result ? { id, result } : null
        } catch {
          failed = true
          return null
        }
      })
    )
    const matchedMeta = metaResults.filter((result) => result !== null)
    let metaResult: StoreMetadata | null = null
    let verifiedMetaIds: string[] = []
    if (matchedMeta.length === 1) {
      const match = matchedMeta[0]
      verifiedMetaIds = [match.id]
      await this.remember(packageName, {
        title: match.result.title,
        metaIds: verifiedMetaIds,
        steamIds: stored ? validIds(stored.steamIds) : undefined
      })
      metaResult = match.result
      if (metaResult.description && metaResult.trailerUrl)
        return this.withIncomplete(metaResult, failed)
    }

    let steamIds = validIds(identity?.steamIds)
    if (steamIds.length === 0) {
      try {
        const html = await this.request('https://store.steampowered.com/search/', {
          term: gameName,
          category1: '998',
          l: 'english'
        })
        if (typeof html !== 'string') throw new Error('Invalid Steam search response')
        steamIds = steamSearchCandidates(html, gameName)
      } catch {
        failed = true
      }
    }
    // Two exact-title listings are still ambiguous: no first-result selection.
    if (steamIds.length === 1) {
      try {
        const id = steamIds[0]
        const data = await this.request('https://store.steampowered.com/api/appdetails', {
          appids: id,
          l: language === 'es' ? 'spanish' : 'english'
        })
        const result = parseSteamMetadata(data, id, gameName, language)
        if (result) {
          await this.remember(packageName, {
            title: result.title,
            steamIds: [id],
            metaIds:
              verifiedMetaIds.length > 0
                ? verifiedMetaIds
                : stored
                  ? validIds(stored.metaIds)
                  : undefined
          })
          const combined = metaResult
            ? {
                ...metaResult,
                description: metaResult.description ?? result.description,
                trailerUrl: metaResult.trailerUrl ?? result.trailerUrl
              }
            : result
          return this.withIncomplete(combined, failed)
        }
        failed = true
      } catch {
        failed = true
      }
    }
    if (metaResult) return this.withIncomplete(metaResult, failed)
    if (failed) throw new Error('One or more store metadata sources are unavailable')
    return null
  }

  private withIncomplete(metadata: StoreMetadata, failed: boolean): StoreMetadata {
    return failed && (!metadata.description || !metadata.trailerUrl)
      ? { ...metadata, incomplete: true }
      : metadata
  }

  private async discoverIdentity(gameName: string): Promise<StoreIdentity | undefined> {
    const data = (await this.request('https://www.wikidata.org/w/api.php', {
      action: 'wbsearchentities',
      search: gameName,
      language: 'en',
      uselang: 'en',
      type: 'item',
      limit: '5',
      format: 'json'
    })) as {
      search?: { id?: string; label?: string; match?: { text?: string } }[]
      error?: unknown
    }
    if (!Array.isArray(data?.search) || data.error)
      throw new Error('Invalid Wikidata search response')
    const matches = data.search.filter(
      (item) =>
        /^Q\d+$/.test(item.id ?? '') &&
        [item.label, item.match?.text].some((name) => name && titlesMatch(gameName, name))
    )
    if (matches.length !== 1) return undefined
    const id = matches[0].id!
    const response = (await this.request('https://www.wikidata.org/w/api.php', {
      action: 'wbgetentities',
      ids: id,
      props: 'claims',
      format: 'json'
    })) as {
      entities?: Record<
        string,
        {
          claims?: Record<
            string,
            { rank?: string; mainsnak?: { datavalue?: { value?: unknown } } }[]
          >
        }
      >
    }
    const claims = response?.entities?.[id]?.claims
    if (!claims) throw new Error('Invalid Wikidata entity response')
    const ids = (property: string): string[] =>
      validIds(
        claims[property]
          ?.filter((claim) => claim.rank !== 'deprecated')
          .map((claim) => claim.mainsnak?.datavalue?.value)
      )
    return { title: gameName, metaIds: ids('P11088'), steamIds: ids('P1733') }
  }

  private async loadIdentities(): Promise<void> {
    if (!this.options.identityCachePath) return
    try {
      const data = JSON.parse(await fs.readFile(this.options.identityCachePath, 'utf8'))
      if (data.version !== 1 || !data.identities || typeof data.identities !== 'object') return
      for (const [key, value] of Object.entries(data.identities)) {
        const item = value as StoreIdentity
        if (item && typeof item.title === 'string' && !this.identities[key]) {
          this.identities[key] = {
            title: item.title,
            metaIds: validIds(item.metaIds),
            steamIds: validIds(item.steamIds)
          }
        }
      }
    } catch {
      /* Missing or invalid cache: use verified defaults and discovery. */
    }
  }

  private async remember(packageName: string | undefined, identity: StoreIdentity): Promise<void> {
    if (!packageName) return
    this.identities[packageName] = identity
    const path = this.options.identityCachePath
    if (!path) return
    this.writes = this.writes
      .then(async () => {
        await fs.mkdir(dirname(path), { recursive: true })
        await fs.writeFile(
          `${path}.tmp`,
          JSON.stringify({ version: 1, identities: this.identities })
        )
        await fs.rename(`${path}.tmp`, path)
      })
      .catch(() => {
        /* Cache persistence must not hide a successful lookup. */
      })
    await this.writes
  }
}

const providers = new Map<string, StoreMetadataProvider>()
export function getStoreMetadataProvider(identityCachePath: string): StoreMetadataProvider {
  let provider = providers.get(identityCachePath)
  if (!provider) {
    provider = new StoreMetadataProvider({ identityCachePath })
    providers.set(identityCachePath, provider)
  }
  return provider
}
