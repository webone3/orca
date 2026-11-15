import type { GlobalSettings } from './global-settings-types'
import { claudeAccountDistroKey } from './claude-account-identity'

type WslUsageSettings = Pick<
  GlobalSettings,
  | 'activeClaudeManagedAccountIdsByRuntime'
  | 'activeCodexManagedAccountIdsByRuntime'
  | 'claudeManagedAccounts'
  | 'codexManagedAccounts'
>

function selectedLane(selections: Record<string, string | null> | undefined, distro: string) {
  const aliases = Object.entries(selections ?? {}).filter(
    ([key]) => claudeAccountDistroKey(key) === claudeAccountDistroKey(distro)
  )
  const ids = new Set(aliases.map(([, id]) => id))
  return {
    conflict: ids.size > 1,
    id: aliases.find(([key]) => key === distro)?.[1] ?? aliases[0]?.[1] ?? null
  }
}

export function wslUsageScope(settings: WslUsageSettings, distro: string) {
  const claude = selectedLane(settings.activeClaudeManagedAccountIdsByRuntime?.wsl, distro)
  const codex = selectedLane(settings.activeCodexManagedAccountIdsByRuntime?.wsl, distro)
  const claudeAccount = settings.claudeManagedAccounts.find((account) => account.id === claude.id)
  const codexAccount = settings.codexManagedAccounts.find((account) => account.id === codex.id)
  const matches = (runtime: string | undefined, accountDistro: string | null | undefined) =>
    runtime === 'wsl' && claudeAccountDistroKey(accountDistro) === claudeAccountDistroKey(distro)
  return {
    key: JSON.stringify([
      'local-wsl',
      distro,
      settings.activeClaudeManagedAccountIdsByRuntime?.wsl,
      settings.activeCodexManagedAccountIdsByRuntime?.wsl,
      claude,
      claudeAccount,
      codex,
      codexAccount
    ]),
    claudeId: claude.id,
    claudeAllowed:
      !claude.conflict &&
      (!claude.id ||
        (!!claudeAccount && matches(claudeAccount.managedAuthRuntime, claudeAccount.wslDistro))),
    codexAllowed:
      !codex.conflict &&
      (!codex.id ||
        (!!codexAccount && matches(codexAccount.managedHomeRuntime, codexAccount.wslDistro))),
    codexHome: codexAccount?.managedHomePath ?? null
  }
}

export type WslUsageScope = ReturnType<typeof wslUsageScope>
