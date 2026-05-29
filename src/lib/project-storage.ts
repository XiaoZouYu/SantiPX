import type { StateStorage } from "zustand/middleware";
import { fileStorage } from "@/lib/indexed-db-storage";
import { DEFAULT_PROJECT_ID, isUserProjectId } from "@/lib/user-session";
import { useProjectStore } from "@/stores/project-store";

export function createProjectScopedStorage(storeName: string): StateStorage {
  return {
    getItem: async (name) => {
      if (!useProjectStore.persist.hasHydrated()) {
        await new Promise<void>((resolve) => {
          const unsub = useProjectStore.persist.onFinishHydration(() => {
            unsub();
            resolve();
          });
        });
      }
      const projectId = useProjectStore.getState().activeProjectId || DEFAULT_PROJECT_ID;
      const scopedValue = await fileStorage.getItem(`_p/${projectId}/${storeName}`);
      if (scopedValue) return scopedValue;
      return isUserProjectId(projectId) ? null : fileStorage.getItem(name);
    },
    setItem: async (_name, value) => {
      const projectId = useProjectStore.getState().activeProjectId || DEFAULT_PROJECT_ID;
      await fileStorage.setItem(`_p/${projectId}/${storeName}`, value);
    },
    removeItem: async (_name) => {
      const projectId = useProjectStore.getState().activeProjectId || DEFAULT_PROJECT_ID;
      await fileStorage.removeItem(`_p/${projectId}/${storeName}`);
    },
  };
}
