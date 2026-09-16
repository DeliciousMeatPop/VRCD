import { describe, expect, it, vi } from 'vitest'
import { WikipediaDescriptionProvider } from './wikipediaProvider'

const responseFor = (
  page: Record<string, unknown>
): { data: { query: { pages: Record<string, unknown>[] } } } => ({
  data: { query: { pages: [page] } }
})

describe('WikipediaDescriptionProvider', () => {
  it('returns an exact VR game match with canonical attribution', async () => {
    const get = vi.fn().mockResolvedValue(
      responseFor({
        title: 'Puzzling Places',
        extract: 'Puzzling Places is a virtual reality puzzle game for Meta Quest.',
        fullurl: 'https://en.wikipedia.org/wiki/Puzzling_Places'
      })
    )
    const provider = new WikipediaDescriptionProvider(get)

    await expect(provider.lookup('Puzzling Places', 'en')).resolves.toMatchObject({
      status: 'found',
      language: 'en',
      source: { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Puzzling_Places' }
    })

    expect(get).toHaveBeenCalledWith(
      'https://en.wikipedia.org/w/api.php',
      expect.objectContaining({ timeout: 8_000 })
    )
  })

  it('tries a video-game-specific query after an inconclusive title query', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: { query: { pages: [] } } })
      .mockResolvedValueOnce(
        responseFor({
          title: 'Breachers (video game)',
          extract: 'Breachers is a virtual reality tactical shooter game.',
          fullurl: 'https://en.wikipedia.org/wiki/Breachers_(video_game)'
        })
      )
    const provider = new WikipediaDescriptionProvider(get)

    await expect(provider.lookup('Breachers VR', 'en')).resolves.toMatchObject({
      status: 'found',
      source: { url: 'https://en.wikipedia.org/wiki/Breachers_(video_game)' }
    })

    expect(get).toHaveBeenCalledTimes(2)
    expect(get.mock.calls[1][1].params.gsrsearch).toBe('"Breachers VR" video game')
  })

  it('selects only the exact identity from multiple search candidates', async () => {
    const provider = new WikipediaDescriptionProvider(
      vi.fn().mockResolvedValue({
        data: {
          query: {
            pages: [
              {
                title: 'Royal Rumble',
                extract: 'Royal Rumble is a virtual reality wrestling game.',
                fullurl: 'https://en.wikipedia.org/wiki/Royal_Rumble'
              },
              {
                title: 'RUMBLE (video game)',
                extract: 'RUMBLE is a virtual reality fighting game.',
                fullurl: 'https://en.wikipedia.org/wiki/Rumble_(video_game)'
              }
            ]
          }
        }
      })
    )

    await expect(provider.lookup('RUMBLE', 'en')).resolves.toMatchObject({
      status: 'found',
      source: { url: 'https://en.wikipedia.org/wiki/Rumble_(video_game)' }
    })
  })

  it('rejects fuzzy, disambiguation, non-VR, and unsafe candidates', async () => {
    const cases = [
      {
        title: 'Royal Rumble',
        extract: 'A virtual reality game.',
        fullurl: 'https://en.wikipedia.org/wiki/Royal_Rumble'
      },
      {
        title: 'RUMBLE',
        extract: 'A virtual reality game.',
        fullurl: 'https://en.wikipedia.org/wiki/Rumble',
        pageprops: { disambiguation: '' }
      },
      {
        title: 'RUMBLE',
        extract: 'A mobile game for Android.',
        fullurl: 'https://en.wikipedia.org/wiki/Rumble'
      },
      {
        title: 'RUMBLE',
        extract: 'A virtual reality game.',
        fullurl: 'http://en.wikipedia.org/wiki/Rumble'
      }
    ]

    for (const page of cases) {
      const provider = new WikipediaDescriptionProvider(
        vi.fn().mockResolvedValue(responseFor(page))
      )
      await expect(provider.lookup('RUMBLE', 'en')).resolves.toMatchObject({ status: 'not-found' })
    }
  })

  it('keeps transport failures distinct from confirmed misses', async () => {
    const provider = new WikipediaDescriptionProvider(
      vi.fn().mockRejectedValue(new Error('offline'))
    )
    await expect(provider.lookup('RUMBLE', 'en')).rejects.toThrow('offline')
  })

  it('keeps HTTP-success API errors distinct from confirmed misses', async () => {
    const provider = new WikipediaDescriptionProvider(
      vi.fn().mockResolvedValue({ data: { error: { code: 'ratelimited' } } })
    )
    await expect(provider.lookup('Breachers', 'en')).rejects.toThrow()
  })
})
