import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseReleaseManifest,
  RELEASE_MANIFEST_FILENAME,
  RELEASE_METADATA_SIDECARS,
  isReleaseMetadataSidecar
} from './releaseManifest.ts'

// Real-world example (Arizona Sunshine Remake), trimmed but structurally intact.
const SAMPLE = `#VRPRELEASEMANIFEST 1.0
Game Name;Release Name;Package Name;Version Code;Last Updated;Size (MB);Downloads;Rating;Rating Count
Arizona Sunshine Remake;Arizona Sunshine Remake v112989+1.1.87484 -VRP;com.vertigogames.azs1hd;112989;2025-10-19 12:12 UTC;23263;0;0;0

#filelist
type;name;size
f;./com.vertigogames.azs1hd.apk;1030074668
d;./com.vertigogames.azs1hd;0
f;./com.vertigogames.azs1hd/asset-config.json;950
f;./com.vertigogames.azs1hd/scenesmobile0.main.com.vertigogames.azs1hd.obb;3075599129
f;./com.vertigogames.azs1hd/vertigoresourcesmobilehq.main.com.vertigogames.azs1hd.obb;2976851679`

test('exports the expected manifest filename', () => {
  assert.equal(RELEASE_MANIFEST_FILENAME, 'release.manifest')
})

test('parses only file rows and strips the leading ./', () => {
  const { files } = parseReleaseManifest(SAMPLE)
  // 4 file rows; the single directory row is ignored.
  assert.equal(files.length, 4)
  assert.deepEqual(files[0], { path: 'com.vertigogames.azs1hd.apk', size: 1030074668 })
  assert.deepEqual(files[1], { path: 'com.vertigogames.azs1hd/asset-config.json', size: 950 })
  assert.equal(files[2].size, 3075599129)
  // No directory entry leaks in.
  assert.equal(
    files.some((f) => f.path === 'com.vertigogames.azs1hd'),
    false
  )
})

test('handles large OBB sizes beyond 2^31 without truncation', () => {
  const { files } = parseReleaseManifest(SAMPLE)
  const obb = files.find((f) =>
    f.path.endsWith('vertigoresourcesmobilehq.main.com.vertigogames.azs1hd.obb')
  )
  assert.ok(obb)
  assert.equal(obb.size, 2976851679)
})

test('ignores the meta section before #filelist', () => {
  const { files } = parseReleaseManifest(SAMPLE)
  // The metadata row also contains ';'-separated fields but must not be parsed.
  assert.equal(
    files.some((f) => f.path.includes('Arizona')),
    false
  )
})

test('returns no files for an empty or manifest-less input', () => {
  assert.deepEqual(parseReleaseManifest('').files, [])
  assert.deepEqual(parseReleaseManifest('#VRPRELEASEMANIFEST 1.0\nsome;meta;row').files, [])
})

test('tolerates CRLF line endings and blank lines', () => {
  const crlf = SAMPLE.replace(/\n/g, '\r\n')
  assert.equal(parseReleaseManifest(crlf).files.length, 4)
})

test('skips malformed file rows without throwing', () => {
  const input = `#filelist
type;name;size
f;./ok.bin;123
f;./bad.bin;notanumber
f;./missing-size
f;;456
garbage line
d;./dir;0`
  const { files } = parseReleaseManifest(input)
  assert.deepEqual(files, [{ path: 'ok.bin', size: 123 }])
})

test('treats release.manifest and release.add as metadata sidecars', () => {
  // Both are release-root metadata, not game payload — they must be skipped by
  // manifest verification so their absence never fails an otherwise-good install.
  assert.equal(isReleaseMetadataSidecar('release.manifest'), true)
  assert.equal(isReleaseMetadataSidecar('release.add'), true)
  assert.ok(RELEASE_METADATA_SIDECARS.has('release.add'))
  assert.ok(RELEASE_METADATA_SIDECARS.has(RELEASE_MANIFEST_FILENAME))
})

test('sidecar match is case-insensitive but only at the release root', () => {
  assert.equal(isReleaseMetadataSidecar('RELEASE.ADD'), true)
  assert.equal(isReleaseMetadataSidecar('Release.Manifest'), true)
  // A real game asset is never treated as a sidecar.
  assert.equal(isReleaseMetadataSidecar('com.example.game.apk'), false)
  // A same-named file nested inside a package folder is still a real file.
  assert.equal(isReleaseMetadataSidecar('com.example.game/release.add'), false)
})

test('stops treating rows as files after a later # section', () => {
  const input = `#filelist
type;name;size
f;./a.bin;1
#somethingelse
f;./b.bin;2`
  const { files } = parseReleaseManifest(input)
  assert.deepEqual(files, [{ path: 'a.bin', size: 1 }])
})
