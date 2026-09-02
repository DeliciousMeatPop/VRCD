import assert from 'node:assert/strict'
import test from 'node:test'
import { isRegeneratedSaveFile } from './saveDataFilter.ts'

// Real paths taken from the Maestro / Into the Radius / Walkabout failure reports.

test('excludes GPU shader / pipeline caches', () => {
  assert.equal(isRegeneratedSaveFile('files/ProgramBinaryCache/GLSL_ES3_1_ANDROID_5DD8F5E5'), true)
  assert.equal(
    isRegeneratedSaveFile('files/VulkanProgramBinaryCache/VulkanPSO_BEDC3013.5143.6050002'),
    true
  )
  assert.equal(isRegeneratedSaveFile('cache/vulkan_pso_cache.bin'), true)
})

test('excludes il2cpp metadata and extracted localization', () => {
  assert.equal(isRegeneratedSaveFile('files/il2cpp/Metadata/global-metadata.dat'), true)
  assert.equal(isRegeneratedSaveFile('files/il2cpp/Resources/mscorlib.dll-resources.dat'), true)
  assert.equal(isRegeneratedSaveFile('files/I2Source_I2Languages1CumfmcJaod9.loc'), true)
})

test('excludes the Oculus platform cache marker', () => {
  assert.equal(isRegeneratedSaveFile('files/cacheFile.txt'), true)
  assert.equal(isRegeneratedSaveFile('files/CacheFile.TXT'), true) // case-insensitive
})

test('KEEPS real save data', () => {
  // Walkabout's actual saves and json data must survive the filter.
  assert.equal(
    isRegeneratedSaveFile('files/Profiles/Oculus/3428494867149971/Profile_Default.data'),
    false
  )
  assert.equal(isRegeneratedSaveFile('files/Profiles/Snapshot.data'), false)
  assert.equal(isRegeneratedSaveFile('files/Data/863549053984779Meta/MC541GgGd0.json'), false)
  assert.equal(isRegeneratedSaveFile('files/PriorityList_Retrieved.json'), false)
})

test('is not fooled by a filename that merely contains "cache"', () => {
  // Only exact cache dirs/basenames are excluded, not any path with the substring.
  assert.equal(isRegeneratedSaveFile('files/Data/MyCacheProgress.json'), false)
  assert.equal(isRegeneratedSaveFile('files/uncached_profile.data'), false)
})

test('handles odd input without throwing', () => {
  assert.equal(isRegeneratedSaveFile(''), false)
  assert.equal(isRegeneratedSaveFile('/'), false)
  assert.equal(isRegeneratedSaveFile('cache/'), false) // trailing slash → no basename file
})
