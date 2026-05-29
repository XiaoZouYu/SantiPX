import {
  getAllFeatureConfigs,
  getFeatureConfig,
  getFeatureNotConfiguredMessage,
  type FeatureConfig,
} from "@/lib/ai/feature-router";
import { submitGridImageRequest } from "@/lib/ai/image-generator";

export interface FreedomImageReference {
  url: string;
  purpose: string;
  name?: string;
}

export interface FreedomImageParams {
  prompt: string;
  model?: string;
  size?: string;
  aspectRatio?: string;
  resolution?: string;
  referenceImages?: FreedomImageReference[];
  extraParams?: Record<string, unknown>;
}

export interface GenerationResult {
  url: string;
  taskId?: string;
  mediaId?: string;
}

function pickFeatureConfig(requestedModel?: string): FeatureConfig | null {
  const all = getAllFeatureConfigs("freedom_image");
  if (requestedModel) {
    const exact = all.find((config) => config.model === requestedModel);
    if (exact) return exact;
  }
  return getFeatureConfig("freedom_image") ?? all[0] ?? null;
}

export async function generateFreedomImage(params: FreedomImageParams): Promise<GenerationResult> {
  const config = pickFeatureConfig(params.model);
  if (!config) {
    throw new Error(getFeatureNotConfiguredMessage("freedom_image"));
  }

  const apiKey = config.keyManager.getCurrentKey() || config.apiKey;
  const model = (params.model || config.model || config.models[0] || "").trim();
  const baseUrl = config.baseUrl?.replace(/\/+$/, "");
  if (!apiKey || !baseUrl || !model) {
    throw new Error("请先在设置中为「品宣生图」绑定供应商、模型和 API Key");
  }

  const result = await submitGridImageRequest({
    model,
    prompt: params.prompt,
    apiKey,
    baseUrl,
    providerPlatform: config.platform,
    aspectRatio: params.aspectRatio || "1:1",
    resolution: params.resolution,
    referenceImages: params.referenceImages?.map((image) => image.url),
    extraParams: {
      ...params.extraParams,
      ...(params.size ? { size: params.size } : {}),
    },
    keyManager: config.keyManager,
  });

  if (!result.imageUrl) {
    throw new Error("品宣生图接口未返回图片结果");
  }

  return { url: result.imageUrl, taskId: result.taskId };
}
