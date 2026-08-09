interface ArchiveCandidate {
  number: number
  name: string
}

interface ArchiveFamily {
  prefix: string
  candidates: ArchiveCandidate[]
}

export interface ArchiveDiscoverySuccess {
  ok: true
  prefix: string
  archivePart1: string
  volumeNames: string[]
}

export type ArchiveDiscoveryResult =
  | ArchiveDiscoverySuccess
  | {
      ok: false
      error: string
    }

const volumePattern = /^(.+)\.7z\.(\d{3,})$/i
const temporaryVolumePattern = /^(.+)\.7z\.(\d{3,})\.tmp$/i

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export function isAppleDoublePath(path: string): boolean {
  return fileName(path).startsWith('._')
}

export function isRclonePartialPath(path: string): boolean {
  return path.toLowerCase().endsWith('.partial')
}

export function isTemporaryArchiveVolumePath(path: string): boolean {
  return temporaryVolumePattern.test(path)
}

export function isCanonicalArchiveVolumePath(path: string): boolean {
  return volumePattern.test(path)
}

/**
 * Resolve the one split 7z archive that is safe to extract from a download
 * directory. Finder metadata (`._*`) is never a candidate. Temporary source
 * names and rclone partials fail closed because neither proves that the remote
 * publisher finished writing the archive.
 */
export function discoverArchive(files: string[]): ArchiveDiscoveryResult {
  const visibleFiles = files.filter((name) => !isAppleDoublePath(name))

  const unfinishedPartial = visibleFiles.find(
    (name) => name.toLowerCase().includes('.7z.') && isRclonePartialPath(name)
  )
  if (unfinishedPartial) {
    return {
      ok: false,
      error: `Incomplete download — ${unfinishedPartial} did not finish downloading.`
    }
  }

  const temporaryVolume = visibleFiles.find(isTemporaryArchiveVolumePath)
  if (temporaryVolume) {
    return {
      ok: false,
      error: `Download source is not finalized — the server supplied ${temporaryVolume} as a temporary archive volume. Try again later or choose another source.`
    }
  }

  const families = new Map<string, ArchiveFamily>()
  for (const name of visibleFiles) {
    const match = name.match(volumePattern)
    if (!match) continue

    const prefix = match[1]
    const key = prefix.toLowerCase()
    const family = families.get(key) ?? { prefix, candidates: [] }
    family.candidates.push({ number: Number.parseInt(match[2], 10), name })
    families.set(key, family)
  }

  if (families.size === 0) {
    return { ok: false, error: 'No usable .7z.001 archive was found.' }
  }

  if (families.size > 1) {
    return {
      ok: false,
      error: `Multiple split archives were found (${[...families.values()]
        .map((family) => family.prefix)
        .join(', ')}). Remove the unrelated archive and retry.`
    }
  }

  const family = [...families.values()][0]
  const byNumber = new Map<number, ArchiveCandidate>()
  for (const candidate of family.candidates) {
    const duplicate = byNumber.get(candidate.number)
    if (duplicate) {
      return {
        ok: false,
        error: `Ambiguous archive — ${duplicate.name} and ${candidate.name} both represent volume ${candidate.number}.`
      }
    }
    byNumber.set(candidate.number, candidate)
  }

  if (!byNumber.has(1)) {
    return {
      ok: false,
      error: 'Incomplete download — archive volume .7z.001 is missing.'
    }
  }

  const maxNumber = Math.max(...byNumber.keys())
  const missing: number[] = []
  for (let number = 1; number <= maxNumber; number++) {
    if (!byNumber.has(number)) missing.push(number)
  }
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Incomplete download — missing archive volume(s) ${missing
        .map((number) => `.7z.${String(number).padStart(3, '0')}`)
        .join(', ')}.`
    }
  }

  const volumeNames = [...byNumber.values()]
    .sort((left, right) => left.number - right.number)
    .map((candidate) => candidate.name)

  return {
    ok: true,
    prefix: family.prefix,
    archivePart1: byNumber.get(1)!.name,
    volumeNames
  }
}

export interface DownloadedFile {
  relativePath: string
  size: number
}

export type DownloadCompletionResult =
  | {
      ok: true
      archive?: ArchiveDiscoverySuccess
    }
  | {
      ok: false
      error: string
    }

function isTopLevel(path: string): boolean {
  return !/[\\/]/.test(path)
}

/** Files that can contribute to resume progress without counting metadata or
 * unfinished transfers as completed bytes. */
export function isCompletedDownloadFile(path: string, requireArchive: boolean): boolean {
  if (isAppleDoublePath(path) || isRclonePartialPath(path) || isTemporaryArchiveVolumePath(path)) {
    return false
  }
  return requireArchive ? isTopLevel(path) && isCanonicalArchiveVolumePath(path) : true
}

/**
 * Validate rclone's output before the queue advances to extraction. rclone
 * exit code 0 only means it copied everything the source exposed; it does not
 * mean the source exposed finalized or extractable archive names.
 */
export function validateDownloadCompletion(
  files: DownloadedFile[],
  requireArchive: boolean
): DownloadCompletionResult {
  const visibleFiles = files.filter((file) => !isAppleDoublePath(file.relativePath))

  const partial = visibleFiles.find((file) => isRclonePartialPath(file.relativePath))
  if (partial) {
    return {
      ok: false,
      error: `Download did not finalize — ${partial.relativePath} is still partial. Its data was kept; Retry will restart the unfinished volume while preserving completed files.`
    }
  }

  const temporaryVolume = visibleFiles.find((file) =>
    isTemporaryArchiveVolumePath(file.relativePath)
  )
  if (temporaryVolume) {
    return {
      ok: false,
      error: `Download source is not finalized — the server supplied ${temporaryVolume.relativePath} as a .tmp archive volume. Retrying immediately will fetch the same unfinished data; try again later or choose another source.`
    }
  }

  if (!requireArchive) {
    if (!visibleFiles.some((file) => file.size > 0)) {
      return {
        ok: false,
        error: 'Download did not finalize: no non-empty files were produced.'
      }
    }
    return { ok: true }
  }

  const topLevelFiles = visibleFiles.filter((file) => isTopLevel(file.relativePath))
  const archive = discoverArchive(topLevelFiles.map((file) => file.relativePath))
  if (!archive.ok) return archive

  const byName = new Map(topLevelFiles.map((file) => [file.relativePath, file]))
  const volumeSizes = archive.volumeNames.map((name) => byName.get(name)?.size ?? -1)

  for (let index = 0; index < volumeSizes.length; index++) {
    if (volumeSizes[index] <= 0) {
      return {
        ok: false,
        error: `Incomplete download — archive volume ${archive.volumeNames[index]} is empty or unreadable.`
      }
    }
  }

  if (volumeSizes.length > 1) {
    const fullVolumeSize = volumeSizes[0]
    for (let index = 0; index < volumeSizes.length - 1; index++) {
      if (volumeSizes[index] !== fullVolumeSize) {
        return {
          ok: false,
          error: `Incomplete download — archive volume ${archive.volumeNames[index]} has an unexpected size (${volumeSizes[index]} bytes; expected ${fullVolumeSize}).`
        }
      }
    }
    const finalSize = volumeSizes[volumeSizes.length - 1]
    if (finalSize > fullVolumeSize) {
      return {
        ok: false,
        error: `Incomplete download — final archive volume ${archive.volumeNames.at(-1)} is larger than the preceding volumes.`
      }
    }
  }

  return { ok: true, archive }
}
