import { ChevronDown, PanelLeft, PanelRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useTranslate } from '@/i18n/use-translate'
import { resolveBrowserSourceUnifiedTab } from '@/lib/browser/workspace/browser-workspace-source-resolution'
import { deriveNotesSendAgentTargets } from '@/lib/agent-session/messaging/notes-send-agent-targets'
import { getStructuredChatTabNames } from '@/runtime/native-chat/naming/structured-chat-name-observation'
import { useAppStore } from '@/store/index'
import { isFloatingWorkspaceId } from '../../../../../../shared/floating-workspace-worktree'
import { planChatBesideBrowser } from './chat-beside-browser'
import {
  getChatBesideBrowserSide,
  setChatBesideBrowserSide,
  useChatBesideBrowserSide,
  type ChatBesideBrowserSide
} from './chat-beside-browser-side'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

/** `moveToSide` places the chat on the chosen side even when it is already showing. */
function toggleChatBesideBrowser(
  worktreeId: string,
  browserPageId: string,
  moveToSide = false
): void {
  const state = useAppStore.getState()
  const browserTab = resolveBrowserSourceUnifiedTab(state, browserPageId, worktreeId)
  if (!browserTab) {
    return
  }
  // Agent terminals are named by their terminal tab, which a unified tab points at.
  const agentTabIds = new Set(
    deriveNotesSendAgentTargets(state, worktreeId, getStructuredChatTabNames()).map(
      (target) => target.tabId
    )
  )
  const chatTabIds = new Set(
    (state.unifiedTabsByWorktree[worktreeId] ?? [])
      .filter(
        (tab) =>
          tab.contentType === 'agent-session' ||
          agentTabIds.has(tab.id) ||
          agentTabIds.has(tab.entityId)
      )
      .map((tab) => tab.id)
  )
  const plan = planChatBesideBrowser(state, worktreeId, browserTab.groupId, chatTabIds)
  if (!plan) {
    if (moveToSide) {
      return
    }
    toast.message(
      translate('components.browser-pane.chatBeside.noChat', 'Open a chat in this workspace first.')
    )
    return
  }
  if (plan.kind === 'show' || moveToSide) {
    state.dropUnifiedTab(plan.chatTabId, {
      groupId: browserTab.groupId,
      splitDirection: getChatBesideBrowserSide()
    })
  } else {
    state.moveUnifiedTabToGroup(plan.chatTabId, browserTab.groupId, { activate: false })
  }
  state.recordFeatureInteraction('tab-splits')
}

/** One press puts the workspace's chat beside this page, or folds it back into the tabs. */
export function BrowserChatBesideButton({
  worktreeId,
  browserPageId
}: {
  worktreeId: string
  browserPageId: string
}): React.JSX.Element | null {
  const t = useTranslate()
  const side = useChatBesideBrowserSide()
  // Document previews borrow this toolbar without owning a workspace tab to split from.
  const hasWorkspaceTab = useAppStore(
    (state) => resolveBrowserSourceUnifiedTab(state, browserPageId, worktreeId) != null
  )
  // The floating panel is a scratch workspace with its own split rules.
  if (!hasWorkspaceTab || isFloatingWorkspaceId(worktreeId)) {
    return null
  }
  const label = t('components.browser-pane.chatBeside.label', 'Chat beside page')
  const Icon = side === 'left' ? PanelLeft : PanelRight
  return (
    <span className="flex shrink-0 items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label={label}
            onClick={() => toggleChatBesideBrowser(worktreeId, browserPageId)}
          >
            <Icon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-4"
            aria-label={t('components.browser-pane.chatBeside.chooseSide', 'Choose the chat side')}
          >
            <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup
            value={side}
            onValueChange={(value) => {
              setChatBesideBrowserSide(value as ChatBesideBrowserSide)
              // Choosing a side puts the chat there, whether or not it was showing.
              toggleChatBesideBrowser(worktreeId, browserPageId, true)
            }}
          >
            <DropdownMenuRadioItem value="left">
              {t('components.browser-pane.chatBeside.left', 'Chat on the left')}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="right">
              {t('components.browser-pane.chatBeside.right', 'Chat on the right')}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}
