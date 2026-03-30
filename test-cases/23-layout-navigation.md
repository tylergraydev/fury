# TC-23: Layout & Navigation

## TC-23.01: Three-panel layout
- **Steps:**
  1. Launch the app
- **Expected:** Three resizable panels visible: Left Sidebar | Main Panel | Right Sidebar.

## TC-23.02: Resize left sidebar
- **Steps:**
  1. Drag the divider between left sidebar and main panel
- **Expected:** Sidebar resizes within constraints (12-30% width). Content reflows.

## TC-23.03: Resize right sidebar
- **Steps:**
  1. Drag the divider between main panel and right sidebar
- **Expected:** Right sidebar resizes within constraints (15-40% width).

## TC-23.04: Resize top/bottom in right sidebar
- **Steps:**
  1. Drag the divider between top and bottom sections of right sidebar
- **Expected:** Sections resize within constraints (15-85%). Terminal/script panels grow/shrink.

## TC-23.05: Toggle right sidebar (Cmd+B)
- **Steps:**
  1. Press **Cmd+B**
- **Expected:** Right sidebar hides. Press again to show. Main panel expands to fill space.

## TC-23.06: Collapse bottom section of right sidebar
- **Steps:**
  1. Click the collapse chevron on the bottom section divider
- **Expected:** Bottom section (Setup/Run/Terminal) collapses. Top section (Files/Changes/Checks/Bookmarks) expands.

## TC-23.07: Expand bottom section
- **Steps:**
  1. Click the expand chevron
- **Expected:** Bottom section restores to previous size.

## TC-23.08: Top bar — repository breadcrumb
- **Precondition:** Active workspace selected
- **Steps:**
  1. Observe the top bar
- **Expected:** Shows: Repository name → Branch name. Workspace name in pill.

## TC-23.09: Top bar — agent status indicator
- **Steps:**
  1. Observe status dot in top bar
  2. Send a message (Running state)
  3. Wait for completion (Idle state)
- **Expected:** Dot color changes: gray (Idle), green with pulse (Running), red (Error). Tooltip matches.

## TC-23.10: Top bar — notification bell
- **Steps:**
  1. Click the notification bell icon
- **Expected:** Notification panel opens (380px wide, max 420px height).

## TC-23.11: Top bar — unread notification badge
- **Precondition:** Unread notifications exist
- **Steps:**
  1. Observe bell icon
- **Expected:** Badge shows unread count (up to 99+).

## TC-23.12: Mac traffic light support
- **Precondition:** Running on macOS
- **Steps:**
  1. Observe top-left corner of app
- **Expected:** Extra padding for macOS traffic light buttons. Draggable region works for window movement.

## TC-23.13: Right sidebar tab switching
- **Steps:**
  1. Click "All Files" tab
  2. Click "Changes" tab
  3. Click "Checks" tab
  4. Click "Bookmarks" tab
- **Expected:** Each tab shows its respective content. Active tab has distinct styling.

## TC-23.14: Right sidebar — Checks tab only for workspaces
- **Steps:**
  1. Switch to repository context (not workspace)
  2. Observe right sidebar tabs
- **Expected:** "Checks" tab not available in repository context. Only for workspace context.

## TC-23.15: Bottom section tab switching
- **Steps:**
  1. Click "Setup" tab
  2. Click "Run" tab
  3. Click "Terminal" tab
- **Expected:** Each tab shows its respective panel. Active tab indicated.

## TC-23.16: Main panel — view tab switching
- **Steps:**
  1. Open Chat view
  2. Open Merge view
  3. Open History view
  4. Switch between them
- **Expected:** Each view loads its content. Tab bar shows open views. Active view highlighted.

## TC-23.17: Conditional rendering — hidden panels don't mount
- **Steps:**
  1. Open only the Chat tab
  2. Verify that other tabs (Merge, Tests, etc.) are not mounted
- **Expected:** Only the active view is rendered. No hidden components running hooks/effects in background. (Verify via React DevTools if available.)

## TC-23.18: Home button
- **Steps:**
  1. Click the Home button in left sidebar
- **Expected:** Returns to landing page / repository selection view.
