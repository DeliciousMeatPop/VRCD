import { describe, expect, it } from 'vitest'
import { isPortGame, parsePortList } from './portDetection'

const game = { packageName: 'com.example.port', releaseName: 'Example Port v1 -user' }

describe('parsePortList', () => {
  it('lowercases, trims, drops junk and "_" entries', () => {
    expect([...parsePortList({ ports: [' Com.A ', '_doc', 5, ''] })]).toEqual(['com.a'])
  })
  it('tolerates bad payloads', () => {
    expect(parsePortList(null).size).toBe(0)
    expect(parsePortList({ ports: 'x' }).size).toBe(0)
    expect(parsePortList([]).size).toBe(0)
  })
})

describe('isPortGame', () => {
  it('matches on package or release name', () => {
    expect(isPortGame(game, new Set(['com.example.port']))).toBe(true)
    expect(isPortGame(game, new Set(['example port v1 -user']))).toBe(true)
    expect(isPortGame(game, new Set(['other']))).toBe(false)
  })
})
