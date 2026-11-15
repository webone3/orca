import { useAppStore } from '@/store/index'
import { track } from '@/diagnostics/telemetry/telemetry'
import { getStructuredChatTabNames } from '@/runtime/native-chat/naming/structured-chat-name-observation'
import { sendMessageToAgent } from '@/lib/agent-session/messaging/agent-message-send'
import { deriveNotesSendAgentTargets } from '@/lib/agent-session/messaging/notes-send-agent-targets'
import { resolveDirectNotesSendTarget } from '@/lib/agent-session/messaging/direct-notes-send-target'
import { agentKindForAgentType } from '@/lib/agent-status/aggregation/worktree-agent-status'
import type { LaunchSource } from '../../../../../shared/telemetry/schemas/telemetry-property-schemas'
import { runNotesSendWithToast } from './run-notes-send'

/**
 * Sends notes without the agent picker when there is one obvious agent to receive them.
 * Returns false, sending nothing, when the user has to choose.
 */
export function sendNotesToDirectTarget({
  worktreeId,
  prompt,
  launchSource = 'notes_send',
  onPromptDelivered,
  onPromptHandedOff
}: {
  worktreeId: string
  prompt: string
  launchSource?: LaunchSource
  onPromptDelivered?: () => void
  onPromptHandedOff?: (delivered: Promise<unknown>) => void
}): boolean {
  if (!prompt.trim()) {
    return false
  }
  const state = useAppStore.getState()
  const target = resolveDirectNotesSendTarget(
    deriveNotesSendAgentTargets(state, worktreeId, getStructuredChatTabNames()),
    state,
    worktreeId
  )
  if (!target) {
    return false
  }
  runNotesSendWithToast(
    () => sendMessageToAgent({ worktreeId, prompt, target: target.messageTarget }),
    () => {
      onPromptDelivered?.()
      track('agent_prompt_sent', {
        agent_kind: agentKindForAgentType(target.agentType),
        launch_source: launchSource,
        request_kind: 'followup'
      })
    },
    { explicitTarget: true, structured: target.messageTarget.kind === 'structured-session' },
    onPromptHandedOff
  )
  return true
}
