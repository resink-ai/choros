import { build } from 'esbuild'

/** Bundle a workflow entry into a single self-contained ESM string (imports inlined). */
export async function bundleEntry(entryPath: string): Promise<string> {
  const result = await build({
    entryPoints: [entryPath],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'esnext',
    write: false,
    legalComments: 'none',
    logLevel: 'silent',
  })
  const file = result.outputFiles?.[0]
  if (!file) throw new Error(`esbuild produced no output for ${entryPath}`)
  return file.text
}
