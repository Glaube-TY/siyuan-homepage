import SHA256 from "crypto-js/sha256";

export interface HomepageMcpWriteRequest {
  confirmationId: string;
  toolName: string;
  action: string;
  targetSummary: string;
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

function fingerprint(toolName: string, action: string, args: Record<string, unknown>): string {
  // 唯一允许的写 action 只接受标量参数；字段排序保证对象顺序不影响绑定。
  return SHA256(JSON.stringify([toolName, action, Object.keys(args).sort().map((key) => [key, typeof args[key], args[key]])])).toString();
}

/** 仅属于本次 Kernel 运行；不存原始参数，不借用 Robot 的确认或会话。 */
export class HomepageMcpWriteAccess {
  private allowed = false;
  private requests = new Map<string, HomepageMcpWriteRequest & { fingerprint: string }>();
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
    return Array.from(this.requests.values(), ({ fingerprint: _fingerprint, ...request }) => ({ ...request }));
  }

  create(toolName: string, action: string, args: Record<string, unknown>): string | null {
    this.prune();
    if (!this.allowed || this.requests.size >= MAX_REQUESTS) return null;
    const confirmationId = createConfirmationId();
    if (this.requests.has(confirmationId)) throw new Error("MCP 确认 ID 冲突，未创建请求。");
    const requestedAt = Date.now();
    this.requests.set(confirmationId, {
      confirmationId, toolName, action,
      targetSummary: "收藏文档 " + String(args.docId),
      requestedAt, expiresAt: requestedAt + CONFIRMATION_TTL_MS, status: "pending",
      fingerprint: fingerprint(toolName, action, args),
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

  consume(confirmationId: string, toolName: string, action: string, args: Record<string, unknown>): string | null {
    this.prune();
    const request = this.requests.get(confirmationId);
    if (!this.allowed || !request || request.fingerprint !== fingerprint(toolName, action, args)) {
      return "mcp_confirmation_invalid";
    }
    if (request.status !== "approved") return "mcp_confirmation_required";
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
