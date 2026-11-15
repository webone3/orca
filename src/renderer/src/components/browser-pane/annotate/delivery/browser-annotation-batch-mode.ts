import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'orca.browserAnnotations.batchMode'
const listeners = new Set<() => void>()
let batchMode: boolean | null = null

/** Batch collects notes in the tray until Send; off, each note is sent as soon as it is written. */
export function getBrowserAnnotationBatchMode(): boolean {
  if (batchMode === null) {
    try {
      batchMode = localStorage.getItem(STORAGE_KEY) !== 'off'
    } catch {
      batchMode = true
    }
  }
  return batchMode
}

export function setBrowserAnnotationBatchMode(next: boolean): void {
  batchMode = next
  try {
    localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off')
  } catch {
    // The choice still applies for this session.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useBrowserAnnotationBatchMode(): boolean {
  return useSyncExternalStore(subscribe, getBrowserAnnotationBatchMode)
}
