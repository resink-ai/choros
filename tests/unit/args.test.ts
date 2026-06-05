import { describe, it, expect } from 'vitest'
import { parseCli } from '../../src/cli/args.js'

describe('parseCli', () => {
  it('parses pack with platform and flow', () => {
    const r = parseCli(['pack', '--platform', 'claude', '--flow', 'trading-agents'])
    expect(r).toEqual({ command: 'pack', platform: 'claude', flow: 'trading-agents', out: undefined, install: false })
  })

  it('parses run with flow-script, args json, and budget', () => {
    const r = parseCli(['run', '--platform', 'codex', '--flow-script', 'a.js', '--args', '{"x":1}', '--budget', '500000'])
    expect(r).toEqual({
      command: 'run', platform: 'codex', flow: undefined, flowScript: 'a.js',
      args: { x: 1 }, budget: 500000, db: undefined, record: true,
    })
  })

  it('parses run recording flags (--db, --no-record)', () => {
    const a = parseCli(['run', '--platform', 'codex', '--flow', 'x', '--db', '/tmp/r.db'])
    expect(a).toMatchObject({ db: '/tmp/r.db', record: true })
    const b = parseCli(['run', '--platform', 'codex', '--flow', 'x', '--no-record'])
    expect(b).toMatchObject({ db: undefined, record: false })
  })

  it('throws on unknown command', () => {
    expect(() => parseCli(['frobnicate'])).toThrow(/unknown command/i)
  })

  it('throws when run has neither --flow nor --flow-script', () => {
    expect(() => parseCli(['run', '--platform', 'codex'])).toThrow(/--flow or --flow-script/i)
  })
})
