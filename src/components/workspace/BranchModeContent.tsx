/**
 * Branch mode content for NewWorkspaceDialog.
 *
 * Branch mode has no mode-specific selector UI — it uses only
 * the shared worktree-name and base-branch fields rendered by the parent.
 * This component renders an empty fragment so the parent can treat
 * every mode uniformly via a content component.
 */
export function BranchModeContent() {
  return null;
}
