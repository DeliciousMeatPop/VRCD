import { describe, expect, it, vi } from 'vitest'
import { WikipediaDescriptionProvider } from './wikipediaProvider'

const responseFor = (page: Record<string, unknown>): { data: { query: { pages: Record<string, unknown>[] } } } => ({
  data: { query: { pages: [page] } }
})

describe('WikipediaDescriptionProvider', () => {
  it('returns an exact VR game match with canonical attribution', async () => {
    const get = vi.fn().mockResolvedValue(responseFor({
      title: 'Puzzling Places',
      extract: 'Puzzling Places is a virtual reality puzzle game for Meta Quest.',
      fullurl: 'https://en.wikipedia.org/wiki/Puzzling_Places'
    }))
    const provider = new WikipediaDescriptionProvider(get)

    await expect(provider.lookup('Puzzling Places', 'en')).resolves.toMatchObject({
      status: 'found',
      language: 'en',
      source: { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Puzzling_Places' }
    })
  })

  it('rejects fuzzy, disambiguation, non-VR, and unsafe candidates', async () => {
    const cases = [
      { title: 'Royal Rumble', extract: 'A virtual reality game.', fullurl: 'https://en.wikipedia.org/wiki/Royal_Rumble' },
      { title: 'RUMBLE', extract: 'A virtual reality game.', fullurl: 'https://en.wikipedia.org/wiki/Rumble', pageprops: { disambiguation: '' } },
      { title: 'RUMBLE', extract: 'A mobile game for Android.', fullurl: 'https://en.wikipedia.org/wiki/Rumble' },
      { title: 'RUMBLE', extract: 'A virtual reality game.', fullurl: 'http://en.wikipedia.org/wiki/Rumble' }
    ]

    for (const page of cases) {
      const provider = new WikipediaDescriptionProvider(vi.fn().mockResolvedValue(responseFor(page)))
      await expect(provider.lookup('RUMBLE', 'en')).resolves.toMatchObject({ status: 'not-found' })
    }
  })

  it('keeps transport failures distinct from confirmed misses', async () => {
    const provider = new WikipediaDescriptionProvider(vi.fn().mockRejectedValue(new Error('offline')))
    await expect(provider.lookup('RUMBLE', 'en')).rejects.toThrow('offline')
  })
})
