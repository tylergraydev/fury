# TC-17: Settings — Appearance & Themes

## TC-17.01: Theme — Blend (default)
- **Steps:**
  1. Go to Settings > Appearance
  2. Select "Blend" theme
- **Expected:** Black base with blue accents and Figma panel colors applied. Active theme indicator on Blend.

## TC-17.02: Theme — Midnight
- **Steps:**
  1. Select "Midnight" theme
- **Expected:** Pure black background with white accents. All UI elements update.

## TC-17.03: Theme — GitHub Dark
- **Steps:**
  1. Select "GitHub" theme
- **Expected:** GitHub's dark default color palette applied throughout the app.

## TC-17.04: Theme — live preview on selection
- **Steps:**
  1. Click on different themes quickly
- **Expected:** Theme changes immediately on click (live preview). No delay or flicker.

## TC-17.05: Custom theme — create new
- **Steps:**
  1. Click "Create Custom Theme"
  2. Enter a name
  3. Adjust colors using the color picker
  4. Save
- **Expected:** New custom theme created with UUID. Appears in theme list. Can be selected.

## TC-17.06: Custom theme — duplicate existing
- **Steps:**
  1. Click "Duplicate" on an existing theme
  2. Modify colors
  3. Save with new name
- **Expected:** New theme created based on existing theme's colors. Original unchanged.

## TC-17.07: Custom theme — edit colors
- **Steps:**
  1. Open a custom theme for editing
  2. Change `--bg-primary` to a different color
  3. Observe live preview
  4. Save
- **Expected:** Color picker for each variable. Live preview as colors change. Save persists changes.

## TC-17.08: Custom theme — all 24 CSS variables
- **Steps:**
  1. Edit a custom theme
  2. Verify all variable groups are editable:
     - Backgrounds: `--bg-primary`, `--bg-secondary`, `--bg-surface`, `--bg-hover`
     - Text: `--text-primary`, `--text-secondary`, `--text-muted`
     - Accents: `--accent`, `--accent-hover`, `--accent-green`, `--accent-purple`, `--accent-orange`
     - Borders & Status: `--border`, `--composer-border`, `--overlay`, `--overlay-heavy`, `--success`, `--warning`, `--error`
- **Expected:** All 24 variables present and editable. Organized by group.

## TC-17.09: Custom theme — delete
- **Steps:**
  1. Delete a custom theme
- **Expected:** Theme removed from list. If it was active, app reverts to default (Blend).

## TC-17.10: Custom theme — export as JSON
- **Steps:**
  1. Open a custom theme
  2. Click "Copy JSON" or "Export"
- **Expected:** Theme JSON copied to clipboard containing theme name and all CSS variable values.

## TC-17.11: Custom theme — import from JSON
- **Steps:**
  1. Click "Import Theme"
  2. Paste a theme JSON
  3. Confirm
- **Expected:** New custom theme created from imported JSON. All colors applied correctly.

## TC-17.12: Theme — cancel reverts
- **Steps:**
  1. Start editing a theme (live preview active)
  2. Click "Cancel"
- **Expected:** Theme reverts to previously active theme. Edits discarded.

## TC-17.13: Theme persistence across restart
- **Steps:**
  1. Select a theme
  2. Restart app
- **Expected:** Same theme active after restart.

## TC-17.14: Theme affects terminal colors
- **Steps:**
  1. Switch theme
  2. Observe terminal
- **Expected:** Terminal background, foreground, and ANSI colors update to match theme.

## TC-17.15: Theme affects Monaco editor
- **Steps:**
  1. Switch theme
  2. Observe file editor
- **Expected:** Monaco editor theme updates (background, syntax colors, gutter).
