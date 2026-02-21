import { create } from "zustand";
import {
  type Repository,
  addRepository,
  cloneRepository,
  initRepository,
  listRepositories,
  removeRepository,
} from "../lib/tauri";

interface RepositoryStore {
  repositories: Repository[];
  loading: boolean;
  error: string | null;

  loadRepositories: () => Promise<void>;
  addRepo: (path: string) => Promise<Repository>;
  cloneRepo: (url: string, path: string) => Promise<Repository>;
  initRepo: (path: string, name: string) => Promise<Repository>;
  removeRepo: (id: string) => Promise<void>;
}

export const useRepositoryStore = create<RepositoryStore>((set, get) => ({
  repositories: [],
  loading: false,
  error: null,

  loadRepositories: async () => {
    set({ loading: true, error: null });
    try {
      const repos = await listRepositories();
      set({ repositories: repos, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  addRepo: async (path: string) => {
    set({ error: null });
    try {
      const repo = await addRepository(path);
      set({ repositories: [...get().repositories, repo] });
      return repo;
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  cloneRepo: async (url: string, path: string) => {
    set({ error: null });
    try {
      const repo = await cloneRepository(url, path);
      set({ repositories: [...get().repositories, repo] });
      return repo;
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  initRepo: async (path: string, name: string) => {
    set({ error: null });
    try {
      const repo = await initRepository(path, name);
      set({ repositories: [...get().repositories, repo] });
      return repo;
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  removeRepo: async (id: string) => {
    try {
      await removeRepository(id);
      set({ repositories: get().repositories.filter((r) => r.id !== id) });
    } catch (e) {
      set({ error: String(e) });
    }
  },
}));
