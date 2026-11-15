import { join } from 'node:path'
import type { ClaudeRuntimeAuthPreparation } from '../../claude-accounts/runtime-auth/runtime-auth-types'
import { fetchActiveClaudeRateLimits } from '../providers/claude/claude-active-usage-fetch'
import { fetchCodexRateLimits } from '../providers/codex/codex-fetcher'
import type { NetworkProxySettings } from '../../../shared/network-proxy'
import type { ProviderRateLimits } from '../../../shared/agent-usage/rate-limits/rate-limit-types'
import type { WslUsageScope } from '../../../shared/wsl-usage-scope'
import { claudeAccountDistroKey } from '../../../shared/claude-account-identity'
import { wslUncPathToLinux } from '../../../shared/file-access/wsl-paths'
import { wslCredentialGeneration } from './wsl-credential-generation'

export type WslReadSources = {
  claude: () => Promise<ClaudeRuntimeAuthPreparation | undefined>
  codex: () => Promise<{ skip: boolean; homePath: string | null }>
  current: () => boolean
  networkProxySettings?: NetworkProxySettings
  claudeEnabled: boolean
}
export type WslProviderRead = {
  limits: ProviderRateLimits | null
  credential: { path: string; generation: string } | null
  retry: boolean
  confirm?: () => Promise<boolean>
}
export type WslUsageRead = { claude: WslProviderRead; codex: WslProviderRead }
export type WslReadProviders = { claude: boolean; codex: boolean }
export const unavailableWslProvider: WslProviderRead = {
  limits: null,
  credential: null,
  retry: false
}
const unavailable = unavailableWslProvider

async function readCredentialUsage(
  path: string,
  fetch: () => Promise<ProviderRateLimits>,
  signal: AbortSignal
): Promise<WslProviderRead> {
  const before = await wslCredentialGeneration(path, signal)
  if (!before || signal.aborted) {
    return { ...unavailable, retry: true }
  }
  const limits = await fetch().catch(() => null)
  if (signal.aborted) {
    return unavailable
  }
  const after = await wslCredentialGeneration(path, signal)
  if (!after || before !== after || signal.aborted) {
    return { ...unavailable, retry: true }
  }
  return { limits, credential: limits ? { path, generation: before } : null, retry: false }
}

/** Reads explicit credential homes without changing the global poller's runtime. */
export async function readWslUsage(
  distro: string,
  scope: WslUsageScope,
  sources: WslReadSources,
  signal: AbortSignal,
  providers: WslReadProviders
): Promise<WslUsageRead> {
  const [claude, codex] = await Promise.all([
    (async () => {
      if (!providers.claude || !scope.claudeAllowed || !sources.claudeEnabled) {
        return unavailable
      }
      const auth = await sources.claude()
      if (
        !auth ||
        auth.runtime !== 'wsl' ||
        claudeAccountDistroKey(auth.wslDistro) !== claudeAccountDistroKey(distro) ||
        !matchesClaudeSelection(auth, scope) ||
        !sources.current() ||
        signal.aborted
      ) {
        return unavailable
      }
      const reading = await readCredentialUsage(
        join(auth.configDir, '.credentials.json'),
        () =>
          fetchActiveClaudeRateLimits({
            authPreparation: auth,
            allowPtyFallback: false,
            allowUsagePanelSupplement: false,
            networkProxySettings: sources.networkProxySettings,
            signal
          }),
        signal
      )
      const confirm = async () => {
        const after = await sources.claude()
        return (
          sources.current() &&
          after !== undefined &&
          matchesClaudeSelection(after, scope) &&
          after.provenance === auth.provenance &&
          after.configDir === auth.configDir
        )
      }
      return (await confirm()) ? { ...reading, confirm } : unavailable
    })().catch(() => unavailable),
    (async () => {
      if (!providers.codex || !scope.codexAllowed) {
        return unavailable
      }
      const home = await sources.codex()
      const linuxHome = home.homePath ? wslUncPathToLinux(home.homePath, distro) : null
      const selectedHome = scope.codexHome ? wslUncPathToLinux(scope.codexHome, distro) : null
      if (
        home.skip ||
        !home.homePath ||
        !linuxHome ||
        (scope.codexHome && selectedHome !== linuxHome) ||
        !sources.current() ||
        signal.aborted
      ) {
        return unavailable
      }
      const reading = await readCredentialUsage(
        join(home.homePath, 'auth.json'),
        () =>
          fetchCodexRateLimits({
            codexHomePath: home.homePath,
            networkProxySettings: sources.networkProxySettings,
            signal
          }),
        signal
      )
      const confirm = async () => {
        const after = await sources.codex()
        return sources.current() && !after.skip && after.homePath === home.homePath
      }
      return (await confirm()) ? { ...reading, confirm } : unavailable
    })().catch(() => unavailable)
  ])
  return { claude, codex }
}

export async function unconfirmedWslProviders(
  reading: WslUsageRead,
  signal: AbortSignal
): Promise<WslReadProviders> {
  const unconfirmed = async (provider: WslProviderRead) =>
    provider.retry ||
    (!!provider.confirm && !(await provider.confirm())) ||
    (!!provider.credential &&
      (await wslCredentialGeneration(provider.credential.path, signal)) !==
        provider.credential.generation)
  const [claude, codex] = await Promise.all([
    unconfirmed(reading.claude),
    unconfirmed(reading.codex)
  ])
  return { claude, codex }
}

function matchesClaudeSelection(auth: ClaudeRuntimeAuthPreparation, scope: WslUsageScope): boolean {
  const system = auth.provenance === `wsl:${auth.wslDistro}:system`
  if (!scope.claudeId) {
    return system && !auth.selectedAccountId
  }
  return (
    auth.provenance === `profile:${scope.claudeId}:wsl:${auth.wslDistro}` ||
    (system && auth.selectedAccountId === scope.claudeId)
  )
}
