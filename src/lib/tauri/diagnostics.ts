import { instrumentedInvoke as invoke } from "../ipcInstrumentation";

export interface LintDiagnostic {
  filePath: string;
  line: number;
  column: number;
  severity: string;
  message: string;
  rule: string | null;
}

export async function runLint(
  repoId: string,
  filePath?: string,
): Promise<LintDiagnostic[]> {
  return invoke("run_lint", { repoId, filePath });
}
