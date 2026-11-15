// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../../shared/constants'
import { createEmptyRateLimitState } from '../../../../../shared/agent-usage/rate-limits/rate-limit-state-factory'
import type { RateLimitState } from '../../../../../shared/agent-usage/rate-limits/rate-limit-types'

let settings = getDefaultSettings('/fixture')
const mocks = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('@/store', () => ({
  useAppStore: (select: (state: unknown) => unknown) => select({ settings })
}))
const { useWslOwnerUsage } = await import('./use-wsl-owner-usage')
beforeEach(() => {
  settings = getDefaultSettings('/fixture')
  mocks.read.mockReset()
})
afterEach(cleanup)

it('drops a slow distro read after the visible chat changes', async () => {
  let first: (state: RateLimitState) => void = () => {}
  let second: (state: RateLimitState) => void = () => {}
  mocks.read
    .mockImplementationOnce(
      () =>
        new Promise<RateLimitState>((resolve) => {
          first = resolve
        })
    )
    .mockImplementationOnce(
      () =>
        new Promise<RateLimitState>((resolve) => {
          second = resolve
        })
    )
  window.api = { ...window.api, rateLimits: { ...window.api?.rateLimits, readWsl: mocks.read } }
  const local = createEmptyRateLimitState()
  const usage = (percent: number) =>
    createEmptyRateLimitState({
      claude: {
        provider: 'claude',
        session: {
          usedPercent: percent,
          windowMinutes: 300,
          resetsAt: null,
          resetDescription: null
        },
        weekly: null,
        status: 'ok',
        error: null,
        updatedAt: 1
      }
    })
  const { result, rerender } = renderHook(
    ({ distro, chat }) => useWslOwnerUsage(distro, chat, local),
    { initialProps: { distro: 'Ubuntu', chat: 'a' } }
  )
  rerender({ distro: 'Debian', chat: 'b' })
  await act(async () => {
    second(usage(17))
    await Promise.resolve()
  })
  expect(result.current.rateLimits.claude?.session?.usedPercent).toBe(17)
  await act(async () => {
    first(usage(99))
    await Promise.resolve()
  })
  expect(result.current.rateLimits.claude?.session?.usedPercent).toBe(17)
})

it('invalidates an in-flight quota when a casing alias moves the exact selected lane', async () => {
  const account = {
    id: 'a',
    email: 'a@example.com',
    managedHomeRuntime: 'wsl' as const,
    wslDistro: 'Ubuntu',
    managedHomePath: '//wsl.localhost/Ubuntu/home/a/.codex',
    createdAt: 1,
    updatedAt: 1,
    lastAuthenticatedAt: 1
  }
  settings = {
    ...settings,
    codexManagedAccounts: [account],
    activeCodexManagedAccountIdsByRuntime: { host: null, wsl: { Ubuntu: 'a' } }
  }
  let reply: (value: RateLimitState) => void = () => {}
  mocks.read
    .mockImplementationOnce(
      () =>
        new Promise<RateLimitState>((resolve) => {
          reply = resolve
        })
    )
    .mockResolvedValueOnce(null)
  window.api = { ...window.api, rateLimits: { ...window.api?.rateLimits, readWsl: mocks.read } }
  const { result, rerender } = renderHook(() =>
    useWslOwnerUsage('Ubuntu', 'chat', createEmptyRateLimitState())
  )
  settings = {
    ...settings,
    activeCodexManagedAccountIdsByRuntime: { host: null, wsl: { ubuntu: 'a' } }
  }
  rerender()
  await act(async () => {
    reply(
      createEmptyRateLimitState({
        codex: {
          provider: 'codex',
          session: { usedPercent: 99, windowMinutes: 300, resetsAt: null, resetDescription: null },
          weekly: null,
          status: 'ok',
          error: null,
          updatedAt: 1
        }
      })
    )
    await Promise.resolve()
  })
  expect(result.current.rateLimits.codex?.session).toBeNull()
})

function quota(percent: number): RateLimitState {
  return createEmptyRateLimitState({
    claude: {
      provider: 'claude',
      session: { usedPercent: percent, windowMinutes: 300, resetsAt: null, resetDescription: null },
      weekly: null,
      status: 'ok',
      error: null,
      updatedAt: 1
    }
  })
}
it('refreshes a stationary owner when the existing freshness loop requests a new read', async () => {
  mocks.read.mockResolvedValueOnce(quota(17)).mockResolvedValueOnce(quota(7))
  window.api = { ...window.api, rateLimits: { ...window.api?.rateLimits, readWsl: mocks.read } }
  const { result, rerender } = renderHook(
    ({ generation }) => useWslOwnerUsage('Ubuntu', 'chat', createEmptyRateLimitState(), generation),
    { initialProps: { generation: 0 } }
  )
  await act(async () => {
    await Promise.resolve()
  })
  expect(result.current.rateLimits.claude?.session?.usedPercent).toBe(17)
  rerender({ generation: 1 })
  await act(async () => {
    await Promise.resolve()
  })
  expect(result.current.rateLimits.claude?.session?.usedPercent).toBe(7)
})
it('gives explicit refresh a fresh request even while the activation read is pending', async () => {
  let oldReply: (state: RateLimitState) => void = () => {}
  const old = new Promise<RateLimitState>((resolve) => {
    oldReply = resolve
  })
  let activationId: string | null = null
  mocks.read.mockImplementation((_distro, _scope, id: string) => {
    activationId ??= id
    return id === activationId ? old : Promise.resolve(quota(7))
  })
  window.api = { ...window.api, rateLimits: { ...window.api?.rateLimits, readWsl: mocks.read } }
  const { result } = renderHook(() =>
    useWslOwnerUsage('Ubuntu', 'chat', createEmptyRateLimitState())
  )
  await act(async () => {
    const refreshed = result.current.refresh()
    oldReply(quota(99))
    await refreshed
  })
  expect(result.current.rateLimits.claude?.session?.usedPercent).toBe(7)
})
it('withholds an old reading when a new check fails, then recovers on another refresh', async () => {
  mocks.read
    .mockResolvedValueOnce(quota(17))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(quota(7))
  window.api = { ...window.api, rateLimits: { ...window.api?.rateLimits, readWsl: mocks.read } }
  const { result } = renderHook(() =>
    useWslOwnerUsage('Ubuntu', 'chat', createEmptyRateLimitState())
  )
  await act(async () => {
    await Promise.resolve()
  })
  expect(result.current.rateLimits.claude?.session?.usedPercent).toBe(17)
  await act(async () => {
    await result.current.refresh()
  })
  expect(result.current.rateLimits.claude?.session).toBeNull()
  await act(async () => {
    await result.current.refresh()
  })
  expect(result.current.rateLimits.claude?.session?.usedPercent).toBe(7)
})
it('ignores a refresh callback belonging to the previous owner', async () => {
  mocks.read
    .mockResolvedValueOnce(quota(17))
    .mockResolvedValueOnce(quota(7))
    .mockResolvedValue(quota(99))
  window.api = { ...window.api, rateLimits: { ...window.api?.rateLimits, readWsl: mocks.read } }
  const { result, rerender } = renderHook(
    ({ distro }) => useWslOwnerUsage(distro, 'chat', createEmptyRateLimitState()),
    { initialProps: { distro: 'Ubuntu' } }
  )
  await act(async () => {
    await Promise.resolve()
  })
  const stale = result.current.refresh
  rerender({ distro: 'Debian' })
  await act(async () => {
    await Promise.resolve()
  })
  await act(async () => {
    await stale()
  })
  expect(result.current.rateLimits.claude?.session?.usedPercent).toBe(7)
})
