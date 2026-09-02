import { promises as fs } from 'fs'
import {
  GameDescriptionLanguage,
  GameDescriptionFound,
  GameDescriptionRequest,
  GameDescriptionResult,
  GameDescriptionSnapshot
} from '@shared/types'
import { DescriptionCache } from './descriptionCache'
import { ImageDimensions, normalizeGameTitle, readImageDimensions, truncateDescription } from './descriptionText'
import { WikipediaDescriptionProvider } from './wikipediaProvider'

const MIN_LIBRARY_DESCRIPTION_LENGTH = 40
const MIN_SOURCE_IMAGE_SIDE = 256

export interface DescriptionCachePort {
  get(key: string): Promise<GameDescriptionFound | Extract<GameDescriptionResult, { status: 'not-found' }> | null>
  set(key: string, result: GameDescriptionFound | Extract<GameDescriptionResult, { status: 'not-found' }>): Promise<void>
}

export interface DescriptionProviderPort {
  lookup(gameName: string, language: GameDescriptionLanguage): Promise<GameDescriptionFound | Extract<GameDescriptionResult, { status: 'not-found' }>>
}

export interface GameDescriptionServiceDependencies {
  cache: DescriptionCachePort
  provider: DescriptionProviderPort
  probeImage: (path: string) => Promise<ImageDimensions | null>
}

export const descriptionCacheKey = (request: GameDescriptionRequest): string =>
  `${request.packageName || normalizeGameTitle(request.gameName)}:${request.language}`

const safeHttpsUrl = (value: string | undefined): string | undefined => {
  if (!value) return undefined
  try {
    return new URL(value).protocol === 'https:' ? value : undefined
  } catch {
    return undefined
  }
}

const hasUsableSourceImage = (dimensions: ImageDimensions | null): boolean =>
  !!dimensions && dimensions.width >= MIN_SOURCE_IMAGE_SIDE && dimensions.height >= MIN_SOURCE_IMAGE_SIDE

export class GameDescriptionService {
  private inFlight = new Map<string, Promise<GameDescriptionResult>>()

  constructor(private readonly dependencies: GameDescriptionServiceDependencies) {}

  async primeDescriptions(requests: GameDescriptionRequest[]): Promise<GameDescriptionSnapshot> {
    const snapshot: GameDescriptionSnapshot = {}
    for (const request of requests) {
      const result = await this.libraryDescription(request)
      if (!result) continue
      await this.dependencies.cache.set(descriptionCacheKey(request), result)
      snapshot[request.key] = result
    }
    return snapshot
  }

  async getDescription(request: GameDescriptionRequest): Promise<GameDescriptionResult> {
    const qualifiedLibraryResult = await this.libraryDescription(request)
    if (qualifiedLibraryResult) {
      await this.dependencies.cache.set(descriptionCacheKey(request), qualifiedLibraryResult)
      return qualifiedLibraryResult
    }

    const key = descriptionCacheKey(request)
    const cached = await this.dependencies.cache.get(key)
    if (cached) return cached

    const existing = this.inFlight.get(key)
    if (existing) return existing

    const lookup = this.lookupAndCache(request, key).finally(() => this.inFlight.delete(key))
    this.inFlight.set(key, lookup)
    return lookup
  }

  private async lookupAndCache(request: GameDescriptionRequest, key: string): Promise<GameDescriptionResult> {
    try {
      let result = await this.dependencies.provider.lookup(request.gameName, request.language)
      if (result.status === 'not-found' && request.language === 'es') {
        result = await this.dependencies.provider.lookup(request.gameName, 'en')
      }
      await this.dependencies.cache.set(key, result)
      return result
    } catch (error) {
      console.warn(`[GameDescriptionService] Lookup failed for ${request.packageName || request.gameName}:`, error)
      return { status: 'error', language: request.language }
    }
  }

  private async libraryDescription(request: GameDescriptionRequest): Promise<GameDescriptionFound | null> {
    const text = truncateDescription(request.libraryDescription ?? '')
    const sourceLabel = request.libraryDescriptionSourceLabel?.trim()
    if (text.length < MIN_LIBRARY_DESCRIPTION_LENGTH || !sourceLabel || !request.thumbnailPath) return null

    let dimensions: ImageDimensions | null
    try {
      dimensions = await this.dependencies.probeImage(request.thumbnailPath)
    } catch {
      return null
    }
    if (!hasUsableSourceImage(dimensions)) return null

    return {
      status: 'found',
      text,
      source: {
        label: sourceLabel,
        url: safeHttpsUrl(request.libraryDescriptionSourceUrl)
      },
      language: request.libraryDescriptionLanguage ?? request.language,
      fetchedAt: Date.now()
    }
  }
}

export const probeLocalImage = async (path: string): Promise<ImageDimensions | null> => {
  try {
    return readImageDimensions(await fs.readFile(path))
  } catch {
    return null
  }
}

export const createGameDescriptionService = (cachePath: string): GameDescriptionService =>
  new GameDescriptionService({
    cache: new DescriptionCache(cachePath),
    provider: new WikipediaDescriptionProvider(),
    probeImage: probeLocalImage
  })
