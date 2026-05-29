// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

import { Bot } from "lucide-react";
import { useLayoutEffect, useRef, type ChangeEvent, type CSSProperties, type TextareaHTMLAttributes } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  PRODUCT_REFERENCE_PURPOSE_LABELS,
  usePromotionStore,
  type ProductBible,
} from "@/stores/promotion-store";
import { joinList, splitList } from "@/lib/promotion/prompt-builder";
import { cn } from "@/lib/utils";

interface ProductBiblePanelProps {
  bible: ProductBible;
}

interface AutoResizeTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> {
  value: string;
  minHeight?: number;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
}

function AutoResizeTextarea({
  value,
  minHeight = 64,
  className,
  style,
  onChange,
  ...props
}: AutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const resize = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(textarea.scrollHeight, minHeight)}px`;
  };

  useLayoutEffect(() => {
    resize();
  }, [value, minHeight]);

  return (
    <Textarea
      {...props}
      ref={textareaRef}
      value={value}
      rows={1}
      onChange={(event) => {
        onChange(event);
        requestAnimationFrame(resize);
      }}
      className={cn("resize-none overflow-hidden", className)}
      style={{ ...style, minHeight } as CSSProperties}
    />
  );
}

export function ProductBiblePanel({ bible }: ProductBiblePanelProps) {
  const updateProductBible = usePromotionStore((state) => state.updateProductBible);

  const updateList = (key: keyof ProductBible, value: string) => {
    updateProductBible({ [key]: splitList(value) } as Partial<ProductBible>);
  };

  return (
    <div className="h-full border-l border-border bg-panel flex flex-col min-w-0">
      <div className="h-14 px-4 border-b border-border flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            AI 识别的产品档案
          </h3>
          <p className="text-[11px] text-muted-foreground">由产品图和 Prompt 自动填充，可人工校准</p>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>产品名</Label>
              <Input
                value={bible.productName}
                onChange={(event) => updateProductBible({ productName: event.target.value })}
                placeholder="例如：恒温随行杯"
              />
            </div>
            <div className="space-y-1.5">
              <Label>品类</Label>
              <Input
                value={bible.category}
                onChange={(event) => updateProductBible({ category: event.target.value })}
                placeholder="例如：户外水杯"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>目标人群</Label>
            <Input
              value={bible.targetAudience}
              onChange={(event) => updateProductBible({ targetAudience: event.target.value })}
              placeholder="例如：通勤白领、露营用户"
            />
          </div>

          <div className="space-y-1.5">
            <Label>核心卖点</Label>
            <AutoResizeTextarea
              value={joinList(bible.coreSellingPoints)}
              onChange={(event) => updateList("coreSellingPoints", event.target.value)}
              minHeight={76}
              placeholder="一行或逗号分隔"
            />
          </div>

          <div className="space-y-1.5">
            <Label>使用场景</Label>
            <AutoResizeTextarea
              value={joinList(bible.usageScenarios)}
              onChange={(event) => updateList("usageScenarios", event.target.value)}
              minHeight={64}
              placeholder="办公室、车内、露营、健身后"
            />
          </div>

          <div className="space-y-1.5">
            <Label>品牌色</Label>
            <AutoResizeTextarea
              value={joinList(bible.brandColors)}
              onChange={(event) => updateList("brandColors", event.target.value)}
              minHeight={64}
              placeholder="墨绿、银色"
            />
          </div>

          <div className="space-y-1.5">
            <Label>固定视角</Label>
            <AutoResizeTextarea
              value={joinList(bible.fixedAngles)}
              onChange={(event) => updateList("fixedAngles", event.target.value)}
              minHeight={64}
              placeholder="正面45度、包装正面"
            />
          </div>

          <div className="space-y-1.5">
            <Label>必须出现元素</Label>
            <AutoResizeTextarea
              value={joinList(bible.requiredElements)}
              onChange={(event) => updateList("requiredElements", event.target.value)}
              minHeight={64}
              placeholder="Logo、包装盒、杯盖结构"
            />
          </div>

          <div className="space-y-1.5">
            <Label>禁用表达</Label>
            <AutoResizeTextarea
              value={joinList(bible.forbiddenExpressions)}
              onChange={(event) => updateList("forbiddenExpressions", event.target.value)}
              minHeight={64}
              placeholder="医疗承诺、绝对化用语、竞品 Logo"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>包装说明</Label>
              <AutoResizeTextarea
                value={bible.packagingNotes}
                onChange={(event) => updateProductBible({ packagingNotes: event.target.value })}
                minHeight={70}
              />
            </div>
            <div className="space-y-1.5">
              <Label>材质说明</Label>
              <AutoResizeTextarea
                value={bible.materialNotes}
                onChange={(event) => updateProductBible({ materialNotes: event.target.value })}
                minHeight={70}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>识别来源</Label>
            {bible.referenceImages.length === 0 ? (
              <div className="h-24 rounded border border-dashed border-border text-xs text-muted-foreground flex items-center justify-center">
                暂无产品参考图
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {bible.referenceImages.map((image, index) => (
                  <div key={`${image.id}-${index}`} className="relative aspect-square rounded border border-border overflow-hidden bg-muted">
                    <img src={image.url} alt="" className="h-full w-full object-cover" />
                    <Badge variant="secondary" className="absolute bottom-1 left-1 right-1 justify-center truncate px-1 text-[10px]">
                      {PRODUCT_REFERENCE_PURPOSE_LABELS[image.purpose]}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
