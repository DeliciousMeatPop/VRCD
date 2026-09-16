import type {
  GameDescriptionLanguage,
  GameDescriptionFound,
  GameDescriptionNotFound
} from '@shared/types'
import type { DescriptionProviderPort } from './gameDescriptionService'
import type { StoreMetadataProvider } from '../gameMetadata/storeMetadataProvider'

export class StoreDescriptionProvider implements DescriptionProviderPort {
  constructor(private readonly store: Pick<StoreMetadataProvider, 'lookup'>) {}
  async lookup(
    gameName: string,
    language: GameDescriptionLanguage,
    packageName?: string
  ): Promise<GameDescriptionFound | GameDescriptionNotFound> {
    const metadata = await this.store.lookup(gameName, language, packageName)
    if (!metadata?.description && metadata?.incomplete)
      throw new Error('Store description sources unavailable')
    return metadata?.description ?? { status: 'not-found', language, fetchedAt: Date.now() }
  }
}

export class MultiSourceDescriptionProvider implements DescriptionProviderPort {
  constructor(private readonly providers: DescriptionProviderPort[]) {}
  async lookup(
    gameName: string,
    language: GameDescriptionLanguage,
    packageName?: string
  ): Promise<GameDescriptionFound | GameDescriptionNotFound> {
    let failed = false
    for (const provider of this.providers) {
      try {
        const result = await provider.lookup(gameName, language, packageName)
        if (result.status === 'found') return result
      } catch {
        failed = true
      }
    }
    if (failed) throw new Error('Description sources temporarily unavailable')
    return { status: 'not-found', language, fetchedAt: Date.now() }
  }
}
