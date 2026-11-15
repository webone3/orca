import type { AppState } from '@/store/types'
import type { NotesSendAgentTarget } from './notes-send-agent-targets'

export type DirectNotesSendTargetState = Pick<
  AppState,
  'groupsByWorktree' | 'unifiedTabsByWorktree'
>

/** True when the target's tab is the one showing in any of the worktree's tab groups. */
function isTargetTabShowing(
  state: DirectNotesSendTargetState,
  worktreeId: string,
  target: NotesSendAgentTarget
): boolean {
  const tabs = state.unifiedTabsByWorktree[worktreeId] ?? []
  return (state.groupsByWorktree[worktreeId] ?? []).some((group) => {
    if (!group.activeTabId) {
      return false
    }
    if (group.activeTabId === target.tabId) {
      return true
    }
    // Terminal targets name their terminal tab, which the unified tab points at.
    const showing = tabs.find((tab) => tab.id === group.activeTabId)
    return showing?.entityId === target.tabId
  })
}

/**
 * The agent notes can go to without asking: the only one on screen, or failing that the
 * worktree's only one. Null means the choice is real and the picker must ask.
 */
export function resolveDirectNotesSendTarget(
  targets: readonly NotesSendAgentTarget[],
  state: DirectNotesSendTargetState,
  worktreeId: string
): NotesSendAgentTarget | null {
  const eligible = targets.filter((target) => target.status === 'eligible')
  const showing = eligible.filter((target) => isTargetTabShowing(state, worktreeId, target))
  if (showing.length === 1) {
    return showing[0]
  }
  return showing.length === 0 && eligible.length === 1 ? eligible[0] : null
}
