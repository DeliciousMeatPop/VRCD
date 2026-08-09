import React, { useEffect, useState } from 'react'
import { Spinner } from '@fluentui/react-components'
import { useDependency } from '../hooks/useDependency'
import { useDownload } from '../hooks/useDownload'
import { useSettings } from '../hooks/useSettings'

interface DownloadStorageWarningProps {
  onOpenSettings: () => void
}

const actionButton: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(var(--vrcd-neon-raw),0.65)',
  color: 'var(--vrcd-neon)',
  fontFamily: 'var(--vrcd-font-mono)',
  fontSize: '12px',
  letterSpacing: '0.08em',
  padding: '10px 16px',
  borderRadius: '6px',
  cursor: 'pointer',
  textTransform: 'uppercase'
}

const DownloadStorageWarning: React.FC<DownloadStorageWarningProps> = ({ onOpenSettings }) => {
  const { isReady: dependenciesReady } = useDependency()
  const { storageStatus, retryStorage } = useDownload()
  const { setDownloadPath } = useSettings()
  const [dismissedPath, setDismissedPath] = useState<string | null>(null)
  const [working, setWorking] = useState<'retry' | 'choose' | null>(null)

  useEffect(() => {
    if (storageStatus.state === 'available') setDismissedPath(null)
  }, [storageStatus.state])

  if (!dependenciesReady || storageStatus.state !== 'unavailable') return null

  const dismissed = dismissedPath === storageStatus.path

  const handleRetry = async (): Promise<void> => {
    setWorking('retry')
    try {
      await retryStorage()
    } catch (error) {
      console.error('Failed to recheck download location:', error)
    } finally {
      setWorking(null)
    }
  }

  const handleChoose = async (): Promise<void> => {
    setWorking('choose')
    try {
      const selectedPath = await window.api.dialog.showDirectoryPicker()
      if (!selectedPath) return
      await setDownloadPath(selectedPath)
      await retryStorage()
    } catch (error) {
      console.error('Failed to change download location:', error)
    } finally {
      setWorking(null)
    }
  }

  if (dismissed) {
    return (
      <div
        role="status"
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          padding: '8px 16px',
          background: 'rgba(52, 12, 35, 0.96)',
          borderBottom: '1px solid rgba(var(--vrcd-purple-raw),0.55)',
          color: 'var(--vrcd-purple)',
          fontFamily: 'var(--vrcd-font-mono)',
          fontSize: '12px'
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          Downloads paused — location unavailable: {storageStatus.path}
        </span>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button style={{ ...actionButton, padding: '6px 10px' }} onClick={handleRetry}>
            Retry
          </button>
          <button
            style={{
              ...actionButton,
              padding: '6px 10px',
              borderColor: 'rgba(var(--vrcd-purple-raw),0.7)',
              color: 'var(--vrcd-purple)'
            }}
            onClick={() => {
              onOpenSettings()
            }}
          >
            Review
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="download-storage-warning-title"
      aria-describedby="download-storage-warning-description"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(3px)'
      }}
    >
      <div
        style={{
          width: 'min(620px, 94vw)',
          background: '#030310',
          border: '1px solid rgba(var(--vrcd-purple-raw),0.7)',
          borderRadius: '8px',
          padding: '28px 32px',
          boxShadow: '0 0 55px rgba(var(--vrcd-purple-raw),0.16)',
          fontFamily: 'var(--vrcd-font-mono)'
        }}
      >
        <div
          id="download-storage-warning-title"
          style={{
            color: 'var(--vrcd-purple)',
            fontSize: '20px',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textAlign: 'center',
            textTransform: 'uppercase',
            marginBottom: '18px'
          }}
        >
          [ Download Location Offline ]
        </div>
        <div
          id="download-storage-warning-description"
          style={{
            color: 'var(--vrcd-neon)',
            lineHeight: 1.7,
            textAlign: 'center'
          }}
        >
          The saved download location is not available. This often means an external drive is
          disconnected. Your download queue has been preserved and downloading is paused.
        </div>
        <div
          style={{
            margin: '18px 0 10px',
            padding: '12px',
            border: '1px solid rgba(var(--vrcd-neon-raw),0.2)',
            borderRadius: '5px',
            color: 'rgba(var(--vrcd-neon-raw),0.8)',
            overflowWrap: 'anywhere',
            textAlign: 'center'
          }}
        >
          {storageStatus.path}
        </div>
        {storageStatus.error && (
          <div
            style={{
              color: 'rgba(var(--vrcd-purple-raw),0.78)',
              fontSize: '11px',
              textAlign: 'center',
              overflowWrap: 'anywhere'
            }}
          >
            {storageStatus.code ? `${storageStatus.code}: ` : ''}
            {storageStatus.error}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '10px',
            marginTop: '24px'
          }}
        >
          <button style={actionButton} onClick={handleRetry} disabled={working !== null}>
            {working === 'retry' && <Spinner size="tiny" />}
            {working === 'retry' ? ' Retrying…' : 'Retry Drive'}
          </button>
          <button
            style={{
              ...actionButton,
              borderColor: 'rgba(var(--vrcd-purple-raw),0.7)',
              color: 'var(--vrcd-purple)'
            }}
            onClick={handleChoose}
            disabled={working !== null}
          >
            {working === 'choose' && <Spinner size="tiny" />}
            {working === 'choose' ? ' Choosing…' : 'Choose Another Folder'}
          </button>
          <button
            style={{
              ...actionButton,
              borderColor: 'rgba(var(--vrcd-neon-raw),0.25)',
              color: 'rgba(var(--vrcd-neon-raw),0.65)'
            }}
            onClick={() => setDismissedPath(storageStatus.path)}
            disabled={working !== null}
          >
            Continue Anyway
          </button>
          <button
            style={{
              ...actionButton,
              borderColor: 'rgba(var(--vrcd-neon-raw),0.25)',
              color: 'rgba(var(--vrcd-neon-raw),0.65)'
            }}
            onClick={() => {
              setDismissedPath(storageStatus.path)
              onOpenSettings()
            }}
            disabled={working !== null}
          >
            Open Settings
          </button>
        </div>
      </div>
    </div>
  )
}

export default DownloadStorageWarning
