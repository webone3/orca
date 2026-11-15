import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import {
  activeAgentNotesSendFailureMessage,
  type ActiveAgentNotesSendResult
} from '@/lib/agent-session/messaging/terminal/active-agent-note-send-result'

export type NotesSendRunOptions = { explicitTarget?: boolean; structured?: boolean }

/** Runs one notes send behind a loading toast that settles into its outcome. */
export function runNotesSendWithToast(
  send: () => Promise<ActiveAgentNotesSendResult>,
  onSent: () => void,
  options: NotesSendRunOptions = {},
  /** Given the send's own result the moment its prompt is handed to an agent. */
  onPromptHandedOff?: (delivered: Promise<unknown>) => void
): void {
  // Settle the loading toast in place: immediate sends can resolve before Sonner mounts, racing a separate dismissal.
  const pending = toast.loading(
    translate('auto.components.editor.ReviewNotesSendMenuContent.50f7e753ea', 'Sending notes...')
  )

  const sending = send()
    .then((result) => {
      if (result.status === 'sent') {
        onSent()
        toast.success(
          translate('auto.components.editor.ReviewNotesSendMenuContent.bb9c69a0c9', 'Notes sent.'),
          { id: pending }
        )
        return
      }

      if (options.structured && result.status === 'unconfirmed') {
        toast.dismiss(pending)
        return
      }

      // Use a typed toast update; toast.message preserves the loading spinner.
      toast.info(
        activeAgentNotesSendFailureMessage(result.status, {
          explicitTarget: options.explicitTarget,
          code: result.code
        }),
        { id: pending }
      )
    })
    .catch(() => {
      console.error('Failed to send notes:', { code: 'runtime-unverifiable' })
      toast.error(
        activeAgentNotesSendFailureMessage('status-unavailable', {
          explicitTarget: options.explicitTarget,
          code: 'runtime-unverifiable'
        }),
        { id: pending }
      )
    })
  onPromptHandedOff?.(sending)
}
