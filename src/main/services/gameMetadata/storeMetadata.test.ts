import { describe, expect, it } from 'vitest'
import { parseMetaMetadata, parseSteamMetadata, steamSearchCandidates } from './storeMetadata'

const metaUrl = 'https://www.meta.com/experiences/beat-saber/2448060205267927/'
const metaPage = (overrides: Record<string, unknown> = {}): string =>
  `<script type="application/ld+json">${JSON.stringify({
    '@graph': [
      {
        '@type': 'ItemPage',
        name: 'Beat Saber',
        url: metaUrl,
        mainEntity: { '@id': 'app' },
        video: { '@id': 'https://video.oculuscdn.com/trailer.mp4' }
      },
      {
        '@type': ['SoftwareApplication', 'Product'],
        '@id': 'app',
        name: 'Beat Saber',
        url: metaUrl,
        sku: '2448060205267927',
        availableOnDevice: ['Quest 3'],
        description: 'Slash the beats in a virtual reality rhythm game. Play solo or with friends.',
        ...overrides
      }
    ]
  })}</script>`

describe('Meta store metadata', () => {
  it('reads a description and the matched page video without any image', () => {
    expect(parseMetaMetadata(metaPage(), 'Beat Saber', 'en', '2448060205267927')).toMatchObject({
      title: 'Beat Saber',
      description: { status: 'found', source: { label: 'Meta Store', url: metaUrl } },
      trailerUrl: 'https://video.oculuscdn.com/trailer.mp4'
    })
  })
  it('keeps media independent when a description is absent', () => {
    const result = parseMetaMetadata(
      metaPage({ description: '' }),
      'Beat Saber',
      'en',
      '2448060205267927'
    )
    expect(result?.description).toBeUndefined()
    expect(result?.trailerUrl).toBe('https://video.oculuscdn.com/trailer.mp4')
  })
  it('rejects another title, edition, platform or store ID', () => {
    for (const fields of [
      { name: 'Beat Saber 2' },
      { availableOnDevice: ['Rift'] },
      { sku: '999' }
    ]) {
      expect(parseMetaMetadata(metaPage(fields), 'Beat Saber', 'en', '2448060205267927')).toBeNull()
    }
    expect(parseMetaMetadata(metaPage(), 'Med Valley', 'en', '2448060205267927')).toBeNull()
  })
  it('does not steal a recommendation video or accept malformed JSON', () => {
    const page = metaPage().replace(
      '"video":{"@id":"https://video.oculuscdn.com/trailer.mp4"}',
      '"video":{"@id":"https://evil.test/video.mp4"}'
    )
    expect(
      parseMetaMetadata(page, 'Beat Saber', 'en', '2448060205267927')?.trailerUrl
    ).toBeUndefined()
    expect(
      parseMetaMetadata(
        '<script type="application/ld+json">broken</script>',
        'Beat Saber',
        'en',
        '2448060205267927'
      )
    ).toBeNull()
  })

  it('does not relate pages or videos through missing JSON-LD IDs', () => {
    const malformedRelationships = `<script type="application/ld+json">${JSON.stringify({
      '@graph': [
        {
          '@type': 'ItemPage',
          url: metaUrl,
          mainEntity: {},
          video: {}
        },
        {
          '@type': 'SoftwareApplication',
          name: 'Beat Saber',
          url: metaUrl,
          sku: '2448060205267927',
          availableOnDevice: ['Quest 3'],
          description:
            'Slash the beats in a virtual reality rhythm game. Play solo or with friends.'
        },
        {
          '@type': 'VideoObject',
          contentUrl: 'https://video.oculuscdn.com/unrelated.mp4'
        }
      ]
    })}</script>`

    expect(
      parseMetaMetadata(malformedRelationships, 'Beat Saber', 'en', '2448060205267927')?.trailerUrl
    ).toBeUndefined()
  })

  it('uses a useful related page description when the application description is too short', () => {
    const pageDescription =
      'Slash colorful blocks to the beat in a full virtual reality rhythm campaign.'
    const html = metaPage({ description: 'Brief teaser.' }).replace(
      `"video":{"@id":"https://video.oculuscdn.com/trailer.mp4"}`,
      `"description":${JSON.stringify(pageDescription)},"video":{"@id":"https://video.oculuscdn.com/trailer.mp4"}`
    )

    expect(parseMetaMetadata(html, 'Beat Saber', 'en', '2448060205267927')?.description?.text).toBe(
      pageDescription
    )
  })
})

const steamDetails = (overrides: Record<string, unknown> = {}): unknown => ({
  '620980': {
    success: true,
    data: {
      steam_appid: 620980,
      type: 'game',
      name: 'Beat Saber',
      developers: ['Beat Games'],
      short_description:
        'A &quot;rhythm&quot; game in <b>virtual reality</b>. Slash blocks to the beat.',
      categories: [{ id: 54, description: 'VR Only' }],
      movies: [{ name: 'Launch trailer', dash_h264: 'https://video.steamstatic.com/movie.mpd' }],
      ...overrides
    }
  }
})

describe('Steam metadata', () => {
  it('returns attributed plain text without pretending DASH is playable native video', () => {
    const result = parseSteamMetadata(steamDetails(), '620980', 'Beat Saber', 'en')
    expect(result?.description?.text).toBe(
      'A "rhythm" game in virtual reality. Slash blocks to the beat.'
    )
    expect(result?.description?.source.url).toBe('https://store.steampowered.com/app/620980/')
    expect(result?.trailerUrl).toBeUndefined()
  })
  it('rejects non-VR homonyms, sequels and DLC', () => {
    for (const data of [
      { type: 'dlc' },
      { name: 'Beat Saber 2' },
      { categories: [], short_description: 'A music game.' }
    ]) {
      expect(parseSteamMetadata(steamDetails(data), '620980', 'Beat Saber', 'en')).toBeNull()
    }
  })
  it('only discovers exact normalized games from actual result rows', () => {
    const html =
      '<a data-ds-appid="1"><span class="title">Royal Rumble</span></a>' +
      '<a data-ds-appid="2"><span class="title">RUMBLE</span></a>' +
      '<a data-ds-appid="3"><span class="title">RUMBLE 2</span></a>'
    expect(steamSearchCandidates(html, 'Rumble')).toEqual(['2'])
  })
})
