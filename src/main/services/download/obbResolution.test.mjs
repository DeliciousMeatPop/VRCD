import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveObbDirectory } from './obbResolution.ts'

/**
 * Build a fake ObbFileSystem from a plain description of a directory tree.
 * `tree` maps an absolute dir path to either an array of `{ name, dir }` entries
 * (for the withFileTypes listing) or, for leaf OBB dirs, an array of file names.
 */
function makeFs(tree) {
  return {
    async readdir(path, options) {
      const entry = tree[path]
      if (entry === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      if (options && options.withFileTypes) {
        return entry.map((e) => ({ name: e.name, isDirectory: () => !!e.dir }))
      }
      // Plain listing: return file names (entries described as strings).
      return entry.map((e) => (typeof e === 'string' ? e : e.name))
    }
  }
}

test('resolves the OBB folder by explicit package name', async () => {
  const fs = makeFs({
    '/dl': [
      { name: 'game.apk', dir: false },
      { name: 'com.sanzaru.AW2', dir: true }
    ]
  })
  const obb = await resolveObbDirectory('/dl', 'com.sanzaru.AW2', fs)
  assert.deepEqual(obb, {
    obbPath: '/dl/com.sanzaru.AW2',
    obbDirName: 'com.sanzaru.AW2'
  })
})

test('auto-detects the OBB folder when the package name is blank', async () => {
  const fs = makeFs({
    '/dl': [
      { name: 'game.apk', dir: false },
      { name: 'com.sanzaru.AW2', dir: true }
    ],
    '/dl/com.sanzaru.AW2': ['main.5513.com.sanzaru.AW2.obb']
  })
  const obb = await resolveObbDirectory('/dl', '', fs)
  assert.deepEqual(obb, {
    obbPath: '/dl/com.sanzaru.AW2',
    obbDirName: 'com.sanzaru.AW2'
  })
})

test('auto-detects even when the package name is undefined (single-APK case)', async () => {
  const fs = makeFs({
    '/dl': [{ name: 'com.foo.Bar', dir: true }],
    '/dl/com.foo.Bar': ['patch.1.com.foo.Bar.OBB'] // uppercase extension
  })
  const obb = await resolveObbDirectory('/dl', undefined, fs)
  assert.deepEqual(obb, { obbPath: '/dl/com.foo.Bar', obbDirName: 'com.foo.Bar' })
})

test('returns null for an APK-only release with no OBB folder', async () => {
  const fs = makeFs({
    '/dl': [{ name: 'game.apk', dir: false }]
  })
  const obb = await resolveObbDirectory('/dl', '', fs)
  assert.equal(obb, null)
})

test('ignores a package-style folder that holds no .obb files', async () => {
  const fs = makeFs({
    '/dl': [{ name: 'com.foo.Bar', dir: true }],
    '/dl/com.foo.Bar': ['readme.txt']
  })
  const obb = await resolveObbDirectory('/dl', '', fs)
  assert.equal(obb, null)
})

test('does not treat a non-package-style folder as an OBB folder during auto-detect', async () => {
  const fs = makeFs({
    '/dl': [{ name: 'extras', dir: true }],
    '/dl/extras': ['something.obb']
  })
  // Auto-detect only considers dotted (package-style) folder names.
  const obb = await resolveObbDirectory('/dl', '', fs)
  assert.equal(obb, null)
})

test('falls back to auto-detect when the explicit package name has no matching folder', async () => {
  const fs = makeFs({
    '/dl': [{ name: 'com.actual.Pkg', dir: true }],
    '/dl/com.actual.Pkg': ['main.1.com.actual.Pkg.obb']
  })
  const obb = await resolveObbDirectory('/dl', 'com.stale.Wrong', fs)
  assert.deepEqual(obb, { obbPath: '/dl/com.actual.Pkg', obbDirName: 'com.actual.Pkg' })
})

test('returns null when the base directory cannot be read', async () => {
  const fs = {
    async readdir() {
      throw Object.assign(new Error('boom'), { code: 'EACCES' })
    }
  }
  const obb = await resolveObbDirectory('/nope', 'com.x.y', fs)
  assert.equal(obb, null)
})
