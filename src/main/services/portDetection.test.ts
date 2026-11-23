import { describe, expect, it } from 'vitest'
import { isPortGame, noteLooksLikePort, parsePortOverrides } from './portDetection'

const none = { include: [], exclude: [] }
const game = { packageName: 'com.example.port', releaseName: 'Example Port v1 -user' }

describe('noteLooksLikePort', () => {
  it('flags notes that need Steam files', () => {
    expect(noteLooksLikePort('You must copy the Steam files into the game folder.')).toBe(true)
    expect(noteLooksLikePort('Requires Steam version of the game.')).toBe(true)
    expect(noteLooksLikePort('Own the game on Steam, then add your files')).toBe(true)
  })
  it('ignores unrelated notes', () => {
    expect(noteLooksLikePort('')).toBe(false)
    expect(noteLooksLikePort('Install the APK and enjoy.')).toBe(false)
    expect(noteLooksLikePort('Also available on SteamVR')).toBe(false)
  })
})

describe('parsePortOverrides', () => {
  it('lowercases, trims and drops "_" breadcrumbs and junk', () => {
    expect(
      parsePortOverrides({ include: [' Com.A ', '_doc', 5], exclude: ['B'], other: 1 })
    ).toEqual({ include: ['com.a'], exclude: ['b'] })
  })
  it('tolerates bad payloads', () => {
    expect(parsePortOverrides(null)).toEqual(none)
    expect(parsePortOverrides([])).toEqual(none)
  })
})

describe('isPortGame', () => {
  it('uses the note when there is no override', () => {
    expect(isPortGame(game, 'needs Steam files', none)).toBe(true)
    expect(isPortGame(game, 'plain note', none)).toBe(false)
    expect(isPortGame(game, null, none)).toBe(false)
  })
  it('include forces a port, exclude beats everything', () => {
    expect(isPortGame(game, '', { include: ['com.example.port'], exclude: [] })).toBe(true)
    expect(
      isPortGame(game, 'needs Steam files', { include: [], exclude: ['example port v1 -user'] })
    ).toBe(false)
    expect(
      isPortGame(game, '', { include: ['com.example.port'], exclude: ['com.example.port'] })
    ).toBe(false)
  })
})
