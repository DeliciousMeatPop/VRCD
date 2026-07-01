import React, { useEffect, useState } from 'react'
import { Dialog, DialogSurface, DialogBody, Button, Text, Checkbox } from '@fluentui/react-components'
import { WarningRegular } from '@fluentui/react-icons'

const NEON = 'var(--vrcd-neon)'
const BG = '#030310'
const SURFACE_VARS = {
  '--colorNeutralBackground1': BG,
  '--colorNeutralForeground1': NEON,
  '--colorBrandBackground': NEON,
  '--colorNeutralForegroundOnBrand': BG
} as React.CSSProperties

interface BackupBetaWarningDialogProps {
  open: boolean
  onAgree: () => void
  onCancel: () => void
}

/**
 * Consent gate for the experimental save-backup feature. The user must tick the
 * acknowledgement box before they can enable backups. Declining leaves the
 * feature disabled (greyed out) until they opt in from Extra Options.
 */
const BackupBetaWarningDialog: React.FC<BackupBetaWarningDialogProps> = ({
  open,
  onAgree,
  onCancel
}) => {
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (open) setChecked(false)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(_e, d) => !d.open && onCancel()} modalType="alert">
      <DialogSurface
        mountNode={document.getElementById('portal')}
        style={{
          ...SURFACE_VARS,
          background: BG,
          border: '1px solid rgba(255,170,0,0.5)',
          maxWidth: 500,
          width: '90vw',
          padding: 0
        }}
      >
        <DialogBody style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: 'monospace',
              fontSize: 14,
              fontWeight: 700,
              color: '#ffaa00',
              letterSpacing: '0.06em'
            }}
          >
            <WarningRegular fontSize={18} />
            SAVE BACKUPS — EXPERIMENTAL BETA
          </div>

          <Text style={{ color: 'rgba(var(--vrcd-neon-raw),0.85)', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.7 }}>
            This is an <strong style={{ color: '#ffaa00' }}>experimental BETA</strong> feature.
            While I&apos;m doing everything I can to make sure it doesn&apos;t happen, it is{' '}
            <strong style={{ color: '#ffaa00' }}>POSSIBLE that you could lose your save data</strong>.
            Back up anything you truly can&apos;t afford to lose by other means too.
            <br />
            <br />
            By enabling this feature you accept that risk. You can turn it back off at any time
            from Settings → Extra Options.
          </Text>

          <Checkbox
            checked={checked}
            onChange={(_e, d) => setChecked(!!d.checked)}
            label={
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: NEON }}>
                I understand and accept that I could lose my save data.
              </span>
            }
          />

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button appearance="secondary" style={{ fontFamily: 'monospace' }} onClick={onCancel}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              style={{ fontFamily: 'monospace' }}
              disabled={!checked}
              onClick={onAgree}
            >
              Enable Save Backups
            </Button>
          </div>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export default BackupBetaWarningDialog
