/**
 * Reversible obfuscation for embedding the vrSrc API key in the built bundle.
 *
 * This does NOT stop a determined attacker - the decoded key still exists in
 * memory and on the wire at runtime, so anyone willing to hook the process or
 * sniff traffic can still recover it. All this buys us is that a plain-text
 * string search (`strings app.asar | grep -i key`) of the packaged app no
 * longer turns up the raw key, which is how it's been getting lifted so far.
 */
const MASK = 'vr-cyberdeck-build-obfuscation-mask-v1'

function xor(input: string, mask: string): string {
  let out = ''
  for (let i = 0; i < input.length; i++) {
    out += String.fromCharCode(input.charCodeAt(i) ^ mask.charCodeAt(i % mask.length))
  }
  return out
}

export function encodeApiKey(rawKey: string): string {
  if (!rawKey) return ''
  return Buffer.from(xor(rawKey, MASK), 'utf-8').toString('base64')
}

export function decodeApiKey(encoded: string): string {
  if (!encoded) return ''
  return xor(Buffer.from(encoded, 'base64').toString('utf-8'), MASK)
}
