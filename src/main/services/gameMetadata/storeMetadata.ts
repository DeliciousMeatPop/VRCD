import type { GameDescriptionFound, GameDescriptionLanguage } from '@shared/types'
import { titlesMatch, truncateDescription } from '../gameDescription/descriptionText'

export interface StoreMetadata {
  title: string
  sourceUrl: string
  description?: GameDescriptionFound
  trailerUrl?: string
  /** A missing field could not be checked because a fallback source failed. */
  incomplete?: boolean
}

type JsonRecord = Record<string, unknown>
const record = (value: unknown): JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}
const string = (value: unknown): string => (typeof value === 'string' ? value : '')
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [value])
const hasType = (value: JsonRecord, type: string): boolean => list(value['@type']).includes(type)

export function plainText(value: string): string {
  const entities: Record<string, string> = {
    amp: '&',
    quot: '"',
    apos: "'",
    lt: '<',
    gt: '>',
    nbsp: ' '
  }
  return value
    .replace(/<\/?(?:p|div|br|li|h[1-6])\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (match, entity: string) => {
      if (!entity.startsWith('#')) return entities[entity.toLowerCase()] ?? match
      const point =
        entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match
    })
    .replace(/\s+/g, ' ')
    .trim()
}

const foundDescription = (
  value: unknown,
  language: GameDescriptionLanguage,
  label: string,
  url: string
): GameDescriptionFound | undefined => {
  const text = truncateDescription(plainText(string(value)))
  return text.length >= 40
    ? { status: 'found', text, language, source: { label, url }, fetchedAt: Date.now() }
    : undefined
}

function metaPageUrl(value: unknown, id: string): string | null {
  try {
    const url = new URL(string(value))
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'www.meta.com' ||
      !new RegExp(`^/experiences/(?:[^/]+/)?${id}/?$`).test(url.pathname)
    )
      return null
    return `${url.origin}${url.pathname}`
  } catch {
    return null
  }
}

export function playableStoreVideo(value: unknown, provider: 'meta' | 'steam'): string | undefined {
  try {
    const url = new URL(string(value))
    const domains =
      provider === 'meta'
        ? ['oculuscdn.com', 'fbcdn.net']
        : ['steamstatic.com', 'steamcdn-a.akamaihd.net']
    return url.protocol === 'https:' &&
      /\.(mp4|webm)$/i.test(url.pathname) &&
      domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}

export function signedUrlExpiry(
  urlValue: string,
  now: number,
  maximumAge = 15 * 60_000
): number | null {
  let expiry = now + maximumAge
  try {
    const url = new URL(urlValue)
    for (const [rawKey, raw] of url.searchParams) {
      const key = rawKey.toLowerCase()
      if (!['expires', 'expiry', 'exp', 'oe'].includes(key) || !raw) continue
      const number = Number(raw)
      const parsed =
        key === 'oe' && /^[\da-f]+$/i.test(raw)
          ? parseInt(raw, 16) * 1000
          : number * (number < 10_000_000_000 ? 1000 : 1)
      if (Number.isFinite(parsed)) expiry = Math.min(expiry, parsed)
    }
  } catch {
    return null
  }
  return expiry > now ? expiry : null
}

export function parseMetaMetadata(
  html: string,
  gameName: string,
  language: GameDescriptionLanguage,
  storeId: string
): StoreMetadata | null {
  if (!/^\d+$/.test(storeId)) return null
  const nodes: JsonRecord[] = []
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      for (const root of list(JSON.parse(match[1]))) {
        const node = record(root)
        nodes.push(...list(node['@graph'] ?? node).map(record))
      }
    } catch {
      /* Other valid JSON-LD blocks can still describe the app. */
    }
  }
  const applications = nodes.filter(
    (node) =>
      hasType(node, 'SoftwareApplication') &&
      titlesMatch(gameName, string(node.name)) &&
      String(node.sku) === storeId &&
      list(node.availableOnDevice).some((device) => /\bquest\b/i.test(string(device)))
  )
  if (applications.length !== 1) return null
  const application = applications[0]
  const sourceUrl = metaPageUrl(application.url, storeId)
  if (!sourceUrl) return null
  const applicationId = string(application['@id']).trim()
  const page = nodes.find(
    (node) =>
      applicationId.length > 0 &&
      hasType(node, 'ItemPage') &&
      metaPageUrl(node.url, storeId) === sourceUrl &&
      string(record(node.mainEntity)['@id']).trim() === applicationId
  )
  const videoRef = record(page?.video)
  const videoId = string(videoRef['@id']).trim()
  const video = nodes.find(
    (node) =>
      videoId.length > 0 && hasType(node, 'VideoObject') && string(node['@id']).trim() === videoId
  )
  return {
    title: string(application.name),
    sourceUrl,
    description:
      foundDescription(application.description, language, 'Meta Store', sourceUrl) ??
      foundDescription(page?.description, language, 'Meta Store', sourceUrl),
    trailerUrl: playableStoreVideo(video?.contentUrl ?? videoRef.contentUrl ?? videoId, 'meta')
  }
}

export function parseSteamMetadata(
  response: unknown,
  appId: string,
  gameName: string,
  language: GameDescriptionLanguage
): StoreMetadata | null {
  const result = record(record(response)[appId])
  const data = record(result.data)
  if (
    result.success !== true ||
    String(data.steam_appid) !== appId ||
    data.type !== 'game' ||
    !titlesMatch(gameName, string(data.name))
  )
    return null
  const vrText = [
    data.short_description,
    ...list(data.categories).map((value) => record(value).description)
  ].join(' ')
  if (!/\bVR\b|virtual reality/i.test(vrText)) return null
  const sourceUrl = `https://store.steampowered.com/app/${appId}/`
  const movie = list(data.movies)
    .map(record)
    .find((item) => /trailer/i.test(string(item.name)))
  return {
    title: string(data.name),
    sourceUrl,
    description: foundDescription(data.short_description, language, 'Steam', sourceUrl),
    trailerUrl: playableStoreVideo(
      record(movie?.mp4).max ?? record(movie?.mp4)['480'] ?? record(movie?.webm).max,
      'steam'
    )
  }
}

export function steamSearchCandidates(html: string, gameName: string): string[] {
  const ids = new Set<string>()
  for (const match of html.matchAll(
    /<a\b[^>]*data-ds-appid=["'](\d+)["'][^>]*>([\s\S]*?)<\/a>/gi
  )) {
    const title = match[2].match(/<span\b[^>]*class=["']title["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]
    if (title && titlesMatch(gameName, plainText(title))) ids.add(match[1])
  }
  return [...ids]
}
