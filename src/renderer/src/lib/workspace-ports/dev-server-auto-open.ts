import type { WorkspacePort } from '../../../../shared/workspace/ports/workspace-ports'
import { browserUrlForPort } from './workspace-port-urls'

/** A terminal in a worktree printed a server URL for this port. */
export type DevServerAnnouncement = { worktreeId: string; port: number; at: number }

/** How long after its URL is printed a server still counts as just started. */
export const DEV_SERVER_ANNOUNCEMENT_WINDOW_MS = 20_000

export function devServerKey(worktreeId: string, port: number): string {
  return `${worktreeId}:${port}`
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/**
 * The just-started server to open, if any: announced by a terminal in the active worktree,
 * confirmed listening by the port scan, not opened before and not already showing in a tab.
 */
export function pickDevServerToOpen(args: {
  announcements: readonly DevServerAnnouncement[]
  ports: readonly WorkspacePort[]
  activeWorktreeId: string | null
  openedKeys: ReadonlySet<string>
  /** URLs of the browser tabs already open in the active worktree. */
  openTabUrls: readonly string[]
  now: number
}): { key: string; port: WorkspacePort } | null {
  if (!args.activeWorktreeId) {
    return null
  }
  const openOrigins = new Set(args.openTabUrls.map(originOf))
  for (const announcement of args.announcements) {
    const key = devServerKey(announcement.worktreeId, announcement.port)
    if (
      announcement.worktreeId !== args.activeWorktreeId ||
      args.now - announcement.at > DEV_SERVER_ANNOUNCEMENT_WINDOW_MS ||
      args.openedKeys.has(key)
    ) {
      continue
    }
    const port = args.ports.find(
      (candidate) =>
        candidate.kind === 'workspace' &&
        candidate.owner.worktreeId === announcement.worktreeId &&
        candidate.port === announcement.port &&
        Boolean(candidate.advertisedUrl)
    )
    if (port && !openOrigins.has(originOf(browserUrlForPort(port)))) {
      return { key, port }
    }
  }
  return null
}

/** Forgets servers that stopped listening, so starting one again opens it again. */
export function forgetStoppedDevServers(
  openedKeys: Set<string>,
  ports: readonly WorkspacePort[]
): void {
  const listening = new Set(
    ports.flatMap((port) =>
      port.kind === 'workspace' ? [devServerKey(port.owner.worktreeId, port.port)] : []
    )
  )
  for (const key of openedKeys) {
    if (!listening.has(key)) {
      openedKeys.delete(key)
    }
  }
}
