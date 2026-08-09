import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { isCompletedDownloadFile, validateDownloadCompletion } from './archiveDiscovery.ts'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const file = (relativePath, size = 100) => ({ relativePath, size })

test('accepts a complete canonical archive while ignoring AppleDouble files', () => {
  const result = validateDownloadCompletion(
    [
      file('._game.7z.001', 4096),
      file('game.7z.001', 500),
      file('._game.7z.002', 4096),
      file('game.7z.002', 250)
    ],
    true
  )

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.archive?.volumeNames, ['game.7z.001', 'game.7z.002'])
})

test('does not count AppleDouble sidecars as a completed download', () => {
  const result = validateDownloadCompletion([file('._game.7z.001', 4096)], true)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.error, /No usable/)
})

test('rejects and retains a partial when canonical volumes also exist', () => {
  const input = [file('game.7z.001', 500), file('game.7z.002.token.partial', 200)]
  const result = validateDownloadCompletion(input, true)

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.error, /data was kept/)
  assert.equal(input.length, 2)
})

test('rejects server-provided tmp volumes before extraction', () => {
  const result = validateDownloadCompletion(
    [file('game.7z.001.tmp', 500), file('game.7z.002.tmp', 250)],
    true
  )

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.error, /server supplied .*\.tmp/)
})

test('rejects empty and truncated canonical volumes', () => {
  const empty = validateDownloadCompletion([file('game.7z.001', 0)], true)
  assert.equal(empty.ok, false)
  if (!empty.ok) assert.match(empty.error, /empty or unreadable/)

  const truncated = validateDownloadCompletion(
    [file('game.7z.001', 500), file('game.7z.002', 400), file('game.7z.003', 200)],
    true
  )
  assert.equal(truncated.ok, false)
  if (!truncated.ok) assert.match(truncated.error, /unexpected size/)
})

test('rejects a final volume larger than the preceding full volumes', () => {
  const result = validateDownloadCompletion(
    [file('game.7z.001', 500), file('game.7z.002', 600)],
    true
  )

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.error, /final archive volume/)
})

test('mirror downloads may contain ordinary files but never leftovers', () => {
  assert.equal(validateDownloadCompletion([file('game.apk')], false).ok, true)
  assert.equal(validateDownloadCompletion([file('._game.apk', 4096)], false).ok, false)
  assert.equal(
    validateDownloadCompletion([file('game.apk'), file('obb.token.partial')], false).ok,
    false
  )
  assert.equal(validateDownloadCompletion([file('game.7z.001.tmp')], false).ok, false)
})

test('resume accounting excludes AppleDouble, tmp, and partial artifacts', () => {
  assert.equal(isCompletedDownloadFile('game.7z.001', true), true)
  assert.equal(isCompletedDownloadFile('._game.7z.001', true), false)
  assert.equal(isCompletedDownloadFile('game.7z.002.tmp', true), false)
  assert.equal(isCompletedDownloadFile('game.7z.002.token.partial', true), false)
  assert.equal(isCompletedDownloadFile('nested/game.7z.001', true), false)
})

test(
  'accepts a real split 7z archive surrounded by AppleDouble sidecars',
  { skip: process.platform !== 'darwin' },
  async () => {
    const sevenZip = join(process.cwd(), 'resources', 'bin', 'mac', '7zz')
    const directory = await mkdtemp(join(tmpdir(), 'vrcd-archive-completion-'))
    try {
      const payload = join(directory, 'payload.bin')
      const archive = join(directory, 'fixture.7z')
      await writeFile(payload, randomBytes(2_500_000))

      const created = spawnSync(sevenZip, ['a', archive, payload, '-mx=0', '-v1m'], {
        encoding: 'utf8'
      })
      assert.equal(created.status, 0, created.stderr || created.stdout)

      const names = (await readdir(directory)).filter((name) => /^fixture\.7z\.\d+$/.test(name))
      assert.ok(names.length >= 2)
      const files = await Promise.all(
        names.map(async (name) => file(name, (await stat(join(directory, name))).size))
      )
      files.push(file('._fixture.7z.001', 4096))

      const completion = validateDownloadCompletion(files, true)
      assert.equal(completion.ok, true)

      const tested = spawnSync(sevenZip, ['t', join(directory, 'fixture.7z.001')], {
        encoding: 'utf8'
      })
      assert.equal(tested.status, 0, tested.stderr || tested.stdout)
      assert.match(tested.stdout, /Everything is Ok/)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
)
