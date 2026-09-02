// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import IntroAnimation from './IntroAnimation'

vi.mock('../utils/matrixUsername', () => ({ getMatrixUsername: () => 'codex' }))
vi.mock('../hooks/useSoundEffects', () => ({ playSoundOnce: () => undefined }))

describe('IntroAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    window.api = {
      app: {
        getVersion: vi.fn().mockResolvedValue('1.0.0'),
        getSystemUsername: vi.fn().mockResolvedValue('codex')
      }
    } as unknown as typeof window.api
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('completes when React development Strict Mode replays its effect', async () => {
    const onComplete = vi.fn()
    render(
      <StrictMode>
        <IntroAnimation onComplete={onComplete} />
      </StrictMode>
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000)
    })

    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
