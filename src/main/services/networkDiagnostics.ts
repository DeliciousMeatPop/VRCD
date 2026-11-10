import { promises as dns } from 'dns'

/** Extra rclone flags so a dead/blocked host fails in seconds, not minutes. */
export const RCLONE_TIMEOUT_ARGS: string[] = [
  '--contimeout',
  '10s',
  '--timeout',
  '30s',
  '--retries',
  '1',
  '--low-level-retries',
  '1'
]

function isPrivateOrBogus(ip: string): boolean {
  if (ip.includes(':')) {
    const v6 = ip.toLowerCase()
    return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd')
  }
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true
  const [a, b] = p
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    // 111.111.111.x: repeated-octet address seen from blocked DNS
    (p[0] === p[1] && p[1] === p[2])
  )
}

/**
 * Resolve the host of `baseUri` and throw a friendly error if DNS fails or
 * returns a private / bogus (likely sinkholed) address. Never throws for
 * non-URL inputs (rclone will report those itself).
 */
export async function preflightHostCheck(baseUri: string): Promise<void> {
  let host: string
  try {
    host = new URL(baseUri).hostname
  } catch {
    return
  }
  if (!host || /^[\d.]+$/.test(host) || host === 'localhost') return

  let addrs: string[]
  try {
    const res = await Promise.race([
      dns.lookup(host, { all: true }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(Object.assign(new Error('DNS timeout'), { code: 'ETIMEOUT' })),
          5000
        )
      )
    ])
    addrs = res.map((r) => r.address)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    throw new Error(
      code === 'ENOTFOUND'
        ? `The server host "${host}" could not be found. The domain may be dead, or DNS is blocking it.`
        : `Could not look up "${host}" (${code ?? 'DNS error'}). Check your internet connection or DNS settings.`
    )
  }

  if (addrs.length > 0 && addrs.every(isPrivateOrBogus)) {
    throw new Error(
      `DNS resolved "${host}" to ${addrs[0]}, which is not a real public server. ` +
        `Your ISP, router, Pi-hole/AdGuard, or hosts file is probably blocking it. ` +
        `Try a different DNS server (e.g. 1.1.1.1) or a VPN.`
    )
  }
}

/** Turn a raw rclone failure into something a user can act on. */
export function friendlyRcloneError(
  exitCode: number | undefined,
  stderr: string,
  hasApiKey = true
): string {
  const s = stderr || ''
  // The server rejects (or silently drops) requests without the API header,
  // so a missing key looks like a timeout or a 403.
  const noKeyHint = hasApiKey
    ? ''
    : ' This build has no API key configured (VRSRC_API_KEY_ENC), and the server blocks requests without it.'
  if (/i\/o timeout|context deadline exceeded|timed out|Client\.Timeout/i.test(s)) {
    return (
      'Connection to the server timed out. It may be down, blocked by your network/DNS, or needs a VPN.' +
      noKeyHint
    )
  }
  if (/no such host|lookup .* (failed|on)/i.test(s)) {
    return 'The server host could not be found. Check the Base URI and your DNS settings.'
  }
  if (/connection refused/i.test(s)) {
    return 'The server refused the connection. It may be offline.'
  }
  if (/\b401\b|\b403\b|unauthori[sz]ed|forbidden/i.test(s)) {
    return 'The server rejected the request (401/403). Check your password / API key.' + noKeyHint
  }
  if (/\b404\b|not found|directory not found/i.test(s)) {
    return 'meta.7z was not found on the server. Check the Base URI.'
  }
  if (/certificate|x509|tls/i.test(s)) {
    return 'A TLS/certificate error occurred while connecting to the server.'
  }
  return `Download failed (rclone exit code ${exitCode ?? 'unknown'}).`
}

/** Hosts of the vrSrc server, which rejects requests lacking the X-API-Key header. */
const VRSRC_HOSTS = ['go.srcdl1.xyz']

export function isVrsrcHost(baseUri: string): boolean {
  try {
    const host = new URL(baseUri).hostname.toLowerCase()
    return VRSRC_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
  } catch {
    return false
  }
}
