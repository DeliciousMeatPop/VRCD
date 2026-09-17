import { describe, expect, it } from 'vitest'
import { MultiSourceDescriptionProvider, StoreDescriptionProvider } from './multiSourceProvider'
import type { GameDescriptionFound } from '@shared/types'

const description: GameDescriptionFound = {
  status: 'found',
  text: 'Plan your assault in a tactical virtual reality team shooter.',
  language: 'en',
  source: { label: 'Meta Store', url: 'https://www.meta.com/experiences/5740397619319389/' },
  fetchedAt: 1
}

describe('independent description providers', () => {
  it('accepts a store description even when the source has no trailer or cover', async () => {
    const store = new StoreDescriptionProvider({
      lookup: async () => ({ title: 'Breachers', sourceUrl: description.source.url!, description })
    })
    await expect(store.lookup('Breachers', 'en', 'com.TriangleFactory.Breachers')).resolves.toEqual(
      description
    )
  })
  it('continues to the next source after either a miss or a transport failure', async () => {
    for (const failed of [false, true]) {
      const provider = new MultiSourceDescriptionProvider([
        {
          lookup: async () => {
            if (failed) throw new Error('offline')
            return { status: 'not-found', language: 'en', fetchedAt: 1 }
          }
        },
        {
          lookup: async (name, _lang, pkg) => {
            if (name !== 'Breachers' || pkg !== 'com.test') throw new Error('wrong identity')
            return description
          }
        }
      ])
      await expect(provider.lookup('Breachers', 'en', 'com.test')).resolves.toEqual(description)
    }
  })
  it('does not turn a partial outage into a cacheable miss', async () => {
    const provider = new MultiSourceDescriptionProvider([
      {
        lookup: async () => {
          throw new Error('offline')
        }
      },
      { lookup: async () => ({ status: 'not-found', language: 'en', fetchedAt: 1 }) }
    ])
    await expect(provider.lookup('Breachers', 'en')).rejects.toThrow()
  })
  it('returns not-found only when every provider confirms a miss', async () => {
    const provider = new MultiSourceDescriptionProvider([
      { lookup: async () => ({ status: 'not-found', language: 'en', fetchedAt: 1 }) }
    ])
    await expect(provider.lookup('Unknown Game', 'en')).resolves.toMatchObject({
      status: 'not-found'
    })
  })
})
