import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { fileStorage } from "@/lib/indexed-db-storage";
import {
  DEFAULT_PROJECT_ID,
  PROJECT_STORE_KEY,
  createProjectForPhone,
  getProjectIdForPhone,
  isValidPhone,
  normalizePhone,
} from "@/lib/user-session";

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

interface ProjectStore {
  userPhone: string | null;
  projects: Project[];
  activeProjectId: string;
  activeProject: Project;
  setUserPhone: (phone: string) => void;
  renameProject: (name: string) => void;
}

const DEFAULT_PROJECT: Project = {
  id: DEFAULT_PROJECT_ID,
  name: "品宣项目",
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      userPhone: null,
      projects: [DEFAULT_PROJECT],
      activeProjectId: DEFAULT_PROJECT.id,
      activeProject: DEFAULT_PROJECT,
      setUserPhone: (rawPhone) => {
        const phone = normalizePhone(rawPhone);
        if (!isValidPhone(phone)) return;
        set((state) => {
          const projectId = getProjectIdForPhone(phone);
          const existing = state.projects.find((project) => project.id === projectId);
          const nextProject = createProjectForPhone(phone, existing);
          return {
            userPhone: phone,
            projects: [nextProject],
            activeProjectId: nextProject.id,
            activeProject: nextProject,
          };
        });
      },
      renameProject: (name) => {
        set((state) => {
          const nextProject = {
            ...state.activeProject,
            name: name.trim() || "品宣项目",
            updatedAt: Date.now(),
          };
          return {
            projects: [nextProject],
            activeProjectId: nextProject.id,
            activeProject: nextProject,
          };
        });
      },
    }),
    {
      name: PROJECT_STORE_KEY,
      storage: createJSONStorage(() => fileStorage),
      partialize: (state) => ({
        userPhone: state.userPhone,
        projects: state.projects,
        activeProjectId: state.activeProjectId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const phone = normalizePhone(state.userPhone);
        const fallbackProject = state.projects[0] || DEFAULT_PROJECT;
        const project = isValidPhone(phone)
          ? createProjectForPhone(phone, state.projects.find((item) => item.id === getProjectIdForPhone(phone)))
          : fallbackProject;
        state.userPhone = isValidPhone(phone) ? phone : null;
        state.projects = [project];
        state.activeProjectId = project.id;
        state.activeProject = project;
      },
    },
  ),
);
