import { describe, expect, it } from 'vitest'
import { buildTrailerReportUrl } from './trailerReport'

describe('buildTrailerReportUrl', () => {
  it('pre-fills the Wrong Trailer form fields', () => {
    const url = new URL(
      buildTrailerReportUrl({
        gameName: 'Beat Saber & Friends',
        packageName: 'com.beatgames.beatsaber',
        currentTrailerUrl: 'https://www.youtube.com/watch?v=abcdefghijk'
      })
    )

    expect(url.origin + url.pathname).toBe('https://github.com/DeliciousMeatPop/VRCD/issues/new')
    expect(url.searchParams.get('template')).toBe('trailer_report.yml')
    expect(url.searchParams.get('title')).toBe('[Trailer] Beat Saber & Friends')
    expect(url.searchParams.get('game_name')).toBe('Beat Saber & Friends')
    expect(url.searchParams.get('package_name')).toBe('com.beatgames.beatsaber')
    expect(url.searchParams.get('current_trailer')).toBe(
      'https://www.youtube.com/watch?v=abcdefghijk'
    )
  })

  it('reports "none" when no trailer was shown', () => {
    const url = new URL(
      buildTrailerReportUrl({
        gameName: 'Mystery',
        packageName: 'com.mystery',
        currentTrailerUrl: null
      })
    )
    expect(url.searchParams.get('current_trailer')).toBe('none')
  })
})
