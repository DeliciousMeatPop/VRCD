import React from 'react'
import { Spinner } from '@fluentui/react-components'
import { GameDescriptionResult } from '@shared/types'

interface GameDescriptionPanelProps {
  loading: boolean
  result: GameDescriptionResult | null
  labels: { heading: string; loading: string; unavailable: string }
}

const GameDescriptionPanel: React.FC<GameDescriptionPanelProps> = ({ loading, result, labels }) => (
  <section
    aria-busy={loading}
    style={{
      minHeight: 72,
      borderTop: '1px solid rgba(var(--vrcd-neon-raw),0.12)',
      paddingTop: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }}
  >
    <div style={{ fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.1em', color: 'rgba(var(--vrcd-neon-raw),0.6)' }}>
      {'// '}{labels.heading}
    </div>
    {loading ? (
      <Spinner size="tiny" label={labels.loading} />
    ) : result?.status === 'found' ? (
      <>
        <p style={{ margin: 0, color: 'rgba(var(--vrcd-neon-raw),0.78)', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.55 }}>
          {result.text}
        </p>
        {result.source.url ? (
          <a
            href={result.source.url}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--vrcd-purple)', fontFamily: 'monospace', fontSize: 11, alignSelf: 'flex-start' }}
          >
            Source: {result.source.label}
          </a>
        ) : (
          <span style={{ color: 'rgba(var(--vrcd-neon-raw),0.45)', fontFamily: 'monospace', fontSize: 11 }}>
            Source: {result.source.label}
          </span>
        )}
      </>
    ) : (
      <span style={{ color: 'rgba(var(--vrcd-neon-raw),0.35)', fontFamily: 'monospace', fontSize: 12 }}>
        {labels.unavailable}
      </span>
    )}
  </section>
)

export default GameDescriptionPanel
