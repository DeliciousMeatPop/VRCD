import { app, shell } from 'electron'
import { join } from 'path'
import { promises as fs, existsSync } from 'fs'
import adbService from '../adbService'
import { uploadTextToRentry } from '../logsService'
import {
  BackupEntry,
  BackupVerification,
  BackupResult,
  BackupCreateResult,
  BackupReportResult
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
 *  Save data on Quest lives under /sdcard/Android/data/<package>. That is the
 *  only location we snapshot — OBB is shipped game content, not user progress.
 *
 *  Backups are stored under userData/save-backups/<backupId>/:
 *    - manifest.json   metadata + user verification state
 *    - data/           mirror of the device's /sdcard/Android/data/<pkg> tree
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
   * Snapshot the save data for `packageName` from the device into a new backup.
   * Fails (without creating an empty backup) if the app has no save directory
   * or it contains no files — usually because the app was never launched.
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
    const dataDir = join(dir, 'data')
    const remotePath = deviceSavePath(packageName)

    try {
      await fs.mkdir(dataDir, { recursive: true })
      await this.log(id, `Backup started for ${appLabel} (${packageName}) on ${deviceId}`)
      await this.log(id, `Source: ${remotePath}`)

      const exists = await adbService.remotePathExists(deviceId, remotePath)
      if (!exists) {
        await this.log(id, `Save directory not found on device: ${remotePath}`)
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
        return {
          ok: false,
          error: `No save data found for ${appLabel}. Launch the app on the headset at least once before backing up.`
        }
      }

      const { fileCount, totalBytes } = await adbService.pullDirectory(
        deviceId,
        remotePath,
        dataDir
      )
      await this.log(id, `Pulled ${fileCount} file(s), ${totalBytes} bytes`)

      if (fileCount === 0) {
        await this.log(id, 'Backup aborted: no files copied.')
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
        return {
          ok: false,
          error: `No save files found for ${appLabel}. There may be nothing to back up yet.`
        }
      }

      const entry: BackupEntry = {
        id,
        packageName,
        appLabel: appLabel || packageName,
        deviceModel: await this.resolveDeviceModel(deviceId),
        createdAt: Date.now(),
        fileCount,
        totalBytes,
        sourcePath: remotePath,
        verification: 'pending'
      }
      await this.writeManifest(entry)
      await this.log(id, 'Backup completed successfully.')
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
   * Push a backup's stored save tree back onto the device. The target app
   * should already be installed so its /sdcard/Android/data/<pkg> directory
   * exists with the right context; we mkdir -p defensively regardless.
   */
  public async restoreBackup(backupId: string, deviceId: string): Promise<BackupResult> {
    if (!deviceId) return { ok: false, error: 'No device connected.' }
    const entry = await this.readManifest(backupId)
    if (!entry) return { ok: false, error: 'Backup not found.' }

    const dataDir = join(this.backupDir(backupId), 'data')
    if (!existsSync(dataDir)) {
      return { ok: false, error: 'Backup data is missing on disk.' }
    }
    const remotePath = deviceSavePath(entry.packageName)

    try {
      await this.log(backupId, `Restore started to ${deviceId} → ${remotePath}`)
      await adbService.runShellCommand(deviceId, `mkdir -p "${remotePath}"`)
      const ok = await adbService.pushFileOrFolder(deviceId, dataDir, remotePath)
      if (!ok) {
        await this.log(backupId, 'Restore FAILED: push returned false.')
        return { ok: false, error: 'Failed to push save data to the device.' }
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
   * Build an anonymous diagnostic report for a backup the user says didn't
   * restore correctly, upload the details to rentry, and open a pre-filled
   * GitHub issue so the maintainer gets a genuinely useful report. No personal
   * information is attached — just the manifest and the backup log.
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

    const report = [
      'VR CyberDeck — Save Backup Failure Report',
      '=========================================',
      `App:            ${entry.appLabel}`,
      `Package:        ${entry.packageName}`,
      `Backup ID:      ${entry.id}`,
      `Device model:   ${entry.deviceModel ?? 'unknown'}`,
      `Created:        ${new Date(entry.createdAt).toISOString()}`,
      `Files / bytes:  ${entry.fileCount} / ${entry.totalBytes}`,
      `Source path:    ${entry.sourcePath}`,
      `User result:    restore reported NOT WORKING`,
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
