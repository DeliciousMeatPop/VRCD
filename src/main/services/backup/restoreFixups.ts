/**
 * Pure planning logic for post-restore fixups. Kept free of any device/adb I/O
 * so the decision of "which files to copy where" is unit-testable; the caller
 * (backupService) gathers the device state and executes the returned plan.
 */

export interface FixupCopy {
  from: string
  to: string
}

export interface ProfileFolderSyncInput {
  /**
   * Device paths at which the target save file currently exists (typically the
   * one just restored, under the old randomised profile folder).
   */
  existingFilePaths: string[]
  /** Immediate profile subfolders of the profiles directory, as device paths. */
  profileDirs: string[]
  /** The save filename kept inside each profile folder. */
  file: string
}

/**
 * Given the save file's current location(s) and the set of profile folders on
 * the device, decide which copies are needed so every profile folder contains
 * the save. Returns the copies to perform (may be empty when nothing is
 * missing) or `null` when there is no source file to copy from.
 *
 * Paths are treated as opaque forward-slash device paths; joining uses '/'.
 */
export function planProfileFolderSync(input: ProfileFolderSyncInput): FixupCopy[] | null {
  const { existingFilePaths, profileDirs, file } = input

  const sources = existingFilePaths.filter((p) => p.trim() !== '')
  if (sources.length === 0) return null

  // Prefer a deterministic source: the first existing copy.
  const source = sources[0]

  // Fast lookup of folders that already have the file (by the file's parent dir).
  const dirsWithFile = new Set(
    sources.map((p) => p.slice(0, p.lastIndexOf('/')).replace(/\/+$/, ''))
  )

  const copies: FixupCopy[] = []
  for (const rawDir of profileDirs) {
    const dir = rawDir.trim().replace(/\/+$/, '')
    if (dir === '') continue
    if (dirsWithFile.has(dir)) continue // already has the save
    copies.push({ from: source, to: `${dir}/${file}` })
  }

  return copies
}
