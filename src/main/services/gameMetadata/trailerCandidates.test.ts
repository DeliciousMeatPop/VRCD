import { describe, expect, it } from 'vitest'
import { selectYoutubeTrailerCandidate } from './trailerCandidates'

const searchPageFromItems = (items: unknown[]): string => `
  <html><script>
    var ytInitialData = ${JSON.stringify({
      contents: {
        twoColumnSearchResultsRenderer: {
          primaryContents: {
            sectionListRenderer: {
              contents: [
                {
                  itemSectionRenderer: {
                    contents: items
                  }
                }
              ]
            }
          }
        }
      }
    })};
  </script></html>`

const searchPage = (...videos: { id: string; title: string }[]): string =>
  searchPageFromItems(
    videos.map(({ id, title }) => ({
      videoRenderer: {
        videoId: id,
        title: { runs: [{ text: title }] }
      }
    }))
  )

describe('selectYoutubeTrailerCandidate', () => {
  it('selects the regular search result whose title identifies the requested game', () => {
    const html = searchPage(
      { id: 'demeo000001', title: 'Demeo - Official Trailer | Meta Quest' },
      { id: 'medvalley01', title: 'Med Valley - Official Meta Quest Trailer' }
    )

    expect(selectYoutubeTrailerCandidate(html, 'Med Valley')).toEqual({
      videoId: 'medvalley01',
      title: 'Med Valley - Official Meta Quest Trailer'
    })
  })

  it('rejects Puzzling Places as a result for Puzzleverse', () => {
    expect(
      selectYoutubeTrailerCandidate(
        searchPage({ id: 'puzzling001', title: 'Puzzling Places | Official Trailer' }),
        'Puzzleverse'
      )
    ).toBeNull()
  })

  it('accepts complete game names with release and platform metadata', () => {
    expect(
      selectYoutubeTrailerCandidate(
        searchPage({
          id: 'puzzlevers1',
          title: 'Puzzleverse - 2026 Release Trailer | Meta Quest 3'
        }),
        'Puzzleverse'
      )
    ).toEqual({
      videoId: 'puzzlevers1',
      title: 'Puzzleverse - 2026 Release Trailer | Meta Quest 3'
    })
  })

  it('preserves sequel and edition tokens when checking identity', () => {
    expect(
      selectYoutubeTrailerCandidate(
        searchPage({ id: 'sunshine002', title: 'Arizona Sunshine 2 - Official Trailer' }),
        'Arizona Sunshine'
      )
    ).toBeNull()
    expect(
      selectYoutubeTrailerCandidate(
        searchPage({
          id: 'deluxetest1',
          title: 'Arizona Sunshine Deluxe Edition - Launch Trailer'
        }),
        'Arizona Sunshine'
      )
    ).toBeNull()
  })

  it('rejects empty and generic headset searches', () => {
    const html = searchPage({ id: 'generic0001', title: 'Meta Quest 3 Official Trailer' })
    expect(selectYoutubeTrailerCandidate(html, '')).toBeNull()
    expect(selectYoutubeTrailerCandidate(html, 'Meta Quest')).toBeNull()
  })

  it('rejects ambiguous matching results', () => {
    const html = searchPage(
      { id: 'breachers01', title: 'Breachers - Official Trailer' },
      { id: 'breachers02', title: 'Breachers - Meta Quest Launch Trailer' }
    )
    expect(selectYoutubeTrailerCandidate(html, 'Breachers')).toBeNull()
  })

  it('does not treat promoted or recommended renderers as search results', () => {
    const html = searchPageFromItems([
      {
        promotedVideoRenderer: {
          videoId: 'demeo000001',
          title: { simpleText: 'Med Valley - Official Trailer' }
        }
      },
      {
        compactVideoRenderer: {
          videoId: 'random00001',
          title: { simpleText: 'Med Valley - Official Trailer' }
        }
      },
      {
        videoRenderer: {
          videoId: 'wanted00001',
          title: { simpleText: 'Med Valley - Official Trailer' }
        }
      }
    ])
    expect(selectYoutubeTrailerCandidate(html, 'Med Valley')?.videoId).toBe('wanted00001')
  })
})
