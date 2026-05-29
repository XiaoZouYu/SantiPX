// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  Download,
  FileText,
  ImagePlus,
  ImageIcon,
  Layers,
  Loader2,
  Megaphone,
  PackageCheck,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useProjectStore } from "@/stores/project-store";
import {
  useActivePromotionProject,
  usePromotionStore,
  PRODUCT_REFERENCE_PURPOSE_LABELS,
  PROMOTION_IMAGE_SIZE_LABELS,
  PROMOTION_IMAGE_SIZE_OPTIONS,
  PROMOTION_MAX_SHOT_COUNT,
  createProductReferenceImage,
  type PromoShot,
  type ProductReferenceImage,
  type ProductReferencePurpose,
  type PromotionAdStructure,
  type PromotionImageSize,
  type PromotionProjectData,
  type PromotionShotCount,
} from "@/stores/promotion-store";
import { useAPIConfigStore } from "@/stores/api-config-store";
import {
  buildPromoImagePrompt,
  enrichPromoShotStructure,
  rebuildShotPrompts,
} from "@/lib/promotion/prompt-builder";
import {
  exportPromotionFiles,
  generatePromoPlan,
  generatePromoShotImage,
} from "@/lib/promotion/promo-service";
import { runStaggered } from "@/lib/utils/concurrency";
import { cn } from "@/lib/utils";
import { PromoShotCard } from "./promo-shot-card";
import { ProductBiblePanel } from "./product-bible-panel";

interface MobileCollapsibleCardProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  className?: string;
}

function MobileCollapsibleCard({
  title,
  icon,
  children,
  trailing,
  className,
}: MobileCollapsibleCardProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <section className={cn("rounded-lg border border-border bg-panel p-3 sm:p-4", className)}>
      <div className="relative flex w-full min-w-0 items-center gap-2">
        {icon}
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{title}</h3>
        {trailing}
        <button
          type="button"
          aria-expanded={mobileOpen}
          className="absolute inset-0 z-10 md:hidden"
          onClick={() => setMobileOpen((open) => !open)}
        >
          <span className="sr-only">{mobileOpen ? "折叠" : "展开"}{title}</span>
        </button>
        <ChevronDown
          className={cn(
            "pointer-events-none h-4 w-4 shrink-0 text-muted-foreground transition-transform md:hidden",
            mobileOpen && "rotate-180",
          )}
        />
      </div>
      <div className={cn("mt-3", !mobileOpen && "hidden md:block")}>
        {children}
      </div>
    </section>
  );
}

function getCurrentPromotionProject(): PromotionProjectData | null {
  const state = usePromotionStore.getState();
  if (!state.activeProjectId) return null;
  return state.projects[state.activeProjectId] || null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}

function StatBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-[72px] rounded border border-border bg-background/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

const REFERENCE_PURPOSE_OPTIONS: ProductReferencePurpose[] = [
  "main_product",
  "packaging",
  "logo",
  "material_detail",
  "usage_scene",
];

type ChoiceOption<T extends string> = {
  value: T;
  label: string;
};

interface SingleChoiceSettingProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<ChoiceOption<T>>;
  onChange: (value: T) => void;
}

function SingleChoiceSetting<T extends string>({
  label,
  value,
  options,
  onChange,
}: SingleChoiceSettingProps<T>) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(nextValue) => {
          if (nextValue) onChange(nextValue as T);
        }}
        className="grid grid-cols-2 gap-1 rounded-md border border-border bg-background/60 p-1 sm:grid-cols-3"
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            aria-label={`${label} ${option.label}`}
            className="h-8 rounded px-2 text-xs font-medium text-muted-foreground hover:bg-muted data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm"
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

const SHOT_COUNT_OPTIONS: ReadonlyArray<PromotionShotCount> = [
  "auto",
  ...Array.from({ length: PROMOTION_MAX_SHOT_COUNT }, (_, index) => index + 1),
];

const AD_STRUCTURE_OPTIONS: ReadonlyArray<ChoiceOption<PromotionAdStructure>> = [
  { value: "auto", label: "自动" },
  { value: "classic", label: "经典" },
  { value: "product_demo", label: "演示" },
  { value: "problem_solution", label: "痛点" },
  { value: "lifestyle", label: "生活方式" },
];

function getPlannedShotCount(project: PromotionProjectData) {
  return project.shotCount === "auto" ? PROMOTION_MAX_SHOT_COUNT : project.shotCount;
}

function ImageSizeSetting({
  value,
  onChange,
}: {
  value: PromotionImageSize;
  onChange: (value: PromotionImageSize) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">图片尺寸</Label>
      <Select value={value} onValueChange={(nextValue) => onChange(nextValue as PromotionImageSize)}>
        <SelectTrigger className="h-9 bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROMOTION_IMAGE_SIZE_OPTIONS.map((size) => (
            <SelectItem key={size} value={size}>
              {PROMOTION_IMAGE_SIZE_LABELS[size]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[11px] leading-4 text-muted-foreground">
        直接作为 IMAGE2 的 size 参数；auto 由模型自行决定。
      </p>
    </div>
  );
}

function ShotCountSetting({
  value,
  onChange,
}: {
  value: PromotionShotCount;
  onChange: (value: PromotionShotCount) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-muted-foreground">宣传图数量</Label>
        <span className="text-[11px] text-muted-foreground">最多 {PROMOTION_MAX_SHOT_COUNT} 张</span>
      </div>
      <ToggleGroup
        type="single"
        value={String(value)}
        onValueChange={(nextValue) => {
          if (!nextValue) return;
          onChange(nextValue === "auto" ? "auto" : Number(nextValue));
        }}
        className="grid grid-cols-4 gap-1 rounded-md border border-border bg-background/60 p-1 sm:grid-cols-5"
      >
        {SHOT_COUNT_OPTIONS.map((option) => {
          return (
            <ToggleGroupItem
              key={String(option)}
              value={String(option)}
              aria-label={`宣传图数量 ${option === "auto" ? "自动" : `${option} 张`}`}
              className="h-8 rounded px-2 text-xs font-medium text-muted-foreground hover:bg-muted data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm"
            >
              {option === "auto" ? "自动" : option}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface ProductReferencePanelProps {
  images: ProductReferenceImage[];
  onUpload: (files: FileList | null, purpose: ProductReferencePurpose) => void;
  onPurposeChange: (imageId: string, purpose: ProductReferencePurpose) => void;
  onRemove: (imageId: string) => void;
}

function ProductReferencePanel({
  images,
  onUpload,
  onPurposeChange,
  onRemove,
}: ProductReferencePanelProps) {
  const [uploadPurpose, setUploadPurpose] = useState<ProductReferencePurpose>("main_product");

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    onUpload(event.target.files, uploadPurpose);
    event.target.value = "";
  };

  return (
    <MobileCollapsibleCard
      title="产品参考图"
      icon={<PackageCheck className="h-4 w-4 shrink-0 text-primary" />}
      trailing={(
        <Badge variant="outline" className="hidden text-[10px] text-muted-foreground sm:inline-flex">
          主产品 / 包装 / Logo / 细节 / 场景
        </Badge>
      )}
    >
      <div className="space-y-3">
        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:w-auto">
          <Select value={uploadPurpose} onValueChange={(value) => setUploadPurpose(value as ProductReferencePurpose)}>
            <SelectTrigger className="h-8 w-full bg-background sm:w-[124px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REFERENCE_PURPOSE_OPTIONS.map((purpose) => (
                <SelectItem key={purpose} value={purpose}>
                  {PRODUCT_REFERENCE_PURPOSE_LABELS[purpose]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="relative h-8">
            <ImagePlus className="h-4 w-4" />
            上传图片
            <input
              type="file"
              accept="image/*"
              multiple
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={handleUpload}
            />
          </Button>
        </div>

        {images.length === 0 ? (
          <div className="flex min-h-[172px] flex-col items-center justify-center rounded border border-dashed border-border bg-background/50 p-6 text-center">
            <ImagePlus className="h-8 w-8 text-muted-foreground/60" />
            <p className="mt-2 text-sm font-medium text-foreground">上传产品图作为 AI 理解入口</p>
            <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">
              支持产品主图、包装图、Logo 图、材质细节图和使用场景图；上传后可逐张标记用途。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {images.map((image) => (
              <div key={image.id} className="overflow-hidden rounded border border-border bg-background">
                <div className="relative aspect-square bg-muted">
                  <img src={image.url} alt="" className="h-full w-full object-cover" />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute right-1 top-1 h-7 w-7 border border-border bg-background/90"
                    onClick={() => onRemove(image.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="space-y-1.5 p-2">
                  <Select value={image.purpose} onValueChange={(value) => onPurposeChange(image.id, value as ProductReferencePurpose)}>
                    <SelectTrigger className="h-8 w-full bg-muted/40 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REFERENCE_PURPOSE_OPTIONS.map((purpose) => (
                        <SelectItem key={purpose} value={purpose}>
                          {PRODUCT_REFERENCE_PURPOSE_LABELS[purpose]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="truncate text-[11px] text-muted-foreground">{image.name || "产品参考图"}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MobileCollapsibleCard>
  );
}

export function PromotionView() {
  const { activeProjectId, activeProject } = useProjectStore();
  const project = useActivePromotionProject();
  const selectedShotId = usePromotionStore((state) => state.selectedShotId);
  const setActiveProjectId = usePromotionStore((state) => state.setActiveProjectId);
  const ensureProject = usePromotionStore((state) => state.ensureProject);
  const setBriefText = usePromotionStore((state) => state.setBriefText);
  const updateProductBible = usePromotionStore((state) => state.updateProductBible);
  const setShotCount = usePromotionStore((state) => state.setShotCount);
  const setAdStructure = usePromotionStore((state) => state.setAdStructure);
  const setImageSize = usePromotionStore((state) => state.setImageSize);
  const setShots = usePromotionStore((state) => state.setShots);
  const updateShot = usePromotionStore((state) => state.updateShot);
  const deleteShot = usePromotionStore((state) => state.deleteShot);
  const addShot = usePromotionStore((state) => state.addShot);
  const reorderShot = usePromotionStore((state) => state.reorderShot);
  const setSelectedShotId = usePromotionStore((state) => state.setSelectedShotId);
  const concurrency = useAPIConfigStore((state) => state.concurrency);

  const [planBusy, setPlanBusy] = useState(false);
  const [planStatus, setPlanStatus] = useState("");
  const [imageBatchBusy, setImageBatchBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  useEffect(() => {
    if (!activeProjectId) {
      setActiveProjectId(null);
      return;
    }
    setActiveProjectId(activeProjectId);
    ensureProject(activeProjectId);
  }, [activeProjectId, ensureProject, setActiveProjectId]);

  const stats = useMemo(() => {
    const shots = project?.shots || [];
    const imageCount = shots.filter((shot) => shot.imageStatus === "completed" && shot.imageUrl).length;
    const referenceCount = project?.productBible.referenceImages.length || 0;
    return { nodeCount: shots.length, imageCount, referenceCount };
  }, [project?.productBible.referenceImages.length, project?.shots]);

  const plannedShotCount = useMemo(() => project ? getPlannedShotCount(project) : 0, [project]);

  const selectedShot = useMemo(
    () => project?.shots.find((shot) => shot.id === selectedShotId) || null,
    [project?.shots, selectedShotId],
  );

  const generateImageForShot = useCallback(async (shotId: string, quiet = false) => {
    const currentProject = getCurrentPromotionProject();
    const shot = currentProject?.shots.find((item) => item.id === shotId);
    if (!currentProject || !shot) return false;
    const structuredShot = enrichPromoShotStructure(currentProject.productBible, shot);
    if (!structuredShot.firstFramePrompt.trim()) {
      toast.error("请先填写宣传图提示词");
      return false;
    }

    updateShot(shotId, { imageStatus: "generating", imageError: undefined });
    try {
      const result = await generatePromoShotImage(shot, currentProject);
      updateShot(shotId, {
        imageStatus: "completed",
        imageUrl: result.imageUrl,
        imageMediaId: result.mediaId,
        imageError: undefined,
      });
      if (!quiet) toast.success(`已生成宣传图：${shot.title}`);
      return true;
    } catch (error) {
      const message = getErrorMessage(error);
      updateShot(shotId, { imageStatus: "failed", imageError: message });
      if (!quiet) toast.error(`宣传图生成失败：${message}`);
      return false;
    }
  }, [updateShot]);

  const handleReferenceUpload = useCallback(async (files: FileList | null, purpose: ProductReferencePurpose) => {
    if (!files || files.length === 0) return;
    const currentProject = getCurrentPromotionProject();
    if (!currentProject) return;
    try {
      const uploaded = await Promise.all(
        Array.from(files).map(async (file) => createProductReferenceImage(await fileToDataUrl(file), purpose, file.name)),
      );
      updateProductBible({
        referenceImages: [...currentProject.productBible.referenceImages, ...uploaded],
      });
      toast.success(`已上传 ${uploaded.length} 张产品参考图`);
    } catch (error) {
      toast.error(`上传失败：${getErrorMessage(error)}`);
    }
  }, [updateProductBible]);

  const handleReferencePurposeChange = useCallback((imageId: string, purpose: ProductReferencePurpose) => {
    const currentProject = getCurrentPromotionProject();
    if (!currentProject) return;
    updateProductBible({
      referenceImages: currentProject.productBible.referenceImages.map((image) =>
        image.id === imageId ? { ...image, purpose } : image,
      ),
    });
  }, [updateProductBible]);

  const handleReferenceRemove = useCallback((imageId: string) => {
    const currentProject = getCurrentPromotionProject();
    if (!currentProject) return;
    updateProductBible({
      referenceImages: currentProject.productBible.referenceImages.filter((image) => image.id !== imageId),
    });
  }, [updateProductBible]);

  const handleGeneratePlan = useCallback(async () => {
    if (!project || planBusy) return;
    setPlanBusy(true);
    setPlanStatus("准备分析产品图和创作意图");
    try {
      const result = await generatePromoPlan(project.briefText, project.productBible, {
        timeoutMs: 600000,
        onStatus: setPlanStatus,
        shotCount: project.shotCount,
        adStructure: project.adStructure,
      });
      updateProductBible(result.productBible);
      setShots(result.shots);
      toast.success("已生成宣传图提示词节点");
    } catch (error) {
      toast.error(`生成宣传图节点失败：${getErrorMessage(error)}`);
    } finally {
      setPlanBusy(false);
      setPlanStatus("");
    }
  }, [planBusy, project, setShots, updateProductBible]);

  const handleRebuildPrompts = useCallback(() => {
    if (!project || project.shots.length === 0) return;
    setShots(rebuildShotPrompts(project.productBible, project.shots));
    toast.success("已根据产品档案重编排宣传图提示词");
  }, [project, setShots]);

  const handleAddShot = useCallback(() => {
    if (!project) return;
    const maxShots = project.shotCount === "auto" ? PROMOTION_MAX_SHOT_COUNT : project.shotCount;
    if (project.shots.length >= maxShots) {
      toast.error(`当前最多 ${maxShots} 个宣传图节点`);
      return;
    }
    const newShot = addShot({
      title: `自定义宣传图 ${project.shots.length + 1}`,
      sellingPoint: project.productBible.coreSellingPoints[project.shots.length] || "",
      referenceImages: project.productBible.referenceImages,
    });
    if (newShot) {
      const [rebuilt] = rebuildShotPrompts(project.productBible, [newShot]);
      updateShot(newShot.id, rebuilt);
    }
  }, [addShot, project, updateShot]);

  const handleBatchImages = useCallback(async () => {
    const currentProject = getCurrentPromotionProject();
    if (!currentProject || currentProject.shots.length === 0 || imageBatchBusy) return;
    setImageBatchBusy(true);
    const maxConcurrent = Math.max(1, Math.floor(concurrency || 1));
    const shots = currentProject.shots.map((shot) => ({ id: shot.id }));
    try {
      toast.info(`开始批量生图：${shots.length} 张，并发 ${Math.min(maxConcurrent, shots.length)}`);
      const settled = await runStaggered(
        shots.map((shot) => async () => generateImageForShot(shot.id, true)),
        maxConcurrent,
        0,
      );
      const ok = settled.filter((result) => result.status === "fulfilled" && result.value === true).length;
      const failed = settled.length - ok;
      if (failed > 0) toast.error(`批量生成宣传图完成：${ok} 成功，${failed} 失败`);
      else toast.success(`批量生图完成：${ok} 张`);
    } finally {
      setImageBatchBusy(false);
    }
  }, [concurrency, generateImageForShot, imageBatchBusy]);

  const handleExport = useCallback(async () => {
    if (!project || exportBusy) return;
    setExportBusy(true);
    try {
      await exportPromotionFiles(activeProject?.name || "品宣项目", project);
      toast.success("已导出宣传图素材包");
    } catch (error) {
      toast.error(`导出失败：${getErrorMessage(error)}`);
    } finally {
      setExportBusy(false);
    }
  }, [activeProject?.name, exportBusy, project]);

  const handleShotUpdate = useCallback((shot: PromoShot, updates: Partial<PromoShot>) => {
    if (!project) {
      updateShot(shot.id, updates);
      return;
    }
    const nextShot = { ...shot, ...updates };
    const promptRelatedKeys: Array<keyof PromoShot> = [
      "title",
      "shotType",
      "sellingPoint",
      "firstFramePrompt",
      "referenceUsage",
      "productLockRules",
      "ctaCopy",
      "notes",
    ];
    const shouldRefreshPrompts = promptRelatedKeys.some((key) => Object.prototype.hasOwnProperty.call(updates, key));
    if (!shouldRefreshPrompts) {
      updateShot(shot.id, updates);
      return;
    }

    const structuredShot = enrichPromoShotStructure(project.productBible, nextShot);
    updateShot(shot.id, {
      ...updates,
      firstFramePrompt: updates.firstFramePrompt !== undefined ? updates.firstFramePrompt : structuredShot.firstFramePrompt,
      referenceUsage: updates.referenceUsage !== undefined ? updates.referenceUsage : structuredShot.referenceUsage,
      productLockRules: updates.productLockRules !== undefined ? updates.productLockRules : structuredShot.productLockRules,
      imagePrompt: buildPromoImagePrompt(project.productBible, structuredShot),
    });
  }, [project, updateShot]);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        正在加载品宣项目...
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border bg-panel px-4 py-3 sm:px-5 md:h-16 md:px-6 md:py-0">
          <div className="flex h-full flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Megaphone className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-foreground">品宣</h2>
                <p className="truncate text-xs text-muted-foreground">产品图分析、宣传图提示词节点、批量生图和素材导出</p>
              </div>
            </div>

            <div className="hidden items-center gap-2 xl:flex">
              <StatBlock label="Nodes" value={stats.nodeCount} />
              <StatBlock label="Images" value={`${stats.imageCount}/${stats.nodeCount}`} />
              <StatBlock label="Refs" value={stats.referenceCount} />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:items-center">
              {planBusy && planStatus && (
                <span className="hidden max-w-[280px] truncate text-xs text-muted-foreground lg:inline">
                  {planStatus}
                </span>
              )}
              <Button variant="outline" size="sm" disabled={planBusy} onClick={handleGeneratePlan} className="min-w-0 px-2 sm:px-3">
                {planBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span className="hidden sm:inline">生成产品报告与提示词节点</span>
                <span className="sm:hidden">生成节点</span>
              </Button>
              <Button variant="default" size="sm" disabled={exportBusy} onClick={handleExport} className="min-w-0 px-2 sm:px-3">
                {exportBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span className="hidden sm:inline">批量导出</span>
                <span className="sm:hidden">导出</span>
              </Button>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto xl:grid-cols-[360px_minmax(0,1fr)_380px] xl:overflow-hidden">
          <ScrollArea className="overflow-visible border-b border-border bg-background/40 xl:min-h-0 xl:overflow-auto xl:border-b-0 xl:border-r">
            <div className="space-y-4 p-3 sm:p-4">
              <ProductReferencePanel
                images={project.productBible.referenceImages}
                onUpload={(files, purpose) => void handleReferenceUpload(files, purpose)}
                onPurposeChange={handleReferencePurposeChange}
                onRemove={handleReferenceRemove}
              />

              <MobileCollapsibleCard
                title="创作意图 / Prompt 文案"
                icon={<FileText className="h-4 w-4 shrink-0 text-primary" />}
                trailing={(
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    User Intent
                  </Badge>
                )}
              >
                <Textarea
                  value={project.briefText}
                  onChange={(event) => setBriefText(event.target.value)}
                  className="min-h-[150px] resize-none text-sm leading-6"
                  placeholder="例如：用高端电商宣传图风格宣传这个杯子，突出保温、轻便、通勤户外使用场景，画面干净高级。"
                />
              </MobileCollapsibleCard>

              <MobileCollapsibleCard
                title="生成设置"
                icon={<Settings2 className="h-4 w-4 shrink-0 text-primary" />}
              >
                <div className="space-y-3">
                  <ShotCountSetting
                    value={project.shotCount}
                    onChange={setShotCount}
                  />
                  <SingleChoiceSetting
                    label="宣传图结构"
                    value={project.adStructure}
                    options={AD_STRUCTURE_OPTIONS}
                    onChange={setAdStructure}
                  />
                  <div className="rounded-md border border-border bg-background/60 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs text-muted-foreground">节点计划</Label>
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {plannedShotCount}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                      当前设置将生成 {plannedShotCount} 个宣传图提示词节点，每个节点对应一张可批量生成的宣传图。
                    </p>
                  </div>
                  <ImageSizeSetting
                    value={project.imageSize}
                    onChange={setImageSize}
                  />
                </div>
              </MobileCollapsibleCard>
            </div>
          </ScrollArea>

          <ScrollArea className="overflow-visible xl:min-h-0 xl:overflow-auto">
            <div className="space-y-4 p-3 pb-8 sm:p-4">
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-panel px-3 py-3 sm:px-4">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                  <Layers className="h-4 w-4 text-primary" />
                  宣传图提示词节点
                  {planBusy && planStatus && (
                    <span className="text-xs font-normal text-muted-foreground">
                      {planStatus}
                    </span>
                  )}
                  {selectedShot && (
                    <span className="text-xs font-normal text-muted-foreground">
                      当前：#{String(selectedShot.order).padStart(2, "0")} {selectedShot.title}
                    </span>
                  )}
                </div>
                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                  <Button variant="outline" size="sm" onClick={handleAddShot} className="min-w-0 px-2 sm:px-3">
                    <Plus className="h-4 w-4" />
                    添加节点
                  </Button>
                  <Button variant="outline" size="sm" disabled={project.shots.length === 0} onClick={handleRebuildPrompts} className="min-w-0 px-2 sm:px-3">
                    <RefreshCw className="h-4 w-4" />
                    <span className="hidden sm:inline">重编排提示词</span>
                    <span className="sm:hidden">重编排</span>
                  </Button>
                  <Button variant="outline" size="sm" disabled={imageBatchBusy || project.shots.length === 0} onClick={handleBatchImages} className="min-w-0 px-2 sm:px-3">
                    {imageBatchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                    批量生图
                  </Button>
                  <Button variant="outline" size="sm" disabled={exportBusy || project.shots.length === 0} onClick={handleExport} className="min-w-0 px-2 sm:px-3">
                    {exportBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    批量导出
                  </Button>
                </div>
              </section>

              {project.shots.length === 0 ? (
                <section className="flex min-h-[300px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-panel/70 p-4 text-center sm:min-h-[320px] sm:p-8">
                  <Megaphone className="h-10 w-10 text-muted-foreground/60" />
                  <h3 className="mt-3 text-base font-semibold text-foreground">还没有宣传图提示词节点</h3>
                  <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
                    上传产品图并输入宣传意图后，AI 会先识别产品信息，再生成一组可批量出图的宣传图节点。
                  </p>
                  <div className="mt-4 flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
                    <Button disabled={planBusy} onClick={handleGeneratePlan}>
                      {planBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      <span className="hidden sm:inline">生成产品报告与提示词节点</span>
                      <span className="sm:hidden">生成节点</span>
                    </Button>
                    <Button variant="outline" onClick={handleAddShot}>
                      <Plus className="h-4 w-4" />
                      手动添加
                    </Button>
                  </div>
                </section>
              ) : (
                <div
                  className="grid items-start gap-4"
                  style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 420px), 1fr))" }}
                >
                  {project.shots.map((shot, index) => (
                    <PromoShotCard
                      key={shot.id}
                      shot={shot}
                      isSelected={shot.id === selectedShotId}
                      canMoveUp={index > 0}
                      canMoveDown={index < project.shots.length - 1}
                      onSelect={() => setSelectedShotId(shot.id)}
                      onUpdate={(updates) => handleShotUpdate(shot, updates)}
                      onDelete={() => deleteShot(shot.id)}
                      onMove={(direction) => reorderShot(shot.id, direction)}
                      onGenerateImage={() => void generateImageForShot(shot.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="hidden min-h-0 xl:block">
            <ProductBiblePanel bible={project.productBible} />
          </div>
        </div>

      </div>
    </div>
  );
}
