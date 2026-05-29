import { removeStorageKeyEverywhere } from "@/lib/indexed-db-storage";
import type { Project } from "@/stores/project-store";

export const DEFAULT_PROJECT_ID = "santipx-default-project";
export const PROJECT_STORE_KEY = "santipx-project-store";
export const PROMOTION_STORE_KEY = "santi-promotion-store";
export const API_CONFIG_STORE_KEY = "opencut-api-config";
export const USER_PHONE_STORAGE_KEY = "santipx-user-phone";
export const USER_PROJECT_ID_PREFIX = "santipx-user-";
export const LEGACY_USERLESS_STORAGE_CLEARED_KEY = "santipx-legacy-userless-storage-cleared-v2";

const LEGACY_USERLESS_STORAGE_KEYS = [
  PROJECT_STORE_KEY,
  PROMOTION_STORE_KEY,
  API_CONFIG_STORE_KEY,
  `_p/${DEFAULT_PROJECT_ID}/promotion`,
];

export function normalizePhone(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "");
}

export function isValidPhone(phone: string): boolean {
  return /^\d{5,20}$/.test(phone);
}

export function readPhoneFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const phone = normalizePhone(new URLSearchParams(window.location.search).get("phone"));
  return isValidPhone(phone) ? phone : null;
}

export function readStoredPhone(): string | null {
  if (typeof window === "undefined") return null;
  const phone = normalizePhone(localStorage.getItem(USER_PHONE_STORAGE_KEY));
  return isValidPhone(phone) ? phone : null;
}

export function persistPhone(phone: string): void {
  localStorage.setItem(USER_PHONE_STORAGE_KEY, phone);
}

export function getProjectIdForPhone(phone: string): string {
  return `${USER_PROJECT_ID_PREFIX}${phone}`;
}

export function isUserProjectId(projectId: string): boolean {
  return projectId.startsWith(USER_PROJECT_ID_PREFIX);
}

export function createProjectForPhone(phone: string, existing?: Project): Project {
  const now = Date.now();
  return {
    id: getProjectIdForPhone(phone),
    name: existing?.name?.trim() || "品宣项目",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export async function clearLegacyUserlessStorageOnce(): Promise<void> {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(LEGACY_USERLESS_STORAGE_CLEARED_KEY) === "1") return;

  await Promise.all(LEGACY_USERLESS_STORAGE_KEYS.map((key) => removeStorageKeyEverywhere(key)));
  localStorage.setItem(LEGACY_USERLESS_STORAGE_CLEARED_KEY, "1");
}
