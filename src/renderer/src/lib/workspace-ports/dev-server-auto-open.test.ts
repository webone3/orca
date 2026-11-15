import { describe, expect, it } from 'vitest'
import type { WorkspacePort } from '../../../../shared/workspace/ports/workspace-ports'
import {
  DEV_SERVER_ANNOUNCEMENT_WINDOW_MS,
  devServerKey,
  forgetStoppedDevServers,
  pickDevServerToOpen
} from './dev-server-auto-open'

const NOW = 1_000_000

function workspacePort(worktreeId: string, port: number, advertised = true): WorkspacePort {
  return {
    id: `${worktreeId}:${port}`,
    kind: 'workspace',
    bindHost: '127.0.0.1',
    connectHost: 'localhost',
    port,
    protocol: 'http',
    owner: { worktreeId, repoId: 'repo', displayName: worktreeId, path: '/x', confidence: 'cwd' },
    ...(advertised ? { advertisedUrl: `http://localhost:${port}` } : {})
  }
}

function pick(overrides: Partial<Parameters<typeof pickDevServerToOpen>[0]> = {}) {
  return pickDevServerToOpen({
    announcements: [{ worktreeId: 'wt', port: 3000, at: NOW }],
    ports: [workspacePort('wt', 3000)],
    activeWorktreeId: 'wt',
    openedKeys: new Set(),
    openTabUrls: [],
    now: NOW + 1_000,
    ...overrides
  })
}

describe('pickDevServerToOpen', () => {
  it('opens a server a terminal in the active worktree just announced', () => {
    expect(pick()?.key).toBe(devServerKey('wt', 3000))
  })

  it('waits until the port scan confirms the listener', () => {
    expect(pick({ ports: [] })).toBeNull()
    expect(pick({ ports: [workspacePort('wt', 3000, false)] })).toBeNull()
  })

  it('leaves servers in other worktrees alone', () => {
    expect(pick({ activeWorktreeId: 'other' })).toBeNull()
  })

  it('does not reopen a server it already opened', () => {
    expect(pick({ openedKeys: new Set([devServerKey('wt', 3000)]) })).toBeNull()
  })

  it('does not duplicate a tab already on that server', () => {
    expect(pick({ openTabUrls: ['http://localhost:3000/products'] })).toBeNull()
  })

  it('ignores a server announced too long ago', () => {
    expect(pick({ now: NOW + DEV_SERVER_ANNOUNCEMENT_WINDOW_MS + 1 })).toBeNull()
  })
})

describe('forgetStoppedDevServers', () => {
  it('forgets only servers that stopped listening', () => {
    const opened = new Set([devServerKey('wt', 3000), devServerKey('wt', 4000)])
    forgetStoppedDevServers(opened, [workspacePort('wt', 3000)])
    expect([...opened]).toEqual([devServerKey('wt', 3000)])
  })
})
