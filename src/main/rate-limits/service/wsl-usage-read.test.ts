import type { GlobalSettings } from '../../../shared/global-settings-types'
import { beforeEach, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../shared/constants'
import { wslUsageScope } from '../../../shared/wsl-usage-scope'
import type { ProviderRateLimits } from '../../../shared/rate-limit-types'
import { readWslUsage } from './wsl-usage-read'

const mocks = vi.hoisted(() => ({ claude: vi.fn(), codex: vi.fn() }))
vi.mock('../providers/claude/claude-active-usage-fetch', () => ({
  fetchActiveClaudeRateLimits: mocks.claude
}))
vi.mock('../providers/codex/codex-fetcher', () => ({ fetchCodexRateLimits: mocks.codex }))

function usage(provider: ProviderRateLimits['provider'], percent: number): ProviderRateLimits {
  return {
    provider,
    session: { usedPercent: percent, windowMinutes: 300, resetsAt: null, resetDescription: null },
    weekly: null,
    status: 'ok',
    error: null,
    updatedAt: 1
  }
}
function settings(): GlobalSettings {
  return {
    ...getDefaultSettings('/fixture'),
    claudeManagedAccounts: ['a', 'b'].map((id) => ({
      id,
      email: `${id}@example.com`,
      managedAuthPath: `/profiles/${id}`,
      managedAuthRuntime: 'wsl' as const,
      wslDistro: 'Ubuntu',
      authMethod: 'subscription-oauth' as const,
      createdAt: 1,
      updatedAt: 1,
      lastAuthenticatedAt: 1
    })),
    codexManagedAccounts: ['a', 'b'].map((id) => ({
      id,
      email: `${id}@example.com`,
      managedHomePath: `//wsl.localhost/Ubuntu/home/${id}/.codex`,
      managedHomeRuntime: 'wsl' as const,
      wslDistro: 'Ubuntu',
      createdAt: 1,
      updatedAt: 1,
      lastAuthenticatedAt: 1
    })),
    activeClaudeManagedAccountIdsByRuntime: { host: null, wsl: { Ubuntu: 'a' } },
    activeCodexManagedAccountIdsByRuntime: { host: null, wsl: { Ubuntu: 'a' } }
  }
}
function sources() {
  return {
    claude: async () => ({
      runtime: 'wsl' as const,
      wslDistro: 'Ubuntu',
      configDir: '/profiles/a',
      envPatch: {},
      provenance: 'profile:a:wsl:Ubuntu'
    }),
    codex: async () => ({ skip: false, homePath: '//wsl.localhost/Ubuntu/home/a/.codex' }),
    current: () => true,
    claudeEnabled: true
  }
}
beforeEach(() => {
  mocks.claude.mockResolvedValue(usage('claude', 17))
  mocks.codex.mockResolvedValue(usage('codex', 23))
})
it.each(['Ubuntu', 'ubuntu'])(
  'withholds both providers for conflicting casing aliases requested as %s',
  async (distro) => {
    const value = settings()
    value.activeClaudeManagedAccountIdsByRuntime = { host: null, wsl: { Ubuntu: 'a', ubuntu: 'b' } }
    value.activeCodexManagedAccountIdsByRuntime = { host: null, wsl: { Ubuntu: 'a', ubuntu: 'b' } }
    const result = await readWslUsage(distro, wslUsageScope(value, distro), sources())
    expect(result?.claude).toBeNull()
    expect(result?.codex).toBeNull()
  }
)
it('publishes only the proven selected account homes for the requested distro', async () => {
  const result = await readWslUsage('Ubuntu', wslUsageScope(settings(), 'Ubuntu'), sources())
  expect(result?.claude?.session?.usedPercent).toBe(17)
  expect(result?.codex?.session?.usedPercent).toBe(23)
  expect(result?.claudeTarget).toEqual({ runtime: 'wsl', wslDistro: 'Ubuntu' })
})
it('rejects another profile even in the same distro', async () => {
  const result = await readWslUsage('Ubuntu', wslUsageScope(settings(), 'Ubuntu'), {
    ...sources(),
    claude: async () => ({
      runtime: 'wsl',
      wslDistro: 'Ubuntu',
      configDir: '/profiles/b',
      envPatch: {},
      provenance: 'profile:b:wsl:Ubuntu'
    }),
    codex: async () => ({ skip: false, homePath: '//wsl.localhost/Ubuntu/home/b/.codex' })
  })
  expect(result?.claude).toBeNull()
  expect(result?.codex).toBeNull()
})
it('drops the response when account provenance changes during the read', async () => {
  let current = true
  mocks.claude.mockImplementation(async () => {
    current = false
    return usage('claude', 99)
  })
  const result = await readWslUsage('Ubuntu', wslUsageScope(settings(), 'Ubuntu'), {
    ...sources(),
    current: () => current
  })
  expect(result).toBeNull()
})
