import { useCallback, useEffect, useState } from 'react'
import {
  BackupEntry,
  BackupVerification,
  BackupResult,
  BackupCreateResult,
  BackupReportResult,
  BackupProfile
} from '@shared/types'

/**
 * Thin React wrapper around window.api.backup for the save-backup BETA module.
 * Keeps a local copy of the backup list and exposes the create/restore/delete/
 * verify/report actions. Self-contained: deleting the backup UI folder and the
 * two call sites removes the feature entirely.
 */
export interface UseBackup {
  backups: BackupEntry[]
  loading: boolean
  refresh: () => Promise<void>
  create: (deviceId: string, packageName: string, appLabel: string) => Promise<BackupCreateResult>
  restore: (backupId: string, deviceId: string) => Promise<BackupResult>
  remove: (backupId: string) => Promise<boolean>
  setVerification: (
    backupId: string,
    result: BackupVerification
  ) => Promise<BackupEntry | null>
  reportFailure: (backupId: string) => Promise<BackupReportResult | null>
  getProfile: (packageName: string) => Promise<BackupProfile | null>
}

export function useBackup(): UseBackup {
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.api.backup.listBackups()
      setBackups(list)
    } catch (err) {
      console.error('[useBackup] Failed to list backups:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const create = useCallback(
    async (deviceId: string, packageName: string, appLabel: string) => {
      const result = await window.api.backup.createBackup(deviceId, packageName, appLabel)
      if (result.ok) await refresh()
      return result
    },
    [refresh]
  )

  const restore = useCallback(
    async (backupId: string, deviceId: string) => {
      const result = await window.api.backup.restoreBackup(backupId, deviceId)
      await refresh()
      return result
    },
    [refresh]
  )

  const remove = useCallback(
    async (backupId: string) => {
      const ok = await window.api.backup.deleteBackup(backupId)
      if (ok) await refresh()
      return ok
    },
    [refresh]
  )

  const setVerification = useCallback(
    async (backupId: string, result: BackupVerification) => {
      const entry = await window.api.backup.setVerification(backupId, result)
      await refresh()
      return entry
    },
    [refresh]
  )

  const reportFailure = useCallback(
    (backupId: string) => window.api.backup.reportFailure(backupId),
    []
  )

  const getProfile = useCallback(
    (packageName: string) => window.api.backup.getProfile(packageName),
    []
  )

  return {
    backups,
    loading,
    refresh,
    create,
    restore,
    remove,
    setVerification,
    reportFailure,
    getProfile
  }
}
