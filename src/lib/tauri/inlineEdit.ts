import { instrumentedInvoke as invoke } from "../ipcInstrumentation";

export async function inlineEdit(
  workspaceId: string,
  editId: string,
  filePath: string,
  language: string,
  selectedCode: string,
  fullFileContent: string,
  instruction: string,
): Promise<void> {
  return invoke("inline_edit", {
    workspaceId,
    editId,
    filePath,
    language,
    selectedCode,
    fullFileContent,
    instruction,
  });
}

export async function cancelInlineEdit(editId: string): Promise<void> {
  return invoke("cancel_inline_edit", { editId });
}
