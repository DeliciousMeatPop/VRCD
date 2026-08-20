// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import GameDescriptionPanel from './GameDescriptionPanel'

afterEach(cleanup)

describe('GameDescriptionPanel', () => {
  it('reserves its description area and shows a spinner while a lazy lookup is running', () => {
    render(
      <GameDescriptionPanel
        loading
        result={null}
        labels={{ heading: 'DESCRIPTION', loading: 'Loading description…', unavailable: 'No description available.' }}
      />
    )

    expect(screen.getByText(/DESCRIPTION/)).toBeTruthy()
    expect(screen.getByLabelText('Loading description…')).toBeTruthy()
  })

  it('renders plain text with its source link', () => {
    render(
      <GameDescriptionPanel
        loading={false}
        result={{
          status: 'found',
          text: 'A virtual reality puzzle game.',
          source: { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Test' },
          language: 'en',
          fetchedAt: 1
        }}
        labels={{ heading: 'DESCRIPTION', loading: 'Loading description…', unavailable: 'No description available.' }}
      />
    )

    expect(screen.getByText('A virtual reality puzzle game.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Source: Wikipedia' }).getAttribute('href')).toBe(
      'https://en.wikipedia.org/wiki/Test'
    )
  })
})
