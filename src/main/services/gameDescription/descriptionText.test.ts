import { describe, expect, it } from 'vitest'
import {
  hasVrSignal,
  normalizeGameTitle,
  readImageDimensions,
  titlesMatch,
  truncateDescription
} from './descriptionText'

describe('game description text rules', () => {
  it('normalizes only harmless title differences', () => {
    expect(normalizeGameTitle('RUMBLE™ (video game)')).toBe('rumble')
    expect(titlesMatch('Puzzling Places®', 'Puzzling Places (video game)')).toBe(true)
    expect(titlesMatch('RUMBLE', 'Royal Rumble')).toBe(false)
  })

  it('requires a VR-specific signal before accepting a source description', () => {
    expect(hasVrSignal('A virtual reality puzzle game for Meta Quest.')).toBe(true)
    expect(hasVrSignal('A mobile puzzle game for Android.')).toBe(false)
  })

  it('keeps descriptions to three sentences and 500 characters', () => {
    const description = [
      'First sentence is short.',
      'Second sentence is short.',
      'Third sentence is short.',
      'Fourth sentence must not appear.'
    ].join(' ')

    expect(truncateDescription(description)).toBe(
      'First sentence is short. Second sentence is short. Third sentence is short.'
    )

    const veryLong = `A ${'very '.repeat(160)}long sentence.`
    expect(truncateDescription(veryLong).length).toBeLessThanOrEqual(500)
  })

  it('reads JPEG dimensions so eager source metadata needs a genuinely usable cover', () => {
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x40, 0x02, 0x00, 0x03, 0x01, 0x11, 0x00,
      0xff, 0xd9
    ])

    expect(readImageDimensions(jpeg)).toEqual({ width: 512, height: 320 })
  })
})
