import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Spinner } from '@fluentui/react-components'

interface GameCoverLightboxProps {
  src: string
  alt: string
  isPlaceholder: boolean
  loading: boolean
  labels: { open: string; close: string }
}

const coverStyle: React.CSSProperties = {
  width: 140,
  height: 140,
  objectFit: 'cover',
  borderRadius: 8,
  border: '1px solid rgba(var(--vrcd-neon-raw),0.3)',
  display: 'block'
}

const GameCoverLightbox: React.FC<GameCoverLightboxProps> = ({
  src,
  alt,
  isPlaceholder,
  loading,
  labels
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const close = (): void => {
    setIsOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen])

  const image = <img src={src} alt={alt} style={coverStyle} />
  const content = isPlaceholder ? (
    image
  ) : (
    <button
      ref={triggerRef}
      type="button"
      aria-label={labels.open}
      title={labels.open}
      onClick={() => setIsOpen(true)}
      style={{
        padding: 0,
        border: 0,
        borderRadius: 8,
        background: 'transparent',
        cursor: 'zoom-in'
      }}
    >
      {image}
    </button>
  )

  return (
    <div style={{ position: 'relative', width: 140, height: 140 }}>
      {content}
      {loading && (
        <div
          aria-label="Loading description"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 8,
            background: 'rgba(3,3,16,0.68)',
            pointerEvents: 'none'
          }}
        >
          <Spinner size="small" />
        </div>
      )}
      {isOpen &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={alt}
            onClick={close}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10000,
              display: 'grid',
              placeItems: 'center',
              padding: 28,
              background: 'rgba(0, 0, 0, 0.88)',
              cursor: 'zoom-out'
            }}
          >
            <img
              src={src}
              alt={alt}
              style={{
                width: 'min(70vw, 480px)',
                height: 'min(70vh, 480px)',
                maxWidth: '92vw',
                maxHeight: '92vh',
                objectFit: 'contain',
                borderRadius: 8
              }}
            />
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                right: 20,
                top: 16,
                color: 'white',
                fontFamily: 'monospace',
                fontSize: 12
              }}
            >
              {labels.close}
            </span>
          </div>,
          document.body
        )}
    </div>
  )
}

export default GameCoverLightbox
