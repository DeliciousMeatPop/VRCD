import assert from 'node:assert/strict'
import test from 'node:test'
import { planProfileFolderSync } from './restoreFixups.ts'

const BASE = '/sdcard/Android/data/com.MightyCoconut.WalkaboutMiniGolf/files/Profiles/Oculus'

test('copies the restored save into a new profile folder the game created', () => {
  const plan = planProfileFolderSync({
    existingFilePaths: [`${BASE}/12345/Profile_Default.data`],
    profileDirs: [`${BASE}/12345`, `${BASE}/98765`],
    file: 'Profile_Default.data'
  })
  assert.deepEqual(plan, [
    { from: `${BASE}/12345/Profile_Default.data`, to: `${BASE}/98765/Profile_Default.data` }
  ])
})

test('does nothing when every profile folder already has the save', () => {
  const plan = planProfileFolderSync({
    existingFilePaths: [`${BASE}/12345/Profile_Default.data`],
    profileDirs: [`${BASE}/12345`],
    file: 'Profile_Default.data'
  })
  assert.deepEqual(plan, [])
})

test('returns null when there is no source file to copy from', () => {
  const plan = planProfileFolderSync({
    existingFilePaths: [],
    profileDirs: [`${BASE}/12345`],
    file: 'Profile_Default.data'
  })
  assert.equal(plan, null)
})

test('tolerates trailing slashes on profile dirs and blank entries', () => {
  const plan = planProfileFolderSync({
    existingFilePaths: [`${BASE}/12345/Profile_Default.data`],
    profileDirs: [`${BASE}/12345/`, '', `${BASE}/98765/`],
    file: 'Profile_Default.data'
  })
  assert.deepEqual(plan, [
    { from: `${BASE}/12345/Profile_Default.data`, to: `${BASE}/98765/Profile_Default.data` }
  ])
})

test('fills multiple empty folders from a single source', () => {
  const plan = planProfileFolderSync({
    existingFilePaths: [`${BASE}/a/Profile_Default.data`],
    profileDirs: [`${BASE}/a`, `${BASE}/b`, `${BASE}/c`],
    file: 'Profile_Default.data'
  })
  assert.deepEqual(plan, [
    { from: `${BASE}/a/Profile_Default.data`, to: `${BASE}/b/Profile_Default.data` },
    { from: `${BASE}/a/Profile_Default.data`, to: `${BASE}/c/Profile_Default.data` }
  ])
})
