# UI Freeze Fix — Progress Log

## Problem
App freezes when transitioning between contexts (landing→repo, repo→workspace, workspace→workspace).

## Root Cause (Identified)
PRs #74 and #75 introduced changes that, combined with their fixes, altered the mount staggering pattern. The original codebase used tiered double-rAF deferrals to spread IPC calls across multiple frames. The PRs removed this staggering, causing all IPC calls to fire simultaneously.

## What We've Tried

### 1. Backend: Mutex → RwLock (KEPT)
**Files**: `src-tauri/src/state/app_state.rs`, all 15 files in `src-tauri/src/commands/`
**Change**: Converted `repositories`, `workspaces`, `settings` from `std::sync::Mutex` to `std::sync::RwLock`. Read operations use `.read()`, write operations use `.write()`.
**Result**: Reduces backend lock contention for concurrent reads. Good optimization, keeping.

### 2. Backend: Parallel list_repositories (KEPT)
**Files**: `src-tauri/src/commands/repository.rs`
**Change**: Git operations in list_repositories run in parallel.
**Result**: Faster repo listing. Keeping.

### 3. Cache Guards in FileTreePanel + ChangesPanel (KEPT)
**Files**: `src/components/sidebar/FileTreePanel.tsx`, `src/components/sidebar/ChangesPanel.tsx`
**Change**: Skip IPC call if data is already cached for the contextId.
**Result**: Prevents redundant IPC calls on context switch when data exists.

### 4. Replaced PanelGroup with Custom Flexbox + DragHandle (REVERTED)
**Files**: `src/App.tsx`, `src/components/layout/RightSidebar.tsx`
**Change**: Replaced `react-resizable-panels` with custom flexbox layout + mouse-drag resize handles.
**Result**: Did NOT fix the freeze. PanelGroup has been in the project for a long time and is not the cause. Reverted back to PanelGroup.

### 5. Restored layoutReady + rightSidebarReady Mount Staggering (KEPT)
**Files**: `src/App.tsx`
**Change**:
- `layoutReady`: double-rAF deferral when `hasContext` transitions from falsy to truthy
- `rightSidebarReady`: single-rAF deferral after layoutReady becomes true
- Gate: `if (!hasContext || !layoutReady)` shows landing page
- RightSidebar content gated on `rightSidebarReady`
**Result**: Fixed the initial landing→workspace freeze. Workspace switches still freeze.

### 6. Added rAF Deferral to TerminalPanel (KEPT)
**Files**: `src/components/terminal/TerminalPanel.tsx`
**Change**: Wrapped `createTerminal` IPC call in `requestAnimationFrame`.
**Result**: Prevents terminal creation from blocking the mount frame.

### 7. Added contextId to rightSidebarReady deps (REVERTED)
**Files**: `src/App.tsx`
**Change**: Added `contextId` to `rightSidebarReady` effect dependency array so it resets on workspace switch.
**Result**: Caused PanelGroup layout thrash (3 render cycles + 2 layout recalculations). Did NOT fix freeze. Reverted.

### 8. Flattened Double-rAF to Single-rAF (REVERTED)
**Files**: `src/components/chat/ChatPanel.tsx`, `src/components/chat/Composer.tsx`, `src/components/sidebar/FileTreePanel.tsx`
**Change**: Changed double-rAF (tiered) to single-rAF in ChatPanel, Composer, FileTreePanel.
**Result**: Caused all 12+ IPC calls to fire on the same frame during workspace switches. REVERTED back to double-rAF tiering.

### 9. IPC Concurrency Limiter (KEPT, but didn't fix freeze)
**Files**: `src/lib/ipcInstrumentation.ts`
**Change**: Added MAX_CONCURRENT=3 limiter to `instrumentedInvoke`. Excess calls are queued. `setTimeout(0)` yield between batches.
**Result**: Queue IS working (screenshot shows inflight maxing at 3). But freeze still happens. This means the freeze is NOT from IPC response storms — it's in the synchronous React render/commit phase.

### 10. Removed React.StrictMode (KEPT)
**Files**: `src/main.tsx`
**Change**: Removed `<React.StrictMode>` wrapper.
**Result**: Prevents double-firing of effects in dev mode.

### 11. pauseFrameMonitor/resumeFrameMonitor (KEPT)
**Files**: `src/lib/frameMonitor.ts`
**Change**: Added ability to pause/resume frame monitoring.
**Result**: Diagnostic utility, not a fix.

### 12. contentReady gate for context switches (CURRENT)
**Files**: `src/App.tsx`
**Change**: Added `contentReady` state that resets to false when `contextId` changes (workspace-to-workspace or repo-to-workspace switch). MainPanel is gated on `contentReady`. RightSidebar is chained to `contentReady && layoutReady`.
**Result**: Splits the heavy synchronous re-render across 3 frames:
- Frame 0: contextId changes → `contentReady=false` → MainPanel unmounts, RightSidebar unmounts (PanelGroup skeleton stays)
- Frame 1: `contentReady=true` → MainPanel mounts with new contextId
- Frame 2: `rightSidebarReady=true` → RightSidebar mounts with new context

## Root Cause Analysis (Updated)
The Zustand store's `setActive()` is atomic — `hasContext` never goes falsy during workspace switches. The `layoutReady` effect correctly doesn't reset during context-to-context changes. The freeze was caused by the massive synchronous React re-render when ALL child components (ChatPanel, FileTreePanel, ChangesPanel, TerminalPanel, etc.) update simultaneously because `contextId` changed. The `contentReady` gate breaks this into staggered frames.

## Current State
- Initial landing→repo transition: **WORKS** (no freeze)
- Workspace/chat switching: **Testing contentReady gate**
