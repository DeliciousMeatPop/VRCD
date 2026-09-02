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
  query?: {
    pages?: WikipediaPage[] | Record<string, WikipediaPage>
  }
}

export type WikipediaGet = (
  url: string,
  config: { params: Record<string, string>; headers: Record<string, string> }
) => Promise<{ data: WikipediaResponse }>

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
    language: GameDescriptionLanguage
  ): Promise<GameDescriptionFound | GameDescriptionNotFound> {
    const { data } = await this.get(`https://${language}.wikipedia.org/w/api.php`, {
      params: {
        action: 'query',
        generator: 'search',
        gsrsearch: `intitle:"${gameName}"`,
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
      }
    })

    const matchingPage = pagesFrom(data).find((page) => {
      const extract = page.extract?.trim() ?? ''
      return !!page.title &&
        titlesMatch(gameName, page.title) &&
        page.pageprops?.disambiguation === undefined &&
        hasVrSignal(extract) &&
        isHttpsUrl(page.fullurl)
    })

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
