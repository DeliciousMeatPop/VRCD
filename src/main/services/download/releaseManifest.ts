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
