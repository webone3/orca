import type { AppState } from '@/store/types'

export type ChatBesideBrowserState = Pick<AppState, 'groupsByWorktree' | 'unifiedTabsByWorktree'>

export type ChatBesideBrowserPlan =
  /** Split the chat tab out to the right of the browser's group. */
  | { kind: 'show'; chatTabId: string }
  /** The chat already sits in another group: fold it back into the browser's tabs. */
  | { kind: 'hide'; chatTabId: string }

/**
 * What one press of "chat beside page" does, using the worktree's existing tabs and splits.
 * `chatTabIds` are the unified tabs that hold an agent conversation. Null when there is none.
 */
export function planChatBesideBrowser(
  state: ChatBesideBrowserState,
  worktreeId: string,
  browserGroupId: string,
  chatTabIds: ReadonlySet<string>
): ChatBesideBrowserPlan | null {
  const groups = state.groupsByWorktree[worktreeId] ?? []
  const browserGroup = groups.find((group) => group.id === browserGroupId)
  if (!browserGroup) {
    return null
  }
  const showingBeside = groups.find(
    (group) => group.id !== browserGroupId && group.activeTabId && chatTabIds.has(group.activeTabId)
  )
  if (showingBeside?.activeTabId) {
    return { kind: 'hide', chatTabId: showingBeside.activeTabId }
  }
  // Prefer the chat last used in the browser's own group, newest first.
  const recent = (browserGroup.recentTabIds ?? []).toReversed()
  const inBrowserGroup = [...recent, ...browserGroup.tabOrder].find(
    (tabId) => chatTabIds.has(tabId) && tabId !== browserGroup.activeTabId
  )
  const anywhere = (state.unifiedTabsByWorktree[worktreeId] ?? []).find(
    (tab) => chatTabIds.has(tab.id) && tab.id !== browserGroup.activeTabId
  )
  const chatTabId = inBrowserGroup ?? anywhere?.id
  return chatTabId ? { kind: 'show', chatTabId } : null
}
