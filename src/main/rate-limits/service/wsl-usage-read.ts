import type { ClaudeRuntimeAuthPreparation } from '../../claude-accounts/runtime-auth/runtime-auth-types'
import { fetchActiveClaudeRateLimits } from '../providers/claude/claude-active-usage-fetch'
import { fetchCodexRateLimits } from '../providers/codex/codex-fetcher'
import type { NetworkProxySettings } from '../../../shared/network-proxy'
import type { RateLimitRuntimeTarget, RateLimitState } from '../../../shared/rate-limit-types'
import type { WslUsageScope } from '../../../shared/wsl-usage-scope'
import { claudeAccountDistroKey } from '../../../shared/claude-account-identity'
import { wslUncPathToLinux } from '../../../shared/file-access/wsl-paths'
import { createEmptyRateLimitState } from '../../../shared/rate-limit-state-factory'

type WslReadSources = {
  claude: () => Promise<ClaudeRuntimeAuthPreparation | undefined>
  codex: () => Promise<{ skip: boolean; homePath: string | null }>
  current: () => boolean
  networkProxySettings?: NetworkProxySettings
  claudeEnabled: boolean
}

/** Reads an explicit lane without changing the service's published runtime or credentials. */
export async function readWslUsage(
  distro: string,
  scope: WslUsageScope,
  sources: WslReadSources
): Promise<RateLimitState | null> {
  const target: RateLimitRuntimeTarget = { runtime: 'wsl', wslDistro: distro }
  const signal = AbortSignal.timeout(30_000)
  const [claude, codex] = await Promise.all([
    (async () => {
      if (!scope.claudeAllowed || !sources.claudeEnabled) {
        return null
      }
      const auth = await sources.claude()
      const expected = scope.claudeId ? `profile:${scope.claudeId}:wsl:` : 'wsl:'
      if (
        !auth ||
        auth.runtime !== 'wsl' ||
        claudeAccountDistroKey(auth.wslDistro) !== claudeAccountDistroKey(distro) ||
        !auth.provenance.startsWith(expected) ||
        (!scope.claudeId && auth.provenance !== `wsl:${auth.wslDistro}:system`) ||
        !sources.current()
      ) {
        return null
      }
      const result = await fetchActiveClaudeRateLimits({
        authPreparation: auth,
        allowPtyFallback: false,
        allowUsagePanelSupplement: false,
        networkProxySettings: sources.networkProxySettings,
        signal
      })
      const after = await sources.claude()
      return sources.current() &&
        after?.provenance === auth.provenance &&
        after.configDir === auth.configDir
        ? result
        : null
    })().catch(() => null),
    (async () => {
      if (!scope.codexAllowed) {
        return null
      }
      const home = await sources.codex()
      const linuxHome = home.homePath ? wslUncPathToLinux(home.homePath, distro) : null
      const selectedHome = scope.codexHome ? wslUncPathToLinux(scope.codexHome, distro) : null
      if (
        home.skip ||
        !linuxHome ||
        (scope.codexHome && selectedHome !== linuxHome) ||
        !sources.current()
      ) {
        return null
      }
      const result = await fetchCodexRateLimits({
        codexHomePath: home.homePath,
        networkProxySettings: sources.networkProxySettings,
        signal
      })
      const after = await sources.codex()
      return sources.current() && !after.skip && after.homePath === home.homePath ? result : null
    })().catch(() => null)
  ])
  return sources.current()
    ? createEmptyRateLimitState({ claudeTarget: target, codexTarget: target, claude, codex })
    : null
}
