import { instrumentedInvoke as invoke } from "../ipcInstrumentation";

export interface Notepad {
  id: string;
  title: string;
  content: string;
  description: string | null;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNotepadRequest {
  title: string;
  content: string;
  description?: string;
  tags?: string[];
}

export interface UpdateNotepadRequest {
  title?: string;
  content?: string;
  description?: string;
  tags?: string[];
  pinned?: boolean;
}

export async function createNotepad(
  request: CreateNotepadRequest,
): Promise<Notepad> {
  return invoke("create_notepad", { request });
}

export async function listNotepads(): Promise<Notepad[]> {
  return invoke("list_notepads");
}

export async function getNotepad(id: string): Promise<Notepad> {
  return invoke("get_notepad", { id });
}

export async function updateNotepad(
  id: string,
  request: UpdateNotepadRequest,
): Promise<Notepad> {
  return invoke("update_notepad", { id, request });
}

export async function deleteNotepad(id: string): Promise<void> {
  return invoke("delete_notepad", { id });
}
