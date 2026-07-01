import React, { useEffect, useState } from 'react'
import { Dialog, DialogSurface, DialogBody, Button, Text, Spinner } from '@fluentui/react-components'
import {
  CheckmarkCircleRegular,
  DismissCircleRegular,
  ClockRegular
} from '@fluentui/react-icons'
import { BackupVerification, BackupReportResult } from '@shared/types'

const NEON = 'var(--vrcd-neon)'
const BG = '#030310'
const SURFACE_VARS = {
  '--colorNeutralBackground1': BG,
  '--colorNeutralForeground1': NEON,
  '--colorBrandBackground': NEON,
  '--colorNeutralForegroundOnBrand': BG
} as React.CSSProperties

interface RestoreVerifyDialogProps {
  open: boolean
  appLabel: string
  /** Persist the user's answer. */
  onSubmit: (result: BackupVerification) => Promise<void>
  /** Called after a 'failed' answer to file an anonymous report. */
  onReport: () => Promise<BackupReportResult | null>
  onClose: () => void
}

const RestoreVerifyDialog: React.FC<RestoreVerifyDialogProps> = ({
  open,
  appLabel,
  onSubmit,
  onReport,
  onClose
}) => {
  const [busy, setBusy] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [reportResult, setReportResult] = useState<BackupReportResult | null | undefined>(undefined)

  useEffect(() => {
    if (open) {
      setBusy(false)
      setReporting(false)
      setReportResult(undefined)
    }
  }, [open])

  const answer = async (result: BackupVerification): Promise<void> => {
    setBusy(true)
    try {
      await onSubmit(result)
      if (result === 'failed') {
        setReporting(true)
        const res = await onReport()
        setReportResult(res)
        setReporting(false)
        return // keep dialog open to show the report outcome
      }
      onClose()
    } catch (err) {
      console.error('[RestoreVerify] Failed to submit answer:', err)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const btnStyle: React.CSSProperties = {
    justifyContent: 'flex-start',
    width: '100%',
    fontFamily: 'monospace'
  }

  return (
    <Dialog open={open} onOpenChange={(_e, d) => !d.open && onClose()} modalType="modal">
      <DialogSurface
        mountNode={document.getElementById('portal')}
        style={{
          ...SURFACE_VARS,
          background: BG,
          border: `1px solid rgba(var(--vrcd-neon-raw),0.4)`,
          maxWidth: 460,
          width: '90vw',
          padding: 0
        }}
      >
        <DialogBody style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 14,
              fontWeight: 700,
              color: NEON,
              letterSpacing: '0.06em'
            }}
          >
            {'// DID THE RESTORE WORK?'}
          </div>

          {reportResult === undefined ? (
            <>
              <Text style={{ color: 'rgba(var(--vrcd-neon-raw),0.8)', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 }}>
                Save data for <strong style={{ color: NEON }}>{appLabel}</strong> was restored.
                Please open the app on your headset and check that your progress/settings are back,
                then let me know. This helps me make backups more reliable during the BETA.
              </Text>

              {reporting ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Spinner size="tiny" />
                  <Text style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(var(--vrcd-neon-raw),0.8)' }}>
                    Filing an anonymous report...
                  </Text>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Button
                    appearance="primary"
                    icon={<CheckmarkCircleRegular />}
                    style={btnStyle}
                    disabled={busy}
                    onClick={() => answer('worked')}
                  >
                    Yes — my save came back
                  </Button>
                  <Button
                    appearance="secondary"
                    icon={<DismissCircleRegular />}
                    style={{ ...btnStyle, color: '#ff5555', borderColor: 'rgba(255,85,85,0.5)' }}
                    disabled={busy}
                    onClick={() => answer('failed')}
                  >
                    No — it didn&apos;t work (send DMP the log)
                  </Button>
                  <Button
                    appearance="secondary"
                    icon={<ClockRegular />}
                    style={btnStyle}
                    disabled={busy}
                    onClick={() => answer('unsure')}
                  >
                    Not sure — I need more time
                  </Button>
                </div>
              )}

              <Text style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(var(--vrcd-neon-raw),0.45)' }}>
                You can change your answer later from Settings → Save Backups.
              </Text>
            </>
          ) : (
            <>
              <Text style={{ color: 'rgba(var(--vrcd-neon-raw),0.85)', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 }}>
                Thanks. A pre-filled GitHub issue{' '}
                {reportResult ? 'was opened in your browser' : 'could not be opened automatically'}.
                {reportResult?.rentryUrl
                  ? ' The backup log was uploaded anonymously and attached to it.'
                  : ' Please attach your log manually if the report is empty.'}
              </Text>
              {reportResult?.rentryUrl && (
                <Text
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 11,
                    color: NEON,
                    wordBreak: 'break-all',
                    border: '1px solid rgba(var(--vrcd-neon-raw),0.25)',
                    borderRadius: 4,
                    padding: '6px 8px'
                  }}
                >
                  {reportResult.rentryUrl}
                </Text>
              )}
              <Button appearance="primary" style={{ fontFamily: 'monospace' }} onClick={onClose}>
                Close
              </Button>
            </>
          )}
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export default RestoreVerifyDialog
