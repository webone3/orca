import { useCallback, useRef } from 'react'
import { useAppStore } from '@/store/index'
import type { BrowserGrabPayload } from '../../../../../../shared/browser/element-grab/browser-grab-types'
import {
  createBrowserAnnotationId,
  createBrowserAnnotationPayload,
  DEFAULT_BROWSER_ANNOTATION_PRIORITY
} from '../../describe-page/browser-annotation-geometry'
import type { BrowserAnnotationDraft } from '../../describe-page/browser-page-types'

/** Holds the open card's note so picking another element can save it instead of losing it. */
export function usePendingBrowserAnnotationDraft(browserTabId: string): {
  /** Adds a note and drops the draft it came from. */
  addAnnotationForPayload: (payload: BrowserGrabPayload, draft: BrowserAnnotationDraft) => void
  /** Saves the open card's note against its element; false when there was nothing to save. */
  savePendingDraftFor: (payload: BrowserGrabPayload) => boolean
  clearPendingDraft: () => void
  handlePendingBrowserAnnotationDraftChange: (draft: BrowserAnnotationDraft | null) => void
} {
  const pendingAnnotationDraftRef = useRef<BrowserAnnotationDraft | null>(null)
  const addBrowserPageAnnotation = useAppStore((s) => s.addBrowserPageAnnotation)
  const recordFeatureInteraction = useAppStore((s) => s.recordFeatureInteraction)

  const addAnnotationForPayload = useCallback(
    (payload: BrowserGrabPayload, draft: BrowserAnnotationDraft): void => {
      pendingAnnotationDraftRef.current = null
      addBrowserPageAnnotation({
        id: createBrowserAnnotationId(),
        browserPageId: browserTabId,
        comment: draft.comment,
        intent: draft.intent,
        priority: DEFAULT_BROWSER_ANNOTATION_PRIORITY,
        createdAt: new Date().toISOString(),
        payload: createBrowserAnnotationPayload(payload),
        ...(draft.imagePaths.length > 0 ? { imagePaths: draft.imagePaths } : {})
      })
      recordFeatureInteraction('browser-annotations')
    },
    [addBrowserPageAnnotation, browserTabId, recordFeatureInteraction]
  )

  const savePendingDraftFor = useCallback(
    (payload: BrowserGrabPayload): boolean => {
      const draft = pendingAnnotationDraftRef.current
      if (!draft) {
        return false
      }
      addAnnotationForPayload(payload, draft)
      return true
    },
    [addAnnotationForPayload]
  )

  const clearPendingDraft = useCallback((): void => {
    pendingAnnotationDraftRef.current = null
  }, [])

  const handlePendingBrowserAnnotationDraftChange = useCallback(
    (draft: BrowserAnnotationDraft | null): void => {
      pendingAnnotationDraftRef.current = draft
    },
    []
  )

  return {
    addAnnotationForPayload,
    savePendingDraftFor,
    clearPendingDraft,
    handlePendingBrowserAnnotationDraftChange
  }
}
