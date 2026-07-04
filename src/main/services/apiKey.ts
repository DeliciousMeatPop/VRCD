import { decodeApiKey } from '@shared/keyObfuscation'

let cached: string | null = null

/** Decodes the build-time-obfuscated vrSrc API key (see keyObfuscation.ts). */
export function getApiKey(): string {
  if (cached === null) {
    cached = decodeApiKey(process.env.VRSRC_API_KEY_ENC ?? '')
  }
  return cached
}

/** Strips the API key out of arbitrary text before it's logged, uploaded, or displayed. */
export function redactApiKey(s: string): string {
  const k = getApiKey()
  return k ? s.split(k).join('[REDACTED]') : s
}
