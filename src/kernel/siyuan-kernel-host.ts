/**
 * SiYuan Kernel Plugin 真实宿主适配：把官方 `siyuan` 全局（`kernel.ISiyuan`）绑定到 `RobotKernelHost`。
 *
 * 所有底层调用严格使用官方 `siyuan/kernel` 类型：
 * - `api.storage.get(path)` → Promise<IDataObject>（`text()` / `json()` / `buffer()` / `arrayBuffer()`，均 async）
 * - `api.storage.put(path, content)` / `remove` / `list`
 * - `api.rpc.bind(name, fn)` / `unbind(name)`；`api.rpc.broadcast(method, params)`
 * - `api.client.fetch(path, init)` → Promise<IFetchResponse>
 * - `api.plugin.lifecycle.onload / onrunning / onunload`
 * - `api.logger.info / debug / warn / error`（async）
 *
 * storage root = data/storage/petal/<plugin-name>，与前端 `plugin.loadData/saveData` 同根。
 * 只在此文件接触 `siyuan` 全局，其余代码保持环境无关。
 */

import type * as kernel from "siyuan/kernel";

function utf8Bytes(value: string): Uint8Array {
  if (typeof globalThis.TextEncoder === "function") return new globalThis.TextEncoder().encode(value);
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    let code = value.codePointAt(index) ?? 0;
    if (code > 0xffff) index += 1;
    if (code <= 0x7f) bytes.push(code);
    else if (code <= 0x7ff) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code <= 0xffff) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return new Uint8Array(bytes);
}

async function fileBytes(value: unknown): Promise<Uint8Array> {
  if (typeof value === "string") return utf8Bytes(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    const result = new Uint8Array(view.byteLength);
    result.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return result;
  }
  if (value && typeof value === "object" && typeof (value as { arrayBuffer?: unknown }).arrayBuffer === "function") {
    const buffer = await (value as { arrayBuffer(): Promise<ArrayBuffer> }).arrayBuffer();
    return new Uint8Array(buffer);
  }
  const serialized = JSON.stringify(value ?? "");
  return utf8Bytes(serialized ?? "");
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

export interface SiyuanKernelHostOptions {
  /** 日志前缀。 */
  prefix?: string;
}

/**
 * 构造真实 Kernel host。`siyuan` 全局缺失时返回 null（调用方应跳过启动）。
 */
export function createSiyuanKernelHost(api: kernel.ISiyuan, options: SiyuanKernelHostOptions = {}) {
  const prefix = options.prefix ?? "[robot-kernel]";
  const boundMethods: string[] = [];

  const log = {
    info: (entry: Record<string, unknown>) => void api.logger.info(prefix, entry),
    warn: (entry: Record<string, unknown>) => void api.logger.warn(prefix, entry),
    error: (entry: Record<string, unknown>) => void api.logger.error(prefix, entry),
  };

  return {
    storage: {
      async get(key: string): Promise<string | null> {
        try {
          const data = await api.storage.get(key);
          return await data.text();
        } catch {
          return null;
        }
      },
      async set(key: string, value: string): Promise<void> {
        await api.storage.put(key, value);
      },
      async remove(key: string): Promise<void> {
        await api.storage.remove(key);
      },
    },
    async siyuanPost(path: string, payload: unknown): Promise<{ code: number; msg?: string; data?: unknown }> {
      const response = await api.client.fetch(path as `/${string}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload ?? {}),
      });
      const text = await response.text();
      try {
        const envelope = JSON.parse(text) as { code?: number; msg?: string; data?: unknown };
        if (typeof envelope.code === "number") return envelope as { code: number; msg?: string; data?: unknown };
      } catch {
        // fall through to a stable error envelope
      }
      return {
        code: response.status || 500,
        msg: response.statusText || "Invalid SiYuan API response",
        data: null,
      };
    },
    async siyuanGetFile(path: string): Promise<unknown> {
      const response = await api.client.fetch("/api/file/getFile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const contentTypeEntry = Object.entries(response.headers ?? {}).find(([name]) => name.toLowerCase() === "content-type");
      const contentType = String(contentTypeEntry?.[1] ?? "").toLowerCase();
      const textual = contentType.startsWith("text/")
        || contentType.includes("json")
        || contentType.includes("xml")
        || contentType.includes("javascript")
        || contentType.includes("svg");
      if (response.status === 200 && !textual) return await response.arrayBuffer();
      const text = await response.text();
      if (response.status === 200) return text;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return { code: response.status || 500, msg: response.statusText || "getFile failed", data: null };
      }
    },
    async siyuanPutFile(path: string, isDir: boolean, file: unknown): Promise<{ code: number; msg?: string; data?: unknown }> {
      const boundary = `----SiyuanHomepageRobot${Date.now().toString(16)}${Math.floor(Math.random() * 1e9).toString(16)}`;
      const contentType = file && typeof file === "object" && typeof (file as { type?: unknown }).type === "string"
        ? String((file as { type: string }).type || "application/octet-stream")
        : "application/octet-stream";
      const field = (name: string, value: string) => utf8Bytes(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      );
      const bytes = concatBytes([
        field("path", path),
        field("isDir", String(isDir)),
        field("modTime", String(Date.now())),
        utf8Bytes(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="file"\r\nContent-Type: ${contentType}\r\n\r\n`),
        await fileBytes(file),
        utf8Bytes(`\r\n--${boundary}--\r\n`),
      ]);
      const body = new Uint8Array(bytes.byteLength);
      body.set(bytes);
      const response = await api.client.fetch("/api/file/putFile", {
        method: "POST",
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
        body: body.buffer,
      });
      const text = await response.text();
      try {
        const envelope = JSON.parse(text) as { code?: number; msg?: string; data?: unknown };
        if (typeof envelope.code === "number") return envelope as { code: number; msg?: string; data?: unknown };
      } catch {
        // fall through
      }
      return { code: response.status || 500, msg: response.statusText || "Invalid putFile response", data: null };
    },
    async httpPostJson(
      url: string,
      headers: Record<string, string>,
      body: string,
      timeoutMs: number,
    ): Promise<{ status: number; statusText: string; headers: Record<string, string>; text: string }> {
      return this.httpRequest(url, "POST", headers, body, timeoutMs);
    },
    async httpRequest(
      url: string,
      method: "GET" | "POST",
      headers: Record<string, string>,
      body: string | undefined,
      timeoutMs: number,
    ): Promise<{ status: number; statusText: string; headers: Record<string, string>; text: string }> {
      // 经思源内核 forwardProxy 转发外部请求。
      const contentTypeEntry = Object.entries(headers).find(([name]) => name.toLowerCase() === "content-type");
      const payload = {
        url,
        method,
        timeout: Math.max(1, Math.round(timeoutMs)),
        contentType: contentTypeEntry?.[1] ?? "application/json",
        headers: Object.entries(headers).map(([name, value]) => ({ [name]: value })),
        payload: body ?? {},
        responseEncoding: "text",
      };
      const resp = await api.client.fetch("/api/network/forwardProxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let text = "";
      try {
        text = await resp.text();
      } catch {
        text = "";
      }

      if (resp.status < 200 || resp.status >= 300) {
        return { status: resp.status, statusText: resp.statusText, headers: resp.headers ?? {}, text };
      }

      try {
        const envelope = JSON.parse(text) as {
          code?: number;
          msg?: string;
          data?: {
            status?: number;
            headers?: Record<string, string | string[]>;
            body?: string;
            contentType?: string;
          } | null;
        };
        if (envelope.code !== 0 || !envelope.data || typeof envelope.data.status !== "number") {
          return {
            status: 502,
            statusText: envelope.msg || "SiYuan forwardProxy failed",
            headers: { "content-type": "text/plain; charset=utf-8" },
            text: envelope.msg || text,
          };
        }

        const responseHeaders: Record<string, string> = {};
        for (const [name, value] of Object.entries(envelope.data.headers ?? {})) {
          responseHeaders[name] = Array.isArray(value) ? value.join(", ") : value;
        }
        if (envelope.data.contentType && !Object.keys(responseHeaders).some((name) => name.toLowerCase() === "content-type")) {
          responseHeaders["Content-Type"] = envelope.data.contentType;
        }
        return {
          status: envelope.data.status,
          statusText: envelope.data.status >= 200 && envelope.data.status < 300 ? "OK" : "Upstream request failed",
          headers: responseHeaders,
          text: typeof envelope.data.body === "string" ? envelope.data.body : "",
        };
      } catch {
        return {
          status: 502,
          statusText: "Invalid SiYuan forwardProxy response",
          headers: { "content-type": "text/plain; charset=utf-8" },
          text,
        };
      }
    },
    async registerRpc(method: string, handler: (payload: unknown) => Promise<unknown>): Promise<void> {
      boundMethods.push(method);
      await api.rpc.bind(method, (payload: unknown) => handler(payload));
    },
    notify(event: string, payload: unknown): void {
      // 官方 RPC broadcast 的第二个参数是调用参数数组；前端 handler 收到 args[0]。
      void api.rpc.broadcast(event, [payload]).catch(() => undefined);
    },
    log,
    timeout(fn: () => void, ms: number): () => void {
      if (typeof globalThis.setTimeout === "function") {
        const id = globalThis.setTimeout(fn, ms);
        return () => {
          if (typeof globalThis.clearTimeout === "function") globalThis.clearTimeout(id);
        };
      }
      return () => {};
    },
    async dispose(): Promise<void> {
      for (const name of boundMethods.splice(0)) {
        try {
          await api.rpc.unbind(name);
        } catch {
          // 忽略解绑错误
        }
      }
    },
  };
}

export type SiyuanKernelHost = NonNullable<ReturnType<typeof createSiyuanKernelHost>>;
