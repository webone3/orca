import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RateLimitService } from './rate-limit-service'
import { ClaudeWslProfileRouter } from '../../claude-accounts/profiles/wsl/claude-profile-wsl-router'
import { getDefaultSettings } from '../../../shared/constants'
import { wslUsageScope } from '../../../shared/wsl-usage-scope'
import { deferred, okProvider } from './rate-limit-service-test-harness'
import { readAuthTextFile } from '../providers/auth-filesystem-reads'
import type * as FsPromises from 'node:fs/promises'

const io = vi.hoisted(() => ({ stat: vi.fn(), lstat: vi.fn(), readFile: vi.fn() }))
vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof FsPromises>()),
  ...io
}))
vi.mock('../../wsl/discovery/distro-catalog', () => ({
  getWslHomeAsync: async () => '//wsl.localhost/Ubuntu/home/test',
  listRunningWslDistrosAsync: async () => ['Ubuntu']
}))
vi.mock('../providers/claude/claude-oauth-usage-request', () => ({
  fetchClaudeOAuthUsage: async () => okProvider('claude', 17)
}))
vi.mock('../../claude-accounts/runtime-auth/keychain', () => ({
  readActiveClaudeKeychainCredentialsStrict: async () => null,
  claudeConfigDirSpellings: () => [],
  claudeKeychainService: () => 'fixture'
}))
vi.mock('../providers/codex/codex-fetcher', () => ({
  fetchCodexRateLimits: async () => okProvider('codex', 23)
}))
vi.mock('../providers/grok/grok-auth', () => ({
  readGrokAuthSession: () => ({ status: 'missing' })
}))
vi.mock('./wsl-credential-generation', () => ({
  wslCredentialGeneration: async () => 'fixture-generation'
}))

beforeEach(() => {
  io.stat.mockReset().mockResolvedValue({ mtimeMs: 1, size: 100 })
  io.lstat.mockReset().mockResolvedValue({ isDirectory: () => true })
  io.readFile
    .mockReset()
    .mockImplementation(async (path) =>
      String(path).endsWith('.credentials.json')
        ? JSON.stringify({ claudeAiOauth: { accessToken: 'fixture-token' } })
        : JSON.stringify({ oauthAccount: { emailAddress: 'a@example.test' } })
    )
})
afterEach(() => vi.restoreAllMocks())

it.each(['preparation', 'credentials'] as const)(
  'retains a timed-out %s read through settlement while refreshes and local reads remain usable',
  async (stage) => {
    const config = {
      ...getDefaultSettings('/fixture'),
      claudeManagedAccounts: [
        {
          id: `unc-${stage}`,
          email: 'a@example.test',
          managedAuthRuntime: 'wsl' as const,
          wslDistro: 'Ubuntu',
          managedAuthPath: '/unused',
          authMethod: 'subscription-oauth' as const,
          createdAt: 1,
          updatedAt: 1,
          lastAuthenticatedAt: 1
        }
      ],
      activeClaudeManagedAccountIdsByRuntime: { host: null, wsl: { Ubuntu: `unc-${stage}` } }
    }
    const router = new ClaudeWslProfileRouter({ getSettings: () => config, dataRoot: '/fixture' })
    const value = new RateLimitService()
    value.setClaudeOAuthUsageEnabledResolver(() => true)
    value.setClaudeAuthPreparationResolver(() => router.preparation('Ubuntu'))
    value.setCodexHomePathResolver(() => ({
      kind: 'ready',
      codexHomePath: '//wsl.localhost/Ubuntu/home/test/.codex'
    }))
    const scope = wslUsageScope(config, 'Ubuntu')
    const read = (id: string) => value.readWsl('Ubuntu', scope, id, () => true)
    const deadlines: AbortController[] = []
    const originalTimeout = AbortSignal.timeout
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      if (ms !== 30_000) {
        return originalTimeout(ms)
      }
      const controller = new AbortController()
      deadlines.push(controller)
      return controller.signal
    })
    const started = deferred<void>()
    const release = deferred<void>()
    if (stage === 'preparation') {
      io.stat.mockImplementationOnce(async () => {
        started.resolve()
        await release.promise
        return { mtimeMs: 1, size: 100 }
      })
    } else {
      const normal = io.readFile.getMockImplementation()!
      io.readFile.mockImplementation(async (path) => {
        if (String(path).endsWith('.credentials.json')) {
          started.resolve()
          await release.promise
        }
        return normal(path)
      })
    }
    const first = read('first')
    await started.promise
    deadlines[0].abort(new Error('provider deadline'))
    const expired = await first
    expect(expired?.claude).toBeNull()
    expect(expired?.codex?.session?.usedPercent).toBe(23)
    // Each new activation must skip the still-owned provider, even after its caller expired.
    expect((await read('second'))?.claude).toBeNull()
    expect((await read('third'))?.claude).toBeNull()
    await expect(readAuthTextFile('/local/fixture')).resolves.toContain('a@example.test')
    release.resolve()
    // The same read id remains unavailable until raw settlement retires its ownership.
    await expect.poll(async () => (await read('recovered'))?.claude?.session?.usedPercent).toBe(17)
  }
)
