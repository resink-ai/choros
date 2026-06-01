import { HELLO_SCHEMA } from './schemas/hello.js'

export const meta = {
  name: 'hello-fan',
  description: 'Two greeters run in parallel and a summarizer combines them',
  phases: [{ title: 'Greet' }, { title: 'Summarize' }],
}

export default async function run() {
  phase('Greet')
  const names = (args && args.names) || ['Ada', 'Linus']
  const greetings = await parallel(
    names.map((n) => () =>
      agent(`Greet ${n} in one short sentence.`, { label: `greet:${n}`, schema: HELLO_SCHEMA }),
    ),
  )
  phase('Summarize')
  const summary = await agent(
    `Summarize these greetings in one line: ${JSON.stringify(greetings)}`,
    { label: 'summarize' },
  )
  log(`done: ${names.length} greeted`)
  return { greetings, summary }
}
