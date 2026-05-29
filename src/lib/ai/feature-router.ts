import { useAPIConfigStore, type AIFeature, type IProvider, AI_FEATURES } from "@/stores/api-config-store";
import { ApiKeyManager, getProviderKeyManager, parseApiKeys } from "@/lib/api-key-manager";
import { corsFetch } from "@/lib/cors-fetch";

export interface FeatureConfig {
  feature: AIFeature;
  featureName: string;
  provider: IProvider;
  apiKey: string;
  allApiKeys: string[];
  keyManager: ApiKeyManager;
  platform: string;
  baseUrl: string;
  models: string[];
  model: string;
}

const featureRoundRobinIndex: Map<AIFeature, number> = new Map();

export function getAllFeatureConfigs(feature: AIFeature): FeatureConfig[] {
  const store = useAPIConfigStore.getState();
  const providersWithModels = store.getProvidersForFeature(feature);
  const featureInfo = AI_FEATURES.find((item) => item.key === feature);

  return providersWithModels.flatMap(({ provider, model }) => {
    const keys = parseApiKeys(provider.apiKey);
    if (keys.length === 0) return [];
    const keyManager = getProviderKeyManager(provider.id, provider.apiKey, `${feature}:${model || "default"}`);
    return [{
      feature,
      featureName: featureInfo?.name || feature,
      provider,
      apiKey: keyManager.getCurrentKey() || keys[0],
      allApiKeys: keys,
      keyManager,
      platform: provider.platform,
      baseUrl: provider.baseUrl,
      models: [model],
      model,
    }];
  });
}

export function getFeatureConfig(feature: AIFeature): FeatureConfig | null {
  const configs = getAllFeatureConfigs(feature);
  if (configs.length === 0) return null;
  if (configs.length === 1) return configs[0];
  const currentIndex = featureRoundRobinIndex.get(feature) || 0;
  const config = configs[currentIndex % configs.length];
  featureRoundRobinIndex.set(feature, currentIndex + 1);
  return config;
}

export function getFeatureNotConfiguredMessage(feature: AIFeature): string {
  const featureName = AI_FEATURES.find((item) => item.key === feature)?.name || feature;
  return `请先在设置中为「${featureName}」功能绑定 API 供应商`;
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

export async function callFeatureAPI(
  feature: AIFeature,
  systemPrompt: string,
  userPrompt: string,
  options?: {
    temperature?: number;
    maxTokens?: number;
    modelOverride?: string;
    configOverride?: FeatureConfig;
  },
): Promise<string> {
  const config = options?.configOverride || getFeatureConfig(feature);
  if (!config) throw new Error(getFeatureNotConfiguredMessage(feature));

  const model = options?.modelOverride || config.model || config.models[0];
  const apiKey = config.keyManager.getCurrentKey() || config.apiKey;
  if (!model) throw new Error("请先在设置中配置模型");
  if (!apiKey) throw new Error("API Key 未配置");

  const response = await corsFetch(buildChatEndpoint(config.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: options?.temperature ?? 0.4,
      max_tokens: options?.maxTokens ?? 4096,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    config.keyManager.handleError(response.status, errorText);
    throw new Error(`品宣规划请求失败：${response.status}（模型=${model}）${errorText.slice(0, 220)}`);
  }

  const data = await response.json();
  const text = extractMessageText(data.choices?.[0]?.message?.content);
  if (!text) throw new Error("模型未返回有效文本");
  return text;
}
