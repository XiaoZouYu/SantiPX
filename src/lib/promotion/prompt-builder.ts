// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import {
  PRODUCT_REFERENCE_PURPOSE_LABELS,
  PROMOTION_SHOT_TYPE_LABELS,
  type ProductBible,
  type ProductReferenceImage,
  type PromoShot,
  type PromotionShotType,
} from "@/stores/promotion-store";

function toPromptText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map(toPromptText).filter(Boolean).join("，");
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferred = record.name ?? record.label ?? record.title ?? record.text ?? record.value ?? record.description;
    if (preferred !== undefined) return toPromptText(preferred);
    return Object.values(record).map(toPromptText).filter(Boolean).join("，");
  }
  return "";
}

export function splitList(value: unknown): string[] {
  return toPromptText(value)
    .split(/[\n,，、;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinList(value: unknown[]): string {
  return value.map(toPromptText).filter(Boolean).join("，");
}

function nonEmpty(value: unknown, fallback: string): string {
  return toPromptText(value) || fallback;
}

export function buildReferenceImageContext(bible: ProductBible): string {
  if (bible.referenceImages.length === 0) return "";
  return bible.referenceImages
    .map((image, index) => {
      const label = PRODUCT_REFERENCE_PURPOSE_LABELS[image.purpose];
      return `${index + 1}. ${label}${image.name ? `（${image.name}）` : ""}`;
    })
    .join("\n");
}

function inferShotType(shot: Pick<PromoShot, "title" | "sellingPoint" | "order">): PromotionShotType {
  const text = `${shot.title} ${shot.sellingPoint}`.toLowerCase();
  if (/cta|转化|行动|收口|结尾|定格/.test(text)) return "cta";
  if (/包装|信任|交付|品牌/.test(text)) return "packaging";
  if (/使用|场景|生活|通勤|户外|办公/.test(text)) return "usage";
  if (/证明|功能|演示|解决|痛点/.test(text)) return "proof";
  if (/细节|材质|工艺|特写|质感|logo/.test(text)) return "detail";
  return shot.order <= 1 ? "hero" : "detail";
}

function getPosterRoleGuide(
  shotType: PromotionShotType,
  shot: Pick<PromoShot, "sellingPoint" | "ctaCopy">,
): string {
  const sellingPoint = nonEmpty(shot.sellingPoint, "核心卖点");
  const cta = nonEmpty(shot.ctaCopy, "立即了解");
  const guides: Record<PromotionShotType, string> = {
    hero: `主视觉封面海报：产品作为英雄主体，占画面 45%-65%，正面或 45 度完整可见；大标题传达“${sellingPoint}”，下方保留 1 条短副标题和品牌氛围背景。`,
    detail: `卖点信息海报：不是单纯局部特写。保持完整产品为主视觉，同时使用 1-2 个局部放大窗、箭头或信息卡解释“${sellingPoint}”，形成广告图而非产品细节记录照。`,
    usage: `生活方式场景海报：把产品放入目标用户真实使用环境，产品仍是画面主角；使用场景服务于“${sellingPoint}”，背景干净、有情绪但不抢主体。`,
    proof: `功能证明海报：用对比、流程、图标或 2-3 个短卖点卡证明“${sellingPoint}”；画面必须像电商卖点图，产品完整清晰，不做孤立微距。`,
    packaging: `包装与信任海报：产品、包装、品牌元素组合成整洁陈列；突出“${sellingPoint}”，可以有质保/礼盒/配送/材质等短标签，整体像品牌官方销售页。`,
    cta: `收口转化海报：产品英雄位 + 明确行动按钮/短 CTA“${cta}”；画面简洁、购买理由集中、适合作为最后一张投放图。`,
  };
  return guides[shotType];
}

function getPosterCopyGuide(bible: ProductBible, shot: Pick<PromoShot, "title" | "sellingPoint" | "ctaCopy">): string {
  const headline = nonEmpty(shot.title, nonEmpty(shot.sellingPoint, nonEmpty(bible.productName, "产品主标题")));
  const subline = nonEmpty(shot.sellingPoint, "一句话利益点");
  const cta = nonEmpty(shot.ctaCopy, "立即了解");
  return `建议中文短文案：主标题“${headline}”；副标题“${subline}”；卖点标签 2-3 个来自核心卖点；${shot.ctaCopy ? `CTA“${cta}”` : "非收口图可不放 CTA"}。文字必须短、清晰、排版整齐，避免大段小字。`;
}

function getReferenceInstruction(image: ProductReferenceImage, index: number): string {
  const token = `@图片${index + 1}`;
  if (image.purpose === "main_product") {
    return `Use ${token} as the exact hero product identity reference: lock visible shape, proportions, handle/edge geometry, pattern, color, and material details.`;
  }
  if (image.purpose === "packaging") {
    return `Use ${token} for packaging shape, logo placement, label layout, scale, and package proportions.`;
  }
  if (image.purpose === "logo") {
    return `Use ${token} for logo position, brand mark shape, typography layout, and brand color consistency.`;
  }
  if (image.purpose === "material_detail") {
    return `Use ${token} for material, surface texture, finish, reflection behavior, and exact color tone.`;
  }
  return `Use ${token} for real usage context, table/hand/environment scale, and plausible interaction while keeping the product unchanged.`;
}

function buildDefaultReferenceUsage(bible: ProductBible): string {
  if (bible.referenceImages.length === 0) {
    return "Use the product bible as the identity lock. Do not invent new logos, packaging, colors, or materials.";
  }
  return bible.referenceImages
    .slice(0, 8)
    .map((image, index) => `${index + 1}. ${PRODUCT_REFERENCE_PURPOSE_LABELS[image.purpose]}：${getReferenceInstruction(image, index)}`)
    .join("\n");
}

function buildDefaultProductLockRules(bible: ProductBible): string[] {
  const rules = [
    "Do not change product geometry, handle shape, packaging proportions, logo position, label layout, brand colors, or material finish.",
    "Do not invent fake logos, fake labels, extra products, warped text, distorted handles, or altered product proportions.",
  ];
  if (bible.requiredElements.length > 0) rules.push(`Keep required visible elements: ${joinList(bible.requiredElements)}.`);
  if (bible.forbiddenExpressions.length > 0) rules.push(`Avoid forbidden expressions: ${joinList(bible.forbiddenExpressions)}.`);
  return rules;
}

function buildDefaultFirstFramePrompt(
  bible: ProductBible,
  shot: Pick<PromoShot, "title" | "shotType" | "sellingPoint" | "notes" | "ctaCopy">,
): string {
  return [
    `生成一张可直接投放的电商/社媒品宣海报，产品为${nonEmpty(bible.productName, "该产品")}。`,
    getPosterRoleGuide(shot.shotType, shot),
    getPosterCopyGuide(bible, shot),
    "成片应有明确广告版式、主视觉、卖点信息区、品牌调性背景和商业摄影光影。",
    shot.notes ? `额外构图要求：${shot.notes}。` : "",
  ].filter(Boolean).join(" ");
}

export function enrichPromoShotStructure(bible: ProductBible, shot: PromoShot): PromoShot {
  const shotType = shot.shotType || inferShotType(shot);
  const structuredShot = { ...shot, shotType };
  const productLockRules = shot.productLockRules.length > 0
    ? shot.productLockRules
    : buildDefaultProductLockRules(bible);
  return {
    ...structuredShot,
    firstFramePrompt: nonEmpty(shot.firstFramePrompt, buildDefaultFirstFramePrompt(bible, structuredShot)),
    videoMotionPrompt: shot.videoMotionPrompt || "",
    referenceUsage: nonEmpty(shot.referenceUsage, buildDefaultReferenceUsage(bible)),
    needsEndFrame: Boolean(shot.needsEndFrame),
    endFramePrompt: shot.endFramePrompt || "",
    productLockRules,
  };
}

export function buildBrandConstraintText(bible: ProductBible): string {
  const parts = [
    `产品：${nonEmpty(bible.productName, "未命名产品")}`,
    `品类：${nonEmpty(bible.category, "消费产品")}`,
    `目标人群：${nonEmpty(bible.targetAudience, "目标消费者")}`,
    bible.coreSellingPoints.length > 0 ? `核心卖点：${joinList(bible.coreSellingPoints)}` : "",
    bible.usageScenarios.length > 0 ? `使用场景：${joinList(bible.usageScenarios)}` : "",
    bible.brandColors.length > 0 ? `品牌色：${joinList(bible.brandColors)}` : "",
    bible.requiredElements.length > 0 ? `必须出现：${joinList(bible.requiredElements)}` : "",
    bible.forbiddenExpressions.length > 0 ? `禁用表达：${joinList(bible.forbiddenExpressions)}` : "",
    nonEmpty(bible.packagingNotes, "") ? `包装：${nonEmpty(bible.packagingNotes, "")}` : "",
    nonEmpty(bible.materialNotes, "") ? `材质：${nonEmpty(bible.materialNotes, "")}` : "",
    bible.fixedAngles.length > 0 ? `固定视角：${joinList(bible.fixedAngles)}` : "",
    bible.referenceImages.length > 0 ? `产品参考图：\n${buildReferenceImageContext(bible)}` : "",
  ];
  return parts.filter(Boolean).join("\n");
}

export function buildPromoImagePrompt(
  bible: ProductBible,
  shot: Pick<PromoShot, "title" | "shotType" | "sellingPoint" | "firstFramePrompt" | "referenceUsage" | "productLockRules" | "notes" | "ctaCopy">,
): string {
  const shotType = shot.shotType || inferShotType({ title: shot.title, sellingPoint: shot.sellingPoint, order: 1 });
  const productName = nonEmpty(bible.productName, "产品");
  const category = nonEmpty(bible.category, "消费产品");
  return [
    "任务：生成一张成片级品宣广告图 / 电商卖点海报，不是产品细节记录照，不是视频首帧，不是简单白底 SKU 图。",
    `产品：${productName}；品类：${category}。`,
    `节点：${nonEmpty(shot.title, "宣传图节点")}；广告功能：${PROMOTION_SHOT_TYPE_LABELS[shotType]}；核心卖点：${nonEmpty(shot.sellingPoint, "核心购买理由")}。`,
    `版式策略：${getPosterRoleGuide(shotType, shot)}。`,
    `文案策略：${getPosterCopyGuide(bible, shot)}。`,
    `具体画面：${nonEmpty(shot.firstFramePrompt, "产品英雄位 + 卖点信息卡 + 品牌背景的完整商业海报构图")}。`,
    "商业视觉要求：产品完整可识别，占画面 45%-65%；使用专业棚拍或高质感场景光，干净背景，明确前中后景，留出安全文案区；画面有广告主标题、短副标题或 2-3 个卖点 callout。",
    "版式要求：像淘宝/京东/小红书/Instagram 可投放的正式宣传图；有清晰视觉层级、边距、对齐、图标/标签/信息卡；局部细节只能作为放大窗或辅助标注，不能取代完整产品主视觉。",
    nonEmpty(bible.targetAudience, "") ? `目标人群：${nonEmpty(bible.targetAudience, "")}。` : "",
    bible.usageScenarios.length > 0 ? `可使用场景：${joinList(bible.usageScenarios)}。` : "",
    bible.brandColors.length > 0 ? `品牌色和背景气质：${joinList(bible.brandColors)}，做成统一广告色板。` : "",
    bible.requiredElements.length > 0 ? `必须出现：${joinList(bible.requiredElements)}。` : "",
    nonEmpty(bible.packagingNotes, "") ? `包装一致性：${nonEmpty(bible.packagingNotes, "")}。` : "",
    nonEmpty(bible.materialNotes, "") ? `材质质感：${nonEmpty(bible.materialNotes, "")}。` : "",
    bible.referenceImages.length > 0 ? `参考图用途：${buildReferenceImageContext(bible).replace(/\n/g, " ")}。` : "",
    nonEmpty(shot.referenceUsage, "") ? `参考图锁定规则：${nonEmpty(shot.referenceUsage, "")}。` : "",
    shot.productLockRules.length > 0 ? `产品锁定：${shot.productLockRules.join(" ")}` : "",
    nonEmpty(shot.notes, "") ? `节点补充说明：${nonEmpty(shot.notes, "")}。` : "",
    "一致性：严格保持参考图中的产品外形、比例、手柄/边缘结构、Logo/花纹/标签、包装比例、颜色和材质，不改变主体产品身份。",
    "禁止：不要只生成局部特写，不要裁掉产品，不要把产品变成另一个品类，不要随机添加无关物品，不要伪造 Logo，不要乱码文字，不要密集小字，不要脏乱背景，不要低质感快照。",
    "输出风格：高端商业摄影、真实材质、清晰锐利、可读中文短文案、整洁电商海报排版、适合直接作为宣传图发布。",
  ].filter(Boolean).join(" ");
}

export function rebuildShotPrompts(
  bible: ProductBible,
  shots: PromoShot[],
): PromoShot[] {
  return shots.map((shot) => {
    const structuredShot = enrichPromoShotStructure(bible, shot);
    return {
      ...structuredShot,
      imagePrompt: buildPromoImagePrompt(bible, structuredShot),
      videoPrompt: structuredShot.videoPrompt || "",
    };
  });
}
