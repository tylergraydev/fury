import { instrumentedInvoke as invoke } from "../ipcInstrumentation";
import type {
  CreatePrRequest,
  PrInfo,
  PrCheck,
  MergeResult,
  PrReview,
  PrComment,
  PrFullData,
  ReviewsAndComments,
  WorkflowRun,
  WorkflowJob,
  RunLogsResult,
  PrListItem,
  PrDetail,
  IssueListItem,
  IssueDetail,
  LinearIssue,
  LinkIssueRequest,
  UnlinkIssueRequest,
  WorkspaceIssue,
  UsageDataPoint,
} from "./bindings.generated";

// PR commands
export async function createPr(request: CreatePrRequest): Promise<PrInfo> {
  return invoke<PrInfo>("create_pr", { request });
}

export async function getPrInfo(workspaceId: string): Promise<PrInfo> {
  return invoke<PrInfo>("get_pr_info", { workspaceId });
}

export async function getPrChecks(workspaceId: string): Promise<PrCheck[]> {
  return invoke<PrCheck[]>("get_pr_checks", { workspaceId });
}

export async function pushChanges(workspaceId: string): Promise<void> {
  return invoke("push_changes", { workspaceId });
}

export async function fixFailingChecks(workspaceId: string): Promise<string> {
  return invoke<string>("fix_failing_checks", { workspaceId });
}

export async function mergePr(
  workspaceId: string,
  mergeMethod?: string,
): Promise<MergeResult> {
  return invoke<MergeResult>("merge_pr", { workspaceId, mergeMethod });
}

export async function getPrReviews(
  workspaceId: string,
): Promise<PrReview[]> {
  return invoke<PrReview[]>("get_pr_reviews", { workspaceId });
}

export async function getPrReviewComments(
  workspaceId: string,
): Promise<PrComment[]> {
  return invoke<PrComment[]>("get_pr_review_comments", { workspaceId });
}

export async function getPrFullData(
  workspaceId: string,
): Promise<PrFullData> {
  return invoke<PrFullData>("get_pr_full_data", { workspaceId });
}

export async function getReviewsAndComments(
  workspaceId: string,
): Promise<ReviewsAndComments> {
  return invoke<ReviewsAndComments>("get_reviews_and_comments", {
    workspaceId,
  });
}

// Workflow commands
export async function getWorkflowRuns(
  workspaceId: string,
): Promise<WorkflowRun[]> {
  return invoke<WorkflowRun[]>("get_workflow_runs", { workspaceId });
}

export async function getRunJobs(
  workspaceId: string,
  runId: number,
): Promise<WorkflowJob[]> {
  return invoke<WorkflowJob[]>("get_run_jobs", { workspaceId, runId });
}

export async function getRunLogs(
  workspaceId: string,
  runId: number,
  failedOnly: boolean,
): Promise<RunLogsResult> {
  return invoke<RunLogsResult>("get_run_logs", {
    workspaceId,
    runId,
    failedOnly,
  });
}

export async function rerunWorkflow(
  workspaceId: string,
  runId: number,
  failedOnly: boolean,
): Promise<void> {
  return invoke("rerun_workflow", { workspaceId, runId, failedOnly });
}

// PR/Issue list commands
export async function listRepoPrs(repoId: string): Promise<PrListItem[]> {
  return invoke<PrListItem[]>("list_repo_prs", { repoId });
}

export async function listRepoIssues(
  repoId: string,
): Promise<IssueListItem[]> {
  return invoke<IssueListItem[]>("list_repo_issues", { repoId });
}

export async function getPrDetails(
  repoId: string,
  prNumber: number,
): Promise<PrDetail> {
  return invoke<PrDetail>("get_pr_details", { repoId, prNumber });
}

export async function getIssueDetails(
  repoId: string,
  issueNumber: number,
): Promise<IssueDetail> {
  return invoke<IssueDetail>("get_issue_details", { repoId, issueNumber });
}

// Linear commands
export async function searchLinearIssues(
  query: string,
): Promise<LinearIssue[]> {
  return invoke<LinearIssue[]>("search_linear_issues", { query });
}

export async function linkIssueToWorkspace(
  request: LinkIssueRequest,
): Promise<void> {
  return invoke("link_issue_to_workspace", { request });
}

export async function unlinkIssueFromWorkspace(
  request: UnlinkIssueRequest,
): Promise<void> {
  return invoke("unlink_issue_from_workspace", { request });
}

export async function getWorkspaceIssues(
  workspaceId: string,
): Promise<WorkspaceIssue[]> {
  return invoke<WorkspaceIssue[]>("get_workspace_issues", { workspaceId });
}

// Usage dashboard
export async function getUsageData(
  workspaceId?: string,
  since?: string,
): Promise<UsageDataPoint[]> {
  return invoke<UsageDataPoint[]>("get_usage_data", { workspaceId, since });
}
