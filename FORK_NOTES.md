# Fork notes

This is a personal fork of [stablyai/orca](https://github.com/stablyai/orca) with
quality-of-life changes for visual web development: annotating a page in the browser tab and
sending the notes to a chat with fewer steps.

## Branches

| Branch                           | What it is                                                        |
| -------------------------------- | ----------------------------------------------------------------- |
| `main`                           | Mirror of upstream `main`. Never commit here.                     |
| `fork/local-run`                 | Upstream `main` plus one-line fixes needed to run it (see below). |
| `feat/annotation-keep-picking`   | Feature 1, on top of `fork/local-run`.                            |
| `feat/one-click-annotation-send` | Feature 2, on top of feature 1.                                   |
| `fork/build`                     | Everything above plus this file. **This is the branch to run.**   |

## Changes

### Run fix (`fork/local-run`)

- **What:** `journal-sql-status-items.ts` imported a module from a path it had been moved from.
- **Why:** upstream `main` did not build on 2026-11-15 (`c7d4cb5d52`). Drop this commit once
  upstream fixes it.
- **Files:** `src/main/native-chat/agent-session-journal/journal-sql-status-items.ts`

### 1. Keep picking while a note is open (`feat/annotation-keep-picking`)

- **What:**
  - Clicking another element while a note card is open saves the note and opens a card on the
    new element. The click no longer reaches the page (no accidental link navigation).
  - Clicking away from the card saves a written note. Cancel and Escape still discard it.
  - Enter adds the note; Shift+Enter starts a new line. Cmd/Ctrl+Enter still works.
- **Why:** before, each note needed a click on Add, and typing was lost on click-away.
- **Files:**
  - Page-side picker: `src/main/browser/element-grab/grab-guest-overlay-script.ts`,
    `grab-guest-selection-scripts.ts`, `grab-guest-script.ts`,
    `browser-grab-session-controller.ts`
  - Plumbing: `src/shared/browser/element-grab/browser-grab-types.ts`,
    `src/preload/api/browser/browser-bridge-page-interaction-and-sessions.ts`,
    `src/main/ipc/browser/browser-grab-ipc.ts`,
    `src/main/browser/guest-lifecycle/manager/grab/browser-manager-grab.ts`
  - Window side: `src/renderer/src/components/browser-pane/annotate/grab/useGrabMode.ts`,
    `use-browser-page-grab-annotations.ts`, `use-pending-browser-annotation-draft.ts` (new),
    `browser-grab-toast-messages.ts` (new),
    `annotate/delivery/pending-browser-annotation-card.tsx`,
    `annotate/browser-guest-annotate-overlays.tsx`, `describe-page/browser-page-types.ts`

### 2. Send without the agent picker, and Batch switch (`feat/one-click-annotation-send`)

- **What:**
  - Send goes straight to an agent when the choice is obvious: the only agent whose tab is on
    screen, or failing that the worktree's only agent. Otherwise the picker opens as before.
  - A **Batch** switch in the annotate banner (on by default, remembered). On: notes collect in
    the tray until Send. Off: the card's button says Send and each note is sent as written.
- **Why:** sending took Send, then picking an agent, every time.
- **Files:**
  - `src/renderer/src/lib/agent-session/messaging/direct-notes-send-target.ts` (new, + test)
  - `src/renderer/src/components/editor/review-note-delivery/send-notes-to-direct-target.ts`
    (new), `run-notes-send.ts` (new, extracted from `ReviewNotesSendMenuContent.tsx`)
  - `src/renderer/src/components/browser-pane/annotate/delivery/use-browser-page-annotation-send.ts`
    (+ test), `browser-annotation-batch-mode.ts` (new), `pending-browser-annotation-card.tsx`
  - `src/renderer/src/components/browser-pane/assemble-chrome/feedback/browser-page-chrome-banners.tsx`

### 3. Chat beside the page (`feat/chat-beside-browser`)

- **What:** a button in the browser toolbar, left of Annotate. One press moves the workspace's
  chat tab into a split on the right of the browser; a second press folds it back into the tabs.
  It uses the existing tab split, so the divider still drags to resize. Right-click the button
  to put the chat on the left or the right; the choice is remembered.
- **Why:** the same layout was already possible by dragging a tab to the pane edge, but that is
  hidden and has to be redone by hand.
- **Files:** `src/renderer/src/components/browser-pane/assemble-chrome/toolbar/`
  `chat-beside-browser.ts` (new, + test), `chat-beside-browser-side.ts` (new),
  `browser-chat-beside-button.tsx` (new),
  `browser-chrome-toolbar.tsx`

### Not built (already in Orca)

- **Hiding the project sidebar:** Cmd/Ctrl+B.

## Build and run

Needs Node 24, Xcode Command Line Tools and Python 3. pnpm comes from Corepack and Bun from npm:

```bash
npm install -g bun@$(cat config/.bun-version)
mkdir -p ~/.orca-fork-tools/bin
corepack enable --install-directory ~/.orca-fork-tools/bin pnpm
export PATH="$HOME/.orca-fork-tools/bin:$PATH"

git checkout fork/build
pnpm install
pnpm -C mobile install --frozen-lockfile
pnpm dev
```

`pnpm dev` runs next to the installed Orca. It keeps its own settings in
`~/Library/Application Support/orca-dev` and does not auto-update.

## Pulling in upstream updates

```bash
git fetch upstream main
git checkout main && git merge --ff-only upstream/main && git push origin main
git checkout fork/build && git rebase main    # resolve conflicts if any
pnpm install && pnpm dev
```

Never install an official Orca release over this build.

## Checks

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (upstream requires all four before a
pull request).
