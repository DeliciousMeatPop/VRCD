import { typedIpcMain } from '@shared/ipc-utils'
import backupService from './backupService'

/**
 * Registers all IPC handlers for the save-backup BETA module. Called once from
 * main/index.ts. Keeping every handler here (rather than inline in index.ts)
 * means the entire feature can be removed by deleting this folder and the
 * single `registerBackupIpc()` call.
 */
export function registerBackupIpc(): void {
  typedIpcMain.handle('backup:list', () => backupService.listBackups())

  typedIpcMain.handle('backup:create', (_event, deviceId, packageName, appLabel) =>
    backupService.createBackup(deviceId, packageName, appLabel)
  )

  typedIpcMain.handle('backup:restore', (_event, backupId, deviceId) =>
    backupService.restoreBackup(backupId, deviceId)
  )

  typedIpcMain.handle('backup:delete', (_event, backupId) => backupService.deleteBackup(backupId))

  typedIpcMain.handle('backup:set-verification', (_event, backupId, result) =>
    backupService.setVerification(backupId, result)
  )

  typedIpcMain.handle('backup:report-failure', (_event, backupId) =>
    backupService.reportFailure(backupId)
  )

  typedIpcMain.handle('backup:get-profile', (_event, packageName) =>
    backupService.getProfile(packageName)
  )
}
