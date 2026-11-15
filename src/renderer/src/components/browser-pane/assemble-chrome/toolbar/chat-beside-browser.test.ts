import { describe, expect, it } from 'vitest'
import { planChatBesideBrowser, type ChatBesideBrowserState } from './chat-beside-browser'

const WORKTREE = 'wt-1'

function group(id: string, tabOrder: string[], activeTabId: string, recentTabIds?: string[]) {
  return { id, worktreeId: WORKTREE, activeTabId, tabOrder, recentTabIds }
}

function state(groups: ReturnType<typeof group>[]): ChatBesideBrowserState {
  return {
    groupsByWorktree: { [WORKTREE]: groups },
    unifiedTabsByWorktree: {
      [WORKTREE]: groups.flatMap((entry) =>
        entry.tabOrder.map((id) => ({ id, groupId: entry.id }))
      ) as unknown as ChatBesideBrowserState['unifiedTabsByWorktree'][string]
    }
  }
}

describe('planChatBesideBrowser', () => {
  it('splits out the chat that shares the browser tab row', () => {
    const plan = planChatBesideBrowser(
      state([group('g1', ['term', 'browser', 'chat'], 'browser')]),
      WORKTREE,
      'g1',
      new Set(['chat'])
    )
    expect(plan).toEqual({ kind: 'show', chatTabId: 'chat' })
  })

  it('prefers the chat used most recently in the browser group', () => {
    const plan = planChatBesideBrowser(
      state([group('g1', ['chat-a', 'chat-b', 'browser'], 'browser', ['chat-b', 'chat-a'])]),
      WORKTREE,
      'g1',
      new Set(['chat-a', 'chat-b'])
    )
    expect(plan).toEqual({ kind: 'show', chatTabId: 'chat-a' })
  })

  it('folds the chat back when it already shows in another group', () => {
    const plan = planChatBesideBrowser(
      state([group('g1', ['browser'], 'browser'), group('g2', ['chat'], 'chat')]),
      WORKTREE,
      'g1',
      new Set(['chat'])
    )
    expect(plan).toEqual({ kind: 'hide', chatTabId: 'chat' })
  })

  it('brings over a chat hidden behind another tab in a different group', () => {
    const plan = planChatBesideBrowser(
      state([group('g1', ['browser'], 'browser'), group('g2', ['term', 'chat'], 'term')]),
      WORKTREE,
      'g1',
      new Set(['chat'])
    )
    expect(plan).toEqual({ kind: 'show', chatTabId: 'chat' })
  })

  it('has nothing to do without a chat', () => {
    const plan = planChatBesideBrowser(
      state([group('g1', ['term', 'browser'], 'browser')]),
      WORKTREE,
      'g1',
      new Set()
    )
    expect(plan).toBeNull()
  })
})
