import { app, shell } from 'electron'
import { join } from 'path'
import { promises as fs, existsSync } from 'fs'
import adbService from '../adbService'
import profileService from './profileService'
import { uploadTextToRentry } from '../logsService'
import {
  BackupEntry,
  BackupVerification,
  BackupResult,
  BackupCreateResult,
  BackupReportResult,
  BackupProfile,
  BackupRoot
} from '@shared/types'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SAVE BACKUP MODULE  (EXPERIMENTAL / BETA)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Self-contained service for backing up and restoring Quest app save data.
 *
 *  It is intentionally kept as an isolated module so the whole feature can be
 *  removed without touching the rest of the app:
 *    - main:     delete this folder + the `registerBackupIpc()` call in index.ts
 *    - shared:   delete the backup block in types/index.ts + types/ipc.ts
 *    - preload:  delete the `backup` namespace
 *    - renderer: delete components/backup + the two call sites (Settings, dialog)
 *
 *  Save data on Quest usually lives under /sdcard/Android/data/<package>, which
 *  is what we snapshot by default (OBB is shipped game content, not progress).
 *
 *  Some games don't fit that mould — they keep extra data in other external
 *  paths, or keep progress in PlayerPrefs / shared_prefs under the app's PRIVATE
 *  internal storage (/data/data/<pkg>), which a normal adb pull can't read. For
 *  those, a per-package *profile* (fetched from the remote registry — see
 *  profileService.ts) overrides the default: it can list additional paths and/or
 *  request a best-effort `run-as` capture of internal data. Games with no profile
 *  keep using the plain default method.
 *
 *  Backups are stored under userData/save-backups/<backupId>/:
 *    - manifest.json   metadata + captured-root map + user verification state
 *    - data/           mirror of the primary /sdcard/Android/data/<pkg> tree
 *    - roots/extN/     additional external trees from a profile (if any)
 *    - internal/       private /data/data/<pkg> tree captured via run-as (if any)
 *    - backup.log      human-readable log of create/restore attempts (attached
 *                      to failure reports so issues are actually diagnosable)
 */

const REPO = 'KaladinDMP/VR-CyberDeck'
const SAVE_DATA_BASE = '/sdcard/Android/data'

function deviceSavePath(packageName: string): string {
  return `${SAVE_DATA_BASE}/${packageName}`
}

class BackupService {
  private backupsRoot(): string {
    return join(app.getPath('userData'), 'save-backups')
  }

  private backupDir(id: string): string {
    return join(this.backupsRoot(), id)
  }

  private manifestPath(id: string): string {
    return join(this.backupDir(id), 'manifest.json')
  }

  private logPath(id: string): string {
    return join(this.backupDir(id), 'backup.log')
  }

  /** Append a timestamped line to a backup's log file and the main log. */
  private async log(id: string, message: string): Promise<void> {
    const line = `[${new Date().toISOString()}] ${message}`
    console.log(`[Backup] (${id}) ${message}`)
    try {
      await fs.appendFile(this.logPath(id), line + '\n', 'utf-8')
    } catch {
      /* logging must never throw */
    }
  }

  private async readManifest(id: string): Promise<BackupEntry | null> {
    try {
      const raw = await fs.readFile(this.manifestPath(id), 'utf-8')
      return JSON.parse(raw) as BackupEntry
    } catch {
      return null
    }
  }

  private async writeManifest(entry: BackupEntry): Promise<void> {
    await fs.mkdir(this.backupDir(entry.id), { recursive: true })
    await fs.writeFile(this.manifestPath(entry.id), JSON.stringify(entry, null, 2), 'utf-8')
  }

  private sanitize(pkg: string): string {
    return pkg.replace(/[^a-zA-Z0-9._-]/g, '_')
  }

  private async resolveDeviceModel(deviceId: string): Promise<string | null> {
    try {
      const devices = await adbService.listDevices()
      const d = devices.find((x) => x.id === deviceId)
      return d?.friendlyModelName || d?.model || null
    } catch {
      return null
    }
  }

  /** List all backups, newest first. */
  public async listBackups(): Promise<BackupEntry[]> {
    const root = this.backupsRoot()
    if (!existsSync(root)) return []
    let ids: string[]
    try {
      const dirents = await fs.readdir(root, { withFileTypes: true })
      ids = dirents.filter((d) => d.isDirectory()).map((d) => d.name)
    } catch {
      return []
    }
    const entries: BackupEntry[] = []
    for (const id of ids) {
      const m = await this.readManifest(id)
      if (m) entries.push(m)
    }
    entries.sort((a, b) => b.createdAt - a.createdAt)
    return entries
  }

  /**
   * Look up the per-package backup profile (remote registry, cached). Exposed to
   * the renderer so the UI can indicate when a custom method will be used.
   */
  public async getProfile(packageName: string): Promise<BackupProfile | null> {
    return profileService.getProfile(packageName)
  }

  /**
   * Compute the set of source trees to capture for a package, honouring its
   * profile. Without a profile this is just the single default external path,
   * so default backups are byte-for-byte identical in layout to before.
   */
  private plannedRoots(
    packageName: string,
    profile: BackupProfile | null
  ): { remotePath: string; localDir: string; method: BackupRoot['method'] }[] {
    const externalPaths =
      profile?.paths && profile.paths.length > 0 ? profile.paths : [deviceSavePath(packageName)]

    const roots: { remotePath: string; localDir: string; method: BackupRoot['method'] }[] =
      externalPaths.map((remotePath, i) => ({
        remotePath,
        // Keep the primary tree at `data/` for backward/forward compatibility.
        localDir: i === 0 ? 'data' : `roots/ext${i}`,
        method: 'push'
      }))

    if (profile?.includeInternalData) {
      roots.push({ remotePath: `/data/data/${packageName}`, localDir: 'internal', method: 'run-as' })
    }
    return roots
  }

  /**
   * Snapshot the save data for `packageName` from the device into a new backup.
   * Applies a per-package profile when one exists (extra paths / internal data);
   * otherwise snapshots the default /sdcard/Android/data/<pkg> tree. Fails
   * (without creating an empty backup) only if nothing at all could be captured.
   */
  public async createBackup(
    deviceId: string,
    packageName: string,
    appLabel: string
  ): Promise<BackupCreateResult> {
    if (!deviceId) return { ok: false, error: 'No device connected.' }
    if (!packageName) return { ok: false, error: 'Missing package name.' }

    const id = `${this.sanitize(packageName)}_${Date.now()}`
    const dir = this.backupDir(id)

    try {
      await fs.mkdir(dir, { recursive: true })
      await this.log(id, `Backup started for ${appLabel} (${packageName}) on ${deviceId}`)

      const profile = await profileService.getProfile(packageName)
      if (profile) {
        await this.log(
          id,
          `Profile applied for ${packageName}: paths=${JSON.stringify(
            profile.paths ?? [deviceSavePath(packageName)]
          )} includeInternalData=${!!profile.includeInternalData}` +
            (profile.notes ? ` — ${profile.notes}` : '')
        )
      } else {
        await this.log(id, 'No profile — using default method.')
      }

      const planned = this.plannedRoots(packageName, profile)
      const roots: BackupRoot[] = []
      let anyExternalPathMissing = false

      for (const p of planned) {
        const localDirAbs = join(dir, ...p.localDir.split('/'))
        await fs.mkdir(localDirAbs, { recursive: true })
        await this.log(id, `Source (${p.method}): ${p.remotePath} → ${p.localDir}/`)

        if (p.method === 'push') {
          const exists = await adbService.remotePathExists(deviceId, p.remotePath)
          if (!exists) {
            await this.log(id, `  Path not found on device, skipping: ${p.remotePath}`)
            anyExternalPathMissing = true
            continue
          }
          const { fileCount, totalBytes } = await adbService.pullDirectory(
            deviceId,
            p.remotePath,
            localDirAbs
          )
          await this.log(id, `  Pulled ${fileCount} file(s), ${totalBytes} bytes`)
          roots.push({ ...p, fileCount, totalBytes })
        } else {
          // run-as internal capture (best-effort).
          const res = await adbService.pullInternalDataViaRunAs(deviceId, packageName, localDirAbs)
          if (!res.accessible) {
            await this.log(id, `  Internal data NOT captured: ${res.reason ?? 'run-as unavailable'}`)
          } else {
            await this.log(
              id,
              `  Internal data captured: ${res.fileCount} file(s), ${res.totalBytes} bytes` +
                (res.reason ? ` (${res.reason})` : '')
            )
          }
          roots.push({ ...p, fileCount: res.fileCount, totalBytes: res.totalBytes })
        }
      }

      const fileCount = roots.reduce((n, r) => n + r.fileCount, 0)
      const totalBytes = roots.reduce((n, r) => n + r.totalBytes, 0)

      if (fileCount === 0) {
        await this.log(id, 'Backup aborted: no files copied from any source.')
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
        const hint = anyExternalPathMissing
          ? `No save data found for ${appLabel}. Launch the app on the headset at least once before backing up.`
          : `No save files found for ${appLabel}. There may be nothing to back up yet.`
        return { ok: false, error: hint }
      }

      const primary = roots.find((r) => r.localDir === 'data') ?? roots[0]
      const entry: BackupEntry = {
        id,
        packageName,
        appLabel: appLabel || packageName,
        deviceModel: await this.resolveDeviceModel(deviceId),
        createdAt: Date.now(),
        fileCount,
        totalBytes,
        sourcePath: primary.remotePath,
        verification: 'pending',
        roots,
        profileApplied: !!profile,
        profileNotes: profile?.notes
      }
      await this.writeManifest(entry)
      await this.log(id, `Backup completed successfully (${roots.length} root(s)).`)
      return { ok: true, backup: entry }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await this.log(id, `Backup FAILED: ${message}`)
      // Leave the partial backup dir + log on disk so the failure is reportable,
      // but do not surface it as a usable backup (no manifest was written).
      return { ok: false, error: `Backup failed: ${message}`.substring(0, 300) }
    }
  }

  /**
   * Resolve a backup's captured roots, synthesising a single legacy root for
   * old backups that predate the multi-root manifest.
   */
  private rootsFor(entry: BackupEntry): BackupRoot[] {
    if (entry.roots && entry.roots.length > 0) return entry.roots
    return [
      {
        remotePath: entry.sourcePath || deviceSavePath(entry.packageName),
        localDir: 'data',
        method: 'push',
        fileCount: entry.fileCount,
        totalBytes: entry.totalBytes
      }
    ]
  }

  /**
   * Push a backup's stored save trees back onto the device. The target app
   * should already be installed so its /sdcard/Android/data/<pkg> directory
   * exists with the right context; we mkdir -p defensively regardless. Internal
   * (run-as) roots are restored best-effort and never block the external
   * restore. After pushing, a sanity check re-counts device files so a restore
   * that silently placed nothing gets flagged in the log.
   */
  public async restoreBackup(backupId: string, deviceId: string): Promise<BackupResult> {
    if (!deviceId) return { ok: false, error: 'No device connected.' }
    const entry = await this.readManifest(backupId)
    if (!entry) return { ok: false, error: 'Backup not found.' }

    const roots = this.rootsFor(entry)
    const pushRoots = roots.filter((r) => r.method === 'push')
    // Every push root must exist on disk; a missing primary tree is fatal.
    for (const r of pushRoots) {
      if (!existsSync(join(this.backupDir(backupId), ...r.localDir.split('/')))) {
        return { ok: false, error: `Backup data is missing on disk (${r.localDir}).` }
      }
    }

    try {
      await this.log(backupId, `Restore started to ${deviceId} (${roots.length} root(s))`)

      for (const r of roots) {
        const localDirAbs = join(this.backupDir(backupId), ...r.localDir.split('/'))

        if (r.method === 'push') {
          await this.log(backupId, `Restoring ${r.localDir}/ → ${r.remotePath}`)
          await adbService.runShellCommand(deviceId, `mkdir -p "${r.remotePath}"`)
          const ok = await adbService.pushFileOrFolder(deviceId, localDirAbs, r.remotePath)
          if (!ok) {
            await this.log(backupId, `Restore FAILED: push returned false for ${r.localDir}.`)
            return { ok: false, error: 'Failed to push save data to the device.' }
          }
          // Post-restore sanity check: does the device actually have the files?
          const onDevice = await adbService.countRemoteFiles(deviceId, r.remotePath)
          if (onDevice < 0) {
            await this.log(backupId, `  Post-restore check: could not list ${r.remotePath}.`)
          } else if (onDevice < r.fileCount) {
            await this.log(
              backupId,
              `  Post-restore check WARNING: ${r.remotePath} has ${onDevice} file(s), expected >= ${r.fileCount}.`
            )
          } else {
            await this.log(
              backupId,
              `  Post-restore check OK: ${r.remotePath} has ${onDevice} file(s).`
            )
          }
        } else {
          // Internal data via run-as — best-effort, never fatal.
          if (!existsSync(localDirAbs)) continue
          await this.log(backupId, `Restoring internal data (run-as) → ${r.remotePath}`)
          const ok = await adbService.pushInternalDataViaRunAs(deviceId, entry.packageName, localDirAbs)
          await this.log(
            backupId,
            ok
              ? '  Internal data restored via run-as.'
              : '  Internal data NOT restored (app not debuggable or copy failed). If progress is stored in PlayerPrefs, it may not come back without root.'
          )
        }
      }

      await this.log(backupId, 'Restore push completed.')
      // A fresh restore invalidates any previous verification — the user needs
      // to re-check whether it actually worked this time.
      entry.verification = 'pending'
      entry.verifiedAt = undefined
      await this.writeManifest(entry)
      return { ok: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await this.log(backupId, `Restore FAILED: ${message}`)
      return { ok: false, error: `Restore failed: ${message}`.substring(0, 300) }
    }
  }

  public async deleteBackup(backupId: string): Promise<boolean> {
    try {
      await fs.rm(this.backupDir(backupId), { recursive: true, force: true })
      return true
    } catch (err) {
      console.error(`[Backup] Failed to delete backup ${backupId}:`, err)
      return false
    }
  }

  /** Record the user's assessment of whether a restore actually worked. */
  public async setVerification(
    backupId: string,
    result: BackupVerification
  ): Promise<BackupEntry | null> {
    const entry = await this.readManifest(backupId)
    if (!entry) return null
    entry.verification = result
    entry.verifiedAt = Date.now()
    await this.writeManifest(entry)
    await this.log(backupId, `User marked restore as: ${result}`)
    return entry
  }

  /**
   * Walk a captured root's local mirror and return a `relpath — size` listing so
   * the maintainer can see WHAT was actually backed up (real save files vs. just
   * cache). Capped so a huge tree can't blow up the report.
   */
  private async buildRootListing(backupId: string, root: BackupRoot, cap: number): Promise<string[]> {
    const rootAbs = join(this.backupDir(backupId), ...root.localDir.split('/'))
    const lines: string[] = []
    const walk = async (abs: string, rel: string): Promise<void> => {
      if (lines.length >= cap) return
      let entries: import('fs').Dirent[]
      try {
        entries = await fs.readdir(abs, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (lines.length >= cap) return
        const childRel = rel ? `${rel}/${e.name}` : e.name
        const childAbs = join(abs, e.name)
        if (e.isDirectory()) {
          await walk(childAbs, childRel)
        } else if (e.isFile()) {
          let size = 0
          try {
            size = (await fs.stat(childAbs)).size
          } catch {
            /* ignore */
          }
          lines.push(`  ${childRel} — ${size} B`)
        }
      }
    }
    await walk(rootAbs, '')
    return lines
  }

  /** Assemble the per-root file tree section of a failure report. */
  private async buildFileTree(backupId: string, entry: BackupEntry): Promise<string> {
    const CAP_PER_ROOT = 200
    const roots = this.rootsFor(entry)
    const sections: string[] = []
    for (const root of roots) {
      const listing = await this.buildRootListing(backupId, root, CAP_PER_ROOT)
      const header = `[${root.method}] ${root.remotePath}  (${root.fileCount} files, ${root.totalBytes} B)`
      const body =
        listing.length === 0
          ? '  (no files captured)'
          : listing.join('\n') +
            (listing.length >= CAP_PER_ROOT ? `\n  … (truncated at ${CAP_PER_ROOT} entries)` : '')
      sections.push(`${header}\n${body}`)
    }
    return sections.join('\n\n')
  }

  /**
   * Build an anonymous diagnostic report for a backup the user says didn't
   * restore correctly, upload the details to rentry, and open a pre-filled
   * GitHub issue so the maintainer gets a genuinely useful report. No personal
   * information is attached — just the manifest, the captured file tree, and the
   * backup log. The file tree is the key addition: it shows whether we captured
   * real save data or only cache, which is what makes these reports triable.
   */
  public async reportFailure(backupId: string): Promise<BackupReportResult | null> {
    const entry = await this.readManifest(backupId)
    if (!entry) return null

    let logContents = '(no log captured)'
    try {
      logContents = await fs.readFile(this.logPath(backupId), 'utf-8')
    } catch {
      /* ignore */
    }

    let fileTree = '(unavailable)'
    try {
      fileTree = await this.buildFileTree(backupId, entry)
    } catch {
      /* ignore */
    }

    const roots = this.rootsFor(entry)
    const report = [
      'VR CyberDeck — Save Backup Failure Report',
      '=========================================',
      `App:            ${entry.appLabel}`,
      `Package:        ${entry.packageName}`,
      `Backup ID:      ${entry.id}`,
      `Device model:   ${entry.deviceModel ?? 'unknown'}`,
      `Created:        ${new Date(entry.createdAt).toISOString()}`,
      `Files / bytes:  ${entry.fileCount} / ${entry.totalBytes}`,
      `Profile:        ${entry.profileApplied ? 'applied' : 'none (default method)'}`,
      ...(entry.profileNotes ? [`Profile notes:  ${entry.profileNotes}`] : []),
      `Roots:          ${roots.map((r) => `${r.method}:${r.remotePath}`).join(', ')}`,
      `User result:    restore reported NOT WORKING`,
      '',
      '--- captured files ---',
      fileTree,
      '',
      '--- backup.log ---',
      logContents.trim()
    ].join('\n')

    const rentryUrl = await uploadTextToRentry(report)

    const title = `[Save Backup BETA] Restore not working: ${entry.appLabel}`
    const bodyLines = [
      'A save backup restore was reported as not working from inside the app.',
      '',
      `- **App:** ${entry.appLabel}`,
      `- **Package:** \`${entry.packageName}\``,
      `- **Device:** ${entry.deviceModel ?? 'unknown'}`,
      `- **Files / size:** ${entry.fileCount} / ${entry.totalBytes} bytes`,
      '',
      rentryUrl
        ? `**Backup log & manifest:** ${rentryUrl}`
        : '_(Automatic log upload failed — please attach your log manually.)_',
      '',
      '_Filed anonymously via the VR CyberDeck save-backup BETA reporter._'
    ]
    const body = bodyLines.join('\n')

    const issueUrl =
      `https://github.com/${REPO}/issues/new` +
      `?labels=${encodeURIComponent('save-backup-beta')}` +
      `&title=${encodeURIComponent(title)}` +
      `&body=${encodeURIComponent(body)}`

    // Persist the rentry link on the manifest for reference.
    if (rentryUrl) {
      entry.reportUrl = rentryUrl
      await this.writeManifest(entry).catch(() => {})
    }

    try {
      await shell.openExternal(issueUrl)
    } catch (err) {
      console.error('[Backup] Failed to open GitHub issue URL:', err)
    }

    return { issueUrl, rentryUrl }
  }
}

export default new BackupService()
