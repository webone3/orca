import { defineFixture } from '../../../component-fixtures/component-fixture'
import { getDefaultSettings } from '../../../../../shared/constants'
import { RUNTIME_PROTOCOL_VERSION } from '../../../../../shared/protocol-version'
import { createEmptyRateLimitState } from '../../../../../shared/rate-limit-state-factory'
import type { ProviderRateLimits } from '../../../../../shared/rate-limit-types'
import { ClaudeSwitcherForOwner } from './ClaudeSwitcherForOwner'
import { CodexSwitcherMenu } from './CodexSwitcherMenu'

function fixture(provider: 'claude' | 'codex') {
  const usage: ProviderRateLimits = {
    provider,
    session: { usedPercent: 17, windowMinutes: 300, resetsAt: null, resetDescription: null },
    weekly: null,
    status: 'ok',
    error: null,
    updatedAt: Date.now()
  }
  const account = {
    email: 'remote@example.com',
    createdAt: 1,
    updatedAt: 1,
    lastAuthenticatedAt: 1
  }
  const claude = {
    accounts: [
      { ...account, id: 'selected', authMethod: 'subscription-oauth' as const },
      { ...account, id: 'shared-id', authMethod: 'subscription-oauth' as const },
      {
        ...account,
        id: 'wsl',
        authMethod: 'subscription-oauth' as const,
        managedAuthRuntime: 'wsl' as const,
        wslDistro: 'Ubuntu'
      }
    ],
    activeAccountId: 'selected',
    activeAccountIdsByRuntime: { host: 'selected', wsl: { Ubuntu: 'wsl' } }
  }
  const codex = {
    accounts: [
      { ...account, id: 'selected' },
      { ...account, id: 'shared-id' },
      { ...account, id: 'wsl', managedHomeRuntime: 'wsl' as const, wslDistro: 'Ubuntu' }
    ],
    activeAccountId: 'selected',
    activeAccountIdsByRuntime: { host: 'selected', wsl: { Ubuntu: 'wsl' } }
  }
  const remote = createEmptyRateLimitState({
    [provider]: usage,
    inactiveClaudeAccounts: [
      {
        accountId: 'shared-id',
        rateLimits: { ...usage, provider: 'claude' },
        updatedAt: Date.now(),
        isFetching: false
      }
    ],
    inactiveCodexAccounts: [
      {
        accountId: 'shared-id',
        rateLimits: { ...usage, provider: 'codex' },
        updatedAt: Date.now(),
        isFetching: false
      }
    ]
  })
  return defineFixture({
    width: 360,
    store: {
      settings: {
        ...getDefaultSettings('/fixture'),
        machineName: 'MacBook Pro',
        activeRuntimeEnvironmentId: 'other'
      },
      repos: [
        {
          id: 'remote',
          path: '/srv/app',
          displayName: 'Remote',
          executionHostId: 'runtime:windows',
          addedAt: 1,
          badgeColor: ''
        }
      ],
      activeWorktreeId: 'remote::/srv/app',
      activeGroupIdByWorktree: { 'remote::/srv/app': 'g' },
      groupsByWorktree: {
        'remote::/srv/app': [
          { id: 'g', worktreeId: 'remote::/srv/app', tabOrder: ['chat'], activeTabId: 'chat' }
        ]
      },
      unifiedTabsByWorktree: {
        'remote::/srv/app': [
          {
            id: 'chat',
            entityId: 'session',
            contentType: 'agent-session',
            worktreeId: 'remote::/srv/app',
            groupId: 'g',
            executionHostId: 'runtime:windows',
            label: 'Chat',
            customLabel: null,
            color: null,
            sortOrder: 0,
            createdAt: 1
          }
        ]
      },
      activeView: 'terminal',
      runtimeEnvironmentCatalogHydrated: true,
      runtimeEnvironments: [
        {
          id: 'windows',
          name: 'Windows PC',
          createdAt: 1,
          updatedAt: 1,
          lastUsedAt: null,
          runtimeId: 'fixture',
          preferredEndpointId: 'fixture',
          endpoints: []
        }
      ],
      rateLimits: createEmptyRateLimitState({
        inactiveClaudeAccounts: [
          {
            accountId: 'shared-id',
            rateLimits: {
              ...usage,
              provider: 'claude',
              session: { ...usage.session!, usedPercent: 99 }
            },
            updatedAt: Date.now(),
            isFetching: false
          }
        ],
        inactiveCodexAccounts: [
          {
            accountId: 'shared-id',
            rateLimits: {
              ...usage,
              provider: 'codex',
              session: { ...usage.session!, usedPercent: 99 }
            },
            updatedAt: Date.now(),
            isFetching: false
          }
        ]
      })
    },
    setup: () => {
      window.api.runtimeEnvironments.subscribe = async (_args, handlers) => {
        queueMicrotask(() =>
          handlers.onResponse?.({
            id: 'fixture',
            _meta: { runtimeId: 'fixture' },
            ok: true,
            result: { type: 'snapshot', snapshot: { claude, codex, rateLimits: remote } }
          })
        )
        return { sendBinary: () => {}, unsubscribe: () => {} }
      }

      window.api.runtimeEnvironments.call = async ({ method }) => ({
        id: 'fixture',
        _meta: { runtimeId: 'fixture' },
        ok: true,
        result:
          method === 'accounts.list'
            ? { claude, codex, rateLimits: remote }
            : method === 'wsl.listDistros'
              ? ['Ubuntu']
              : {
                  runtimeId: 'fixture',
                  hostPlatform: 'win32',
                  runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
                  minCompatibleRuntimeClientVersion: RUNTIME_PROTOCOL_VERSION
                }
      })
    },
    render: () => (
      <div className="flex h-[720px] items-end bg-background p-3">
        {provider === 'claude' ? (
          <ClaudeSwitcherForOwner
            claude={usage}
            compact={false}
            iconOnly={false}
            owner={{
              target: { kind: 'environment', environmentId: 'windows' },
              wslHostDistro: null
            }}
          />
        ) : (
          <CodexSwitcherMenu codex={usage} compact={false} iconOnly={false} />
        )}
      </div>
    ),
    interact: (frame) => {
      frame
        .querySelector<HTMLButtonElement>('button[aria-label]')
        ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    }
  })
}
export const claude = fixture('claude')
export const codex = fixture('codex')
