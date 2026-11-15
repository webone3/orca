import type { RateLimitState } from '../../../shared/agent-usage/rate-limits/rate-limit-types'
import type { WslUsageScope } from '../../../shared/wsl-usage-scope'
import { claudeAccountDistroKey } from '../../../shared/claude-account-identity'
import { createEmptyRateLimitState } from '../../../shared/agent-usage/rate-limits/rate-limit-state-factory'
import { waitForPromiseWithSignal } from '../../../shared/concurrency/abort-signal-reason'
import { withAuthFilesystemOwnership } from '../providers/auth-filesystem-ownership'
import {
  readWslUsage,
  unconfirmedWslProviders,
  unavailableWslProvider,
  type WslProviderRead,
  type WslReadSources
} from './wsl-usage-read'

type Provider = 'claude' | 'codex'

/** Caller deadlines never release admission for uncancellable work. */
export class WslUsageReads {
  private readonly pending = new Map<string, Promise<RateLimitState | null>>()
  private readonly lanes = new Map<string, Promise<WslProviderRead>>()

  read(distro: string, scope: WslUsageScope, readId: string, sources: WslReadSources) {
    const key = JSON.stringify([scope.key, readId])
    const existing = this.pending.get(key)
    if (existing) {
      return existing
    }
    if (this.pending.size >= 16) {
      return Promise.resolve(null)
    }
    const owned = new Set<Promise<unknown>>()
    const release = () => {
      if (this.pending.get(key) === result) {
        this.pending.delete(key)
      }
    }
    const result = this.perform(distro, scope, sources, owned)
      .catch(() => null)
      .finally(() => {
        if (owned.size === 0) {
          release()
        } else {
          void Promise.allSettled(owned).then(release)
        }
      })
    this.pending.set(key, result)
    return result
  }

  private run(
    distro: string,
    provider: Provider,
    owned: Set<Promise<unknown>>,
    operation: (signal: AbortSignal) => Promise<WslProviderRead>
  ): Promise<WslProviderRead> {
    const key = JSON.stringify([claudeAccountDistroKey(distro), provider])
    if (this.lanes.has(key) || this.lanes.size >= 16) {
      return Promise.resolve(unavailableWslProvider)
    }
    const signal = AbortSignal.timeout(30_000)
    const raw = withAuthFilesystemOwnership(() => operation(signal))
    this.lanes.set(key, raw)
    owned.add(raw)
    const release = () => {
      owned.delete(raw)
      if (this.lanes.get(key) === raw) {
        this.lanes.delete(key)
      }
    }
    void raw.then(release, release)
    return waitForPromiseWithSignal(raw, signal).catch(() => unavailableWslProvider)
  }

  private async perform(
    distro: string,
    scope: WslUsageScope,
    sources: WslReadSources,
    owned: Set<Promise<unknown>>
  ): Promise<RateLimitState | null> {
    const read = async (provider: Provider, signal: AbortSignal) =>
      (
        await readWslUsage(distro, scope, sources, signal, {
          claude: provider === 'claude',
          codex: provider === 'codex'
        })
      )[provider]
    const providers = ['claude', 'codex'] as const
    const initial = await Promise.all(
      providers.map((provider) =>
        this.run(distro, provider, owned, (signal) => read(provider, signal))
      )
    )
    const delivered = await Promise.all(
      providers.map(async (provider, index) => {
        const reading = initial[index]
        if (!sources.current() || (!reading.limits && !reading.retry)) {
          return unavailableWslProvider
        }
        return this.run(distro, provider, owned, async (signal) => {
          const unconfirmed = async (value: WslProviderRead) =>
            (
              await unconfirmedWslProviders(
                {
                  claude: provider === 'claude' ? value : unavailableWslProvider,
                  codex: provider === 'codex' ? value : unavailableWslProvider
                },
                signal
              )
            )[provider]
          let current = reading
          if (await unconfirmed(current)) {
            if (!sources.current() || signal.aborted) {
              return unavailableWslProvider
            }
            current = await read(provider, signal)
          }
          return sources.current() && !signal.aborted && !(await unconfirmed(current))
            ? current
            : unavailableWslProvider
        })
      })
    )
    if (!sources.current()) {
      return null
    }
    return createEmptyRateLimitState({
      claudeTarget: { runtime: 'wsl', wslDistro: distro },
      codexTarget: { runtime: 'wsl', wslDistro: distro },
      claude: delivered[0].limits,
      codex: delivered[1].limits
    })
  }
}
