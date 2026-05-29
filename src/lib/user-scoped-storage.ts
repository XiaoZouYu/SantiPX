import type { StateStorage } from "zustand/middleware";
import { fileStorage } from "@/lib/indexed-db-storage";
import { isValidPhone, normalizePhone, readStoredPhone } from "@/lib/user-session";
import { useProjectStore } from "@/stores/project-store";

async function waitForProjectHydration(): Promise<void> {
  if (useProjectStore.persist.hasHydrated()) return;
  await new Promise<void>((resolve) => {
    const unsubscribe = useProjectStore.persist.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
  });
}

function getActivePhone(): string | null {
  const phone = normalizePhone(useProjectStore.getState().userPhone || readStoredPhone());
  return isValidPhone(phone) ? phone : null;
}

export function createUserScopedStorage(storeName: string): StateStorage {
  return {
    getItem: async () => {
      await waitForProjectHydration();
      const phone = getActivePhone();
      if (!phone) return null;
      return fileStorage.getItem(`_u/${phone}/${storeName}`);
    },
    setItem: async (_name, value) => {
      const phone = getActivePhone();
      if (!phone) return;
      await fileStorage.setItem(`_u/${phone}/${storeName}`, value);
    },
    removeItem: async () => {
      const phone = getActivePhone();
      if (!phone) return;
      await fileStorage.removeItem(`_u/${phone}/${storeName}`);
    },
  };
}

export function getUserScopedStorageKey(phone: string, storeName: string): string {
  return `_u/${normalizePhone(phone)}/${storeName}`;
}

export async function getUserScopedStorageItem(phone: string, storeName: string): Promise<string | null> {
  const normalizedPhone = normalizePhone(phone);
  if (!isValidPhone(normalizedPhone)) return null;
  return fileStorage.getItem(getUserScopedStorageKey(normalizedPhone, storeName));
}
