// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createProjectScopedStorage } from "@/lib/project-storage";

export type PromoStatus = "idle" | "queued" | "generating" | "completed" | "failed";
export type ProductReferencePurpose = "main_product" | "packaging" | "logo" | "material_detail" | "usage_scene";
export type PromotionShotCount = "auto" | number;
export type PromotionAdStructure = "auto" | "classic" | "product_demo" | "problem_solution" | "lifestyle";
export type PromotionShotType = "hero" | "detail" | "usage" | "proof" | "packaging" | "cta";
export type PromotionAspectRatio = "16:9" | "9:16" | "1:1" | "3:2" | "2:3";
export type PromotionImageSize =
  | "auto"
  | "1024x1024"
  | "1536x1024"
  | "1024x1536"
  | "2560x1440"
  | "1440x2560"
  | "3840x2160"
  | "2160x3840";

export const PROMOTION_MIN_SHOT_DURATION = 5;
export const PROMOTION_DEFAULT_TARGET_DURATION = 30;
export const PROMOTION_MAX_SHOT_COUNT = 10;

export const PRODUCT_REFERENCE_PURPOSE_LABELS: Record<ProductReferencePurpose, string> = {
  main_product: "主产品",
  packaging: "包装",
  logo: "Logo",
  material_detail: "材质细节",
  usage_scene: "使用场景",
};

export const PROMOTION_SHOT_TYPE_LABELS: Record<PromotionShotType, string> = {
  hero: "主视觉",
  detail: "细节",
  usage: "使用",
  proof: "证明",
  packaging: "包装",
  cta: "CTA",
};

export const PROMOTION_IMAGE_SIZE_OPTIONS: PromotionImageSize[] = [
  "auto",
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "2560x1440",
  "1440x2560",
  "3840x2160",
  "2160x3840",
];

export const PROMOTION_IMAGE_SIZE_LABELS: Record<PromotionImageSize, string> = {
  auto: "auto",
  "1024x1024": "1024x1024 方图",
  "1536x1024": "1536x1024 横图",
  "1024x1536": "1024x1536 竖图",
  "2560x1440": "2560x1440 2K 横图",
  "1440x2560": "1440x2560 2K 竖图",
  "3840x2160": "3840x2160 4K 横图",
  "2160x3840": "2160x3840 4K 竖图",
};

export interface ProductReferenceImage {
  id: string;
  url: string;
  purpose: ProductReferencePurpose;
  name?: string;
}

export interface ProductBible {
  productName: string;
  category: string;
  targetAudience: string;
  coreSellingPoints: string[];
  usageScenarios: string[];
  brandColors: string[];
  requiredElements: string[];
  forbiddenExpressions: string[];
  referenceImages: ProductReferenceImage[];
  logoUrl?: string;
  packagingNotes: string;
  materialNotes: string;
  fixedAngles: string[];
}

export interface PromoShot {
  id: string;
  order: number;
  title: string;
  shotType: PromotionShotType;
  sellingPoint: string;
  firstFramePrompt: string;
  videoMotionPrompt: string;
  referenceUsage: string;
  needsEndFrame: boolean;
  endFramePrompt?: string;
  productLockRules: string[];
  ctaCopy?: string;
  imagePrompt: string;
  videoPrompt: string;
  duration: number;
  referenceImages: ProductReferenceImage[];
  imageStatus: PromoStatus;
  videoStatus: PromoStatus;
  imageUrl?: string;
  imageMediaId?: string;
  videoUrl?: string;
  videoMediaId?: string;
  imageError?: string;
  videoError?: string;
  notes: string;
}

export interface PromotionProjectData {
  briefText: string;
  productBible: ProductBible;
  shots: PromoShot[];
  targetDuration: number;
  shotCount: PromotionShotCount;
  adStructure: PromotionAdStructure;
  minShotDuration: typeof PROMOTION_MIN_SHOT_DURATION;
  imageSize: PromotionImageSize;
  aspectRatio: PromotionAspectRatio;
  imageResolution: "1K" | "2K" | "4K";
  videoResolution: "480p" | "720p" | "1080p";
  updatedAt: number;
}

interface PromotionStore {
  activeProjectId: string | null;
  projects: Record<string, PromotionProjectData>;
  selectedShotId: string | null;
  setActiveProjectId: (projectId: string | null) => void;
  ensureProject: (projectId: string) => void;
  setBriefText: (briefText: string) => void;
  updateProductBible: (updates: Partial<ProductBible>) => void;
  setTargetDuration: (targetDuration: number) => void;
  setShotCount: (shotCount: PromotionShotCount) => void;
  setAdStructure: (adStructure: PromotionAdStructure) => void;
  setImageSize: (imageSize: PromotionImageSize) => void;
  setAspectRatio: (aspectRatio: PromotionProjectData["aspectRatio"]) => void;
  setImageResolution: (resolution: PromotionProjectData["imageResolution"]) => void;
  setVideoResolution: (resolution: PromotionProjectData["videoResolution"]) => void;
  setShots: (shots: PromoShot[]) => void;
  updateShot: (shotId: string, updates: Partial<PromoShot>) => void;
  deleteShot: (shotId: string) => void;
  addShot: (shot?: Partial<PromoShot>) => PromoShot | null;
  reorderShot: (shotId: string, direction: "up" | "down") => void;
  setSelectedShotId: (shotId: string | null) => void;
  resetPromotion: () => void;
}

const emptyProductBible = (): ProductBible => ({
  productName: "",
  category: "",
  targetAudience: "",
  coreSellingPoints: [],
  usageScenarios: [],
  brandColors: [],
  requiredElements: [],
  forbiddenExpressions: [],
  referenceImages: [],
  packagingNotes: "",
  materialNotes: "",
  fixedAngles: [],
});

function createProductReferenceImage(
  url: string,
  purpose: ProductReferencePurpose = "main_product",
  name?: string,
): ProductReferenceImage {
  return {
    id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    url,
    purpose,
    name,
  };
}

function normalizeReferencePurpose(value: unknown): ProductReferencePurpose {
  return value === "packaging"
    || value === "logo"
    || value === "material_detail"
    || value === "usage_scene"
    || value === "main_product"
    ? value
    : "main_product";
}

function normalizeProductReferenceImages(value: unknown): ProductReferenceImage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (typeof item === "string") {
        return {
          id: `legacy_ref_${index}_${item.length}`,
          url: item,
          purpose: "main_product" as ProductReferencePurpose,
        };
      }
      if (!item || typeof item !== "object") return null;
      const raw = item as Partial<ProductReferenceImage>;
      if (!raw.url) return null;
      return {
        id: raw.id || `ref_${index}_${String(raw.url).length}`,
        url: raw.url,
        purpose: normalizeReferencePurpose(raw.purpose),
        name: raw.name,
      };
    })
    .filter((item): item is ProductReferenceImage => Boolean(item));
}

function normalizeBibleText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(normalizeBibleText).filter(Boolean).join("，");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferred = record.name ?? record.label ?? record.title ?? record.text ?? record.value ?? record.description;
    if (preferred !== undefined) return normalizeBibleText(preferred);
    return Object.values(record).map(normalizeBibleText).filter(Boolean).join("，");
  }
  return "";
}

function normalizeBibleList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(normalizeBibleText).filter(Boolean);
  }
  const text = normalizeBibleText(value);
  return text
    ? text.split(/[\n,，、;；]/).map((item) => item.trim()).filter(Boolean)
    : [];
}

function normalizeProductBible(value: unknown): ProductBible {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<ProductBible>;
  return {
    ...emptyProductBible(),
    ...raw,
    productName: normalizeBibleText(raw.productName),
    category: normalizeBibleText(raw.category),
    targetAudience: normalizeBibleText(raw.targetAudience),
    coreSellingPoints: normalizeBibleList(raw.coreSellingPoints),
    usageScenarios: normalizeBibleList(raw.usageScenarios),
    brandColors: normalizeBibleList(raw.brandColors),
    requiredElements: normalizeBibleList(raw.requiredElements),
    forbiddenExpressions: normalizeBibleList(raw.forbiddenExpressions),
    packagingNotes: normalizeBibleText(raw.packagingNotes),
    materialNotes: normalizeBibleText(raw.materialNotes),
    fixedAngles: normalizeBibleList(raw.fixedAngles),
    referenceImages: normalizeProductReferenceImages((raw as any).referenceImages),
  };
}

function normalizeTargetDuration(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return PROMOTION_DEFAULT_TARGET_DURATION;
  return Math.max(PROMOTION_MIN_SHOT_DURATION, Math.round(numeric));
}

function normalizeShotCount(value: unknown): PromotionShotCount {
  if (value === "auto" || value === undefined || value === null || value === "") return "auto";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "auto";
  return Math.max(1, Math.min(PROMOTION_MAX_SHOT_COUNT, Math.floor(numeric)));
}

function normalizeAdStructure(value: unknown): PromotionAdStructure {
  return value === "classic"
    || value === "product_demo"
    || value === "problem_solution"
    || value === "lifestyle"
    || value === "auto"
    ? value
    : "auto";
}

function normalizeImageSize(value: unknown): PromotionImageSize {
  return PROMOTION_IMAGE_SIZE_OPTIONS.includes(value as PromotionImageSize)
    ? value as PromotionImageSize
    : "auto";
}

function deriveAspectRatioFromImageSize(
  imageSize: PromotionImageSize,
  fallback: PromotionAspectRatio = "9:16",
): PromotionAspectRatio {
  if (imageSize === "1024x1024") return "1:1";
  if (imageSize === "1536x1024") return "3:2";
  if (imageSize === "1024x1536") return "2:3";
  if (imageSize === "2560x1440" || imageSize === "3840x2160") return "16:9";
  if (imageSize === "1440x2560" || imageSize === "2160x3840") return "9:16";
  return fallback;
}

function deriveImageResolutionFromImageSize(
  imageSize: PromotionImageSize,
  fallback: PromotionProjectData["imageResolution"] = "2K",
): PromotionProjectData["imageResolution"] {
  if (imageSize === "1024x1024" || imageSize === "1536x1024" || imageSize === "1024x1536") return "1K";
  if (imageSize === "2560x1440" || imageSize === "1440x2560") return "2K";
  if (imageSize === "3840x2160" || imageSize === "2160x3840") return "4K";
  return fallback;
}

function normalizeShotType(value: unknown): PromotionShotType {
  return value === "detail"
    || value === "usage"
    || value === "proof"
    || value === "packaging"
    || value === "cta"
    || value === "hero"
    ? value
    : "hero";
}

function inferPromotionShotType(order: number, title?: string, sellingPoint?: string): PromotionShotType {
  const text = `${title || ""} ${sellingPoint || ""}`.toLowerCase();
  if (/cta|转化|行动|收口|结尾|定格/.test(text)) return "cta";
  if (/包装|信任|交付|品牌/.test(text)) return "packaging";
  if (/使用|场景|生活|通勤|户外|办公/.test(text)) return "usage";
  if (/证明|功能|演示|解决|痛点/.test(text)) return "proof";
  if (/细节|材质|工艺|特写|质感|logo/.test(text)) return "detail";
  return order <= 1 ? "hero" : "detail";
}

function isShotCountValidForDuration(
  shotCount: PromotionShotCount,
  _targetDuration: number,
  _minShotDuration = PROMOTION_MIN_SHOT_DURATION,
) {
  return shotCount === "auto" || (shotCount >= 1 && shotCount <= PROMOTION_MAX_SHOT_COUNT);
}

function normalizeShotDuration(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return PROMOTION_MIN_SHOT_DURATION;
  return Math.max(PROMOTION_MIN_SHOT_DURATION, Math.round(numeric));
}

const defaultProjectData = (): PromotionProjectData => ({
  briefText: "",
  productBible: emptyProductBible(),
  shots: [],
  targetDuration: PROMOTION_DEFAULT_TARGET_DURATION,
  shotCount: "auto",
  adStructure: "auto",
  minShotDuration: PROMOTION_MIN_SHOT_DURATION,
  imageSize: "auto",
  aspectRatio: "9:16",
  imageResolution: "2K",
  videoResolution: "720p",
  updatedAt: Date.now(),
});

function createPromoShot(order: number, overrides?: Partial<PromoShot>): PromoShot {
  const firstFramePrompt = normalizeBibleText(overrides?.firstFramePrompt || overrides?.imagePrompt || "");
  const videoMotionPrompt = normalizeBibleText(overrides?.videoMotionPrompt || overrides?.videoPrompt || "");
  return {
    id: overrides?.id || `promo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    order,
    title: overrides?.title || `提示词节点 ${order}`,
    shotType: overrides?.shotType
      ? normalizeShotType(overrides.shotType)
      : inferPromotionShotType(order, overrides?.title, overrides?.sellingPoint),
    sellingPoint: overrides?.sellingPoint || "",
    firstFramePrompt,
    videoMotionPrompt,
    referenceUsage: normalizeBibleText(overrides?.referenceUsage),
    needsEndFrame: Boolean(overrides?.needsEndFrame),
    endFramePrompt: normalizeBibleText(overrides?.endFramePrompt),
    productLockRules: normalizeBibleList(overrides?.productLockRules),
    ctaCopy: normalizeBibleText(overrides?.ctaCopy),
    imagePrompt: overrides?.imagePrompt || firstFramePrompt,
    videoPrompt: overrides?.videoPrompt || videoMotionPrompt,
    duration: normalizeShotDuration(overrides?.duration),
    referenceImages: normalizeProductReferenceImages(overrides?.referenceImages || []),
    imageStatus: overrides?.imageStatus || "idle",
    videoStatus: overrides?.videoStatus || "idle",
    imageUrl: overrides?.imageUrl,
    imageMediaId: overrides?.imageMediaId,
    videoUrl: overrides?.videoUrl,
    videoMediaId: overrides?.videoMediaId,
    imageError: overrides?.imageError,
    videoError: overrides?.videoError,
    notes: overrides?.notes || "",
  };
}

function normalizeOrders(shots: PromoShot[]): PromoShot[] {
  return shots.map((shot, index) => createPromoShot(index + 1, shot));
}

function normalizeProjectData(value: unknown): PromotionProjectData {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<PromotionProjectData>;
  const targetDuration = normalizeTargetDuration((raw as any).targetDuration);
  const normalizedShotCount = normalizeShotCount((raw as any).shotCount);
  const imageSize = normalizeImageSize((raw as any).imageSize);
  const legacyAspectRatio = deriveAspectRatioFromImageSize(
    imageSize,
    raw.aspectRatio === "16:9" || raw.aspectRatio === "1:1" || raw.aspectRatio === "3:2" || raw.aspectRatio === "2:3"
      ? raw.aspectRatio
      : "9:16",
  );
  const legacyImageResolution = deriveImageResolutionFromImageSize(
    imageSize,
    raw.imageResolution === "1K" || raw.imageResolution === "4K" ? raw.imageResolution : "2K",
  );
  return {
    ...defaultProjectData(),
    ...raw,
    imageSize,
    aspectRatio: legacyAspectRatio,
    imageResolution: legacyImageResolution,
    targetDuration,
    shotCount: isShotCountValidForDuration(normalizedShotCount, targetDuration)
      ? normalizedShotCount
      : "auto",
    adStructure: normalizeAdStructure((raw as any).adStructure),
    minShotDuration: PROMOTION_MIN_SHOT_DURATION,
    productBible: normalizeProductBible(raw.productBible),
    shots: Array.isArray(raw.shots) ? normalizeOrders(raw.shots) : [],
  };
}

export const usePromotionStore = create<PromotionStore>()(
  persist(
    (set, get) => ({
      activeProjectId: null,
      projects: {},
      selectedShotId: null,

      setActiveProjectId: (projectId) => {
        set((state) => {
          if (!projectId) return { activeProjectId: null };
          return {
            activeProjectId: projectId,
            projects: state.projects[projectId]
              ? state.projects
              : { ...state.projects, [projectId]: defaultProjectData() },
          };
        });
      },

      ensureProject: (projectId) => {
        set((state) => (
          state.projects[projectId]
            ? {}
            : { projects: { ...state.projects, [projectId]: defaultProjectData() } }
        ));
      },

      setBriefText: (briefText) => {
        const pid = get().activeProjectId;
        if (!pid) return;
        set((state) => ({
          projects: {
            ...state.projects,
            [pid]: { ...(state.projects[pid] || defaultProjectData()), briefText, updatedAt: Date.now() },
          },
        }));
      },

      updateProductBible: (updates) => {
        const pid = get().activeProjectId;
        if (!pid) return;
        set((state) => {
          const project = state.projects[pid] || defaultProjectData();
          return {
            projects: {
              ...state.projects,
              [pid]: {
                ...project,
                productBible: normalizeProductBible({ ...project.productBible, ...updates }),
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      setTargetDuration: (targetDuration) => {
        const pid = get().activeProjectId;
        if (!pid) return;
        set((state) => {
          const project = state.projects[pid] || defaultProjectData();
          const normalizedTargetDuration = normalizeTargetDuration(targetDuration);
          const shotCount = isShotCountValidForDuration(project.shotCount, normalizedTargetDuration)
            ? project.shotCount
            : "auto";
          return {
            projects: {
              ...state.projects,
              [pid]: {
                ...project,
                targetDuration: normalizedTargetDuration,
                shotCount,
                minShotDuration: PROMOTION_MIN_SHOT_DURATION,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      setShotCount: (shotCount) => {
        const pid = get().activeProjectId;
        if (!pid) return;
        set((state) => {
          const project = state.projects[pid] || defaultProjectData();
          const normalizedShotCount = normalizeShotCount(shotCount);
          return {
            projects: {
              ...state.projects,
              [pid]: {
                ...project,
                shotCount: isShotCountValidForDuration(normalizedShotCount, project.targetDuration)
                  ? normalizedShotCount
                  : "auto",
                minShotDuration: PROMOTION_MIN_SHOT_DURATION,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      setAdStructure: (adStructure) => {
        const pid = get().activeProjectId;
        if (!pid) return;
        set((state) => ({
          projects: {
            ...state.projects,
            [pid]: {
              ...(state.projects[pid] || defaultProjectData()),
              adStructure: normalizeAdStructure(adStructure),
              minShotDuration: PROMOTION_MIN_SHOT_DURATION,
              updatedAt: Date.now(),
            },
          },
        }));
      },

      setImageSize: (imageSize) => {
        const pid = get().activeProjectId;
        if (!pid) return;
        const normalizedImageSize = normalizeImageSize(imageSize);
        set((state) => {
          const project = state.projects[pid] || defaultProjectData();
          return {
            projects: {
              ...state.projects,
              [pid]: {
                ...project,
                imageSize: normalizedImageSize,
                aspectRatio: deriveAspectRatioFromImageSize(normalizedImageSize, project.aspectRatio),
                imageResolution: deriveImageResolutionFromImageSize(normalizedImageSize, project.imageResolution),
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      setAspectRatio: (aspectRatio) => {
        const pid = get().activeProjectId;
        if (!pid) return;
        set((state) => ({
          projects: {
            ...state.projects,
            [pid]: { ...(state.projects[pid] || defaultProjectData()), aspectRatio, updatedAt: Date.now() },
          },
        }));
      },

      setImageResolution: (imageResolution) => {
        const pid = get().activeProjectId;
        if (!pid) return;
        set((state) => ({
          projects: {
            ...state.projects,
            [pid]: { ...(state.projects[pid] || defaultProjectData()), imageResolution, updatedAt: Date.now() },
          },
        }));
      },

      setVideoResolution: (videoResolution) => {
        const pid = get().activeProjectId;
        if (!pid) return;
        set((state) => ({
          projects: {
            ...state.projects,
            [pid]: { ...(state.projects[pid] || defaultProjectData()), videoResolution, updatedAt: Date.now() },
          },
        }));
      },

      setShots: (shots) => {
        const pid = get().activeProjectId;
        if (!pid) return;
        set((state) => ({
          projects: {
            ...state.projects,
            [pid]: {
              ...(state.projects[pid] || defaultProjectData()),
              shots: normalizeOrders(shots),
              updatedAt: Date.now(),
            },
          },
          selectedShotId: shots[0]?.id || null,
        }));
      },

      updateShot: (shotId, updates) => {
        const pid = get().activeProjectId;
        if (!pid) return;
        set((state) => {
          const project = state.projects[pid] || defaultProjectData();
          return {
            projects: {
              ...state.projects,
              [pid]: {
                ...project,
                shots: project.shots.map((shot) => {
                  if (shot.id !== shotId) return shot;
                  return {
                    ...shot,
                    ...updates,
                    duration: updates.duration !== undefined
                      ? normalizeShotDuration(updates.duration)
                      : normalizeShotDuration(shot.duration),
                  };
                }),
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      deleteShot: (shotId) => {
        const pid = get().activeProjectId;
        if (!pid) return;
        set((state) => {
          const project = state.projects[pid] || defaultProjectData();
          const shots = normalizeOrders(project.shots.filter((shot) => shot.id !== shotId));
          return {
            projects: { ...state.projects, [pid]: { ...project, shots, updatedAt: Date.now() } },
            selectedShotId: state.selectedShotId === shotId ? shots[0]?.id || null : state.selectedShotId,
          };
        });
      },

      addShot: (shot) => {
        const pid = get().activeProjectId;
        if (!pid) return null;
        const project = get().projects[pid] || defaultProjectData();
        const newShot = createPromoShot(project.shots.length + 1, shot);
        set((state) => ({
          projects: {
            ...state.projects,
            [pid]: {
              ...(state.projects[pid] || defaultProjectData()),
              shots: [...project.shots, newShot],
              updatedAt: Date.now(),
            },
          },
          selectedShotId: newShot.id,
        }));
        return newShot;
      },

      reorderShot: (shotId, direction) => {
        const pid = get().activeProjectId;
        if (!pid) return;
        set((state) => {
          const project = state.projects[pid] || defaultProjectData();
          const index = project.shots.findIndex((shot) => shot.id === shotId);
          const target = direction === "up" ? index - 1 : index + 1;
          if (index < 0 || target < 0 || target >= project.shots.length) return {};
          const shots = [...project.shots];
          [shots[index], shots[target]] = [shots[target], shots[index]];
          return {
            projects: {
              ...state.projects,
              [pid]: { ...project, shots: normalizeOrders(shots), updatedAt: Date.now() },
            },
          };
        });
      },

      setSelectedShotId: (selectedShotId) => set({ selectedShotId }),

      resetPromotion: () => {
        const pid = get().activeProjectId;
        if (!pid) return;
        set((state) => ({
          projects: { ...state.projects, [pid]: defaultProjectData() },
          selectedShotId: null,
        }));
      },
    }),
    {
      name: "santi-promotion-store",
      storage: createJSONStorage(() => createProjectScopedStorage("promotion")),
      skipHydration: true,
      partialize: (state) => {
        const pid = state.activeProjectId;
        return {
          activeProjectId: pid,
          projectData: pid ? state.projects[pid] : null,
        };
      },
      merge: (persisted: any, current: any) => {
        if (!persisted) return current;
        const pid = persisted.activeProjectId;
        if (!pid || !persisted.projectData) return { ...current, ...persisted };
        return {
          ...current,
          activeProjectId: pid,
          projects: {
            ...current.projects,
            [pid]: normalizeProjectData(persisted.projectData),
          },
        };
      },
    },
  ),
);

export const useActivePromotionProject = (): PromotionProjectData | null => {
  return usePromotionStore((state) => {
    if (!state.activeProjectId) return null;
    return state.projects[state.activeProjectId] || null;
  });
};

export {
  createPromoShot,
  createProductReferenceImage,
  defaultProjectData,
  deriveAspectRatioFromImageSize,
  emptyProductBible,
  normalizeProductReferenceImages,
  normalizeProjectData,
};
