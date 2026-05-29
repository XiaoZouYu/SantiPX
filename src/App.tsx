import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Megaphone, Settings2 } from "lucide-react";
import { PromotionView } from "@/components/panels/promotion";
import { SettingsPanel } from "@/components/SettingsPanel";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  API_CONFIG_STORE_KEY,
  clearLegacyUserlessStorageOnce,
  getProjectIdForPhone,
  isValidPhone,
  normalizePhone,
  persistPhone,
  readPhoneFromUrl,
  readStoredPhone,
} from "@/lib/user-session";
import { getUserScopedStorageItem } from "@/lib/user-scoped-storage";
import { clearAllManagers } from "@/lib/api-key-manager";
import { useProjectStore } from "@/stores/project-store";
import { useAPIConfigStore } from "@/stores/api-config-store";
import { usePromotionStore } from "@/stores/promotion-store";

type AppView = "promotion" | "settings";
type SessionState = "booting" | "needs-phone" | "ready";

const navItems: Array<{ id: AppView; label: string; icon: typeof Megaphone }> = [
  { id: "promotion", label: "品宣", icon: Megaphone },
  { id: "settings", label: "设置", icon: Settings2 },
];

function waitForProjectHydration(): Promise<void> {
  if (useProjectStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = useProjectStore.persist.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
  });
}

async function hydratePromotionProject(projectId: string): Promise<void> {
  await usePromotionStore.persist.rehydrate();
  const projectData = usePromotionStore.getState().projects[projectId];

  if (projectData) {
    usePromotionStore.setState({
      activeProjectId: projectId,
      projects: { [projectId]: projectData },
      selectedShotId: null,
    });
    return;
  }

  usePromotionStore.setState({
    activeProjectId: null,
    projects: {},
    selectedShotId: null,
  });
  usePromotionStore.getState().setActiveProjectId(projectId);
  usePromotionStore.getState().ensureProject(projectId);
}

async function hydrateApiConfig(phone: string): Promise<void> {
  clearAllManagers();
  const persistedConfig = await getUserScopedStorageItem(phone, API_CONFIG_STORE_KEY);

  if (persistedConfig) {
    await useAPIConfigStore.persist.rehydrate();
    return;
  }

  useAPIConfigStore.getState().resetConfig();
}

async function activatePhoneSession(rawPhone: string): Promise<string> {
  const phone = normalizePhone(rawPhone);
  if (!isValidPhone(phone)) {
    throw new Error("请输入 5-20 位数字手机号");
  }

  persistPhone(phone);
  useProjectStore.getState().setUserPhone(phone);
  await hydrateApiConfig(phone);
  await hydratePromotionProject(getProjectIdForPhone(phone));
  return phone;
}

export default function App() {
  const [view, setView] = useState<AppView>("promotion");
  const [sessionState, setSessionState] = useState<SessionState>("booting");
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [phoneSubmitting, setPhoneSubmitting] = useState(false);

  useEffect(() => {
    document.documentElement.classList.remove("light");
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initializeSession = async () => {
      await waitForProjectHydration();
      await clearLegacyUserlessStorageOnce();

      const phone = readPhoneFromUrl() || readStoredPhone();
      if (!phone) {
        if (!cancelled) setSessionState("needs-phone");
        return;
      }

      await activatePhoneSession(phone);
      if (!cancelled) {
        setPhoneInput(phone);
        setSessionState("ready");
      }
    };

    initializeSession().catch((error) => {
      console.error("[UserSession] initialize failed:", error);
      if (!cancelled) setSessionState("needs-phone");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handlePhoneSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const phone = normalizePhone(phoneInput);
    if (!isValidPhone(phone)) {
      setPhoneError("请输入 5-20 位数字手机号");
      return;
    }

    setPhoneSubmitting(true);
    setPhoneError("");
    try {
      const activatedPhone = await activatePhoneSession(phone);
      setPhoneInput(activatedPhone);
      setSessionState("ready");
    } catch (error) {
      setPhoneError(error instanceof Error ? error.message : "手机号初始化失败");
    } finally {
      setPhoneSubmitting(false);
    }
  }, [phoneInput]);

  if (sessionState !== "ready") {
    return (
      <div className="flex h-[100dvh] w-screen items-center justify-center bg-background text-foreground">
        {sessionState === "booting" && (
          <div className="text-sm text-muted-foreground">正在初始化用户...</div>
        )}
        <AlertDialog open={sessionState === "needs-phone"} onOpenChange={() => undefined}>
          <AlertDialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>请输入手机号</AlertDialogTitle>
              <AlertDialogDescription>
                当前链接没有携带 phone 参数，需要填写手机号后继续使用。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <form className="space-y-4" onSubmit={handlePhoneSubmit}>
              <div className="space-y-2">
                <Label htmlFor="user-phone">手机号</Label>
                <Input
                  id="user-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  autoFocus
                  placeholder="1XXXXXXXXXX"
                  value={phoneInput}
                  onChange={(event) => {
                    setPhoneInput(event.target.value);
                    if (phoneError) setPhoneError("");
                  }}
                  aria-invalid={Boolean(phoneError)}
                />
                {phoneError && <p className="text-xs text-destructive">{phoneError}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={phoneSubmitting}>
                {phoneSubmitting ? "正在进入..." : "进入"}
              </Button>
            </form>
          </AlertDialogContent>
        </AlertDialog>
        <Toaster richColors position="top-right" />
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-background text-foreground md:flex-row">
      <aside className="order-last flex h-14 w-full shrink-0 flex-row items-center justify-center border-t border-border bg-panel px-3 py-2 md:order-none md:h-auto md:w-14 md:flex-col md:border-r md:border-t-0 md:px-0 md:py-3">
        <div className="mb-4 hidden h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground md:flex">
          <Megaphone className="h-4 w-4" />
        </div>
        <nav className="flex flex-row gap-2 md:flex-col">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <Button
                key={item.id}
                size="icon"
                variant={active ? "primary" : "ghost"}
                title={item.label}
                className={cn("h-9 w-9", active && "shadow-sm")}
                onClick={() => setView(item.id)}
              >
                <Icon className="h-4 w-4" />
              </Button>
            );
          })}
        </nav>
      </aside>
      <main className="min-h-0 min-w-0 flex-1">
        {view === "promotion" ? <PromotionView /> : <SettingsPanel />}
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
