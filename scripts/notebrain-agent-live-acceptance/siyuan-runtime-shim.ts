const baseUrl = (process.env.SIYUAN_API_BASE_URL || "http://127.0.0.1:6806").replace(/\/$/, "");
const token = process.env.SIYUAN_API_TOKEN || "";

// The production plugin always runs with a browser global. Keep the live Node
// acceptance environment equivalent without mocking any SiYuan API response.
if (!(globalThis as typeof globalThis & { window?: unknown }).window) {
  (globalThis as typeof globalThis & { window: typeof globalThis }).window = globalThis;
}
(globalThis as typeof globalThis & { siyuan?: unknown }).siyuan ??= {
  appId: "siyuan-homepage-live-acceptance",
};

function headers(contentType = true): Record<string, string> {
  return {
    ...(token ? { Authorization: `token ${token}` } : {}),
    ...(contentType ? { "Content-Type": "application/json; charset=utf-8" } : {}),
  };
}

export async function fetchSyncPost(url: string, data: unknown = {}): Promise<any> {
  const isForm = typeof FormData !== "undefined" && data instanceof FormData;
  const response = await fetch(`${baseUrl}${url}`, {
    method: "POST",
    headers: headers(!isForm),
    body: isForm ? data : JSON.stringify(data ?? {}),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${url}`);
  }
  const content = await response.text();
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`SiYuan API ${url} 返回非 JSON 内容（HTTP ${response.status}，${content.length} 字符）。`);
  }
}

export function fetchPost(url: string, data: unknown, callback: (data: unknown) => void): void {
  if (url === "/api/file/getFile") {
    void fetch(`${baseUrl}${url}`, {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify(data ?? {}),
    }).then(async (response) => callback(await response.text()));
    return;
  }
  void fetchSyncPost(url, data).then(callback);
}

export const platformUtils = {
  isInAndroid: () => false,
  isInIOS: () => false,
  isHuawei: () => false,
  async sendNotification(): Promise<number> {
    return 0;
  },
  cancelNotification(): void {},
};

export function getFrontend(): string {
  return "desktop";
}

export async function openTab(): Promise<unknown> {
  return null;
}

export async function openMobileFileById(): Promise<unknown> {
  return null;
}

export interface IWebSocketData {
  code: number;
  msg: string;
  data: any;
}
