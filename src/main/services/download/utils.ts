import { promises as fs } from 'fs'
import { join } from 'path'

// Debounce function with improved typing
function debounce<T extends (...args: P) => void, P extends unknown[]>(
  func: T,
  wait: number
): (...args: P) => void {
  let timeout: NodeJS.Timeout | null = null
  return (...args: P): void => {
    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(() => {
      func(...args)
    }, wait)
  }
}

export { debounce }

/**
 * Check available disk space at the given path
 * @param path - Directory path to check
 * @returns Available space in bytes, or null if unable to determine
 */
export async function getAvailableDiskSpace(path: string): Promise<number | null> {
  try {
    const stats = await fs.statfs(path)
    // Available space = available blocks * block size
    return stats.bavail * stats.bsize
  } catch (error) {
    console.error(`[DiskSpace] Error checking disk space for ${path}:`, error)
    return null
  }
}

/**
 * Get the total size of files in a directory
 * @param dirPath - Directory path
 * @returns Total size in bytes
 */
export async function getDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0

  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true })

    for (const item of items) {
      const itemPath = join(dirPath, item.name)

      if (item.isDirectory()) {
        totalSize += await getDirectorySize(itemPath)
      } else if (item.isFile()) {
        try {
          const stats = await fs.stat(itemPath)
          totalSize += stats.size
        } catch (statError) {
          console.warn(`[DiskSpace] Could not get size for ${itemPath}:`, statError)
        }
      }
    }
  } catch (error) {
    console.error(`[DiskSpace] Error calculating directory size for ${dirPath}:`, error)
  }

  return totalSize
}

/**
 * Format bytes to human-readable string
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "1.5 GB")
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

/**
 * Parse size string from GameInfo (e.g., "1500 MB") to bytes
 * @param sizeString - Size string like "1500 MB" or "2.5 GB"
 * @returns Size in bytes, or 0 if parsing fails
 */
export function parseSizeToBytes(sizeString: string): number {
  if (!sizeString || typeof sizeString !== 'string') {
    return 0
  }

  const trimmed = sizeString.trim().toLowerCase()
  const match = trimmed.match(/^([\d.]+)\s*(mb|gb|kb|b)$/)

  if (!match) {
    console.warn(`[Utils] Could not parse size string: "${sizeString}"`)
    return 0
  }

  const [, numStr, unit] = match
  const num = parseFloat(numStr)

  if (isNaN(num)) {
    console.warn(`[Utils] Invalid number in size string: "${sizeString}"`)
    return 0
  }

  switch (unit) {
    case 'b':
      return num
    case 'kb':
      return num * 1024
    case 'mb':
      return num * 1024 * 1024
    case 'gb':
      return num * 1024 * 1024 * 1024
    default:
      console.warn(`[Utils] Unknown unit in size string: "${sizeString}"`)
      return 0
  }
}
