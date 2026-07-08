import type { ZipStream } from 'node-7z'

/** An Error as enriched by node-7z's stderr parser. */
type SevenZipError = Error & { level?: string; stderr?: string }

/**
 * Await a node-7z stream, tolerant of benign stderr noise.
 *
 * node-7z (v3) flags *any* bytes written to 7-Zip's stderr as a fatal error and
 * rejects with a generic `Error('unknown error')`, stashing the real text in
 * `err.stderr`. It never inspects the process exit code. On machines running a
 * process-injection framework (e.g. Ammonia on macOS, which injects tweak
 * dylibs like BackToCatalina / AppleSharpener into every spawned binary) each
 * `7zz` child prints banner/objc noise to stderr, so every extraction and
 * compression would fail spuriously even though 7-Zip finished fine.
 *
 * node-7z parses genuine 7-Zip messages of the form `ERROR: ...` / `WARNING:
 * ...` into `err.level`. So we treat stderr as fatal only when 7-Zip itself
 * reported an `ERROR` (e.g. a wrong password); anything else is logged as
 * benign noise and the stream resolves. The captured error (if any) is returned
 * so callers can enrich a later "expected output missing" failure. Callers that
 * can should still verify the expected files landed on disk.
 *
 * node-7z emits `error` then `end` synchronously from the same close handler, so
 * the settled-guard makes this race-free: a real `ERROR` rejects before `end`
 * can resolve.
 */
export function awaitSevenZipStream(
  stream: ZipStream,
  onProgress?: (percent: number) => void
): Promise<SevenZipError | null> {
  return new Promise<SevenZipError | null>((resolve, reject) => {
    let settled = false
    let benign: SevenZipError | null = null

    const finish = (err?: SevenZipError | null): void => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve(benign)
    }

    if (onProgress) {
      stream.on('progress', (progress: { percent: number }) => onProgress(progress.percent))
    }

    stream.on('end', () => finish())

    stream.on('error', (error: SevenZipError) => {
      if (error.level === 'ERROR') {
        finish(error)
        return
      }
      console.warn(
        `[7z] Ignoring benign stderr from 7-Zip child process: ${error.stderr?.trim() || error.message}`
      )
      benign = error
      finish()
    })
  })
}

/** Format a captured benign error for appending to a caller's failure message. */
export function describeSevenZipError(err: SevenZipError | null): string {
  if (!err) return ''
  return ` 7zip output: ${err.stderr?.trim() || err.message}`
}
