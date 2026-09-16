const VR_SIGNALS = /\b(virtual reality|vr game|meta quest|oculus quest)\b/i
const MAX_DESCRIPTION_LENGTH = 500
const MAX_DESCRIPTION_SENTENCES = 3

export function normalizeGameTitle(value: string): string {
  return value
    .replace(/[\u2122\u00ae\u00a9]/g, '')
    .normalize('NFKC')
    .replace(/\s*\(video game\)\s*$/i, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLocaleLowerCase('en')
}

const TITLE_ALIASES: Record<string, string> = {
  motionsoccer: 'motion soccer',
  spatialflashcards: 'spatial flashcards'
}

const normalizeTitleForMatch = (value: string): string => {
  const normalized = normalizeGameTitle(value).replace(/\s+vr$/, '')
  return TITLE_ALIASES[normalized] ?? normalized
}

export const titlesMatch = (gameName: string, candidateTitle: string): boolean => {
  const gameTitle = normalizeTitleForMatch(gameName)
  const candidate = normalizeTitleForMatch(candidateTitle)
  return gameTitle.length > 0 && gameTitle === candidate
}

export const hasVrSignal = (text: string): boolean => VR_SIGNALS.test(text)

export function truncateDescription(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''

  const sentences = normalized.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [normalized]
  const limitedBySentences = sentences.slice(0, MAX_DESCRIPTION_SENTENCES).join('').trim()

  if (limitedBySentences.length <= MAX_DESCRIPTION_LENGTH) return limitedBySentences

  const withoutEllipsis = limitedBySentences.slice(0, MAX_DESCRIPTION_LENGTH - 1)
  const wordBoundary = withoutEllipsis.lastIndexOf(' ')
  return `${withoutEllipsis.slice(0, wordBoundary > 0 ? wordBoundary : withoutEllipsis.length).trimEnd()}…`
}
