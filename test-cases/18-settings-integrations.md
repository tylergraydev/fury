# TC-18: Settings — Integrations

## TC-18.01: Copilot — enable
- **Steps:**
  1. Go to Settings > Copilot
  2. Toggle Copilot to "Enabled"
- **Expected:** Copilot LSP service starts. Connection status indicator appears.

## TC-18.02: Copilot — sign in (device code flow)
- **Steps:**
  1. Enable Copilot
  2. Click "Sign In"
  3. Copy the device code shown
  4. Open GitHub device login page in browser
  5. Enter the code and authorize
- **Expected:** Device code and link displayed. After authorization, status shows signed-in user. Polling completes within 5 minutes.

## TC-18.03: Copilot — connection status indicators
- **Steps:**
  1. Observe Copilot status through: disconnected → connecting → connected
- **Expected:** Each state shown with appropriate indicator. Error state shown if connection fails.

## TC-18.04: Copilot — disable
- **Steps:**
  1. Toggle Copilot to "Disabled"
- **Expected:** Copilot LSP stopped. No more inline completions. Connection status disappears.

## TC-18.05: Linear — configure API key
- **Steps:**
  1. Go to Settings > Linear
  2. Enter Linear API key (`lin_api_...`)
  3. Save
- **Expected:** API key saved (masked). Linear issue search now functional.

## TC-18.06: Linear — show/hide API key
- **Steps:**
  1. Enter Linear API key
  2. Toggle show/hide
- **Expected:** Key toggles between masked and visible.

## TC-18.07: Azure DevOps — configure PAT
- **Steps:**
  1. Go to Settings > Azure DevOps
  2. Enter Personal Access Token
  3. Save
- **Expected:** PAT saved. Azure DevOps PR/issue features enabled for ADO repos.

## TC-18.08: Azure DevOps — default organization
- **Steps:**
  1. Enter default organization name
  2. Save
- **Expected:** Organization saved. Auto-detected from repo remote URL if available.

## TC-18.09: Code Search — enable Claude Context
- **Steps:**
  1. Go to Settings > Code Search
  2. Toggle Claude Context to "Enabled"
  3. Enter OpenAI API key, Zilliz URI, Zilliz Token
  4. Save
- **Expected:** Semantic code search enabled. Repository indexing becomes available.

## TC-18.10: Code Search — index repository
- **Precondition:** Claude Context enabled with valid credentials
- **Steps:**
  1. Navigate to a repository in Code Search settings
  2. Click "Index" or "Re-index"
- **Expected:** Indexing begins. Status changes to "indexing". Progress visible. Completes with "indexed" status and last indexed date.

## TC-18.11: Code Search — indexing error
- **Steps:**
  1. Attempt to index with invalid credentials
- **Expected:** Status shows "error" with error message displayed.

## TC-18.12: MCP Servers — add server
- **Steps:**
  1. Go to Settings > MCP Servers
  2. Click "Add Server"
  3. Enter: Name, Command (e.g., `npx`), Arguments, Scope (user/project)
  4. Add environment variables if needed
  5. Save
- **Expected:** MCP server registered. Appears in server list with command and scope.

## TC-18.13: MCP Servers — remove server
- **Steps:**
  1. Click "Remove" on an MCP server entry
- **Expected:** Server removed from configuration. Disappears from list.

## TC-18.14: MCP Servers — user vs project scope
- **Steps:**
  1. Add a server with "user" scope
  2. Add a server with "project" scope
- **Expected:** User-scoped servers available globally. Project-scoped servers only for current project.

## TC-18.15: LSP Plugins — view catalog
- **Steps:**
  1. Go to Settings > Code Intelligence
- **Expected:** Available LSP plugins listed with language support and installation status.

## TC-18.16: LSP Plugins — install
- **Steps:**
  1. Find a plugin in the catalog
  2. Click "Install"
- **Expected:** Plugin installed. Status shows "Ready" if binary available. "Binary not found" with installation hints if missing.

## TC-18.17: LSP Plugins — uninstall
- **Steps:**
  1. Click "Uninstall" on an installed plugin
- **Expected:** Plugin removed. No longer providing language features.

## TC-18.18: LSP Plugins — auto-suggest for repo
- **Steps:**
  1. Open a repository with Python files
- **Expected:** LSP plugin suggestions offered for detected languages (e.g., Python LSP for .py files).
