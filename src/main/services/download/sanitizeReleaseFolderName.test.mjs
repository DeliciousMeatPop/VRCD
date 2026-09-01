import assert from 'node:assert/strict'
import test from 'node:test'
import { sanitizeReleaseFolderName } from './utils.ts'

test('replaces a colon with a dash (the reported crash)', () => {
  // VR Cyberdeck failed to mkdir this exact release on Windows.
  assert.equal(
    sanitizeReleaseFolderName("Trip the Light: Let's dance v26+0.97 -JF"),
    "Trip the Light- Let's dance v26+0.97 -JF"
  )
})

test('leaves ordinary release names untouched', () => {
  const name = 'Arizona Sunshine Remake v112989+1.1.87484 -VRP'
  assert.equal(sanitizeReleaseFolderName(name), name)
})

test('replaces every character Windows forbids in a path component', () => {
  assert.equal(sanitizeReleaseFolderName('a\\b/c:d*e?f"g<h>i|j'), 'a-b-c-d-e-f-g-h-i-j')
})

test('strips trailing dots and spaces that Windows silently drops', () => {
  assert.equal(sanitizeReleaseFolderName('Some Game. '), 'Some Game')
  assert.equal(sanitizeReleaseFolderName('Some Game v1.0'), 'Some Game v1.0')
})

test('preserves the name used to derive the download hash is a caller concern', () => {
  // Sanity: sanitizing is idempotent, so re-running on a safe folder name is a no-op.
  const once = sanitizeReleaseFolderName("Trip the Light: Let's dance")
  assert.equal(sanitizeReleaseFolderName(once), once)
})
