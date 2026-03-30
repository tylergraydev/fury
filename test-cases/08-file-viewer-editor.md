# TC-08: File Viewer & Editor

## TC-08.01: Open file from file tree
- **Steps:**
  1. Open the Files tab in right sidebar
  2. Navigate to a file (e.g., `src/App.tsx`)
  3. Single-click the file
- **Expected:** File opens in the main editor panel with syntax highlighting. Tab appears in file tab bar.

## TC-08.02: Syntax highlighting per language
- **Steps:**
  1. Open files of different types: `.ts`, `.rs`, `.py`, `.json`, `.md`, `.css`, `.go`
- **Expected:** Each file renders with correct language-specific syntax highlighting. Language indicator shown.

## TC-08.03: Language detection from extension
- **Steps:**
  1. Open files with various extensions
- **Expected:** Correct language detected: `.tsx` → TypeScript, `.rs` → Rust, `.py` → Python, `.json` → JSON, `.yml` → YAML, `.sh` → Shell, etc.

## TC-08.04: Edit file and save (Cmd+S)
- **Steps:**
  1. Open a file
  2. Make a change (add a comment)
  3. Press **Cmd+S**
- **Expected:** File saved to disk. Dirty indicator clears. No format-on-save unless configured.

## TC-08.05: Dirty indicator for unsaved changes
- **Steps:**
  1. Open a file
  2. Make a change without saving
- **Expected:** Tab shows dirty indicator (e.g., dot or different color). Indicator clears after save.

## TC-08.06: Multiple files in tabs
- **Steps:**
  1. Open file A
  2. Open file B
  3. Open file C
- **Expected:** Three tabs visible. Click tabs to switch between files. Content loads correctly for each.

## TC-08.07: Close file tab
- **Steps:**
  1. Open multiple files
  2. Click the close button on a tab
- **Expected:** Tab closes. If file had unsaved changes, prompt or warning shown. Editor switches to adjacent tab.

## TC-08.08: Pin file tab
- **Steps:**
  1. Open a file
  2. Pin the tab (right-click > Pin or similar)
- **Expected:** Pinned tab has distinct styling. Pinned tabs resist accidental closing.

## TC-08.09: Split editor (Cmd+\\)
- **Steps:**
  1. Open a file
  2. Press **Cmd+\\**
  3. Open a different file in the second pane
- **Expected:** Editor splits into left/right panes. Each pane maintains independent file tabs. Can focus either pane.

## TC-08.10: Split editor — focus switching
- **Steps:**
  1. In split mode, click on the left pane
  2. Click on the right pane
- **Expected:** Focus indicator shows which pane is active. Keyboard input goes to focused pane.

## TC-08.11: Split editor — toggle off
- **Steps:**
  1. In split mode, press **Cmd+\\** again
- **Expected:** Split closes. Returns to single editor view.

## TC-08.12: Bookmark — toggle via gutter click
- **Steps:**
  1. Open a file
  2. Click in the gutter area next to a line number
- **Expected:** Bookmark decoration appears in the gutter. Clicking again removes it.

## TC-08.13: Bookmark — add with note
- **Steps:**
  1. Right-click in gutter or use bookmark dialog
  2. Select "Add Bookmark with Note..."
  3. Enter a note: "TODO: Refactor this logic"
  4. Confirm
- **Expected:** Bookmark created with note. Gutter decoration with color coding. Hovering shows the note.

## TC-08.14: Bookmark — view in sidebar
- **Steps:**
  1. Create several bookmarks across files
  2. Open Bookmarks tab in right sidebar
- **Expected:** All bookmarks listed with file path, line number, and note. Clicking navigates to the bookmarked location.

## TC-08.15: Bookmark — search
- **Steps:**
  1. Open Bookmarks tab
  2. Type in the search field
- **Expected:** Bookmarks filtered by search text (matches file path or note content).

## TC-08.16: Bookmark — edit note
- **Steps:**
  1. Open bookmark details
  2. Edit the note text
  3. Save
- **Expected:** Note updated. Visible on hover and in sidebar.

## TC-08.17: Bookmark — delete
- **Steps:**
  1. Delete a bookmark from sidebar or gutter
- **Expected:** Bookmark removed. Gutter decoration disappears. No longer in sidebar list.

## TC-08.18: File tree — directory expansion
- **Steps:**
  1. In Files tab, click on a directory to expand
  2. Click again to collapse
- **Expected:** Directory contents show/hide. Sorted: directories first, then alphabetical.

## TC-08.19: File tree — file search
- **Steps:**
  1. Type in the file tree search field
- **Expected:** File tree filters to show only matching files/directories.

## TC-08.20: File tree — test file run button
- **Steps:**
  1. Navigate to a test file (e.g., `*.test.ts`)
  2. Observe the run button
  3. Click it
- **Expected:** Test run button visible for test files. Clicking triggers test execution for that file.

## TC-08.21: TypeScript IntelliSense
- **Precondition:** TypeScript project with `node_modules`
- **Steps:**
  1. Open a `.ts` file
  2. Type a partial import or function call
- **Expected:** Type definitions loaded from `node_modules`. Autocomplete suggestions appear. Hover shows type information.

## TC-08.22: Copilot inline completions
- **Precondition:** Copilot enabled and authenticated
- **Steps:**
  1. Open a code file
  2. Start typing a function
- **Expected:** Ghost text completions appear inline. Tab to accept. Completions are contextual.

## TC-08.23: Code folding
- **Steps:**
  1. Open a file with nested code blocks
  2. Click fold indicators in the gutter
- **Expected:** Code blocks collapse/expand. Fold indicator shows collapsed state.

## TC-08.24: Read binary file as base64
- **Steps:**
  1. Try to open a binary file (e.g., image)
- **Expected:** File handled appropriately — either displayed (for images) or shown as base64/binary indicator.

## TC-08.25: Write file with format-on-save
- **Precondition:** Formatter configured
- **Steps:**
  1. Open a file
  2. Add poorly formatted code
  3. Save with format-on-save enabled
- **Expected:** File is formatted according to project formatter on save.
