import { describe, expect, it, vi } from 'vitest'
import { runSafetyFix } from './safetyFix'

describe('runSafetyFix', () => {
  it('reports all 9 on success without leaking commands', async () => {
    const run = vi.fn().mockResolvedValue('')
    const r = await runSafetyFix(run)
    expect(run).toHaveBeenCalledTimes(9)
    expect(r.message).toBe('All 9 commands ran successfully.')
    expect(r.message).not.toMatch(/device_config|appops|pm clear/)
  })
  it('counts null, error output and throws as failures', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('Error: boom')
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValue('Success')
    const r = await runSafetyFix(run)
    expect(r.failed).toEqual([1, 2, 3])
    expect(r.succeeded).toBe(6)
  })
})
