import React, { useState } from 'react'
import { Button, Text, Spinner } from '@fluentui/react-components'
import {
  ArrowUploadRegular,
  DeleteRegular,
  ArrowClockwiseRegular
} from '@fluentui/react-icons'
import { useAdb } from '@renderer/hooks/useAdb'
import { getBackupBetaAgreed } from '@renderer/hooks/useExtrasSettings'
import { BackupEntry, BackupVerification } from '@shared/types'
import { useBackup } from './useBackup'
import RestoreVerifyDialog from './RestoreVerifyDialog'

const NEON = 'var(--vrcd-neon)'

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

const VERIFY_META: Record<BackupVerification, { label: string; color: string }> = {
  pending: { label: 'NOT CHECKED', color: 'rgba(var(--vrcd-neon-raw),0.45)' },
  worked: { label: 'WORKED ✓', color: 'var(--vrcd-neon)' },
  failed: { label: 'FAILED ✕', color: '#ff5555' },
  unsure: { label: 'UNSURE', color: '#ffaa00' }
}

/**
 * Dedicated save-backup management panel for the Settings modal. Lists every
 * backup with its verification state and lets the user restore, delete, or
 * change/record whether a restore worked (which can file an anonymous report).
 */
const BackupPanel: React.FC = () => {
  const agreed = getBackupBetaAgreed()
  const { selectedDevice, isConnected } = useAdb()
  const { backups, loading, refresh, restore, remove, setVerification, reportFailure } = useBackup()

  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [verifyBackup, setVerifyBackup] = useState<BackupEntry | null>(null)

  if (!agreed) {
    return (
      <div style={{ padding: '10px 6px' }}>
        <Text style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(var(--vrcd-neon-raw),0.5)', lineHeight: 1.6 }}>
          Save Backups are <strong style={{ color: '#ffaa00' }}>disabled</strong>. Enable{' '}
          <strong>&ldquo;Enable Save Backups (BETA)&rdquo;</strong> under{' '}
          <strong>{'// EXTRA SYSTEMS'}</strong> above to use this feature.
        </Text>
      </div>
    )
  }

  const doRestore = async (b: BackupEntry): Promise<void> => {
    if (!selectedDevice) return
    setBusyId(b.id)
    setMessage(null)
    try {
      const res = await restore(b.id, selectedDevice)
      if (res.ok) {
        setMessage({ kind: 'ok', text: `Restore pushed for ${b.appLabel}. Please verify it worked.` })
        setVerifyBackup(b)
      } else {
        setMessage({ kind: 'err', text: res.error ?? 'Restore failed.' })
      }
    } finally {
      setBusyId(null)
    }
  }

  const doDelete = async (b: BackupEntry): Promise<void> => {
    setBusyId(b.id)
    try {
      await remove(b.id)
    } finally {
      setBusyId(null)
    }
  }

  const changeAnswer = async (b: BackupEntry, result: BackupVerification): Promise<void> => {
    await setVerification(b.id, result)
    if (result === 'failed') {
      setMessage({ kind: 'ok', text: 'Filing an anonymous report — a GitHub issue will open in your browser.' })
      await reportFailure(b.id)
    }
  }

  const answerBtn = (b: BackupEntry, result: BackupVerification, label: string): React.ReactNode => (
    <button
      onClick={() => changeAnswer(b, result)}
      style={{
        background: b.verification === result ? 'rgba(var(--vrcd-neon-raw),0.12)' : 'transparent',
        border: `1px solid ${b.verification === result ? VERIFY_META[result].color : 'rgba(var(--vrcd-neon-raw),0.2)'}`,
        color: b.verification === result ? VERIFY_META[result].color : 'rgba(var(--vrcd-neon-raw),0.5)',
        fontFamily: 'monospace',
        fontSize: 10,
        padding: '2px 7px',
        borderRadius: 4,
        cursor: 'pointer'
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ padding: '6px 4px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(var(--vrcd-neon-raw),0.5)', lineHeight: 1.5 }}>
          Back up a game&apos;s save from its details dialog. Manage and restore existing backups here.
        </Text>
        <Button
          appearance="subtle"
          size="small"
          icon={loading ? <Spinner size="tiny" /> : <ArrowClockwiseRegular />}
          onClick={() => void refresh()}
          style={{ fontFamily: 'monospace' }}
        >
          Refresh
        </Button>
      </div>

      {message && (
        <Text style={{ fontFamily: 'monospace', fontSize: 11, color: message.kind === 'ok' ? NEON : '#ff5555' }}>
          {message.text}
        </Text>
      )}

      {backups.length === 0 ? (
        <Text style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(var(--vrcd-neon-raw),0.4)', padding: '8px 0' }}>
          No backups yet.
        </Text>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {backups.map((b) => {
            const meta = VERIFY_META[b.verification]
            const busy = busyId === b.id
            return (
              <div
                key={b.id}
                style={{
                  border: '1px solid rgba(var(--vrcd-neon-raw),0.15)',
                  borderRadius: 6,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 13, color: NEON, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {b.appLabel}
                    </span>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: `var(--vrcd-purple)` }}>
                      {b.packageName}
                    </span>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(var(--vrcd-neon-raw),0.5)' }}>
                      {new Date(b.createdAt).toLocaleString()} · {b.fileCount} files · {formatBytes(b.totalBytes)}
                      {b.deviceModel ? ` · ${b.deviceModel}` : ''}
                    </span>
                    {b.profileApplied && (
                      <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--vrcd-purple)', lineHeight: 1.5 }}>
                        ⚙ custom backup method{b.profileNotes ? ` — ${b.profileNotes}` : ''}
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 10,
                      fontWeight: 700,
                      color: meta.color,
                      border: `1px solid ${meta.color}`,
                      borderRadius: 4,
                      padding: '1px 6px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {meta.label}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Button
                    appearance="secondary"
                    size="small"
                    icon={busy ? <Spinner size="tiny" /> : <ArrowUploadRegular />}
                    onClick={() => doRestore(b)}
                    disabled={busy || !isConnected || !selectedDevice}
                  >
                    Restore
                  </Button>
                  <Button
                    appearance="secondary"
                    size="small"
                    icon={<DeleteRegular />}
                    style={{ color: '#ff5555', borderColor: 'rgba(255,85,85,0.5)' }}
                    onClick={() => doDelete(b)}
                    disabled={busy}
                  >
                    Delete
                  </Button>
                </div>

                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(var(--vrcd-neon-raw),0.45)' }}>
                    Did a restore work?
                  </span>
                  {answerBtn(b, 'worked', 'Yes')}
                  {answerBtn(b, 'failed', 'No')}
                  {answerBtn(b, 'unsure', 'Not sure')}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <RestoreVerifyDialog
        open={!!verifyBackup}
        appLabel={verifyBackup?.appLabel ?? ''}
        onSubmit={async (result: BackupVerification) => {
          if (verifyBackup) await setVerification(verifyBackup.id, result)
        }}
        onReport={async () => (verifyBackup ? reportFailure(verifyBackup.id) : null)}
        onClose={() => setVerifyBackup(null)}
      />
    </div>
  )
}

export default BackupPanel
