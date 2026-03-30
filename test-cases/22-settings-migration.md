# TC-22: Settings — Cursor Migration

## TC-22.01: Detect Cursor config
- **Precondition:** `~/.cursor/mcp.json` exists
- **Steps:**
  1. Go to Settings > Migration tab
- **Expected:** Cursor config detected. Status indicator shows "Found". Import option available.

## TC-22.02: Detect Cursor config — not found
- **Precondition:** No `~/.cursor/mcp.json`
- **Steps:**
  1. Go to Settings > Migration tab
- **Expected:** Shows "Not found" status. No import option.

## TC-22.03: Import MCP servers from Cursor
- **Steps:**
  1. Click "Import MCP Servers"
- **Expected:** MCP servers from Cursor config imported to Fury. Appear in MCP Servers settings.

## TC-22.04: Detect .cursorrules
- **Precondition:** Repository has a `.cursorrules` file
- **Steps:**
  1. Open Migration tab for that repository
- **Expected:** `.cursorrules` detected for the repo.

## TC-22.05: Convert .cursorrules to CLAUDE.md — new file
- **Precondition:** No existing `CLAUDE.md` in repo
- **Steps:**
  1. Click "Convert to CLAUDE.md"
- **Expected:** New `CLAUDE.md` created with contents converted from `.cursorrules`.

## TC-22.06: Convert .cursorrules to CLAUDE.md — merge with existing
- **Precondition:** Repository already has `CLAUDE.md`
- **Steps:**
  1. Click "Convert to CLAUDE.md"
  2. Choose "Merge" option
- **Expected:** Contents from `.cursorrules` merged into existing `CLAUDE.md` without losing existing content.
