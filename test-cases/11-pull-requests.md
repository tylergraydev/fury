# TC-11: Pull Requests

## TC-11.01: Create PR — basic
- **Precondition:** Workspace with commits not on default branch, changes pushed to remote
- **Steps:**
  1. Open PR panel (right sidebar > Checks tab or dedicated PR area)
  2. Enter PR title
  3. Enter PR description/body
  4. Click "Create Pull Request"
- **Expected:** PR created on GitHub/Azure DevOps. PR number and URL displayed. Status shows "OPEN".

## TC-11.02: Create PR — draft
- **Steps:**
  1. Open PR creation form
  2. Check "Draft" checkbox
  3. Fill in title/body and create
- **Expected:** PR created as draft. Status shows "DRAFT". PR is not ready for review.

## TC-11.03: View active PR status
- **Precondition:** PR exists for current workspace branch
- **Steps:**
  1. Open PR panel
- **Expected:** Shows PR number, branch name, status (OPEN/DRAFT), check status, and action buttons.

## TC-11.04: PR checks — passing
- **Precondition:** PR with all CI checks passing
- **Steps:**
  1. Open PR panel
  2. Observe check status
- **Expected:** Green indicator showing all checks passed. Individual check names and status visible.

## TC-11.05: PR checks — failing
- **Precondition:** PR with failing CI checks
- **Steps:**
  1. Open PR panel
- **Expected:** Red indicator showing failing checks. Failed check names visible with links to details.

## TC-11.06: PR checks — pending
- **Steps:**
  1. Push changes and observe checks before they complete
- **Expected:** Yellow/pending indicator. Check names shown with "pending" status.

## TC-11.07: Push changes to PR
- **Steps:**
  1. Make additional commits in workspace
  2. Click "Push Changes" in PR panel
- **Expected:** Commits pushed to PR branch. Check status refreshes. Changes reflected on remote.

## TC-11.08: Fix failing checks — AI-powered
- **Precondition:** PR with failing checks
- **Steps:**
  1. Click "Fix Failing Checks" button
- **Expected:** Failing check context sent to agent. Agent analyzes failures and attempts to fix the issues. New commits may be created.

## TC-11.09: Merge PR — merge commit
- **Precondition:** PR with passing checks and approvals
- **Steps:**
  1. Click "Merge" button
  2. Select "Merge Commit" strategy
- **Expected:** PR merged with merge commit. Status changes to "Merged". Post-merge info displayed.

## TC-11.10: Merge PR — squash
- **Steps:**
  1. Click "Merge"
  2. Select "Squash" strategy
- **Expected:** All PR commits squashed into one. PR merged.

## TC-11.11: Merge PR — rebase
- **Steps:**
  1. Click "Merge"
  2. Select "Rebase" strategy
- **Expected:** PR commits rebased onto base branch. PR merged.

## TC-11.12: View on GitHub
- **Steps:**
  1. Click "View on GitHub" link
- **Expected:** PR page opens in system default browser.

## TC-11.13: PR reviews — load and display
- **Steps:**
  1. Open a PR that has reviews
  2. View the Checks/Reviews section
- **Expected:** Reviews listed with reviewer name, status (Approved, Changes Requested, Commented), and review body.

## TC-11.14: PR review comments
- **Steps:**
  1. View a PR with review comments
- **Expected:** Inline review comments displayed with file path, line number, and comment body.

## TC-11.15: Workflow runs — list
- **Precondition:** PR with GitHub Actions workflows
- **Steps:**
  1. View workflow runs in PR panel
- **Expected:** List of workflow runs with name, status, and timestamp.

## TC-11.16: Workflow run — view jobs
- **Steps:**
  1. Click on a workflow run
- **Expected:** Shows jobs within the run, each with name and status.

## TC-11.17: Workflow run — view logs
- **Steps:**
  1. Click on a job within a workflow run
- **Expected:** Job logs displayed. Option to show only failed steps.

## TC-11.18: Workflow run — rerun
- **Steps:**
  1. Click "Rerun" on a failed workflow run
- **Expected:** Workflow re-triggered. Status updates to pending.

## TC-11.19: Rerun — failed only
- **Steps:**
  1. Click "Rerun Failed" on a workflow run
- **Expected:** Only failed jobs re-run. Passing jobs not re-executed.

## TC-11.20: PR merged state display
- **Precondition:** PR has been merged
- **Steps:**
  1. Open the workspace for a merged PR
- **Expected:** PR panel shows merged state with indicator. Links to merged PR.

## TC-11.21: PR event subscription — real-time updates
- **Steps:**
  1. Open PR panel
  2. Have someone push to the PR or approve it externally
- **Expected:** PR status updates in real-time via event subscription (pr-updated event).

## TC-11.22: PR merged event notification
- **Steps:**
  1. Have someone merge the PR externally
- **Expected:** pr-merged event fires. Notification appears. PR panel updates to merged state.

## TC-11.23: Repository-level PR list
- **Steps:**
  1. Switch to repository context
  2. View PR list
- **Expected:** All PRs in the repository listed with title, number, status, and author.

## TC-11.24: Repository-level issue list
- **Steps:**
  1. View issues for the repository
- **Expected:** All issues listed with title, number, status, and labels.

## TC-11.25: PR details by number
- **Steps:**
  1. Navigate to a specific PR by number
- **Expected:** Full PR details displayed: title, body, author, reviewers, checks, labels, milestone.
