import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { wslUsageScope } from '../../../../../shared/wsl-usage-scope'
import type { RateLimitState } from '../../../../../shared/rate-limit-types'
import { resolveOwnerUsageRateLimits } from './owner-usage-rate-limits'

export function useWslOwnerUsage(distro: string | null, surfaceKey: string, local: RateLimitState) {
  const settings = useAppStore((state) => (distro ? state.settings : null))
  const scopeKey = useMemo(
    () => (settings && distro ? wslUsageScope(settings, distro).key : null),
    [settings, distro]
  )
  const activation = useMemo(
    () => ({ distro, scopeKey, surfaceKey }),
    [distro, scopeKey, surfaceKey]
  )
  const latest = useRef(activation)
  const request = useRef(0)
  const [snapshot, setSnapshot] = useState<{ activation: object; state: RateLimitState } | null>(
    null
  )
  useEffect(() => {
    latest.current = activation
  }, [activation])
  const refresh = useCallback(async () => {
    if (!distro || !scopeKey) {
      return
    }
    const id = ++request.current
    try {
      const state = await window.api.rateLimits.readWsl(distro, scopeKey)
      if (latest.current === activation && request.current === id && state) {
        setSnapshot({ activation, state })
      }
    } catch {
      // A failed lane read leaves the existing unavailable presentation, never desktop quota.
    }
  }, [distro, scopeKey, activation])
  useEffect(() => {
    void refresh()
    return () => {
      request.current += 1
    }
  }, [refresh])
  const rateLimits = useMemo(() => {
    const unavailable = resolveOwnerUsageRateLimits(local, {
      kind: 'remote-unverifiable',
      ownerLabel: `WSL ${distro ?? ''}`,
      reason: 'unsupported-owner',
      lastKnown: null
    })
    if (snapshot?.activation !== activation) {
      return unavailable
    }
    return {
      ...snapshot.state,
      claude: snapshot.state.claude ?? unavailable.claude,
      codex: snapshot.state.codex ?? unavailable.codex
    }
  }, [local, distro, snapshot, activation])
  return { rateLimits, refresh }
}
