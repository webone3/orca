import { wslUsageScope } from '../../shared/wsl-usage-scope'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { ipcMain } from 'electron'
import type { RateLimitService } from '../rate-limits/service/rate-limit-service'
import type { RateLimitRuntimeTarget } from '../../shared/agent-usage/rate-limits/rate-limit-types'
import type { CodexAccountService } from '../codex-accounts/service'

export function registerRateLimitHandlers(
  rateLimits: RateLimitService,
  codexAccounts: CodexAccountService,
  settings: () => GlobalSettings
): void {
  ipcMain.handle('rateLimits:readWsl', (_event, distro: string, scopeKey: string) => {
    if (typeof distro !== 'string' || !distro.trim()) {
      return null
    }
    const scope = wslUsageScope(settings(), distro)
    if (scope.key !== scopeKey) {
      return null
    }
    return rateLimits.readWsl(
      distro,
      scope,
      () => wslUsageScope(settings(), distro).key === scopeKey
    )
  })
  ipcMain.handle('rateLimits:get', () => rateLimits.getState())
  ipcMain.handle('rateLimits:refresh', () => rateLimits.refresh())
  ipcMain.handle('rateLimits:refreshCodexForTarget', (_event, target: RateLimitRuntimeTarget) =>
    rateLimits.refreshCodexForTarget(target)
  )
  // Why: managed desktop resets must share the mobile mutation queue and durable ledger.
  ipcMain.handle('rateLimits:consumeCodexResetCredit', () =>
    codexAccounts.consumeCurrentRateLimitResetCredit()
  )
  ipcMain.handle('rateLimits:refreshClaudeForTarget', (_event, target: RateLimitRuntimeTarget) =>
    rateLimits.refreshClaudeForTarget(target)
  )
  ipcMain.handle('rateLimits:fetchInactiveClaudeAccounts', () =>
    rateLimits.fetchInactiveClaudeAccountsOnOpen()
  )
  ipcMain.handle('rateLimits:fetchInactiveCodexAccounts', () =>
    rateLimits.fetchInactiveCodexAccountsOnOpen()
  )
  ipcMain.handle('rateLimits:refreshGrok', () => rateLimits.refreshGrok())
}
