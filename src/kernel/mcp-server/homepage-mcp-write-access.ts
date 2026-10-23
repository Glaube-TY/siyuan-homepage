import SHA256 from "crypto-js/sha256";
import { homepageMcpWritePreviewSchema, type HomepageMcpWritePreview } from "../../features/agent-platform/mcp-server/homepage-mcp-write-preview";
export type { HomepageMcpWritePreview } from "../../features/agent-platform/mcp-server/homepage-mcp-write-preview";

export interface HomepageMcpWriteRequest extends HomepageMcpWritePreview {
  confirmationId: string;
  toolName: string;
  requestedAt: number;
  expiresAt: number;
  status: "pending" | "approved";
}

const CONFIRMATION_TTL_MS = 120_000;
const MAX_REQUESTS = 20;

function createConfirmationId(): string {
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("安全随机源不可用，无法开启 MCP 写入授权。");
  }
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function fingerprintHomepageMcpValue(value: unknown): string {
  const ancestors = new Set<object>();
  let nodes = 0;
  let size = 0;
  const encode = (child: unknown, depth: number): string => {
    if (++nodes > 4096 || depth > 8) throw new Error("MCP 参数结构超出边界。");
    let result: string;
    if (child === null || typeof child === "boolean" || typeof child === "string" ||
      (typeof child === "number" && Number.isFinite(child) && !Object.is(child, -0))) {
      result = JSON.stringify(child);
    } else if (typeof child === "object" && child !== null) {
      if (ancestors.has(child)) throw new Error("MCP 参数不能循环引用。");
      ancestors.add(child);
      if (Array.isArray(child)) {
        if (Object.keys(child).length !== child.length || child.length > 2048 || Object.getOwnPropertySymbols(child).length ||
          Object.keys(child).some((key, index) => key !== String(index))) throw new Error("MCP 数组无效。");
        result = "[" + child.map((item) => encode(item, depth + 1)).join(",") + "]";
      } else {
        const prototype = Object.getPrototypeOf(child);
        if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(child).length) throw new Error("MCP 参数必须为 JSON。");
        const keys = Object.keys(child).sort();
        if (keys.length > 256) throw new Error("MCP 对象字段过多。");
        result = "{" + keys.map((key) => encode(key, depth + 1) + ":" + encode((child as Record<string, unknown>)[key], depth + 1)).join(",") + "}";
      }
      ancestors.delete(child);
    } else throw new Error("MCP 参数包含不支持的值。");
    size += result.length;
    if (size > 65_536) throw new Error("MCP 参数过大。");
    return result;
  };
  return SHA256(encode(value, 0)).toString();
}

function fingerprint(toolName: string, action: string, args: Record<string, unknown>): string {
  return fingerprintHomepageMcpValue([toolName, action, args]);
}

/** 仅属于本次 Kernel 运行；不存原始参数，不借用 Robot 的确认或会话。 */
export class HomepageMcpWriteAccess {
  private allowed = false;
  private requests = new Map<string, HomepageMcpWriteRequest & { fingerprint: string; stateFingerprint: string }>();
  private cancelExpiry: (() => void) | null = null;

  constructor(private readonly timeout: (fn: () => void, ms: number) => () => void) {}

  get enabled(): boolean { return this.allowed; }

  enable(): void {
    createConfirmationId();
    this.allowed = true;
  }

  revoke(): void {
    this.allowed = false;
    this.requests.clear();
    this.cancelExpiry?.();
    this.cancelExpiry = null;
  }

  list(): HomepageMcpWriteRequest[] {
    this.prune();
    return Array.from(this.requests.values(), ({ fingerprint: _fingerprint, stateFingerprint: _stateFingerprint, ...request }) => structuredClone(request));
  }

  create(toolName: string, action: string, args: Record<string, unknown>, preview: HomepageMcpWritePreview, stateFingerprint: string): string | null {
    this.prune();
    if (!this.allowed || this.requests.size >= MAX_REQUESTS) return null;
    const confirmationId = createConfirmationId();
    if (this.requests.has(confirmationId)) throw new Error("MCP 确认 ID 冲突，未创建请求。");
    const requestedAt = Date.now();
    const safePreview = homepageMcpWritePreviewSchema.parse(preview);
    if (safePreview.action !== action || !/^[a-f0-9]{64}$/.test(stateFingerprint)) throw new Error("MCP 预览无效。");
    this.requests.set(confirmationId, {
      ...safePreview, confirmationId, toolName,
      requestedAt, expiresAt: requestedAt + CONFIRMATION_TTL_MS, status: "pending",
      fingerprint: fingerprint(toolName, action, args),
      stateFingerprint,
    });
    this.scheduleExpiry();
    return confirmationId;
  }

  decide(confirmationId: string, approved: boolean): boolean {
    this.prune();
    const request = this.requests.get(confirmationId);
    if (!this.allowed || !request || (approved && request.status !== "pending")) return false;
    if (approved) request.status = "approved";
    else this.requests.delete(confirmationId);
    this.scheduleExpiry();
    return true;
  }

  check(confirmationId: string, toolName: string, action: string, args: Record<string, unknown>): string | null {
    this.prune();
    const request = this.requests.get(confirmationId);
    if (!this.allowed || !request || request.fingerprint !== fingerprint(toolName, action, args)) {
      this.invalidate(confirmationId);
      return "mcp_confirmation_invalid";
    }
    if (request.status !== "approved") return "mcp_confirmation_required";
    return null;
  }

  invalidate(confirmationId: string): void {
    this.requests.delete(confirmationId);
    this.scheduleExpiry();
  }

  consume(confirmationId: string, toolName: string, action: string, args: Record<string, unknown>, stateFingerprint: string): string | null {
    const code = this.check(confirmationId, toolName, action, args);
    if (code) return code;
    if (this.requests.get(confirmationId)!.stateFingerprint !== stateFingerprint) {
      this.invalidate(confirmationId);
      return "mcp_confirmation_state_changed";
    }
    // 无 await：批准在业务调用前原子消费，失败或结果未知都不能重放。
    this.requests.delete(confirmationId);
    this.scheduleExpiry();
    return null;
  }

  private prune(): void {
    const now = Date.now();
    for (const [id, request] of this.requests) {
      if (request.expiresAt <= now) this.requests.delete(id);
    }
  }

  private scheduleExpiry(): void {
    this.cancelExpiry?.();
    this.cancelExpiry = null;
    if (!this.requests.size) return;
    const expiresAt = Math.min(...Array.from(this.requests.values(), (request) => request.expiresAt));
    this.cancelExpiry = this.timeout(() => {
      this.cancelExpiry = null;
      this.prune();
      this.scheduleExpiry();
    }, Math.max(0, expiresAt - Date.now()));
  }
}
