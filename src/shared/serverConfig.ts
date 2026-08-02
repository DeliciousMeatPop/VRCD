/**
 * Helpers for normalizing and validating the public server Base URI.
 *
 * The Base URI is handed verbatim to rclone's `--http-url` flag. rclone parses
 * it as a URL, so stray wrapping quotes (a common copy/paste mistake, e.g.
 * pasting `"https://example.com/"` from a JSON snippet) make rclone fail with
 * `first path segment in URL cannot contain colon`. These helpers strip that
 * kind of noise and reject values that aren't real http(s) URLs before they can
 * be saved.
 */

/**
 * Strip surrounding whitespace and any wrapping single/double quotes from a
 * Base URI. Safe to call on already-clean values (returns them unchanged).
 */
export function sanitizeBaseUri(raw: string): string {
  let value = (raw ?? '').trim()
  // Remove one or more layers of wrapping matching quotes: "'https://x/'" etc.
  let previous: string
  do {
    previous = value
    const first = value[0]
    const last = value[value.length - 1]
    if (value.length >= 2 && (first === '"' || first === "'") && last === first) {
      value = value.slice(1, -1).trim()
    }
  } while (value !== previous)
  return value
}

/**
 * Returns true when `value` is a well-formed absolute http(s) URL. An empty
 * string is considered invalid (callers enforce "required" separately when
 * they need a stricter message).
 */
export function isValidBaseUri(value: string): boolean {
  if (!value) return false
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:'
}
