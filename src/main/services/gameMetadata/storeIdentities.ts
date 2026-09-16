import type { StoreIdentity } from './storeMetadataProvider'

// Quest listings checked against their canonical store pages. Keep distinct
// editions (notably Motion Soccer / Motion Soccer PRO) as separate identities.
// Unknown packages are discovered conservatively; this is not a complete catalog.
export const storeIdentities: Record<string, StoreIdentity> = {
  'sm.md.MedValley': { title: 'Med Valley', metaIds: ['5625733234171227'] },
  'org.katana.spatialflashcards': { title: 'SpatialFlashcards', metaIds: ['8075068299221418'] },
  'com.ivanovichgames.motionsoccer': { title: 'Motion Soccer', metaIds: ['28642850658635318'] },
  'com.TriangleFactory.Breachers': { title: 'Breachers', metaIds: ['5740397619319389'] },
  'com.xsgames.puzzleverse': { title: 'Puzzleverse', metaIds: ['7770336956400443'] },
  'com.RealitiesIO.puzzlingPlaces': { title: 'Puzzling Places', metaIds: ['3931148300302917'] },
  'com.beatgames.beatsaber': {
    title: 'Beat Saber',
    metaIds: ['2448060205267927'],
    steamIds: ['620980']
  }
}
