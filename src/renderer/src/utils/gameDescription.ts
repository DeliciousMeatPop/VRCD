import { GameDescriptionLanguage, GameDescriptionRequest, GameInfo } from '@shared/types'

export const gameDescriptionKey = (game: GameInfo, language: GameDescriptionLanguage): string =>
  `${game.packageName || game.id}:${language}`

export const toGameDescriptionRequest = (
  game: GameInfo,
  language: GameDescriptionLanguage
): GameDescriptionRequest => ({
  key: gameDescriptionKey(game, language),
  gameName: game.name,
  packageName: game.packageName,
  thumbnailPath: game.thumbnailPath,
  language,
  libraryDescription: game.libraryDescription,
  libraryDescriptionSourceLabel: game.libraryDescriptionSourceLabel,
  libraryDescriptionSourceUrl: game.libraryDescriptionSourceUrl,
  libraryDescriptionLanguage: game.libraryDescriptionLanguage
})
