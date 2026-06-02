import type { PackTarget, WorkflowMeta } from './types.js'

export const claudePackTarget: PackTarget = {
  name: 'claude',
  finalize(canonicalScript: string, _meta: WorkflowMeta): string {
    // Claude runs the canonical script as-is. Reserved for future install-time
    // touches (slash-command registration handled separately by --install).
    return canonicalScript
  },
}
