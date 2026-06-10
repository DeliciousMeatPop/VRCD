import React, { useState } from 'react'

interface UninstallWarningDialogProps {
  appName: string
  onConfirm: (dontShowAgain: boolean) => void
  onCancel: () => void
}

/**
 * Confirmation shown before any "Uninstall" action. Uninstalling an app on
 * the headset also wipes its save data and settings, so this is a deliberate
 * extra step rather than a silent action - with an opt-out for users who
 * don't want to see it again (toggleable back on in Settings).
 */
const UninstallWarningDialog: React.FC<UninstallWarningDialogProps> = ({
  appName,
  onConfirm,
  onCancel
}) => {
  const [dontShowAgain, setDontShowAgain] = useState(false)

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(2px)'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#030310',
          border: '1px solid rgba(255,85,85,0.5)',
          maxWidth: '520px',
          width: '92vw',
          fontFamily: 'var(--vrcd-font-mono)',
          borderRadius: '8px',
          padding: '24px 28px',
          boxShadow: '0 0 50px rgba(255,85,85,0.12), 0 0 80px rgba(var(--vrcd-purple-raw),0.08)'
        }}
      >
        <div
          style={{
            fontSize: '18px',
            color: '#ff5555',
            letterSpacing: '0.1em',
            fontWeight: 700,
            textAlign: 'center',
            textShadow: '0 0 10px rgba(255,85,85,0.6), 0 0 24px rgba(255,85,85,0.25)',
            marginBottom: '14px',
            textTransform: 'uppercase'
          }}
        >
          [ CONFIRM UNINSTALL ]
        </div>
        <div
          style={{
            fontSize: '13px',
            color: 'var(--vrcd-neon)',
            lineHeight: 1.6,
            textAlign: 'center',
            textShadow: '0 0 6px rgba(var(--vrcd-neon-raw),0.35)',
            marginBottom: '18px'
          }}
        >
          Uninstalling <strong>{appName}</strong> will remove the app from the headset
          <br />
          <strong style={{ color: '#ff5555' }}>and erase its save data, progress, and settings.</strong>
          <br />
          <span style={{ color: 'rgba(var(--vrcd-neon-raw),0.55)', fontSize: '11px' }}>
            This cannot be undone.
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            onClick={() => onConfirm(dontShowAgain)}
            style={{
              background: 'transparent',
              border: '2px solid rgba(255,85,85,0.7)',
              color: '#ff5555',
              fontFamily: 'var(--vrcd-font-mono)',
              fontSize: '13px',
              letterSpacing: '0.1em',
              padding: '12px 0',
              borderRadius: '6px',
              cursor: 'pointer',
              textTransform: 'uppercase'
            }}
          >
            Uninstall (Erase Save Data)
          </button>
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: '2px solid rgba(var(--vrcd-neon-raw),0.7)',
              color: 'var(--vrcd-neon)',
              fontFamily: 'var(--vrcd-font-mono)',
              fontSize: '13px',
              letterSpacing: '0.1em',
              padding: '12px 0',
              borderRadius: '6px',
              cursor: 'pointer',
              textTransform: 'uppercase'
            }}
          >
            Cancel
          </button>
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '16px',
            fontSize: '11px',
            color: 'rgba(var(--vrcd-neon-raw),0.6)',
            cursor: 'pointer',
            justifyContent: 'center'
          }}
        >
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            style={{ accentColor: 'var(--vrcd-neon)' }}
          />
          Don&apos;t show this again (re-enable in Settings)
        </label>
      </div>
    </div>
  )
}

export default UninstallWarningDialog
