import { create } from "zustand";
import {
  type CreateWorkspaceTemplateRequest,
  type UpdateWorkspaceTemplateRequest,
  type WorkspaceTemplate,
  createWorkspaceTemplate,
  listWorkspaceTemplates,
  updateWorkspaceTemplate,
  deleteWorkspaceTemplate,
} from "../lib/tauri";

interface WorkspaceTemplateStore {
  templates: WorkspaceTemplate[];
  loading: boolean;
  error: string | null;

  loadTemplates: (repoId: string) => Promise<void>;
  createTemplate: (
    request: CreateWorkspaceTemplateRequest,
  ) => Promise<WorkspaceTemplate>;
  updateTemplate: (
    templateId: string,
    request: UpdateWorkspaceTemplateRequest,
  ) => Promise<void>;
  deleteTemplate: (templateId: string) => Promise<void>;
}

export const useWorkspaceTemplateStore = create<WorkspaceTemplateStore>(
  (set, get) => ({
    templates: [],
    loading: false,
    error: null,

    loadTemplates: async (repoId: string) => {
      set({ loading: true, error: null });
      try {
        const templates = await listWorkspaceTemplates(repoId);
        set({ templates, loading: false });
      } catch (e) {
        set({ error: String(e), loading: false });
      }
    },

    createTemplate: async (request: CreateWorkspaceTemplateRequest) => {
      set({ error: null });
      try {
        const template = await createWorkspaceTemplate(request);
        set({ templates: [...get().templates, template] });
        return template;
      } catch (e) {
        set({ error: String(e) });
        throw e;
      }
    },

    updateTemplate: async (
      templateId: string,
      request: UpdateWorkspaceTemplateRequest,
    ) => {
      set({ error: null });
      try {
        const updated = await updateWorkspaceTemplate(templateId, request);
        set({
          templates: get().templates.map((t) =>
            t.id === templateId ? updated : t,
          ),
        });
      } catch (e) {
        set({ error: String(e) });
        throw e;
      }
    },

    deleteTemplate: async (templateId: string) => {
      set({ error: null });
      try {
        await deleteWorkspaceTemplate(templateId);
        set({
          templates: get().templates.filter((t) => t.id !== templateId),
        });
      } catch (e) {
        set({ error: String(e) });
        throw e;
      }
    },
  }),
);
