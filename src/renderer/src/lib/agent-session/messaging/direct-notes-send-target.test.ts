import { describe, expect, it } from 'vitest'
import type { NotesSendAgentTarget } from './notes-send-agent-targets'
import {
  resolveDirectNotesSendTarget,
  type DirectNotesSendTargetState
} from './direct-notes-send-target'

const WORKTREE = 'wt-1'

function target(tabId: string, status: NotesSendAgentTarget['status'] = 'eligible') {
  return {
    paneKey: `${tabId}:pane`,
    tabId,
    messageTarget: { kind: 'structured-session', worktreeId: WORKTREE, tabId, sessionId: tabId },
    agentType: 'claude',
    tabTitle: tabId,
    status
  } as unknown as NotesSendAgentTarget
}

function stateShowing(...activeTabIds: string[]): DirectNotesSendTargetState {
  return {
    groupsByWorktree: {
      [WORKTREE]: activeTabIds.map((activeTabId, index) => ({
        id: `group-${index}`,
        worktreeId: WORKTREE,
        activeTabId,
        tabOrder: [activeTabId]
      }))
    },
    unifiedTabsByWorktree: {
      [WORKTREE]: [
        { id: 'unified-terminal', entityId: 'terminal-1' }
      ] as unknown as DirectNotesSendTargetState['unifiedTabsByWorktree'][string]
    }
  }
}

describe('resolveDirectNotesSendTarget', () => {
  it('picks the only agent in the worktree even when its tab is hidden', () => {
    const only = target('chat-1')
    expect(resolveDirectNotesSendTarget([only], stateShowing('browser-1'), WORKTREE)).toBe(only)
  })

  it('picks the agent on screen beside the browser over hidden ones', () => {
    const showing = target('chat-2')
    const targets = [target('chat-1'), showing]
    expect(
      resolveDirectNotesSendTarget(targets, stateShowing('browser-1', 'chat-2'), WORKTREE)
    ).toBe(showing)
  })

  it('matches a terminal agent through the unified tab that shows it', () => {
    const terminal = target('terminal-1')
    const targets = [target('chat-1'), terminal]
    expect(resolveDirectNotesSendTarget(targets, stateShowing('unified-terminal'), WORKTREE)).toBe(
      terminal
    )
  })

  it('asks when several agents are hidden or several are on screen', () => {
    const targets = [target('chat-1'), target('chat-2')]
    expect(resolveDirectNotesSendTarget(targets, stateShowing('browser-1'), WORKTREE)).toBeNull()
    expect(
      resolveDirectNotesSendTarget(targets, stateShowing('chat-1', 'chat-2'), WORKTREE)
    ).toBeNull()
  })

  it('never picks an agent that cannot receive notes', () => {
    expect(
      resolveDirectNotesSendTarget([target('chat-1', 'disabled')], stateShowing('chat-1'), WORKTREE)
    ).toBeNull()
  })
})
