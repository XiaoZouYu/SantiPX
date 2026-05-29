// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import { callFeatureAPI, getFeatureConfig } from "@/lib/ai/feature-router";
import { corsFetch } from "@/lib/cors-fetch";
import { generateFreedomImage, type FreedomImageReference } from "@/lib/freedom/freedom-api";
import { readImageAsBase64 } from "@/lib/image-storage";
import { safeParseJson } from "@/lib/utils/json-cleaner";
import type { ProductBible, ProductReferenceImage, PromoShot, PromotionAdStructure, PromotionProjectData, PromotionShotCount } from "@/stores/promotion-store";
import { PRODUCT_REFERENCE_PURPOSE_LABELS, PROMOTION_DEFAULT_TARGET_DURATION, PROMOTION_MAX_SHOT_COUNT, PROMOTION_MIN_SHOT_DURATION, createPromoShot, deriveAspectRatioFromImageSize } from "@/stores/promotion-store";
import {
  buildReferenceImageContext,
  buildBrandConstraintText,
  buildPromoImagePrompt,
  enrichPromoShotStructure,
  splitList,
} from "./prompt-builder";

interface PromoPlanResponse {
  productBible?: Partial<ProductBible>;
  shots?: Array<Partial<PromoShot>>;
}

export interface PromoPlanResult {
  productBible: ProductBible;
  shots: PromoShot[];
  source: "ai";
}

export interface PromoPlanOptions {
  timeoutMs?: number;
  onStatus?: (status: string) => void;
  targetDuration?: number;
  shotCount?: PromotionShotCount;
  adStructure?: PromotionAdStructure;
  minShotDuration?: number;
}

const TEMPLATE_SHOTS: Array<{ title: string; sellingPoint: string }> = [
  { title: "封面爆款主视觉", sellingPoint: "第一眼建立产品识别和购买理由" },
  { title: "核心卖点信息海报", sellingPoint: "用主标题和卖点标签说明最重要的购买理由" },
  { title: "场景化使用海报", sellingPoint: "让目标人群看到真实使用价值和生活方式" },
  { title: "功能证明卖点图", sellingPoint: "用信息卡、图标或对比证明核心卖点" },
  { title: "材质细节放大海报", sellingPoint: "在完整产品主视觉旁用放大窗展示质感和工艺" },
  { title: "包装信任陈列图", sellingPoint: "展示包装、品牌元素和交付可信度" },
  { title: "差异化对比海报", sellingPoint: "强调区别于普通同类产品的关键优势" },
  { title: "组合清单展示图", sellingPoint: "展示产品、配件、规格或礼盒组合的完整价值" },
  { title: "收口转化 CTA", sellingPoint: "收束品牌情绪并引导行动" },
];

const AD_STRUCTURE_LABELS: Record<PromotionAdStructure, string> = {
  auto: "自动匹配",
  classic: "经典广告：亮相-卖点-细节-场景-证明-CTA",
  product_demo: "产品演示：产品-细节-功能-场景-信任-CTA",
  problem_solution: "痛点解决：痛点-产品-证明-场景-转化",
  lifestyle: "生活方式：场景-产品-体验-质感-品牌收口",
};

interface ResolvedPromoPlanSettings {
  targetDuration: number;
  shotCount: number;
  adStructure: PromotionAdStructure;
  minShotDuration: number;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${label} 超时，请检查模型、网络或供应商响应速度`));
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeout));
  });
}

function resolvePromoPlanSettings(options: PromoPlanOptions = {}): ResolvedPromoPlanSettings {
  const minShotDuration = Math.max(PROMOTION_MIN_SHOT_DURATION, Math.round(options.minShotDuration || PROMOTION_MIN_SHOT_DURATION));
  const targetDuration = Math.max(minShotDuration, Math.round(options.targetDuration || PROMOTION_DEFAULT_TARGET_DURATION));
  const requestedShotCount = options.shotCount === "auto" || options.shotCount === undefined
    ? PROMOTION_MAX_SHOT_COUNT
    : Math.max(1, Math.min(PROMOTION_MAX_SHOT_COUNT, Math.floor(Number(options.shotCount))));
  const adStructure = options.adStructure || "auto";

  return {
    targetDuration,
    shotCount: requestedShotCount,
    adStructure,
    minShotDuration,
  };
}

function distributeShotDurations(targetDuration: number, shotCount: number, minShotDuration: number): number[] {
  const safeShotCount = Math.max(1, shotCount);
  const minimumTotal = safeShotCount * minShotDuration;
  const safeTarget = Math.max(targetDuration, minimumTotal);
  const base = Math.floor(safeTarget / safeShotCount);
  let remainder = safeTarget - base * safeShotCount;

  return Array.from({ length: safeShotCount }, () => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return Math.max(minShotDuration, base + extra);
  });
}

function getTemplateForStructure(adStructure: PromotionAdStructure) {
  if (adStructure === "problem_solution") {
    return [
      { title: "痛点场景海报", sellingPoint: "先建立目标人群的真实使用困扰" },
      { title: "产品解决方案主图", sellingPoint: "明确产品如何解决核心问题" },
      { title: "关键功能证明卖点图", sellingPoint: "用画面和信息卡证明卖点不是口号" },
      { title: "真实场景使用海报", sellingPoint: "把产品放进用户会购买的场景" },
      { title: "信任转化 CTA 海报", sellingPoint: "收束利益点并引导行动" },
      ...TEMPLATE_SHOTS,
    ];
  }
  if (adStructure === "product_demo") {
    return [
      { title: "封面爆款主视觉", sellingPoint: "完整建立产品外观和品类识别" },
      { title: "核心功能卖点图", sellingPoint: "直观演示核心功能和使用方式" },
      { title: "结构细节放大海报", sellingPoint: "以完整产品主视觉搭配局部放大窗突出做工、材质、包装或 Logo" },
      { title: "场景落地海报", sellingPoint: "证明产品适合目标用户的日常场景" },
      { title: "品牌信任陈列图", sellingPoint: "展示品牌一致性和购买安心感" },
      { title: "转化 CTA 海报", sellingPoint: "给出清晰记忆点和行动理由" },
      ...TEMPLATE_SHOTS,
    ];
  }
  if (adStructure === "lifestyle") {
    return [
      { title: "生活方式封面海报", sellingPoint: "先用目标用户场景建立情绪吸引" },
      { title: "产品场景解决方案", sellingPoint: "让产品成为场景里的解决方案" },
      { title: "体验卖点信息图", sellingPoint: "展示手感、质感、使用感或便利性" },
      { title: "审美价值海报", sellingPoint: "强化产品带来的生活方式提升" },
      { title: "品牌收口 CTA", sellingPoint: "以品牌氛围和 CTA 完成记忆闭环" },
      ...TEMPLATE_SHOTS,
    ];
  }
  return TEMPLATE_SHOTS;
}

function buildChatEndpoint(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  return /\/v\d+$/.test(normalized) ? `${normalized}/chat/completions` : `${normalized}/v1/chat/completions`;
}

function extractMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) return String((part as { text?: unknown }).text || "");
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function resolvePromotionPlanningConfig() {
  const primary = getFeatureConfig("promotion_planning");
  if (primary) return { feature: "promotion_planning" as const, config: primary };
  return null;
}

function getReferenceImageDetail(image: ProductReferenceImage): "high" | "auto" {
  if (
    image.purpose === "main_product"
    || image.purpose === "packaging"
    || image.purpose === "logo"
    || image.purpose === "material_detail"
  ) {
    return "high";
  }
  return "auto";
}

async function callPromotionMultimodalPlanAPI(
  systemPrompt: string,
  userPrompt: string,
  referenceImages: ProductReferenceImage[],
): Promise<string> {
  const resolved = resolvePromotionPlanningConfig();
  if (!resolved) throw new Error("请先在设置中为「品宣规划」绑定支持图片输入的 API 供应商");
  const { config } = resolved;

  const model = config.model || config.models?.[0];
  const apiKey = config.keyManager.getCurrentKey() || config.apiKey;
  if (!model) throw new Error("请先在设置中配置品宣规划模型");
  if (!apiKey) throw new Error("API Key 未配置");
  const endpoint = buildChatEndpoint(config.baseUrl);

  const selectedReferenceImages = referenceImages.slice(0, 8);
  const originalImageBytes = selectedReferenceImages.reduce((sum, image) => sum + image.url.length, 0);

  const imageParts = selectedReferenceImages.flatMap((image, index) => {
    const label = PRODUCT_REFERENCE_PURPOSE_LABELS[image.purpose];
    return [
      {
        type: "text",
        text: `产品参考图 ${index + 1}：用途=${label}${image.name ? `，文件=${image.name}` : ""}`,
      },
      {
        type: "image_url",
        image_url: {
          url: image.url,
          detail: getReferenceImageDetail(image),
        },
      },
    ];
  });

  console.info("[Promotion] Multimodal planning request:", {
    feature: resolved.feature,
    provider: config.provider.name,
    model,
    endpoint,
    referenceImageCount: selectedReferenceImages.length,
    originalImageKB: Math.round(originalImageBytes / 1024),
  });

  const requestBody = JSON.stringify({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          ...imageParts,
        ],
      },
    ],
    temperature: 0.35,
    max_tokens: 4096,
  });

  console.info("[Promotion] Multimodal planning payload:", {
    bodyKB: Math.round(requestBody.length / 1024),
  });

  const response = await corsFetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: requestBody,
  });

  if (!response.ok) {
    const errorText = await response.text();
    config.keyManager.handleError(response.status, errorText);
    throw new Error(`品宣多模态规划请求失败：${response.status}（服务映射=品宣规划，模型=${model}，endpoint=${endpoint}）${errorText.slice(0, 220)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const text = extractMessageText(content);
  if (!text) throw new Error("品宣多模态规划未返回有效文本");
  return text;
}

async function callPromotionTextPlanAPI(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const resolved = resolvePromotionPlanningConfig();
  if (!resolved) throw new Error("请先在设置中为「品宣规划」绑定 API 供应商");

  return callFeatureAPI(resolved.feature, systemPrompt, userPrompt, {
    temperature: 0.4,
    maxTokens: 4096,
    configOverride: resolved.config,
  });
}

function pickField(brief: string, labels: string[]): string {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*[:：]\\s*([^\\n]+)`, "i");
    const match = brief.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

export function buildProductBibleFromBrief(brief: string, existing?: ProductBible): ProductBible {
  const firstMeaningfulLine = brief
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean) || "";

  return {
    productName: pickField(brief, ["产品名称", "产品名", "品牌名称", "名称"]) || existing?.productName || firstMeaningfulLine.slice(0, 24),
    category: pickField(brief, ["品类", "产品品类", "类别"]) || existing?.category || "",
    targetAudience: pickField(brief, ["目标人群", "受众", "用户", "目标用户"]) || existing?.targetAudience || "",
    coreSellingPoints: splitList(pickField(brief, ["核心卖点", "卖点", "优势"]) || existing?.coreSellingPoints?.join("，") || ""),
    usageScenarios: splitList(pickField(brief, ["使用场景", "场景", "应用场景"]) || existing?.usageScenarios?.join("，") || ""),
    brandColors: splitList(pickField(brief, ["品牌色", "主色", "颜色"]) || existing?.brandColors?.join("，") || ""),
    requiredElements: splitList(pickField(brief, ["必须出现", "必须元素", "固定元素"]) || existing?.requiredElements?.join("，") || ""),
    forbiddenExpressions: splitList(pickField(brief, ["禁用表达", "禁用", "不要出现"]) || existing?.forbiddenExpressions?.join("，") || ""),
    referenceImages: existing?.referenceImages || [],
    logoUrl: existing?.logoUrl,
    packagingNotes: pickField(brief, ["包装", "包装描述"]) || existing?.packagingNotes || "",
    materialNotes: pickField(brief, ["材质", "质感"]) || existing?.materialNotes || "",
    fixedAngles: splitList(pickField(brief, ["固定视角", "标准视角", "视角"]) || existing?.fixedAngles?.join("，") || ""),
  };
}

function withTemplateSellingPoints(bible: ProductBible, settings: ResolvedPromoPlanSettings) {
  const templates = getTemplateForStructure(settings.adStructure);
  const sellingPoints = bible.coreSellingPoints.length > 0
    ? bible.coreSellingPoints
    : ["外观识别", "核心卖点", "质感细节", "使用便利", "功能价值", "品牌信任", "场景价值", "转化行动"];

  return Array.from({ length: settings.shotCount }, (_, index) => {
    const template = templates[index] || templates[templates.length - 1] || TEMPLATE_SHOTS[0];
    return {
      ...template,
      sellingPoint: sellingPoints[index] || template.sellingPoint,
    };
  });
}

function normalizeAiPlan(
  response: PromoPlanResponse,
  fallbackBible: ProductBible,
  settings: ResolvedPromoPlanSettings,
): PromoPlanResult | null {
  const mergedBible: ProductBible = {
    ...fallbackBible,
    ...(response.productBible || {}),
    coreSellingPoints: Array.isArray(response.productBible?.coreSellingPoints)
      ? response.productBible!.coreSellingPoints!.filter(Boolean)
      : fallbackBible.coreSellingPoints,
    usageScenarios: Array.isArray(response.productBible?.usageScenarios)
      ? response.productBible!.usageScenarios!.filter(Boolean)
      : fallbackBible.usageScenarios,
    brandColors: Array.isArray(response.productBible?.brandColors)
      ? response.productBible!.brandColors!.filter(Boolean)
      : fallbackBible.brandColors,
    requiredElements: Array.isArray(response.productBible?.requiredElements)
      ? response.productBible!.requiredElements!.filter(Boolean)
      : fallbackBible.requiredElements,
    forbiddenExpressions: Array.isArray(response.productBible?.forbiddenExpressions)
      ? response.productBible!.forbiddenExpressions!.filter(Boolean)
      : fallbackBible.forbiddenExpressions,
    referenceImages: fallbackBible.referenceImages,
  };

  const rawShots = Array.isArray(response.shots) ? response.shots : [];
  if (rawShots.length === 0) return null;

  const templates = withTemplateSellingPoints(mergedBible, settings);
  const durations = distributeShotDurations(settings.targetDuration, settings.shotCount, settings.minShotDuration);
  const shots = Array.from({ length: settings.shotCount }, (_, index) => {
    const raw = rawShots[index] || {};
    const template = templates[index] || TEMPLATE_SHOTS[index] || TEMPLATE_SHOTS[0];
    const base = enrichPromoShotStructure(mergedBible, createPromoShot(index + 1, {
      title: raw.title || template?.title || `宣传图节点 ${index + 1}`,
      shotType: raw.shotType,
      sellingPoint: raw.sellingPoint || mergedBible.coreSellingPoints[index] || template?.sellingPoint || "",
      firstFramePrompt: raw.firstFramePrompt || raw.imagePrompt || "",
      videoMotionPrompt: "",
      referenceUsage: raw.referenceUsage || "",
      needsEndFrame: false,
      endFramePrompt: "",
      productLockRules: raw.productLockRules || [],
      ctaCopy: raw.ctaCopy || "",
      duration: durations[index] || settings.minShotDuration,
      notes: raw.notes || "",
      referenceImages: mergedBible.referenceImages,
    }));
    return {
      ...base,
      imagePrompt: buildPromoImagePrompt(mergedBible, base),
      videoPrompt: "",
    };
  });

  return { productBible: mergedBible, shots, source: "ai" };
}

export async function generatePromoPlan(
  brief: string,
  existingBible: ProductBible,
  options: PromoPlanOptions = {},
): Promise<PromoPlanResult> {
  const settings = resolvePromoPlanSettings(options);
  const fallbackBible = buildProductBibleFromBrief(brief, existingBible);
  const hasReferenceImages = fallbackBible.referenceImages.length > 0;
  const timeoutMs = options.timeoutMs ?? 600000;

  if (!brief.trim() && !hasReferenceImages) {
    throw new Error("请先上传产品图或填写创作意图");
  }

  try {
    const systemPrompt = [
      "你是资深电商广告视觉策划、商品主图设计师和产品卖点分析师。",
      "根据产品参考图和用户原始宣传 Prompt 输出严格 JSON，不要 Markdown。",
      "JSON 结构：{ productBible: { productName, category, targetAudience, coreSellingPoints, usageScenarios, brandColors, requiredElements, forbiddenExpressions, packagingNotes, materialNotes, fixedAngles }, shots: [{ title, shotType, sellingPoint, firstFramePrompt, referenceUsage, productLockRules, ctaCopy, imagePrompt, notes }] }。",
      "shots 表示宣传图提示词节点，不是视频分镜；不要输出 videoMotionPrompt、needsEndFrame、endFramePrompt 或视频时长规划。",
      "shotType 只能是 hero | detail | usage | proof | packaging | cta。",
      "productBible 是 AI 识别和结构化后的产品档案，不是要求用户填表；必须优先从图像中识别产品形态、包装、Logo、材质、使用场景，再结合用户文案校准。",
      `严格生成 ${settings.shotCount} 个宣传图提示词节点，每个节点对应一张可直接出图的电商/社媒宣传图。`,
      `广告结构模板：${AD_STRUCTURE_LABELS[settings.adStructure]}。如果模板是自动匹配，请根据产品图和用户意图选择最适合的宣传图组图节奏。`,
      "节点必须像真实电商详情页/小红书/Instagram/淘宝主图组图：主视觉、卖点信息图、场景图、功能证明图、包装信任图、CTA，而不是普通分镜或局部产品特写。",
      "每个节点都必须依赖四类上下文：上传的产品参考图、用户原始 Prompt/宣传文案、AI 识别后的产品档案、当前节点卖点。",
      "每个节点必须说明：1. 当前图片的广告功能；2. 完整海报版式和构图；3. 产品英雄位大小与角度；4. 标题/副标题/卖点标签/CTA 的短文案策略；5. 上传产品参考图分别用于锁定哪些元素；6. 不允许改变产品外形、Logo、包装、材质和品牌色。",
      "重要：detail 类型也不能生成单纯局部特写，必须是“完整产品主视觉 + 局部放大窗/箭头/信息卡”的卖点海报。",
      "firstFramePrompt 用来描述静态宣传图构图；referenceUsage 要逐张说明产品参考图锁定的元素。",
      "productLockRules 必须是数组，明确锁定产品外形、Logo、包装比例、标签布局、品牌色、材质；ctaCopy 仅在转化/收口图片需要时填写。",
      "imagePrompt 可以简短，但必须指向商业品宣海报：final ecommerce advertising poster, product hero, headline, benefit callouts, professional lighting, clean layout, no detail-only crop。",
    ].join("\n");
    const userPrompt = [
      "上传产品参考图用途标记（多模态调用会同时携带图片本体）：",
      buildReferenceImageContext(fallbackBible) || "无",
      "",
      "用户原始 Prompt / 宣传文案：",
      brief || "用户未填写，请主要依据产品参考图识别产品并生成可编辑档案。",
      "",
      "已有校准档案（可覆盖或补全）：",
      buildBrandConstraintText(fallbackBible),
      "",
      "生成设置：",
      `宣传图提示词节点数量：${settings.shotCount} 个`,
      `广告结构模板：${AD_STRUCTURE_LABELS[settings.adStructure]}`,
      "",
      "每个 shot 必须拆成 image prompt node：firstFramePrompt=静态宣传图画面和版式，referenceUsage=每张产品图锁定什么细节，imagePrompt=可直接提交给生图模型的商业海报提示词。",
      "请优先生成“品宣海报/电商卖点图/信息流广告图”，避免把节点写成产品局部说明或单一细节展示。",
      "不要规划视频，不要规划首尾帧，不要输出剪辑节奏。",
    ].join("\n");
    let raw: string;
    if (hasReferenceImages) {
      options.onStatus?.("正在分析产品图与创作意图");
      console.info("[Promotion] Calling multimodal model for promotion planning");
      raw = await withTimeout(
        callPromotionMultimodalPlanAPI(systemPrompt, userPrompt, fallbackBible.referenceImages),
        timeoutMs,
        "品宣多模态规划",
      );
    } else {
      options.onStatus?.("正在调用文本模型理解宣传文案");
      console.info("[Promotion] Calling text model for promo planning");
      raw = await withTimeout(
        callPromotionTextPlanAPI(systemPrompt, userPrompt),
        timeoutMs,
        "品宣文本规划",
      );
    }
    options.onStatus?.("正在解析 AI 返回的产品档案和宣传图节点");
    const parsed = safeParseJson<PromoPlanResponse>(raw, {});
    const plan = normalizeAiPlan(parsed, fallbackBible, settings);
    if (!plan) {
      throw new Error("AI 返回内容缺少可用的宣传图节点");
    }
    return plan;
  } catch (error) {
    console.warn("[Promotion] AI plan failed:", error);
    options.onStatus?.("AI 规划失败");
    throw error;
  }
}

function buildShotGenerationContext(shot: PromoShot, project: PromotionProjectData): string {
  return [
    "Campaign source context:",
    project.productBible.referenceImages.length > 0
      ? `Uploaded product references:\n${buildReferenceImageContext(project.productBible)}`
      : "",
    project.briefText ? `User original creative intent: ${project.briefText}` : "",
    `AI recognized product bible:\n${buildBrandConstraintText(project.productBible)}`,
    `Current promo image node selling point: ${shot.sellingPoint}`,
    `Current promo image node type: ${shot.shotType}`,
    `Selected output image size: ${project.imageSize}`,
    shot.referenceUsage ? `Reference usage plan:\n${shot.referenceUsage}` : "",
    shot.productLockRules.length > 0 ? `Product lock rules:\n${shot.productLockRules.join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

const SHOT_IMAGE_REFERENCE_PURPOSES: ProductReferenceImage["purpose"][] = [
  "main_product",
  "packaging",
  "logo",
  "material_detail",
];

function selectShotImageReferences(project: PromotionProjectData): FreedomImageReference[] {
  const references = project.productBible.referenceImages;
  if (references.length === 0) return [];

  const selected: ProductReferenceImage[] = [];
  const selectedIds = new Set<string>();

  for (const purpose of SHOT_IMAGE_REFERENCE_PURPOSES) {
    const image = references.find((item) => item.purpose === purpose);
    if (image && !selectedIds.has(image.id)) {
      selected.push(image);
      selectedIds.add(image.id);
    }
  }

  for (const image of references) {
    if (selected.length >= 6) break;
    if (!selectedIds.has(image.id)) {
      selected.push(image);
      selectedIds.add(image.id);
    }
  }

  return selected.map((image) => ({
    url: image.url,
    purpose: image.purpose,
    name: image.name || PRODUCT_REFERENCE_PURPOSE_LABELS[image.purpose],
  }));
}

export async function generatePromoShotImage(
  shot: PromoShot,
  project: PromotionProjectData,
): Promise<{ imageUrl: string; mediaId?: string }> {
  const structuredShot = enrichPromoShotStructure(project.productBible, shot);
  const imagePrompt = buildPromoImagePrompt(project.productBible, structuredShot);
  const aspectRatio = deriveAspectRatioFromImageSize(project.imageSize, project.aspectRatio);
  const result = await generateFreedomImage({
    prompt: [imagePrompt, buildShotGenerationContext(structuredShot, project)].filter(Boolean).join("\n\n"),
    aspectRatio,
    size: project.imageSize,
    referenceImages: selectShotImageReferences(project),
  });
  return { imageUrl: result.url, mediaId: result.mediaId };
}

function isHttpUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

function base64ToBlob(base64: string, contentType = "application/octet-stream"): Blob {
  const binary = atob(base64);
  const chunkSize = 1024 * 512;
  const chunks: BlobPart[] = [];

  for (let offset = 0; offset < binary.length; offset += chunkSize) {
    const slice = binary.slice(offset, offset + chunkSize);
    const bytes = new Uint8Array(slice.length);
    for (let index = 0; index < slice.length; index += 1) {
      bytes[index] = slice.charCodeAt(index);
    }
    chunks.push(bytes.buffer as ArrayBuffer);
  }

  return new Blob(chunks, { type: contentType });
}

async function fetchRemoteAssetBlob(url: string): Promise<Blob> {
  if (typeof window !== "undefined" && window.electronAPI?.apiFetch) {
    const result = await window.electronAPI.apiFetch({
      url,
      responseType: "base64",
      timeoutMs: 600000,
    });

    if (!result.ok) {
      throw new Error(result.error || `下载失败：${result.status}${result.statusText ? ` ${result.statusText}` : ""}`);
    }

    if (!result.bodyBase64) {
      throw new Error("下载失败：主进程未返回素材内容");
    }

    return base64ToBlob(result.bodyBase64, result.headers["content-type"] || "application/octet-stream");
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载失败：${response.status}`);
  return response.blob();
}

async function sourceToBlob(url: string): Promise<Blob> {
  if (url.startsWith("local-image://")) {
    const base64 = await readImageAsBase64(url);
    if (!base64) throw new Error(`无法读取本地素材：${url}`);
    const response = await fetch(base64);
    return response.blob();
  }
  if (url.startsWith("data:")) {
    const response = await fetch(url);
    return response.blob();
  }
  if (isHttpUrl(url)) {
    return fetchRemoteAssetBlob(url);
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载失败：${response.status}`);
  return response.blob();
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeDownloadFilename(filename);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function hashFilenameSeed(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 6);
}

function safeFilename(value: string): string {
  const source = value.trim() || "promotion";
  const ascii = source
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  const base = ascii || "promotion";
  return base === source ? base : `${base}_${hashFilenameSeed(source)}`.slice(0, 90);
}

function safeDownloadFilename(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  const name = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  const extension = dotIndex > 0 ? filename.slice(dotIndex + 1).replace(/[^a-zA-Z0-9]/g, "") : "";
  const safeName = safeFilename(name);
  return extension ? `${safeName}.${extension}` : safeName;
}

function getImageAssetPath(baseName: string, shot: PromoShot): string {
  return `${baseName}_image_${shot.order}.png`;
}

export function buildPromotionImageBoard(project: PromotionProjectData, baseName = safeFilename(project.productBible.productName || "promotion")) {
  const images = project.shots.map((shot) => ({
    order: shot.order,
    title: shot.title,
    shotType: shot.shotType,
    imagePath: shot.imageUrl ? getImageAssetPath(baseName, shot) : undefined,
    imageUrl: shot.imageUrl,
    sellingPoint: shot.sellingPoint,
    imageCompositionPrompt: shot.firstFramePrompt,
    imagePrompt: shot.imagePrompt,
    referenceUsage: shot.referenceUsage,
    productLockRules: shot.productLockRules,
    ctaCopy: shot.ctaCopy,
    notes: shot.notes,
  }));

  return {
    mode: "promotion_image_prompt_package",
    usageInstruction: "这是宣传图素材包：可将图片导入剪映、设计工具或投放后台；JSON 用于记录产品档案、提示词节点和每张图的卖点，不包含视频拼接信息。",
    totalImages: images.length,
    readyImages: images.filter((image) => Boolean(image.imageUrl)).length,
    images,
  };
}

export async function exportPromotionFiles(projectName: string, project: PromotionProjectData) {
  const baseName = safeFilename(project.productBible.productName || projectName || "promotion");
  const manifest = {
    exportedAt: new Date().toISOString(),
    userPrompt: project.briefText,
    productBible: project.productBible,
    settings: {
      shotCount: project.shotCount,
      adStructure: project.adStructure,
      imageSize: project.imageSize,
      aspectRatio: project.aspectRatio,
      imageResolution: project.imageResolution,
    },
    shots: project.shots.map((shot) => ({
      order: shot.order,
      title: shot.title,
      shotType: shot.shotType,
      sellingPoint: shot.sellingPoint,
      imageCompositionPrompt: shot.firstFramePrompt,
      referenceUsage: shot.referenceUsage,
      productLockRules: shot.productLockRules,
      ctaCopy: shot.ctaCopy,
      imagePrompt: shot.imagePrompt,
      imagePath: shot.imageUrl ? getImageAssetPath(baseName, shot) : undefined,
      notes: shot.notes,
    })),
    imageBoard: buildPromotionImageBoard(project, baseName),
  };

  triggerDownload(
    new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }),
    `${baseName}_promotion_images_manifest.json`,
  );

  const files = project.shots.flatMap((shot) => {
    const list: Array<{ url: string; filename: string }> = [];
    if (shot.imageUrl) list.push({ url: shot.imageUrl, filename: getImageAssetPath(baseName, shot) });
    return list;
  });

  for (const file of files) {
    const blob = await sourceToBlob(file.url);
    triggerDownload(blob, file.filename);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
