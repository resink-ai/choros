import { parseArgs } from 'node:util'

export type PackArgs = {
  command: 'pack'
  platform: string
  flow: string
  out: string | undefined
  install: boolean
}

export type RunArgs = {
  command: 'run'
  platform: string
  flow: string | undefined
  flowScript: string | undefined
  args: unknown
  budget: number | null
  db: string | undefined
  record: boolean
}

export type CliArgs = PackArgs | RunArgs

export function parseCli(argv: string[]): CliArgs {
  const [command, ...rest] = argv
  if (command === 'pack') {
    const { values } = parseArgs({
      args: rest,
      options: {
        platform: { type: 'string' },
        flow: { type: 'string' },
        out: { type: 'string' },
        install: { type: 'boolean', default: false },
      },
      allowPositionals: false,
    })
    if (!values.platform) throw new Error('pack requires --platform')
    if (!values.flow) throw new Error('pack requires --flow')
    return { command: 'pack', platform: values.platform, flow: values.flow, out: values.out, install: !!values.install }
  }
  if (command === 'run') {
    const { values } = parseArgs({
      args: rest,
      options: {
        platform: { type: 'string' },
        flow: { type: 'string' },
        'flow-script': { type: 'string' },
        args: { type: 'string' },
        budget: { type: 'string' },
        db: { type: 'string' },
        'no-record': { type: 'boolean', default: false },
      },
      allowPositionals: false,
    })
    if (!values.platform) throw new Error('run requires --platform')
    if (!values.flow && !values['flow-script']) throw new Error('run requires --flow or --flow-script')
    return {
      command: 'run',
      platform: values.platform,
      flow: values.flow,
      flowScript: values['flow-script'],
      args: values.args ? JSON.parse(values.args) : undefined,
      budget: values.budget ? Number(values.budget) : null,
      db: values.db,
      record: !values['no-record'],
    }
  }
  throw new Error(`unknown command "${command ?? ''}" (expected: pack | run)`)
}
