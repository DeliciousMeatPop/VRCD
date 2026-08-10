/**
 * Parser for the VRP `release.manifest` file that ships inside every release and
 * is present in the download folder after extraction. It carries the exact byte
 * size of every file in the release, which lets us verify an extraction landed
 * completely and uncorrupted without downloading or hashing anything extra.
 *
 * Format:
 *
 *   #VRPRELEASEMANIFEST 1.0
 *   Game Name;Release Name;Package Name;Version Code;Last Updated;Size (MB);...
 *   Arizona Sunshine Remake;Arizona Sunshine Remake v112989...;...;23263;...
 *
 *   #filelist
 *   type;name;size
 *   f;./com.vertigogames.azs1hd.apk;1030074668
 *   d;./com.vertigogames.azs1hd;0
 *   f;./com.vertigogames.azs1hd/scenesmobile0.main...obb;3075599129
 *
 * Only file (`f`) rows carry a meaningful size; directory (`d`) rows have size 0
 * and are ignored. Paths are relative to the release root and are normalised by
 * stripping the leading "./".
 */

export interface ManifestFileEntry {
  /** Path relative to the release root, forward-slash separated, no leading "./". */
  path: string
  /** Expected size in bytes. */
  size: number
}

export interface ParsedReleaseManifest {
  files: ManifestFileEntry[]
}

/** The filename, at the release root, that this module parses. */
export const RELEASE_MANIFEST_FILENAME = 'release.manifest'

/**
 * Release-metadata sidecar files that can appear at the release root and get
 * listed in the manifest's #filelist, but are NOT part of the game payload and
 * are frequently absent from the actual download:
 *
 *   - release.manifest — the manifest itself; it can't reliably state its own
 *     byte size (writing the size in changes the size), so releases often list a
 *     stale size for it.
 *   - release.add — an uploader-side "additions" sidecar listed by some releases
 *     (e.g. Beat Saber modding builds) but not shipped inside the archive, so it
 *     reads as "missing" after extraction.
 *
 * None of these are APK/OBB/asset-config game assets, so a missing or
 * size-mismatched sidecar can't cause the "game launches with missing
 * resources" crash that manifest verification exists to catch. Verification
 * skips them to avoid false mismatches. Matched (case-insensitively) against the
 * entry's full root-relative path, so only a root-level sidecar is skipped — a
 * same-named file nested inside a package folder is still checked.
 */
export const RELEASE_METADATA_SIDECARS: ReadonlySet<string> = new Set([
  RELEASE_MANIFEST_FILENAME,
  'release.add'
])

/**
 * True if a manifest entry path refers to a release-metadata sidecar (see
 * RELEASE_METADATA_SIDECARS) rather than a game-payload file, and should be
 * excluded from extraction verification.
 */
export function isReleaseMetadataSidecar(path: string): boolean {
  return RELEASE_METADATA_SIDECARS.has(path.toLowerCase())
}

/**
 * Parse the text of a `release.manifest`. Never throws — malformed or
 * unrecognised lines are skipped, so a partial/garbage manifest yields whatever
 * valid file rows it could find (possibly none).
 */
export function parseReleaseManifest(content: string): ParsedReleaseManifest {
  const files: ManifestFileEntry[] = []
  let inFileList = false

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    // Section markers start with '#'. Only inside "#filelist" do rows describe
    // files; any other '#' marker ends the file list.
    if (line.startsWith('#')) {
      inFileList = line.toLowerCase() === '#filelist'
      continue
    }

    if (!inFileList) continue

    // Skip the "type;name;size" column header.
    if (line.toLowerCase().startsWith('type;')) continue

    const parts = line.split(';')
    if (parts.length < 3) continue

    const type = parts[0].trim()
    if (type !== 'f') continue // ignore directories and anything non-file

    const name = parts[1].trim()
    // Size is the last field; join defensively in case a name ever contains ';'.
    const size = Number(parts[parts.length - 1].trim())
    if (!Number.isFinite(size) || size < 0) continue

    const path = name.replace(/^\.\//, '').replace(/\\/g, '/')
    if (!path) continue

    files.push({ path, size })
  }

  return { files }
}
