import React, { useMemo, useState } from 'react'
import { Button, Text, Spinner } from '@fluentui/react-components'
import {
  SaveRegular,
  ArrowUploadRegular,
  HistoryRegular
} from '@fluentui/react-icons'
import { useAdb } from '@renderer/hooks/useAdb'
import { getBackupBetaAgreed } from '@renderer/hooks/useExtrasSettings'
import { BackupVerification } from '@shared/types'
import { useBackup } from './useBackup'
import RestoreVerifyDialog from './RestoreVerifyDialog'

interface GameSaveBackupControlsProps {
  packageName: string
  appLabel: string
  isInstalled: boolean
}

/**
 * Per-game save backup/restore controls, embedded in the Game Details dialog.
 * Gated behind the BETA agreement. Restores the most recent backup for the
 * game's package; full backup management lives in Settings → Save Backups.
 */
const GameSaveBackupControls: React.FC<GameSaveBackupControlsProps> = ({
  packageName,
  appLabel,
  isInstalled
}) => {
  const agreed = getBackupBetaAgreed()
  const { selectedDevice, isConnected } = useAdb()
  const { backups, create, restore, setVerification, reportFailure } = useBackup()

  const [busy, setBusy] = useState<'backup' | 'restore' | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [verifyBackupId, setVerifyBackupId] = useState<string | null>(null)

  const latestForPackage = useMemo(
    () => backups.find((b) => b.packageName === packageName) ?? null,
    [backups, packageName]
  )

  if (!packageName) return null

  if (!agreed) {
    return (
      <div
        style={{
          borderTop: '1px solid rgba(var(--vrcd-neon-raw),0.12)',
          paddingTop: 12,
          marginTop: 4
        }}
      >
        <div style={{ fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.1em', color: 'rgba(var(--vrcd-neon-raw),0.6)', marginBottom: 6 }}>
          {'// SAVE BACKUP '}<span style={{ color: '#ffaa00' }}>[BETA]</span>
        </div>
        <Text style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(var(--vrcd-neon-raw),0.4)' }}>
          Disabled. Enable Save Backups in Settings → Extra Options to use this.
        </Text>
      </div>
    )
  }

  const doBackup = async (): Promise<void> => {
    if (!selectedDevice) return
    setBusy('backup')
    setMessage(null)
    try {
      const res = await create(selectedDevice, packageName, appLabel)
      if (res.ok) {
        setMessage({ kind: 'ok', text: `Backed up ${res.backup?.fileCount ?? 0} file(s).` })
      } else {
        setMessage({ kind: 'err', text: res.error ?? 'Backup failed.' })
      }
    } finally {
      setBusy(null)
    }
  }

  const doRestore = async (): Promise<void> => {
    if (!selectedDevice || !latestForPackage) return
    setBusy('restore')
    setMessage(null)
    try {
      const res = await restore(latestForPackage.id, selectedDevice)
      if (res.ok) {
        setMessage({ kind: 'ok', text: 'Restore pushed. Please verify it worked.' })
        setVerifyBackupId(latestForPackage.id)
        setVerifyOpen(true)
      } else {
        setMessage({ kind: 'err', text: res.error ?? 'Restore failed.' })
      }
    } finally {
      setBusy(null)
    }
  }

  const canAct = isConnected && !!selectedDevice && !busy

  return (
    <div style={{ borderTop: '1px solid rgba(var(--vrcd-neon-raw),0.12)', paddingTop: 12, marginTop: 4 }}>
      <div style={{ fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.1em', color: 'rgba(var(--vrcd-neon-raw),0.6)', marginBottom: 8 }}>
        {'// SAVE BACKUP '}<span style={{ color: '#ffaa00' }}>[BETA]</span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button
          appearance="secondary"
          icon={busy === 'backup' ? <Spinner size="tiny" /> : <SaveRegular />}
          onClick={doBackup}
          disabled={!canAct || !isInstalled}
        >
          Back up save
        </Button>
        <Button
          appearance="secondary"
          icon={busy === 'restore' ? <Spinner size="tiny" /> : <ArrowUploadRegular />}
          onClick={doRestore}
          disabled={!canAct || !latestForPackage}
        >
          Restore save
        </Button>
        {latestForPackage && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'monospace', fontSize: 10, color: 'rgba(var(--vrcd-neon-raw),0.5)' }}>
            <HistoryRegular fontSize={12} />
            last: {new Date(latestForPackage.createdAt).toLocaleString()}
          </span>
        )}
      </div>

      {!isInstalled && (
        <Text style={{ display: 'block', marginTop: 6, fontFamily: 'monospace', fontSize: 10, color: 'rgba(var(--vrcd-neon-raw),0.4)' }}>
          Install the app first to back up its save data.
        </Text>
      )}
      {!isConnected && (
        <Text style={{ display: 'block', marginTop: 6, fontFamily: 'monospace', fontSize: 10, color: 'rgba(var(--vrcd-neon-raw),0.4)' }}>
          Connect a headset to back up or restore.
        </Text>
      )}
      {message && (
        <Text
          style={{
            display: 'block',
            marginTop: 6,
            fontFamily: 'monospace',
            fontSize: 11,
            color: message.kind === 'ok' ? 'var(--vrcd-neon)' : '#ff5555'
          }}
        >
          {message.text}
        </Text>
      )}

      <RestoreVerifyDialog
        open={verifyOpen}
        appLabel={appLabel}
        onSubmit={async (result: BackupVerification) => {
          if (verifyBackupId) await setVerification(verifyBackupId, result)
        }}
        onReport={async () => (verifyBackupId ? reportFailure(verifyBackupId) : null)}
        onClose={() => setVerifyOpen(false)}
      />
    </div>
  )
}

export default GameSaveBackupControls
