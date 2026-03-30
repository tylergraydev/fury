# TC-29: Snippets Manager

## TC-29.01: Open snippets (Cmd+Shift+S)
- **Steps:**
  1. Press **Cmd+Shift+S**
- **Expected:** Snippets manager dialog opens.

## TC-29.02: Create snippet
- **Steps:**
  1. Click "Create Snippet"
  2. Enter name: "React Component Template"
  3. Enter code content
  4. Set language: "TypeScript"
  5. Save
- **Expected:** Snippet created. Appears in snippet list.

## TC-29.03: List snippets
- **Steps:**
  1. Open snippets manager
- **Expected:** All saved snippets listed with name and language.

## TC-29.04: Update snippet
- **Steps:**
  1. Open an existing snippet
  2. Modify the code content
  3. Save
- **Expected:** Snippet updated. Changes persisted.

## TC-29.05: Delete snippet
- **Steps:**
  1. Delete a snippet
- **Expected:** Snippet removed from list permanently.

## TC-29.06: Insert snippet into editor
- **Steps:**
  1. Open snippets manager
  2. Select a snippet
  3. Insert/paste into editor
- **Expected:** Snippet code inserted at cursor position in the active editor.

## TC-29.07: Search snippets
- **Steps:**
  1. Type in snippet search field
- **Expected:** Snippets filtered by name/content matching search text.
