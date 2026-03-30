# TC-07: Repository Management

## TC-07.01: Add existing repository
- **Steps:**
  1. Click "Add Repository" (or use action)
  2. Browse to an existing git repository directory
  3. Confirm
- **Expected:** Repository registered in Fury. Appears in left sidebar. Auto-detects default branch, current branch, and provider (GitHub/Azure DevOps).

## TC-07.02: Clone repository
- **Steps:**
  1. Select "Clone Repository"
  2. Enter repository URL (e.g., `https://github.com/user/repo.git`)
  3. Choose local path
  4. Confirm
- **Expected:** Repository cloned to specified path. Automatically registered in Fury. Appears in sidebar.

## TC-07.03: Initialize new repository
- **Steps:**
  1. Select "Initialize Repository"
  2. Choose a directory path
  3. Enter repository name
  4. Confirm
- **Expected:** New git repository created at path. Registered in Fury. Appears in sidebar.

## TC-07.04: Remove repository
- **Steps:**
  1. Right-click a repository in sidebar
  2. Select "Remove"
  3. Confirm
- **Expected:** Repository unregistered from Fury. Disappears from sidebar. Files on disk NOT deleted. Associated workspaces handled appropriately.

## TC-07.05: List repositories
- **Steps:**
  1. Observe left sidebar
- **Expected:** All registered repositories listed. Each shows repository name. Expandable to show workspaces.

## TC-07.06: Repository auto-detection — GitHub
- **Steps:**
  1. Add a repository with a GitHub remote URL
- **Expected:** Provider detected as "GitHub". PR/issue features use GitHub API.

## TC-07.07: Repository auto-detection — Azure DevOps
- **Steps:**
  1. Add a repository with an Azure DevOps remote URL
- **Expected:** Provider detected as "AzureDevOps". PR/issue features use Azure DevOps API.

## TC-07.08: Repository settings access
- **Steps:**
  1. Click the settings icon on a repository in the sidebar
- **Expected:** Repository settings panel opens showing: setup script, run script, archive script, worktree base path, env vars, provider override, dev container config, test runner config.

## TC-07.09: Repository collapse/expand in sidebar
- **Steps:**
  1. Click on a repository name in sidebar to collapse
  2. Click again to expand
- **Expected:** Workspaces under that repo hide/show. Collapse state visually indicated with chevron.

## TC-07.10: Repository error banner
- **Steps:**
  1. Register a repo, then move/delete the directory on disk
  2. Attempt to interact with it
- **Expected:** Error banner appears in sidebar for that repo. Banner is dismissible. Operations gracefully fail with error messages.

## TC-07.11: List repository directories (for sparse checkout)
- **Steps:**
  1. When creating a workspace, browse repository directories
- **Expected:** Directory tree shown with configurable depth. Can select/deselect directories for sparse checkout.
