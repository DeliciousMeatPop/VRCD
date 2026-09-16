import { normalizeGameTitle, titlesMatch } from '../gameDescription/descriptionText'

export interface YoutubeTrailerCandidate {
  videoId: string
  title: string
}

type JsonRecord = Record<string, unknown>

const record = (value: unknown): JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

const REMAINDER_WORDS = new Set([
  'official',
  'trailer',
  'teaser',
  'launch',
  'announcement',
  'announce',
  'reveal',
  'gameplay',
  'cinematic',
  'story',
  'release',
  'date',
  'available',
  'now',
  'coming',
  'soon',
  'game',
  'video',
  'meta',
  'oculus',
  'quest',
  'playstation',
  'psvr',
  'psvr2',
  'steam',
  'steamvr',
  'pc',
  'pico',
  'vive',
  'virtual',
  'reality',
  'vr'
])

const GENERIC_GAME_WORDS = new Set([...REMAINDER_WORDS, 'new', 'the'])

function extractInitialData(html: string): JsonRecord | null {
  const marker = /(?:var\s+ytInitialData\s*=|(?:window\s*\[\s*)?["']ytInitialData["']\s*\]?\s*=)/g
  const match = marker.exec(html)
  if (!match) return null
  const start = html.indexOf('{', match.index + match[0].length)
  if (start < 0) return null

  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < html.length; index += 1) {
    const char = html[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}' && --depth === 0) {
      try {
        return record(JSON.parse(html.slice(start, index + 1)))
      } catch {
        return null
      }
    }
  }
  return null
}

function rendererTitle(renderer: JsonRecord): string {
  const title = record(renderer.title)
  if (typeof title.simpleText === 'string') return title.simpleText.trim()
  return list(title.runs)
    .map((run) => record(run).text)
    .filter((text): text is string => typeof text === 'string')
    .join('')
    .trim()
}

function regularVideoCandidates(data: JsonRecord): YoutubeTrailerCandidate[] | null {
  const search = record(record(data.contents).twoColumnSearchResultsRenderer)
  const primary = record(search.primaryContents)
  const sectionContents = record(primary.sectionListRenderer).contents
  if (!Array.isArray(sectionContents)) return null
  const sections = sectionContents
  const candidates: YoutubeTrailerCandidate[] = []
  const seen = new Set<string>()

  for (const section of sections) {
    for (const item of list(record(record(section).itemSectionRenderer).contents)) {
      const renderer = record(record(item).videoRenderer)
      const videoId = typeof renderer.videoId === 'string' ? renderer.videoId : ''
      const title = rendererTitle(renderer)
      if (/^[\w-]{11}$/.test(videoId) && title && !seen.has(videoId)) {
        seen.add(videoId)
        candidates.push({ videoId, title })
      }
    }
  }
  return candidates
}

function allowedRemainder(tokens: string[]): boolean {
  return tokens.every((token, index) => {
    if (REMAINDER_WORDS.has(token) || /^20\d{2}$/.test(token)) return true
    if (!/^\d$/.test(token)) return false
    return tokens[index - 1] === 'quest' || tokens[index - 1] === 'playstation'
  })
}

export function isSpecificGameTitle(gameName: string): boolean {
  const normalizedGame = normalizeGameTitle(gameName)
  const gameTokens = normalizedGame.split(' ').filter(Boolean)
  return !(
    gameTokens.length === 0 ||
    gameTokens.every((token) => GENERIC_GAME_WORDS.has(token) || /^\d+$/.test(token))
  )
}

function identifiesGame(gameName: string, candidateTitle: string): boolean {
  if (!isSpecificGameTitle(gameName)) return false

  const candidateTokens = normalizeGameTitle(candidateTitle).split(' ').filter(Boolean)
  for (let start = 0; start < candidateTokens.length; start += 1) {
    for (let end = start + 1; end <= candidateTokens.length; end += 1) {
      if (!titlesMatch(gameName, candidateTokens.slice(start, end).join(' '))) continue
      if (allowedRemainder([...candidateTokens.slice(0, start), ...candidateTokens.slice(end)])) {
        return true
      }
    }
  }
  return false
}

export function selectYoutubeTrailerCandidate(
  html: string,
  gameName: string
): YoutubeTrailerCandidate | null {
  return parseYoutubeTrailerSearch(html, gameName).candidate
}

export interface YoutubeTrailerSearch {
  status: 'valid' | 'malformed'
  candidate: YoutubeTrailerCandidate | null
}

export function parseYoutubeTrailerSearch(html: string, gameName: string): YoutubeTrailerSearch {
  const data = extractInitialData(html)
  if (!data) return { status: 'malformed', candidate: null }
  const candidates = regularVideoCandidates(data)
  if (!candidates) return { status: 'malformed', candidate: null }
  const matches = candidates.filter((candidate) => identifiesGame(gameName, candidate.title))
  return { status: 'valid', candidate: matches.length === 1 ? matches[0] : null }
}
