import { useMemo, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, Pencil, Plus, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AddProviderDialog, EditProviderDialog, FeatureBindingPanel } from "@/components/api-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useAPIConfigStore, type IProvider } from "@/stores/api-config-store";
import { getApiKeyCount, maskApiKey, parseApiKeys } from "@/lib/api-key-manager";
import { isFixedBaseUrlProviderPlatform } from "@/lib/ai/provider-platforms";

function getProviderStatus(provider: IProvider) {
  const keyCount = getApiKeyCount(provider.apiKey);
  const modelCount = provider.model?.length || 0;
  if (keyCount === 0) return { label: "未配置 Key", tone: "destructive" as const };
  if (modelCount === 0) return { label: "待同步模型", tone: "secondary" as const };
  return { label: `${keyCount} Key / ${modelCount} 模型`, tone: "default" as const };
}

export function SettingsPanel() {
  const providers = useAPIConfigStore((state) => state.providers);
  const addProvider = useAPIConfigStore((state) => state.addProvider);
  const updateProvider = useAPIConfigStore((state) => state.updateProvider);
  const removeProvider = useAPIConfigStore((state) => state.removeProvider);
  const syncProviderModels = useAPIConfigStore((state) => state.syncProviderModels);
  const concurrency = useAPIConfigStore((state) => state.concurrency);
  const setConcurrency = useAPIConfigStore((state) => state.setConcurrency);

  const [addOpen, setAddOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<IProvider | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const existingPlatforms = useMemo(() => providers.map((provider) => provider.platform), [providers]);

  const handleAddProvider = (provider: Omit<IProvider, "id">) => {
    const saved = addProvider(provider);
    if (parseApiKeys(saved.apiKey).length > 0) {
      void handleSync(saved.id);
    }
  };

  const handleSync = async (providerId: string) => {
    setSyncingId(providerId);
    try {
      const result = await syncProviderModels(providerId);
      if (result.success) {
        toast.success(`已同步 ${result.count} 个模型`);
      } else {
        toast.error(result.error || "模型同步失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "模型同步失败");
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 flex-col items-stretch gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 md:h-16 md:py-0">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground">设置</h1>
          <p className="mt-1 text-xs text-muted-foreground">API 供应商、品宣服务映射和批量生图并发数</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          添加供应商
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-3 sm:gap-5 sm:p-6">
          <section className="rounded-lg border border-border bg-card p-3 sm:p-4">
            <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" />
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">全局生成设置</h2>
                  <p className="mt-1 text-xs text-muted-foreground">批量生图会按这里的并发上限调度。</p>
                </div>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-2 sm:flex sm:grid-cols-none">
                <Label htmlFor="concurrency" className="text-xs text-muted-foreground">并发生成数</Label>
                <Input
                  id="concurrency"
                  type="number"
                  min={1}
                  max={10}
                  value={concurrency}
                  onChange={(event) => setConcurrency(Number(event.target.value))}
                  className="h-8 w-full sm:w-20"
                />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-3 sm:p-4">
            <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">API 供应商</h2>
                <p className="mt-1 text-xs text-muted-foreground">春风和 auto-vip 已内置 URL，自定义供应商按 OpenAI 官方兼容接口请求。</p>
              </div>
              <Badge variant="secondary">{providers.length} 个供应商</Badge>
            </div>

            <div className="grid gap-3">
              {providers.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  还没有供应商，请先添加春风、auto-vip 或自定义 OpenAI 兼容供应商。
                </div>
              ) : (
                providers.map((provider) => {
                  const status = getProviderStatus(provider);
                  const firstKey = parseApiKeys(provider.apiKey)[0] || "";
                  const fixedBaseUrl = isFixedBaseUrlProviderPlatform(provider.platform);
                  return (
                    <div key={provider.id} className="rounded-md border border-border bg-background/50 p-3">
                      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-sm font-semibold">{provider.name}</h3>
                            <Badge variant={status.tone}>{status.label}</Badge>
                            <Badge variant="outline">{provider.platform}</Badge>
                          </div>
                          <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                            <span className="truncate">Base URL: {fixedBaseUrl ? "内置固定 URL" : provider.baseUrl || "未填写"}</span>
                            <span className="truncate">API Key: {firstKey ? maskApiKey(firstKey) : "未填写"}</span>
                            <span className="truncate">模型: {provider.model?.slice(0, 8).join(", ") || "未同步"}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1 self-end sm:self-start">
                          <Button size="icon" variant="outline" title="同步模型" disabled={syncingId === provider.id} onClick={() => void handleSync(provider.id)}>
                            {syncingId === provider.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                          </Button>
                          <Button size="icon" variant="outline" title="编辑" onClick={() => setEditingProvider(provider)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            title="删除"
                            onClick={() => {
                              removeProvider(provider.id);
                              toast.success("已删除供应商");
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-3 sm:p-4">
            <div className="mb-4 flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              <div>
                <h2 className="text-sm font-semibold">品宣服务映射</h2>
                <p className="mt-1 text-xs text-muted-foreground">品宣规划和品宣生图相互独立，选择各自的供应商和模型。</p>
              </div>
            </div>
            <FeatureBindingPanel />
          </section>

          <Separator />

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" />
            当前项目只保留品宣 Web 端能力；配置数据存储在浏览器本地。
          </div>
        </div>
      </ScrollArea>

      <AddProviderDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSubmit={handleAddProvider}
        existingPlatforms={existingPlatforms}
      />
      <EditProviderDialog
        open={!!editingProvider}
        onOpenChange={(open) => {
          if (!open) setEditingProvider(null);
        }}
        provider={editingProvider}
        onSave={(provider) => {
          updateProvider(provider);
          setEditingProvider(null);
          toast.success("已更新供应商");
        }}
      />
    </div>
  );
}
