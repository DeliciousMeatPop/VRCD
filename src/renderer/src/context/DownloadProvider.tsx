import React, { ReactNode, useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { DownloadContext, DownloadContextType } from './DownloadContext'
import {
  DownloadItem,
  DownloadStorageStatus,
  GameInfo,
  ExistingDownloadAction
} from '@shared/types'
import { playSound } from '../hooks/useSoundEffects'

interface DownloadProviderProps {
  children: ReactNode
}

interface PendingPrompt {
  game: GameInfo
  resolve: (success: boolean) => void
}

export const DownloadProvider: React.FC<DownloadProviderProps> = ({ children }) => {
  const [queue, setQueue] = useState<DownloadItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [storageStatus, setStorageStatus] = useState<DownloadStorageStatus>({
    path: '',
    state: 'checking',
    error: null,
    code: null
  })
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null)
  const [rememberChoice, setRememberChoice] = useState<boolean>(false)
  // Prevent double-resolving the prompt promise if the user clicks twice
  const resolvedRef = useRef(false)
  // Release names we've already fired a "download complete" notification for, so
  // each completion notifies exactly once. This must persist across queue-update
  // events, so it lives in a ref: the onQueueUpdated effect runs once, so reading
  // `queue` state from inside its closure sees a permanently stale value (the
  // empty initial queue) and treats every already-completed item as newly
  // completed on every update — which spammed the click sound and Windows
  // notifications the moment the first of several parallel downloads finished (#31).
  const notifiedCompletedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)

    Promise.all([window.api.downloads.getQueue(), window.api.downloads.getStorageStatus()])
      .then(([initialQueue, initialStorageStatus]) => {
        if (isMounted) {
          // Seed the notified set from items already Completed at load time, so
          // downloads that finished in a previous session don't fire a
          // notification the first time the queue updates.
          notifiedCompletedRef.current = new Set(
            initialQueue.filter((i) => i.status === 'Completed').map((i) => i.releaseName)
          )
          setQueue(initialQueue)
          setStorageStatus(initialStorageStatus)
        }
      })
      .catch((err) => {
        console.error('Error fetching initial download queue:', err)
        if (isMounted) setError('Failed to load download queue')
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    const removeUpdateListener = window.api.downloads.onQueueUpdated((updatedQueue) => {
      // Fire the notification + sound once per completion. Track which releases
      // we've already notified in a ref (see notifiedCompletedRef) so this
      // survives across events — a fresh compare against component state here
      // would be stale and re-notify on every update.
      const notified = notifiedCompletedRef.current
      const stillCompleted = new Set<string>()
      for (const item of updatedQueue) {
        if (item.status !== 'Completed') continue
        stillCompleted.add(item.releaseName)
        if (notified.has(item.releaseName)) continue
        notified.add(item.releaseName)
        playSound('click')
        try {
          window.api.app.showNotification(
            'Download Complete',
            `${item.gameName} finished downloading.`
          )
        } catch {
          /* ignore */
        }
      }
      // Forget releases that are no longer Completed (removed, or re-downloading)
      // so a later re-completion of the same release notifies again.
      for (const name of notified) {
        if (!stillCompleted.has(name)) notified.delete(name)
      }
      setQueue(updatedQueue)
      setError(null)
    })
    const removeStorageListener = window.api.downloads.onStorageStatusChanged((status) => {
      setStorageStatus(status)
      if (status.state === 'available') setError(null)
    })

    return () => {
      isMounted = false
      removeUpdateListener()
      removeStorageListener()
    }
  }, [])

  const addToQueue = useCallback(async (game: GameInfo): Promise<boolean> => {
    console.log(`Context: Adding ${game.releaseName} to queue...`)
    try {
      const result = await window.api.downloads.addToQueue(game)
      if (result === 'added' || result === 'imported') return true
      if (result === 'storage-unavailable') {
        setError('The configured download location is unavailable. Downloads are paused.')
        return false
      }
      if (result === 'duplicate') {
        console.warn(
          `Context: Failed to add ${game.releaseName} to queue (likely already present).`
        )
        return false
      }
      // 'needs-prompt' — open the dialog and wait for the user
      resolvedRef.current = false
      setRememberChoice(false)
      return await new Promise<boolean>((resolve) => {
        setPendingPrompt({ game, resolve })
      })
    } catch (err) {
      console.error('Error adding game to download queue via IPC:', err)
      setError(`Failed to add ${game.name} to queue.`)
      return false
    }
  }, [])

  const retryStorage = useCallback(async (): Promise<DownloadStorageStatus> => {
    const status = await window.api.downloads.retryStorage()
    setStorageStatus(status)
    return status
  }, [])

  const settleResolveExisting = useCallback(
    async (action: 'reinstall' | 'redownload') => {
      const prompt = pendingPrompt
      if (!prompt || resolvedRef.current) return
      resolvedRef.current = true
      try {
        if (rememberChoice) {
          // Persist the choice so future clicks skip the dialog.
          const settingValue: ExistingDownloadAction = action
          await window.api.settings.setExistingDownloadAction(settingValue)
        }
        const result = await window.api.downloads.addToQueueResolveExisting(prompt.game, action)
        if (result === 'storage-unavailable') {
          setError('The configured download location is unavailable. Downloads are paused.')
        }
        prompt.resolve(result === 'added' || result === 'imported')
      } catch (err) {
        console.error('Error resolving existing-download prompt:', err)
        setError(`Failed to add ${prompt.game.name} to queue.`)
        prompt.resolve(false)
      } finally {
        setPendingPrompt(null)
        setRememberChoice(false)
      }
    },
    [pendingPrompt, rememberChoice]
  )

  const cancelPrompt = useCallback(() => {
    const prompt = pendingPrompt
    if (!prompt || resolvedRef.current) return
    resolvedRef.current = true
    prompt.resolve(false)
    setPendingPrompt(null)
    setRememberChoice(false)
  }, [pendingPrompt])

  const removeFromQueue = useCallback(async (releaseName: string): Promise<void> => {
    try {
      await window.api.downloads.removeFromQueue(releaseName)
    } catch (err) {
      console.error('Error removing game from download queue via IPC:', err)
      setError('Failed to remove item from queue.')
    }
  }, [])

  const removeFromQueueOnly = useCallback(async (releaseName: string): Promise<void> => {
    try {
      await window.api.downloads.removeFromQueueOnly(releaseName)
    } catch (err) {
      console.error('Error removing game from download queue (keep files) via IPC:', err)
      setError('Failed to remove item from queue.')
    }
  }, [])

  const moveToFront = useCallback(async (releaseName: string): Promise<boolean> => {
    try {
      return await window.api.downloads.moveToFront(releaseName)
    } catch (err) {
      console.error('Error moving item to front of queue via IPC:', err)
      setError('Failed to bump item to front.')
      return false
    }
  }, [])

  const moveQueuedUp = useCallback(async (releaseName: string): Promise<boolean> => {
    try {
      return await window.api.downloads.moveQueuedUp(releaseName)
    } catch (err) {
      console.error('Error moving item up via IPC:', err)
      setError('Failed to move item up.')
      return false
    }
  }, [])

  const moveQueuedDown = useCallback(async (releaseName: string): Promise<boolean> => {
    try {
      return await window.api.downloads.moveQueuedDown(releaseName)
    } catch (err) {
      console.error('Error moving item down via IPC:', err)
      setError('Failed to move item down.')
      return false
    }
  }, [])

  const cancelDownload = useCallback((releaseName: string): void => {
    try {
      window.api.downloads.cancelUserRequest(releaseName)
    } catch (err) {
      console.error('Error cancelling download via IPC:', err)
      setError('Failed to cancel download.')
    }
  }, [])

  const retryDownload = useCallback((releaseName: string): void => {
    try {
      window.api.downloads.retryDownload(releaseName)
    } catch (err) {
      console.error('Error retrying download via IPC:', err)
      setError('Failed to retry download.')
    }
  }, [])

  const pauseDownload = useCallback((releaseName: string): void => {
    try {
      window.api.downloads.pauseDownload(releaseName)
    } catch (err) {
      console.error('Error pausing download via IPC:', err)
      setError('Failed to pause download.')
    }
  }, [])

  const resumeDownload = useCallback((releaseName: string): void => {
    try {
      window.api.downloads.resumeDownload(releaseName)
    } catch (err) {
      console.error('Error resuming download via IPC:', err)
      setError('Failed to resume download.')
    }
  }, [])

  const deleteFiles = useCallback(async (releaseName: string): Promise<boolean> => {
    try {
      const success = await window.api.downloads.deleteDownloadedFiles(releaseName)
      if (!success) setError('Failed to delete downloaded files.')
      return success
    } catch (err) {
      console.error('Error deleting downloaded files via IPC:', err)
      setError('Failed to delete downloaded files.')
      return false
    }
  }, [])

  const value = useMemo<DownloadContextType>(
    () => ({
      queue,
      isLoading,
      error,
      storageStatus,
      retryStorage,
      addToQueue,
      removeFromQueue,
      removeFromQueueOnly,
      moveToFront,
      moveQueuedUp,
      moveQueuedDown,
      cancelDownload,
      retryDownload,
      pauseDownload,
      resumeDownload,
      deleteFiles
    }),
    [
      queue,
      isLoading,
      error,
      storageStatus,
      retryStorage,
      addToQueue,
      removeFromQueue,
      removeFromQueueOnly,
      moveToFront,
      moveQueuedUp,
      moveQueuedDown,
      cancelDownload,
      retryDownload,
      pauseDownload,
      resumeDownload,
      deleteFiles
    ]
  )

  return (
    <DownloadContext.Provider value={value}>
      {children}
      {pendingPrompt && (
        <ExistingDownloadPromptDialog
          gameName={pendingPrompt.game.name || pendingPrompt.game.releaseName}
          releaseName={pendingPrompt.game.releaseName}
          remember={rememberChoice}
          onToggleRemember={setRememberChoice}
          onChoose={settleResolveExisting}
          onCancel={cancelPrompt}
        />
      )}
    </DownloadContext.Provider>
  )
}

// ─── Dialog ─────────────────────────────────────────────────────────────────

interface PromptDialogProps {
  gameName: string
  releaseName: string
  remember: boolean
  onToggleRemember: (v: boolean) => void
  onChoose: (action: 'reinstall' | 'redownload') => void
  onCancel: () => void
}

const ExistingDownloadPromptDialog: React.FC<PromptDialogProps> = ({
  gameName,
  releaseName,
  remember,
  onToggleRemember,
  onChoose,
  onCancel
}) => {
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
          border: '1px solid rgba(var(--vrcd-neon-raw),0.45)',
          maxWidth: '560px',
          width: '92vw',
          fontFamily: 'var(--vrcd-font-mono)',
          borderRadius: '8px',
          padding: '24px 28px',
          boxShadow:
            '0 0 50px rgba(var(--vrcd-neon-raw),0.10), 0 0 80px rgba(var(--vrcd-purple-raw),0.08)'
        }}
      >
        <div
          style={{
            fontSize: '18px',
            color: 'var(--vrcd-purple)',
            letterSpacing: '0.1em',
            fontWeight: 700,
            textAlign: 'center',
            textShadow:
              '0 0 10px rgba(var(--vrcd-purple-raw),0.7), 0 0 24px rgba(var(--vrcd-purple-raw),0.3)',
            marginBottom: '14px',
            textTransform: 'uppercase'
          }}
        >
          [ FILES ALREADY ON DISK ]
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
          A complete copy of <strong>{gameName}</strong> already exists in your downloads folder.
          <br />
          <span
            style={{
              color: 'rgba(var(--vrcd-neon-raw),0.55)',
              fontSize: '11px'
            }}
          >
            {releaseName}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <PromptButton
            color="neon"
            title="Use the existing files. Skip the download and head straight to install."
            onClick={() => onChoose('reinstall')}
          >
            INSTALL FROM EXISTING FILES
          </PromptButton>
          <PromptButton
            color="purple"
            title="Wipe the existing folder and download a fresh copy from the server."
            onClick={() => onChoose('redownload')}
          >
            RE-DOWNLOAD (REPLACES FILES)
          </PromptButton>
          <PromptButton color="dim" onClick={onCancel}>
            CANCEL
          </PromptButton>
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
            checked={remember}
            onChange={(e) => onToggleRemember(e.target.checked)}
            style={{ accentColor: 'var(--vrcd-neon)' }}
          />
          Remember my choice (Settings → When download already exists)
        </label>
      </div>
    </div>
  )
}

const PromptButton: React.FC<{
  children: React.ReactNode
  onClick: () => void
  title?: string
  color: 'neon' | 'purple' | 'dim'
}> = ({ children, onClick, title, color }) => {
  const [hovered, setHovered] = React.useState(false)
  const raw =
    color === 'purple'
      ? 'var(--vrcd-purple-raw)'
      : color === 'neon'
        ? 'var(--vrcd-neon-raw)'
        : 'var(--vrcd-neon-raw)'
  const fg =
    color === 'purple'
      ? 'var(--vrcd-purple)'
      : color === 'neon'
        ? 'var(--vrcd-neon)'
        : 'rgba(var(--vrcd-neon-raw),0.7)'
  const dimMode = color === 'dim'
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered && !dimMode ? `rgba(${raw},0.12)` : 'transparent',
        border: `${dimMode ? 1 : 2}px solid ${dimMode ? `rgba(${raw},0.3)` : `rgba(${raw},0.7)`}`,
        color: fg,
        fontFamily: 'var(--vrcd-font-mono)',
        fontSize: '13px',
        letterSpacing: '0.1em',
        padding: '12px 0',
        borderRadius: '6px',
        cursor: 'pointer',
        textTransform: 'uppercase',
        boxShadow: hovered && !dimMode ? `0 0 12px rgba(${raw},0.25)` : 'none',
        transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s'
      }}
    >
      {children}
    </button>
  )
}
