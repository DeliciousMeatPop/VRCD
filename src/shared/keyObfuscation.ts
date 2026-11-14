/**
 * Build-time envelope for embedding the vrSrc API key in the packaged app.
 *
 * This is obfuscation, not secrecy. The decoder ships inside the application,
 * the source is public, and the decoded key exists in memory and on the wire
 * while the app runs: anyone able to read the code or inspect the process can
 * recover it. What the envelope buys is that a released build contains no
 * reusable plaintext string and no single fixed mask that decodes every build.
 *
 * The payload is versioned, so the format can change without breaking older
 * bundled builds: `fcbk1:<salt>:<nonce>:<tag+ ciphertext>` (base64url parts).
 * Each build gets a random salt and nonce, and AES-256-GCM authenticates the
 * payload. A leaked decoder no longer turns every build into the same key.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const PREFIX = 'fcbk1'
const SALT_BYTES = 16
const NONCE_BYTES = 12
const TAG_BYTES = 16

// The envelope key material. It is deliberately split so the packed bundle
// does not contain one obvious constant; it is not a secret from anyone who
// reads this file.
const ENVELOPE_SECRET = [
  'frame-cyberdeck',
  'catalog-credential',
  'envelope-v1',
  'a7c1f0e9',
  '5b2d8643'
].join(':')

function deriveKey(salt: Buffer): Buffer {
  return scryptSync(ENVELOPE_SECRET, salt, 32)
}

function toBase64Url(data: Buffer): string {
  return data.toString('base64url')
}

function fromBase64Url(data: string): Buffer {
  return Buffer.from(data, 'base64url')
}

export function encodeApiKey(rawKey: string): string {
  if (!rawKey) return ''

  const salt = randomBytes(SALT_BYTES)
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(salt), nonce)
  cipher.setAAD(Buffer.from(PREFIX, 'utf-8'))
  const ciphertext = Buffer.concat([cipher.update(rawKey, 'utf-8'), cipher.final()])
  const payload = Buffer.concat([cipher.getAuthTag(), ciphertext])

  return [PREFIX, toBase64Url(salt), toBase64Url(nonce), toBase64Url(payload)].join(':')
}

export function decodeApiKey(encoded: string): string {
  if (!encoded) return ''
  const parts = encoded.split(':')
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error('Unsupported catalog credential envelope')
  }

  const salt = fromBase64Url(parts[1])
  const nonce = fromBase64Url(parts[2])
  const payload = fromBase64Url(parts[3])
  if (salt.length !== SALT_BYTES || nonce.length !== NONCE_BYTES || payload.length <= TAG_BYTES) {
    throw new Error('Malformed catalog credential envelope')
  }

  const decipher = createDecipheriv('aes-256-gcm', deriveKey(salt), nonce)
  decipher.setAAD(Buffer.from(PREFIX, 'utf-8'))
  decipher.setAuthTag(payload.subarray(0, TAG_BYTES))
  return Buffer.concat([decipher.update(payload.subarray(TAG_BYTES)), decipher.final()]).toString(
    'utf-8'
  )
}
