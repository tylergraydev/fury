import { instrumentedInvoke as invoke } from "../ipcInstrumentation";

// Terminal commands
export async function createTerminal(
  workspaceId: string,
  cols: number,
  rows: number,
): Promise<string> {
  return invoke<string>("create_terminal", { workspaceId, cols, rows });
}

// Repo-scoped terminal command
export async function createRepoTerminal(
  repoId: string,
  cols: number,
  rows: number,
): Promise<string> {
  return invoke<string>("create_repo_terminal", { repoId, cols, rows });
}

export async function writeTerminal(
  terminalId: string,
  data: string,
): Promise<void> {
  return invoke("write_terminal", { terminalId, data });
}

export async function resizeTerminal(
  terminalId: string,
  cols: number,
  rows: number,
): Promise<void> {
  return invoke("resize_terminal", { terminalId, cols, rows });
}

export async function closeTerminal(terminalId: string): Promise<void> {
  return invoke("close_terminal", { terminalId });
}
