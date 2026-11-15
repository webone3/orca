import type { ClaudeEnvPatch } from './environment'

export type ClaudeRuntimeAuthPreparation = {
  configDir: string
  runtime?: 'host' | 'wsl'
  wslDistro?: string | null
  wslLinuxConfigDir?: string | null
  envPatch: ClaudeEnvPatch
  /** Selected managed login, including one covered by System default. */
  selectedAccountId?: string | null
  provenance: string
  /** Report unavailable usage without throwing out the entire polling cycle. */
  usageError?: string
}
