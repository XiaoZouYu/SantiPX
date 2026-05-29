export {};

declare global {
  interface Window {
    electronAPI?: {
      apiFetch?: (options: {
        url: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string;
        bodyBase64?: string;
        formData?: Array<{
          name: string;
          value?: string;
          fileName?: string;
          mimeType?: string;
          dataBase64?: string;
        }>;
        responseType?: "text" | "base64";
        timeoutMs?: number;
      }) => Promise<{
        ok: boolean;
        status: number;
        statusText?: string;
        headers: Record<string, string>;
        body?: string;
        bodyBase64?: string;
        error?: string;
      }>;
    };
  }
}
