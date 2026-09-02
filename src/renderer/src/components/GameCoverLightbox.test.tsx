// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import GameCoverLightbox from './GameCoverLightbox'

afterEach(cleanup)

describe('GameCoverLightbox', () => {
  it('opens the real thumbnail and closes when the enlarged image is clicked', () => {
    render(
      <GameCoverLightbox
        src="file:///game.jpg"
        alt="Puzzling Places"
        isPlaceholder={false}
        loading={false}
        labels={{ open: 'Enlarge cover', close: 'Close enlarged cover' }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Enlarge cover' }))
    const dialog = screen.getByRole('dialog', { name: 'Puzzling Places' })
    expect(dialog).toBeTruthy()
    const enlargedImage = within(dialog).getByRole('img', { name: 'Puzzling Places' })
    expect(enlargedImage.style.width).toBe('min(70vw, 480px)')

    fireEvent.click(enlargedImage)
    expect(screen.queryByRole('dialog', { name: 'Puzzling Places' })).toBeNull()
  })

  it('closes on Escape and keeps placeholders non-interactive', () => {
    const { rerender } = render(
      <GameCoverLightbox
        src="file:///game.jpg"
        alt="Puzzling Places"
        isPlaceholder={false}
        loading={false}
        labels={{ open: 'Enlarge cover', close: 'Close enlarged cover' }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Enlarge cover' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()

    rerender(
      <GameCoverLightbox
        src="file:///placeholder.jpg"
        alt="No cover"
        isPlaceholder
        loading={false}
        labels={{ open: 'Enlarge cover', close: 'Close enlarged cover' }}
      />
    )
    expect(screen.queryByRole('button', { name: 'Enlarge cover' })).toBeNull()
  })
})
