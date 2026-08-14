import { join } from 'path'

export interface ObbDirectory {
  /** Absolute path to the OBB folder on disk. */
  obbPath: string
  /** Folder name, which is also the package and the /sdcard/Android/obb/<name> target. */
  obbDirName: string
}

/** Directory entry shape we rely on (a subset of Node's Dirent). */
export interface DirEntryLike {
  name: string
  isDirectory(): boolean
}

/** Minimal filesystem surface needed to resolve an OBB folder — injectable for tests. */
export interface ObbFileSystem {
  readdir(path: string, options: { withFileTypes: true }): Promise<DirEntryLike[]>
  readdir(path: string): Promise<string[]>
}

/**
 * Locate the OBB folder for a release inside `baseDir`.
 *
 * The OBB folder is named after the app's package (e.g. `com.sanzaru.AW2`) and
 * is pushed to `/sdcard/Android/obb/<package>`. Resolution order, by confidence:
 *   1. An explicit package name (from the catalog) that matches a directory on disk.
 *   2. Auto-detection: a package-style subfolder (name contains a dot) that
 *      actually holds `.obb` files. This covers releases whose catalog package
 *      name is blank — the case that otherwise blocks the whole install.
 *
 * Returns null when the release has no OBB (e.g. an APK-only game), in which
 * case an APK-only install is still a success.
 */
export async function resolveObbDirectory(
  baseDir: string,
  packageName: string | undefined,
  fs: ObbFileSystem
): Promise<ObbDirectory | null> {
  let dirEntries: DirEntryLike[]
  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true })
    dirEntries = entries.filter((e) => e.isDirectory())
  } catch {
    return null
  }

  // 1. Explicit package name that matches a directory on disk.
  if (packageName) {
    const match = dirEntries.find((e) => e.name === packageName)
    if (match) {
      return { obbPath: join(baseDir, packageName), obbDirName: packageName }
    }
  }

  // 2. Auto-detect a package-style folder that actually contains .obb files.
  for (const entry of dirEntries) {
    if (!entry.name.includes('.')) continue
    const dirPath = join(baseDir, entry.name)
    try {
      const inner = await fs.readdir(dirPath)
      if (inner.some((f) => f.toLowerCase().endsWith('.obb'))) {
        return { obbPath: dirPath, obbDirName: entry.name }
      }
    } catch {
      /* ignore unreadable subdirs */
    }
  }

  return null
}
