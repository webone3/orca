import { useEffect } from 'react'
import { useAppStore } from '@/store/index'
import {
  DEV_SERVER_ANNOUNCEMENT_WINDOW_MS,
  devServerKey,
  forgetStoppedDevServers,
  pickDevServerToOpen,
  type DevServerAnnouncement
} from '@/lib/workspace-ports/dev-server-auto-open'
import {
  openWorkspacePortInBrowser,
  workspacePortScanKeyForTarget
} from '@/lib/workspace-ports/workspace-port-actions'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'

const LOCAL_TARGET: RuntimeClientTarget = { kind: 'local' }

/** Opens a dev server in the in-app browser when a terminal in the active workspace starts one. */
export function WorkspaceDevServerAutoOpen({ enabled = true }: { enabled?: boolean }): null {
  const settingOn = useAppStore((s) => s.settings?.openDevServersInBrowser !== false)
  const active = enabled && settingOn

  useEffect(() => {
    if (!active) {
      return
    }
    let announcements: DevServerAnnouncement[] = []
    const openedKeys = new Set<string>()
    const localScanKey = workspacePortScanKeyForTarget(LOCAL_TARGET)

    const evaluate = (): void => {
      const state = useAppStore.getState()
      const ports = state.workspacePortScansByKey[localScanKey]?.ports ?? []
      const now = Date.now()
      announcements = announcements.filter(
        (announcement) => now - announcement.at <= DEV_SERVER_ANNOUNCEMENT_WINDOW_MS
      )
      forgetStoppedDevServers(openedKeys, ports)
      const activeWorktreeId = state.activeWorktreeId
      const pick = pickDevServerToOpen({
        announcements,
        ports,
        activeWorktreeId,
        openedKeys,
        openTabUrls: (activeWorktreeId
          ? (state.browserTabsByWorktree[activeWorktreeId] ?? [])
          : []
        ).map((tab) => tab.url),
        now
      })
      if (!pick || pick.port.kind !== 'workspace') {
        return
      }
      const worktreeId = pick.port.owner.worktreeId
      openedKeys.add(pick.key)
      // One command often starts helpers too; only its first server gets a tab.
      for (const announcement of announcements) {
        if (announcement.worktreeId === worktreeId) {
          openedKeys.add(devServerKey(worktreeId, announcement.port))
        }
      }
      void openWorkspacePortInBrowser({
        port: pick.port,
        activeWorktreeId,
        runtimeTarget: LOCAL_TARGET,
        createBrowserTab: state.createBrowserTab,
        setRemoteBrowserPageHandle: state.setRemoteBrowserPageHandle,
        openInOrcaBrowser: true
      })
    }

    const unsubscribeAnnouncements = window.api.workspacePorts.onAdvertisedUrlChanged((event) => {
      announcements.push({ worktreeId: event.worktreeId, port: event.port, at: Date.now() })
      evaluate()
    })
    // The scan that confirms the listener lands a moment after the URL is printed.
    const unsubscribeScans = useAppStore.subscribe((state, previous) => {
      if (state.workspacePortScansByKey !== previous.workspacePortScansByKey) {
        evaluate()
      }
    })
    return () => {
      unsubscribeAnnouncements()
      unsubscribeScans()
    }
  }, [active])

  return null
}
