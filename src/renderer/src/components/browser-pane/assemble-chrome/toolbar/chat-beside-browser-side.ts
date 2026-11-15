import { useSyncExternalStore } from 'react'

export type ChatBesideBrowserSide = 'left' | 'right'

const STORAGE_KEY = 'orca.browser.chatBesideSide'
const listeners = new Set<() => void>()
let side: ChatBesideBrowserSide | null = null

/** Which side of the page the chat is placed on. */
export function getChatBesideBrowserSide(): ChatBesideBrowserSide {
  if (side === null) {
    try {
      side = localStorage.getItem(STORAGE_KEY) === 'left' ? 'left' : 'right'
    } catch {
      side = 'right'
    }
  }
  return side
}

export function setChatBesideBrowserSide(next: ChatBesideBrowserSide): void {
  side = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // The choice still applies for this session.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useChatBesideBrowserSide(): ChatBesideBrowserSide {
  return useSyncExternalStore(subscribe, getChatBesideBrowserSide)
}
