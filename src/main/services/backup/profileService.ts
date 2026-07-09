import { app } from 'electron'
import { join } from 'path'
import { promises as fs, existsSync } from 'fs'
import { BackupProfile } from '@shared/types'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SAVE-BACKUP PROFILE REGISTRY
 * ─────────────────────────────────────────────────────────────────────────────
 *  Most games back up and restore fine with the default method (snapshot of
 *  /sdcard/Android/data/<pkg>). A handful don't — they keep progress somewhere
 *  else (extra external paths, or PlayerPrefs/shared_prefs in private internal
 *  storage). Rather than hard-coding those exceptions into each app release,
 *  they live in a JSON registry hosted in the repo:
 *
 *    https://raw.githubusercontent.com/KaladinDMP/VR-CyberDeck/main/backup-profiles.json
 *
 *  Before every backup/restore the service asks this module for the package's
 *  profile. The registry is fetched over HTTPS, cached on disk, and only
 *  re-fetched when the cache is stale — so a normal backup adds no perceptible
 *  latency, and it keeps working offline off the last cached copy. If the fetch
 *  fails and there's no cache, we fall back to "no profile" (default method),
 *  so the registry can never break a backup.
 *
 *  To add support for a new game the maintainer just commits an entry to
 *  backup-profiles.json — every client picks it up automatically.
 */

const REGISTRY_URL =
  'https://raw.githubusercontent.com/KaladinDMP/VR-CyberDeck/main/backup-profiles.json'

/** How long a cached registry is considered fresh before we try to re-fetch. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours

/** Hard cap on the network fetch so a slow/hung request never stalls a backup. */
const FETCH_TIMEOUT_MS = 8000

interface RegistryFile {
  version?: number
  updated?: string
  /** Keyed by package name. */
  profiles?: Record<string, Omit<BackupProfile, 'packageName'>>
}

interface CacheFile {
  fetchedAt: number
  registry: RegistryFile
}

class ProfileService {
  /** In-memory copy of the registry so repeated lookups in one run are cheap. */
  private memory: RegistryFile | null = null
  private memoryFetchedAt = 0
  /** De-dupes concurrent refreshes (e.g. backing up several games at once). */
  private inflight: Promise<void> | null = null

  private cachePath(): string {
    return join(app.getPath('userData'), 'save-backups', 'profiles-cache.json')
  }

  private async readCache(): Promise<CacheFile | null> {
    try {
      const raw = await fs.readFile(this.cachePath(), 'utf-8')
      const parsed = JSON.parse(raw) as CacheFile
      if (parsed && typeof parsed.fetchedAt === 'number' && parsed.registry) return parsed
      return null
    } catch {
      return null
    }
  }

  private async writeCache(registry: RegistryFile): Promise<void> {
    try {
      await fs.mkdir(join(app.getPath('userData'), 'save-backups'), { recursive: true })
      const payload: CacheFile = { fetchedAt: Date.now(), registry }
      await fs.writeFile(this.cachePath(), JSON.stringify(payload, null, 2), 'utf-8')
    } catch (err) {
      console.warn('[ProfileService] Failed to write profile cache:', err)
    }
  }

  /** Fetch the registry from GitHub with a bounded timeout. */
  private async fetchRemote(): Promise<RegistryFile | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(REGISTRY_URL, {
        signal: controller.signal,
        // raw.githubusercontent.com is CDN-cached; ask for a reasonably fresh copy.
        headers: { 'Cache-Control': 'no-cache' }
      })
      if (!res.ok) {
        console.warn(`[ProfileService] Registry fetch HTTP ${res.status} ${res.statusText}`)
        return null
      }
      const json = (await res.json()) as RegistryFile
      if (!json || typeof json !== 'object') return null
      return json
    } catch (err) {
      console.warn('[ProfileService] Registry fetch failed:', err)
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Ensure a registry is loaded into memory, refreshing from the network when
   * the cached copy is stale. Never throws — on total failure `memory` stays
   * null and lookups behave as "no profile".
   */
  private async ensureLoaded(): Promise<void> {
    const fresh = this.memory && Date.now() - this.memoryFetchedAt < CACHE_TTL_MS
    if (fresh) return

    if (this.inflight) return this.inflight

    this.inflight = (async () => {
      // Seed from disk cache first so an offline run still has data.
      if (!this.memory) {
        const cache = await this.readCache()
        if (cache) {
          this.memory = cache.registry
          this.memoryFetchedAt = cache.fetchedAt
        }
      }

      // Skip the network if the disk cache is still fresh.
      if (this.memory && Date.now() - this.memoryFetchedAt < CACHE_TTL_MS) return

      const remote = await this.fetchRemote()
      if (remote) {
        this.memory = remote
        this.memoryFetchedAt = Date.now()
        await this.writeCache(remote)
        console.log('[ProfileService] Profile registry refreshed from remote.')
      } else if (!this.memory) {
        console.log('[ProfileService] No registry available (remote + cache miss); using defaults.')
      }
    })()

    try {
      await this.inflight
    } finally {
      this.inflight = null
    }
  }

  /**
   * Return the profile for `packageName`, or null if the game uses the default
   * method. Safe to call before every backup/restore — cheap and non-throwing.
   */
  public async getProfile(packageName: string): Promise<BackupProfile | null> {
    if (!packageName) return null
    try {
      await this.ensureLoaded()
    } catch {
      /* ensureLoaded already swallows its own errors; belt and braces */
    }
    const raw = this.memory?.profiles?.[packageName]
    if (!raw) return null
    return { packageName, ...raw }
  }
}

export default new ProfileService()

/** Local dev/test hook: returns the on-disk cache path. */
export function profileCacheExists(): boolean {
  return existsSync(join(app.getPath('userData'), 'save-backups', 'profiles-cache.json'))
}
