import { describe, expect, it } from 'vitest'
import {
  hasVrSignal,
  normalizeGameTitle,
  titlesMatch,
  truncateDescription
} from './descriptionText'

describe('game description text rules', () => {
  it('normalizes only harmless title differences', () => {
    expect(normalizeGameTitle('RUMBLE™ (video game)')).toBe('rumble')
    expect(titlesMatch('Puzzling Places®', 'Puzzling Places (video game)')).toBe(true)
    expect(titlesMatch('Breachers', 'Breachers VR')).toBe(true)
    expect(titlesMatch('Motion Soccer', 'Motionsoccer')).toBe(true)
    expect(titlesMatch('RUMBLE', 'Royal Rumble')).toBe(false)
    expect(titlesMatch('RUMBLE', 'RUMBLE 2')).toBe(false)
    expect(titlesMatch('Arizona Sunshine', 'Arizona Sunshine 2')).toBe(false)
    expect(titlesMatch('Beat Saber', 'Beat Saber Demo')).toBe(false)
    expect(titlesMatch('VR Karts', 'Karts')).toBe(false)
    expect(titlesMatch('VR', '')).toBe(false)
    expect(titlesMatch('', '')).toBe(false)
    expect(titlesMatch('A lone', 'Alone')).toBe(false)
    expect(titlesMatch('Spatial Flashcards', 'SpatialFlashcards')).toBe(true)
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
})
