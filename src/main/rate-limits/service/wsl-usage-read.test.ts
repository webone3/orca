import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import { getDefaultSettings } from '../../../shared/constants'
import { wslUsageScope } from '../../../shared/wsl-usage-scope'
import { RateLimitService } from './rate-limit-service'
import { deferred, okProvider } from './rate-limit-service-test-harness'

const mocks = vi.hoisted(() => ({ claude: vi.fn(), codex: vi.fn(), generation: vi.fn() }))
vi.mock('../providers/claude/claude-active-usage-fetch', () => ({
  fetchActiveClaudeRateLimits: mocks.claude
}))
vi.mock('../providers/codex/codex-fetcher', () => ({ fetchCodexRateLimits: mocks.codex }))
vi.mock('../providers/grok/grok-auth', () => ({
  readGrokAuthSession: () => ({ status: 'missing' })
}))
vi.mock('./wsl-credential-generation', () => ({ wslCredentialGeneration: mocks.generation }))

afterEach(() => vi.restoreAllMocks())

const generations: Record<string, string | null> = { claude: 'c1', codex: 'x1' }
function settings(): GlobalSettings {
  return {
    ...getDefaultSettings('/fixture'),
    claudeManagedAccounts: ['a', 'b'].map((id) => ({
      id,
      email: `${id}@example.com`,
      managedAuthPath: `/profiles/${id}`,
      managedAuthRuntime: 'wsl' as const,
      wslDistro: id === 'a' ? 'Ubuntu' : 'Debian',
      authMethod: 'subscription-oauth' as const,
      createdAt: 1,
      updatedAt: 1,
      lastAuthenticatedAt: 1
    })),
    codexManagedAccounts: ['a', 'b'].map((id) => ({
      id,
      email: `${id}@example.com`,
      managedHomePath: `//wsl.localhost/${id === 'a' ? 'Ubuntu' : 'Debian'}/home/${id}/.codex`,
      managedHomeRuntime: 'wsl' as const,
      wslDistro: id === 'a' ? 'Ubuntu' : 'Debian',
      createdAt: 1,
      updatedAt: 1,
      lastAuthenticatedAt: 1
    })),
    activeClaudeManagedAccountIdsByRuntime: { host: null, wsl: { Ubuntu: 'a', Debian: 'b' } },
    activeCodexManagedAccountIdsByRuntime: { host: null, wsl: { Ubuntu: 'a', Debian: 'b' } }
  }
}
function preparation(distro: string) {
  const id = distro === 'Ubuntu' ? 'a' : 'b'
  return {
    runtime: 'wsl' as const,
    wslDistro: distro,
    configDir: `//wsl.localhost/${distro}/profiles/${id}`,
    envPatch: {},
    provenance: `profile:${id}:wsl:${distro}`
  }
}
function service() {
  const value = new RateLimitService()
  value.setClaudeOAuthUsageEnabledResolver(() => true)
  value.setClaudeAuthPreparationResolver(async (target) =>
    preparation(target?.wslDistro ?? 'Ubuntu')
  )
  value.setCodexHomePathResolver((target) => ({
    kind: 'ready',
    codexHomePath: `//wsl.localhost/${target?.wslDistro ?? 'Ubuntu'}/home/${target?.wslDistro === 'Debian' ? 'b' : 'a'}/.codex`
  }))
  return value
}
function read(value: RateLimitService, id: string, distro = 'Ubuntu', config = settings()) {
  const scope = wslUsageScope(config, distro)
  return value.readWsl(distro, scope, id, () => true)
}
beforeEach(() => {
  generations.claude = 'c1'
  generations.codex = 'x1'
  mocks.claude.mockReset().mockResolvedValue(okProvider('claude', 17))
  mocks.codex.mockReset().mockResolvedValue(okProvider('codex', 23))
  mocks.generation
    .mockReset()
    .mockImplementation(
      async (path) => generations[path.endsWith('.credentials.json') ? 'claude' : 'codex']
    )
})

it.each(['Ubuntu', 'ubuntu'])(
  'withholds both providers for conflicting casing aliases requested as %s',
  async (distro) => {
    const config = settings()
    config.activeClaudeManagedAccountIdsByRuntime = {
      host: null,
      wsl: { Ubuntu: 'a', ubuntu: 'b' }
    }
    config.activeCodexManagedAccountIdsByRuntime = { host: null, wsl: { Ubuntu: 'a', ubuntu: 'b' } }
    const result = await read(service(), 'activation', distro, config)
    expect(result?.claude).toBeNull()
    expect(result?.codex).toBeNull()
  }
)
it('publishes only proven selected credential homes in the requested distro', async () => {
  const result = await read(service(), 'activation')
  expect(result?.claude?.session?.usedPercent).toBe(17)
  expect(result?.codex?.session?.usedPercent).toBe(23)
  expect(result?.claudeTarget).toEqual({ runtime: 'wsl', wslDistro: 'Ubuntu' })
})
it('rejects another profile even in the same distro', async () => {
  const value = service()
  value.setClaudeAuthPreparationResolver(async () => ({
    ...preparation('Ubuntu'),
    provenance: 'profile:b:wsl:Ubuntu'
  }))
  value.setCodexHomePathResolver(() => ({
    kind: 'ready',
    codexHomePath: '//wsl.localhost/Ubuntu/home/b/.codex'
  }))
  const result = await read(value, 'activation')
  expect(result?.claude).toBeNull()
  expect(result?.codex).toBeNull()
})
it.each(['claude', 'codex'] as const)(
  'drops and retries a same-path %s login replacement while pending',
  async (provider) => {
    const started = deferred<void>()
    const release = deferred<void>()
    mocks[provider]
      .mockImplementationOnce(async () => {
        started.resolve()
        await release.promise
        return okProvider(provider, 99)
      })
      .mockResolvedValueOnce(okProvider(provider, 7))
    const value = service()
    const pending = read(value, 'activation')
    await started.promise
    generations[provider] = 'replacement'
    const joined = read(value, 'activation')
    release.resolve()
    expect((await pending)?.[provider]?.session?.usedPercent).toBe(7)
    expect((await joined)?.[provider]?.session?.usedPercent).toBe(7)
  }
)
it.each(['claude', 'codex'] as const)(
  'never revives a settled %s reading after replacing the login at the same path',
  async (provider) => {
    const value = service()
    await read(value, 'activation')
    generations[provider] = 'replacement'
    mocks[provider].mockResolvedValue(okProvider(provider, 7))
    expect((await read(value, 'activation'))?.[provider]?.session?.usedPercent).toBe(7)
  }
)
it('rechecks a finished provider before delivery while the other provider was pending', async () => {
  const claudeReady = deferred<void>()
  const codexReply = deferred<ReturnType<typeof okProvider>>()
  const value = service()
  const auth = preparation('Ubuntu')
  value.setClaudeAuthPreparationResolver(
    vi
      .fn()
      .mockResolvedValueOnce(auth)
      .mockImplementation(async () => {
        claudeReady.resolve()
        return auth
      })
  )
  mocks.claude
    .mockResolvedValueOnce(okProvider('claude', 99))
    .mockResolvedValueOnce(okProvider('claude', 7))
  mocks.codex.mockReturnValueOnce(codexReply.promise)
  const pending = read(value, 'activation')
  await claudeReady.promise
  generations.claude = 'replacement'
  codexReply.resolve(okProvider('codex', 23))
  expect((await pending)?.claude?.session?.usedPercent).toBe(7)
})
it('fails closed after one retry if the credential keeps changing', async () => {
  mocks.claude
    .mockImplementationOnce(async () => {
      generations.claude = 'c2'
      return okProvider('claude', 99)
    })
    .mockImplementationOnce(async () => {
      generations.claude = 'c3'
      return okProvider('claude', 88)
    })
    .mockResolvedValue(okProvider('claude', 7))
  const result = await read(service(), 'activation')
  expect(result?.claude).toBeNull()
  expect(result?.codex?.session?.usedPercent).toBe(23)
})
it('recovers on the next request after an unknown credential generation', async () => {
  generations.claude = null
  const value = service()
  expect((await read(value, 'activation'))?.claude).toBeNull()
  generations.claude = 'recovered'
  expect((await read(value, 'activation'))?.claude?.session?.usedPercent).toBe(17)
})
it('does not retain a failed provider result', async () => {
  mocks.claude
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(okProvider('claude', 7))
  const value = service()
  expect((await read(value, 'activation'))?.claude).toBeNull()
  expect((await read(value, 'activation'))?.claude?.session?.usedPercent).toBe(7)
})
it('skips an unsettled provider on explicit refresh and reads fresh after settlement', async () => {
  const started = deferred<void>()
  const oldReply = deferred<ReturnType<typeof okProvider>>()
  mocks.claude
    .mockImplementationOnce(() => {
      started.resolve()
      return oldReply.promise
    })
    .mockResolvedValue(okProvider('claude', 7))
  const value = service()
  const old = read(value, 'activation')
  await started.promise
  expect((await read(value, 'explicit-refresh'))?.claude).toBeNull()
  oldReply.resolve(okProvider('claude', 99))
  await old
  expect((await read(value, 'next-refresh'))?.claude?.session?.usedPercent).toBe(7)
})
it('keeps A-B-A activations separate even when the first A reply arrives last', async () => {
  const started = deferred<void>()
  const oldReply = deferred<ReturnType<typeof okProvider>>()
  mocks.claude
    .mockImplementationOnce(() => {
      started.resolve()
      return oldReply.promise
    })
    .mockResolvedValueOnce(okProvider('claude', 43))
    .mockResolvedValueOnce(okProvider('claude', 7))
  const value = service()
  const firstA = read(value, 'A-1')
  await started.promise
  expect((await read(value, 'B-2', 'Debian'))?.claude?.session?.usedPercent).toBe(43)
  const newA = await read(value, 'A-3')
  expect(newA?.claude).toBeNull()
  oldReply.resolve(okProvider('claude', 99))
  await firstA
  expect(newA?.claude).toBeNull()
  expect((await read(value, 'A-4'))?.claude?.session?.usedPercent).toBe(7)
})

it.each(['initial', 'retry'] as const)(
  'keeps healthy Codex usage when Claude times out during the %s read',
  async (stage) => {
    const deadlines = new Map<AbortSignal, AbortController>()
    const originalTimeout = AbortSignal.timeout
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      if (ms !== 30_000) {
        return originalTimeout(ms)
      }
      const controller = new AbortController()
      deadlines.set(controller.signal, controller)
      return controller.signal
    })
    const stalled = deferred<ReturnType<typeof okProvider>>()
    const started = deferred<AbortSignal>()
    const codexReady = deferred<void>()
    const value = service()
    value.setCodexHomePathResolver(
      vi
        .fn()
        .mockReturnValueOnce({
          kind: 'ready',
          codexHomePath: '//wsl.localhost/Ubuntu/home/a/.codex'
        })
        .mockImplementation(() => {
          codexReady.resolve()
          return { kind: 'ready', codexHomePath: '//wsl.localhost/Ubuntu/home/a/.codex' }
        })
    )
    if (stage === 'retry') {
      mocks.claude.mockImplementationOnce(async () => {
        generations.claude = 'replaced'
        return okProvider('claude', 99)
      })
    }
    mocks.claude.mockImplementationOnce(({ signal }) => {
      started.resolve(signal)
      return stalled.promise
    })
    const pending = read(value, 'timeout')
    const signal = await started.promise
    await codexReady.promise
    deadlines.get(signal)!.abort(new Error('provider deadline'))
    const result = await pending
    expect(result?.claude).toBeNull()
    expect(result?.codex?.session?.usedPercent).toBe(23)
    expect((await read(value, 'while-stalled'))?.claude).toBeNull()
    stalled.resolve(okProvider('claude', 99))
  }
)

it('accepts a selected managed login proven covered by System default', async () => {
  const value = service()
  value.setClaudeAuthPreparationResolver(async () => ({
    ...preparation('Ubuntu'),
    provenance: 'wsl:Ubuntu:system',
    selectedAccountId: 'a'
  }))
  expect((await read(value, 'covered'))?.claude?.session?.usedPercent).toBe(17)
})
it('rejects an unrelated System default login and a changed covered attribution', async () => {
  const value = service()
  const covered = {
    ...preparation('Ubuntu'),
    provenance: 'wsl:Ubuntu:system',
    selectedAccountId: 'a'
  }
  value.setClaudeAuthPreparationResolver(async () => ({ ...covered, selectedAccountId: 'b' }))
  expect((await read(value, 'wrong-system'))?.claude).toBeNull()
  value.setClaudeAuthPreparationResolver(
    vi
      .fn()
      .mockResolvedValueOnce(covered)
      .mockResolvedValue({ ...covered, selectedAccountId: 'b' })
  )
  expect((await read(value, 'changed-system'))?.claude).toBeNull()
})
