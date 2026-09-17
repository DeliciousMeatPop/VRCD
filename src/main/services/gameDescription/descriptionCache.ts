import { promises as fs } from 'fs'
import { dirname } from 'path'
import { GameDescriptionFound, GameDescriptionNotFound } from '@shared/types'

type CacheableDescription = GameDescriptionFound | GameDescriptionNotFound

interface CacheEntry {
  result: CacheableDescription
  expiresAt: number
}

interface DescriptionCacheFile {
  version: 2
  entries: Record<string, CacheEntry>
}

const CACHE_VERSION = 2
const FOUND_TTL = 30 * 24 * 60 * 60 * 1000
const NOT_FOUND_TTL = 24 * 60 * 60 * 1000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isLanguage = (value: unknown): value is CacheableDescription['language'] =>
  value === 'en' || value === 'es'

const isFoundResult = (value: unknown): value is GameDescriptionFound => {
  if (!isRecord(value) || value.status !== 'found' || !isRecord(value.source)) return false
  return (
    typeof value.text === 'string' &&
    value.text.trim().length > 0 &&
    typeof value.source.label === 'string' &&
    value.source.label.trim().length > 0 &&
    (value.source.url === undefined || typeof value.source.url === 'string') &&
    isLanguage(value.language) &&
    typeof value.fetchedAt === 'number' &&
    Number.isFinite(value.fetchedAt)
  )
}

const isNotFoundResult = (value: unknown): value is GameDescriptionNotFound =>
  isRecord(value) &&
  value.status === 'not-found' &&
  isLanguage(value.language) &&
  typeof value.fetchedAt === 'number' &&
  Number.isFinite(value.fetchedAt)

const cacheEntryFrom = (value: unknown): CacheEntry | null => {
  if (
    !isRecord(value) ||
    typeof value.expiresAt !== 'number' ||
    !Number.isFinite(value.expiresAt) ||
    (!isFoundResult(value.result) && !isNotFoundResult(value.result))
  ) {
    return null
  }
  return { result: value.result, expiresAt: value.expiresAt }
}

const validEntriesFrom = (value: unknown): Record<string, CacheEntry> => {
  if (!isRecord(value)) return {}
  const entries: Record<string, CacheEntry> = {}
  for (const [key, candidate] of Object.entries(value)) {
    const entry = cacheEntryFrom(candidate)
    if (entry) entries[key] = entry
  }
  return entries
}

export class DescriptionCache {
  private loaded?: Promise<void>
  private writes: Promise<void> = Promise.resolve()
  private entries: Record<string, CacheEntry> = {}

  constructor(
    private readonly path: string,
    private readonly now: () => number = Date.now
  ) {}

  async get(key: string): Promise<CacheableDescription | null> {
    await this.load()
    const entry = this.entries[key]
    if (!entry || entry.expiresAt <= this.now()) {
      if (entry) {
        delete this.entries[key]
        await this.persist()
      }
      return null
    }
    return entry.result
  }

  async set(key: string, result: CacheableDescription): Promise<void> {
    await this.load()
    this.entries[key] = {
      result,
      expiresAt: this.now() + (result.status === 'found' ? FOUND_TTL : NOT_FOUND_TTL)
    }
    await this.persist()
  }

  private load(): Promise<void> {
    this.loaded ??= this.read()
    return this.loaded
  }

  private async read(): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(this.path, 'utf8'))
      if (!isRecord(parsed)) return

      if (parsed.version === CACHE_VERSION) {
        this.entries = validEntriesFrom(parsed.entries)
        return
      }

      if (parsed.version === 1) {
        const legacyEntries = validEntriesFrom(parsed.entries)
        this.entries = Object.fromEntries(
          Object.entries(legacyEntries).filter(
            ([, entry]) => entry.result.status === 'found' && entry.expiresAt > this.now()
          )
        )
        await this.persist()
      }
    } catch {
      this.entries = {}
    }
  }

  private persist(): Promise<void> {
    this.writes = this.writes.then(() => this.write())
    return this.writes
  }

  private async write(): Promise<void> {
    const temporaryPath = `${this.path}.tmp`
    try {
      await fs.mkdir(dirname(this.path), { recursive: true })
      await fs.writeFile(
        temporaryPath,
        JSON.stringify({
          version: CACHE_VERSION,
          entries: this.entries
        } satisfies DescriptionCacheFile),
        'utf8'
      )
      await fs.rename(temporaryPath, this.path)
    } catch (error) {
      console.warn('[DescriptionCache] Failed to persist description cache:', error)
      await fs.unlink(temporaryPath).catch(() => {})
    }
  }
}
