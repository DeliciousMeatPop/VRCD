import { describe, expect, it } from 'vitest'
import { decodeApiKey, encodeApiKey } from './keyObfuscation'

const KEY = 'vrsrc_test_key_0123456789abcdef'

describe('catalog credential envelope', () => {
  it('round-trips a key', () => {
    expect(decodeApiKey(encodeApiKey(KEY))).toBe(KEY)
  })

  it('produces a different envelope for every build', () => {
    const first = encodeApiKey(KEY)
    const second = encodeApiKey(KEY)
    expect(first).not.toBe(second)
    expect(decodeApiKey(first)).toBe(KEY)
    expect(decodeApiKey(second)).toBe(KEY)
  })

  it('does not contain the plaintext key', () => {
    expect(encodeApiKey(KEY)).not.toContain(KEY)
  })

  it('rejects tampered payloads', () => {
    const encoded = encodeApiKey(KEY)
    const parts = encoded.split(':')
    const payload = Buffer.from(parts[3], 'base64url')
    payload[payload.length - 1] ^= 0xff
    parts[3] = payload.toString('base64url')
    expect(() => decodeApiKey(parts.join(':'))).toThrow()
  })

  it('rejects unknown formats', () => {
    expect(() => decodeApiKey('not-an-envelope')).toThrow(/Unsupported/)
  })

  it('keeps an empty key empty', () => {
    expect(encodeApiKey('')).toBe('')
    expect(decodeApiKey('')).toBe('')
  })
})
