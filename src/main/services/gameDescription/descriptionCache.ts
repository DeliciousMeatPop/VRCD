import { promises as fs } from 'fs'
import { dirname } from 'path'
import { GameDescriptionFound, GameDescriptionNotFound } from '@shared/types'

type CacheableDescription = GameDescriptionFound | GameDescriptionNotFound

interface CacheEntry {
  result: CacheableDescription
  expiresAt: number
}

interface DescriptionCacheFile {
  version: 1
  entries: Record<string, CacheEntry>
}

const FOUND_TTL = 30 * 24 * 60 * 60 * 1000
const NOT_FOUND_TTL = 7 * 24 * 60 * 60 * 1000

export class DescriptionCache {
  private loaded = false
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

  private async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    try {
      const parsed = JSON.parse(await fs.readFile(this.path, 'utf8')) as DescriptionCacheFile
      if (parsed.version === 1 && parsed.entries && typeof parsed.entries === 'object') {
        this.entries = parsed.entries
      }
    } catch {
      this.entries = {}
    }
  }

  private async persist(): Promise<void> {
    const temporaryPath = `${this.path}.tmp`
    try {
      await fs.mkdir(dirname(this.path), { recursive: true })
      await fs.writeFile(
        temporaryPath,
        JSON.stringify({ version: 1, entries: this.entries }),
        'utf8'
      )
      await fs.rename(temporaryPath, this.path)
    } catch (error) {
      console.warn('[DescriptionCache] Failed to persist description cache:', error)
      await fs.unlink(temporaryPath).catch(() => {})
    }
  }
}
