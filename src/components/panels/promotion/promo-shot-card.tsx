// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  ImageIcon,
  Loader2,
  Maximize2,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  PROMOTION_SHOT_TYPE_LABELS,
  type PromoShot,
  type PromoStatus,
  type PromotionShotType,
} from "@/stores/promotion-store";

interface PromoShotCardProps {
  shot: PromoShot;
  isSelected: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<PromoShot>) => void;
  onDelete: () => void;
  onMove: (direction: "up" | "down") => void;
  onGenerateImage: () => void;
}

const statusText: Record<PromoStatus, string> = {
  idle: "待生成",
  queued: "排队中",
  generating: "生成中",
  completed: "已完成",
  failed: "失败",
};

const SHOT_TYPE_OPTIONS = Object.keys(PROMOTION_SHOT_TYPE_LABELS) as PromotionShotType[];

function listToText(items?: string[]) {
  return (items || []).join("\n");
}

function textToList(value: string) {
  return value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function statusClass(status: PromoStatus) {
  if (status === "completed") return "border-green-500/30 bg-green-500/10 text-green-600";
  if (status === "generating" || status === "queued") return "border-blue-500/30 bg-blue-500/10 text-blue-600";
  if (status === "failed") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-border bg-muted/40 text-muted-foreground";
}

function StatusBadge({ label, status }: { label: string; status: PromoStatus }) {
  const Icon = status === "completed" ? CheckCircle2 : status === "failed" ? AlertCircle : status === "generating" ? Loader2 : Clock;
  return (
    <Badge variant="outline" className={cn("gap-1 px-2 py-0.5 text-[11px]", statusClass(status))}>
      <Icon className={cn("h-3 w-3", status === "generating" && "animate-spin")} />
      {label}{statusText[status]}
    </Badge>
  );
}

function IconButton({
  tooltip,
  children,
  ...props
}: ButtonProps & { tooltip: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" variant="ghost" {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function PromoShotCard({
  shot,
  isSelected,
  canMoveUp,
  canMoveDown,
  onSelect,
  onUpdate,
  onDelete,
  onMove,
  onGenerateImage,
}: PromoShotCardProps) {
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const imageBusy = shot.imageStatus === "generating" || shot.imageStatus === "queued";
  const imageReady = shot.imageStatus === "completed" && !!shot.imageUrl;
  const imageCompositionPrompt = shot.firstFramePrompt || shot.imagePrompt;
  const promptPreview = imageCompositionPrompt.trim() || "点击详情补充宣传图提示词";
  const shotTypeLabel = PROMOTION_SHOT_TYPE_LABELS[shot.shotType] || "宣传图";

  return (
    <TooltipProvider delayDuration={250}>
      <article
        className={cn(
          "h-full rounded-lg border bg-card/95 p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
          isSelected ? "border-primary/70 ring-1 ring-primary/25" : "border-border",
        )}
        onClick={onSelect}
      >
        <div className="grid h-full grid-cols-[minmax(0,1fr)_112px] gap-3 sm:grid-cols-[minmax(0,1fr)_144px_30px] 2xl:grid-cols-[minmax(0,1fr)_156px_32px]">
          <div className="flex min-w-0 flex-col">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="h-6 rounded-md px-2 font-mono text-[11px]">
                提示词 {shot.order}
              </Badge>
              <Badge variant="outline" className="h-6 rounded-md px-2 text-[11px] text-muted-foreground">
                {shotTypeLabel}
              </Badge>
              <StatusBadge label="图 " status={shot.imageStatus} />
              {isSelected && (
                <Badge className="h-6 rounded-md bg-primary text-[11px] text-primary-foreground">
                  已选
                </Badge>
              )}
            </div>

            <div className="flex min-w-0 items-start gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-foreground">
                  {shot.title || `宣传图节点 ${shot.order}`}
                </h3>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  第 {shot.order} 张宣传图节点{shot.sellingPoint ? ` · ${shot.sellingPoint}` : ""}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="h-8 shrink-0 px-3 text-xs"
                onClick={(event) => {
                  event.stopPropagation();
                  setDetailsOpen(true);
                }}
              >
                详情
              </Button>
            </div>

            <p className="mt-3 line-clamp-4 text-xs leading-5 text-muted-foreground sm:line-clamp-6">
              {promptPreview}
            </p>

            <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
              {shot.imageError && (
                <span className="truncate text-xs text-destructive">
                  图片：{shot.imageError}
                </span>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-border bg-muted/30">
            <div className="relative aspect-[9/16] bg-background/60">
              {shot.imageUrl ? (
                <button
                  type="button"
                  className="group relative h-full w-full cursor-zoom-in overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label="放大查看生成图片"
                  onClick={(event) => {
                    event.stopPropagation();
                    setImagePreviewOpen(true);
                  }}
                >
                  <img src={shot.imageUrl} alt={shot.title} className="h-full w-full object-cover" />
                  <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded border border-white/20 bg-black/55 text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <Maximize2 className="h-3 w-3" />
                  </span>
                </button>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground">
                  <ImageIcon className="h-4 w-4" />
                  暂无图片
                </div>
              )}
              {imageReady && (
                <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-green-300">
                  READY
                </span>
              )}
            </div>
          </div>

          <div className="col-span-2 flex flex-row flex-wrap items-center justify-start gap-1 sm:col-span-1 sm:flex-col sm:flex-nowrap sm:items-start">
            <IconButton
              tooltip={imageReady ? "重新生成宣传图" : "生成宣传图"}
              disabled={imageBusy || !imageCompositionPrompt.trim()}
              onClick={(event) => {
                event.stopPropagation();
                onGenerateImage();
              }}
              className="h-8 w-8 rounded-md bg-transparent text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground focus-visible:ring-1 disabled:bg-transparent"
            >
              {imageBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            </IconButton>
            <IconButton
              tooltip="上移节点"
              disabled={!canMoveUp}
              onClick={(event) => {
                event.stopPropagation();
                onMove("up");
              }}
              className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground"
            >
              <ArrowUp className="h-4 w-4" />
            </IconButton>
            <IconButton
              tooltip="下移节点"
              disabled={!canMoveDown}
              onClick={(event) => {
                event.stopPropagation();
                onMove("down");
              }}
              className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground"
            >
              <ArrowDown className="h-4 w-4" />
            </IconButton>
            <IconButton
              tooltip="删除节点"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
      </article>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base">
              宣传图节点详情 #{String(shot.order).padStart(2, "0")}
            </DialogTitle>
            <DialogDescription>
              编辑这个节点的卖点、提示词和产品锁定规则。
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">节点标题</span>
              <Input
                value={shot.title}
                onChange={(event) => onUpdate({ title: event.target.value })}
                placeholder="宣传图节点标题"
              />
            </label>

            <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">图片功能</span>
                <Select value={shot.shotType} onValueChange={(value) => onUpdate({ shotType: value as PromotionShotType })}>
                  <SelectTrigger className="h-10 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHOT_TYPE_OPTIONS.map((type) => (
                      <SelectItem key={type} value={type}>
                        {PROMOTION_SHOT_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">卖点</span>
                <Input
                  value={shot.sellingPoint}
                  onChange={(event) => onUpdate({ sellingPoint: event.target.value })}
                  placeholder="这张宣传图要表达的单一卖点"
                />
              </label>
            </div>

            <label className="space-y-1.5 block">
              <span className="text-xs font-medium text-muted-foreground">宣传图提示词</span>
              <Textarea
                value={imageCompositionPrompt}
                onChange={(event) => onUpdate({ firstFramePrompt: event.target.value })}
                className="min-h-[132px] resize-none text-xs leading-5"
                placeholder="静态宣传图画面、构图、场景、文字层级和商品展示方式"
              />
            </label>

            <label className="space-y-1.5 block">
              <span className="text-xs font-medium text-muted-foreground">参考图锁定说明</span>
              <Textarea
                value={shot.referenceUsage}
                onChange={(event) => onUpdate({ referenceUsage: event.target.value })}
                className="min-h-[76px] resize-none text-xs leading-5"
                placeholder="逐张说明产品参考图用于锁定的元素"
              />
            </label>

            <label className="space-y-1.5 block">
              <span className="text-xs font-medium text-muted-foreground">产品锁定规则</span>
              <Textarea
                value={listToText(shot.productLockRules)}
                onChange={(event) => onUpdate({ productLockRules: textToList(event.target.value) })}
                className="min-h-[76px] resize-none text-xs leading-5"
                placeholder="每行一条，不改变外形、Logo、包装、材质、品牌色"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">行动文案</span>
              <Input
                value={shot.ctaCopy || ""}
                onChange={(event) => onUpdate({ ctaCopy: event.target.value })}
                placeholder="如：立即购买、了解更多、限时优惠"
              />
            </label>

            <label className="space-y-1.5 block">
              <span className="text-xs font-medium text-muted-foreground">备注</span>
              <Textarea
                value={shot.notes}
                onChange={(event) => onUpdate({ notes: event.target.value })}
                className="min-h-[70px] resize-none text-xs"
                placeholder="构图、包装、文案层级或审核意见"
              />
            </label>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={imagePreviewOpen} onOpenChange={setImagePreviewOpen}>
        <DialogContent className="max-w-[92vw] gap-3 p-4 sm:max-w-[92vw]">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-sm">{shot.title || `宣传图节点 #${shot.order}`}</DialogTitle>
            <DialogDescription className="sr-only">生成图片放大预览</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[82vh] items-center justify-center overflow-hidden rounded border border-border bg-black">
            {shot.imageUrl && (
              <img
                src={shot.imageUrl}
                alt={shot.title || `宣传图节点 #${shot.order}`}
                className="max-h-[82vh] max-w-full object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
