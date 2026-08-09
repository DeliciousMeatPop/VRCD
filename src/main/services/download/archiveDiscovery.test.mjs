import assert from 'node:assert/strict'
import test from 'node:test'
import { discoverArchive } from './archiveDiscovery.ts'

test('ignores AppleDouble metadata and returns the canonical volumes in order', () => {
  const result = discoverArchive(['._game.7z.002', 'game.7z.002', '._game.7z.001', 'game.7z.001'])

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.archivePart1, 'game.7z.001')
  assert.deepEqual(result.volumeNames, ['game.7z.001', 'game.7z.002'])
})

test('does not accept an AppleDouble file as an archive', () => {
  const result = discoverArchive(['._game.7z.001'])
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.error, /No usable/)
})

test('selects the real Puzzling Places archive instead of its AppleDouble sidecar', () => {
  const archive = 'd92186cdfd50508d2911e51787a00df7.7z.001'
  const result = discoverArchive([`._${archive}`, archive])

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.archivePart1, archive)
})

test('rejects any server-side tmp archive volume', () => {
  const result = discoverArchive(['game.7z.001', 'game.7z.002.tmp', 'game.7z.003'])

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.error, /source is not finalized/)
})

test('rejects a tmp volume family without part 001', () => {
  const result = discoverArchive(['game.7z.002.tmp'])
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.error, /source is not finalized/)
})

test('rejects a gap in the numbered volume sequence', () => {
  const result = discoverArchive(['game.7z.001', 'game.7z.003'])
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.error, /\.7z\.002/)
})

test('rejects a leftover rclone partial for the archive', () => {
  const result = discoverArchive(['game.7z.001', 'game.7z.002.random.partial'])
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.error, /did not finish downloading/)
})

test('rejects multiple archive families even when only one has part 001', () => {
  const result = discoverArchive(['one.7z.001', 'two.7z.002'])
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.error, /Multiple split archives/)
})

test('rejects duplicate numeric volume aliases', () => {
  const result = discoverArchive(['game.7z.001', 'game.7z.0001'])
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.error, /both represent volume 1/)
})

test('groups archive prefixes case-insensitively and rejects duplicates', () => {
  const result = discoverArchive(['Game.7z.001', 'game.7z.001'])
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.error, /both represent volume 1/)
})
