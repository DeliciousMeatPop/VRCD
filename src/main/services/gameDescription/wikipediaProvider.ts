import axios from 'axios'
import {
  GameDescriptionLanguage,
  GameDescriptionFound,
  GameDescriptionNotFound
} from '@shared/types'
import { hasVrSignal, titlesMatch, truncateDescription } from './descriptionText'

interface WikipediaPage {
  title?: string
  extract?: string
  fullurl?: string
  pageprops?: {
    disambiguation?: unknown
  }
}

interface WikipediaResponse {
  error?: unknown
  query?: {
    pages?: WikipediaPage[] | Record<string, WikipediaPage>
  }
}

export type WikipediaGet = (
  url: string,
  config: { params: Record<string, string>; headers: Record<string, string>; timeout: number }
) => Promise<{ data: WikipediaResponse }>

const REQUEST_TIMEOUT_MS = 8_000

const isHttpsUrl = (value: string | undefined): value is string => {
  if (!value) return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

const pagesFrom = (response: WikipediaResponse): WikipediaPage[] => {
  const pages = response.query?.pages
  if (!pages) return []
  return Array.isArray(pages) ? pages : Object.values(pages)
}

const quoteSearchTerm = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const matchingPageFrom = (
  response: WikipediaResponse,
  gameName: string
): WikipediaPage | undefined =>
  pagesFrom(response).find((page) => {
    const extract = page.extract?.trim() ?? ''
    return (
      !!page.title &&
      titlesMatch(gameName, page.title) &&
      page.pageprops?.disambiguation === undefined &&
      hasVrSignal(extract) &&
      isHttpsUrl(page.fullurl)
    )
  })

export class WikipediaDescriptionProvider {
  private readonly userAgent: string

  constructor(
    private readonly get: WikipediaGet = axios.get as WikipediaGet,
    appVersion?: string
  ) {
    // Wikipedia's API policy asks for a descriptive, contactable User-Agent.
    // The version is injected by the caller (from app.getVersion()) so it can't
    // drift out of sync with the app the way a hardcoded string does; the pure
    // provider stays free of any Electron import so it remains unit-testable.
    this.userAgent = `VR-CyberDeck/${appVersion ?? 'dev'} (https://github.com/DeliciousMeatPop/VRCD)`
  }

  async lookup(
    gameName: string,
    language: GameDescriptionLanguage,
    packageName?: string
  ): Promise<GameDescriptionFound | GameDescriptionNotFound> {
    void packageName
    const quotedName = quoteSearchTerm(gameName)
    const queries = [`intitle:"${quotedName}"`, `"${quotedName}" video game`]
    let matchingPage: WikipediaPage | undefined

    for (const searchQuery of queries) {
      const { data } = await this.get(`https://${language}.wikipedia.org/w/api.php`, {
        params: {
          action: 'query',
          generator: 'search',
          gsrsearch: searchQuery,
          gsrlimit: '5',
          prop: 'extracts|info|pageprops',
          exintro: '1',
          explaintext: '1',
          inprop: 'url',
          redirects: '1',
          format: 'json',
          formatversion: '2'
        },
        headers: {
          'User-Agent': this.userAgent
        },
        timeout: REQUEST_TIMEOUT_MS
      })
      if (!data || typeof data !== 'object' || data.error) {
        throw new Error('Wikipedia returned an invalid or failed response')
      }
      matchingPage = matchingPageFrom(data, gameName)
      if (matchingPage) break
    }

    if (!matchingPage || !matchingPage.extract || !matchingPage.fullurl) {
      return { status: 'not-found', language, fetchedAt: Date.now() }
    }

    const text = truncateDescription(matchingPage.extract)
    if (!text) return { status: 'not-found', language, fetchedAt: Date.now() }

    return {
      status: 'found',
      text,
      source: { label: 'Wikipedia', url: matchingPage.fullurl },
      language,
      fetchedAt: Date.now()
    }
  }
}
