import type { RateLimitState } from '../../../shared/agent-usage/rate-limits/rate-limit-types'
import type { WslUsageScope } from '../../../shared/wsl-usage-scope'
import { createEmptyRateLimitState } from '../../../shared/agent-usage/rate-limits/rate-limit-state-factory'
import { waitForPromiseWithSignal } from '../../../shared/concurrency/abort-signal-reason'
import { readWslUsage, unconfirmedWslProviders, type WslReadSources } from './wsl-usage-read'

/** Same-read coalescing only: a new activation or explicit refresh always starts fresh. */
export class WslUsageReads {
  private readonly pending = new Map<string, Promise<RateLimitState | null>>()

  read(
    distro: string,
    scope: WslUsageScope,
    readId: string,
    sources: WslReadSources
  ): Promise<RateLimitState | null> {
    const key = JSON.stringify([scope.key, readId])
    const existing = this.pending.get(key)
    if (existing) {
      return existing
    }
    if (this.pending.size >= 16) {
      return Promise.resolve(null)
    }
    const result = this.perform(distro, scope, sources)
      .catch(() => null)
      .finally(() => {
        if (this.pending.get(key) === result) {
          this.pending.delete(key)
        }
      })
    this.pending.set(key, result)
    return result
  }

  private async perform(
    distro: string,
    scope: WslUsageScope,
    sources: WslReadSources
  ): Promise<RateLimitState | null> {
    const signal = AbortSignal.timeout(30_000)
    let reading = await waitForPromiseWithSignal(
      readWslUsage(distro, scope, sources, signal, { claude: true, codex: true }),
      signal
    )
    let unconfirmed = await unconfirmedWslProviders(reading, signal)
    // One retry, only for invalidated providers; no settled or failed result survives this request.
    if ((unconfirmed.claude || unconfirmed.codex) && sources.current() && !signal.aborted) {
      const retry = await waitForPromiseWithSignal(
        readWslUsage(distro, scope, sources, signal, unconfirmed),
        signal
      )
      reading = {
        claude: unconfirmed.claude ? retry.claude : reading.claude,
        codex: unconfirmed.codex ? retry.codex : reading.codex
      }
      unconfirmed = await unconfirmedWslProviders(reading, signal)
    }
    if (!sources.current() || signal.aborted) {
      return null
    }
    return createEmptyRateLimitState({
      claudeTarget: { runtime: 'wsl', wslDistro: distro },
      codexTarget: { runtime: 'wsl', wslDistro: distro },
      claude: unconfirmed.claude ? null : reading.claude.limits,
      codex: unconfirmed.codex ? null : reading.codex.limits
    })
  }
}
