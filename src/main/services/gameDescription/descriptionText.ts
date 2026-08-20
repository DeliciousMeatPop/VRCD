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

export const titlesMatch = (gameName: string, candidateTitle: string): boolean =>
  normalizeGameTitle(gameName) === normalizeGameTitle(candidateTitle)

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

export interface ImageDimensions {
  width: number
  height: number
}

export function readImageDimensions(data: Buffer): ImageDimensions | null {
  if (
    data.length >= 24 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
  }

  if (data.length < 10 || data[0] !== 0xff || data[1] !== 0xd8) return null

  let offset = 2
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) {
      offset += 1
      continue
    }

    const marker = data[offset + 1]
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2
      continue
    }

    const segmentLength = data.readUInt16BE(offset + 2)
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xc3 || marker >= 0xc5 && marker <= 0xc7 || marker >= 0xc9 && marker <= 0xcb || marker >= 0xcd && marker <= 0xcf
    if (isStartOfFrame && segmentLength >= 7) {
      return {
        height: data.readUInt16BE(offset + 5),
        width: data.readUInt16BE(offset + 7)
      }
    }

    if (segmentLength < 2) return null
    offset += 2 + segmentLength
  }

  return null
}
