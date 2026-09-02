/**
 * Pure filter deciding which files under an app's external data tree are
 * regenerated engine junk rather than real save data. Kept free of any I/O so
 * it is trivially unit-testable; the caller (backupService via adbService.
 * pullDirectory) applies it while enumerating the device tree.
 *
 * Why this exists: the default backup method snapshots the whole
 * /sdcard/Android/data/<pkg> tree. For most Unity/VR titles that tree is
 * dominated by data the engine rebuilds from the APK on next launch — GPU
 * shader / pipeline caches, il2cpp metadata, extracted localization — none of
 * which is progress. Capturing it bloats backups by tens of MB (e.g. a 36 MB
 * "backup" that was ENTIRELY a Vulkan PSO cache) and, worse, makes a backup
 * that holds no real save look successful, so the failure only surfaces later
 * at restore. Excluding it keeps backups meaningful and lets the existing
 * "no files captured" guard give honest feedback up front.
 *
 * The list is deliberately conservative: every entry is data an engine
 * regenerates, never a place a game keeps progress.
 */

// Path segments (case-insensitive) that are always regenerated caches.
const EXCLUDED_DIR_SEGMENTS = new Set([
  'cache',
  'code_cache',
  'programbinarycache', // GLES shader binary cache
  'vulkanprogrambinarycache', // Vulkan shader binary cache
  'gpucache',
  'shader_cache',
  'dawncache',
  'dawnwebgpucache',
  'il2cpp' // Unity IL2CPP metadata/resources — rebuilt from the APK, not a save
])

// Exact file basenames (case-insensitive) that are regenerated markers/caches.
const EXCLUDED_BASENAMES = new Set([
  'cachefile.txt', // Oculus/Meta platform SDK cache marker
  'vulkan_pso_cache.bin'
])

// File extensions (case-insensitive, including the dot) that are engine assets
// extracted at runtime, never progress.
const EXCLUDED_EXTENSIONS = new Set([
  '.loc' // I2 Localization source dumps
])

/**
 * @param relativePath forward-slash path of a file relative to the pulled tree
 *   root (e.g. "files/il2cpp/Metadata/global-metadata.dat").
 * @returns true when the file is regenerated engine data that should NOT be
 *   captured as part of a save backup.
 */
export function isRegeneratedSaveFile(relativePath: string): boolean {
  const rel = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (rel === '') return false

  const segments = rel.split('/').filter((s) => s !== '')
  const basename = segments[segments.length - 1] ?? ''
  const lowerBase = basename.toLowerCase()

  // Any directory segment (i.e. every segment except the basename) matching a
  // known cache folder excludes the whole subtree.
  for (let i = 0; i < segments.length - 1; i++) {
    if (EXCLUDED_DIR_SEGMENTS.has(segments[i].toLowerCase())) return true
  }

  if (EXCLUDED_BASENAMES.has(lowerBase)) return true

  const dot = lowerBase.lastIndexOf('.')
  if (dot > 0 && EXCLUDED_EXTENSIONS.has(lowerBase.slice(dot))) return true

  return false
}
