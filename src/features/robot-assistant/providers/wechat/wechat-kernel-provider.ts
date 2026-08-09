import type { RobotProvider } from "../../contracts/robot-provider-contract";
import type { RobotProviderRuntimeStatus, RobotProviderId, RobotProviderStatus } from "../../contracts/robot-provider";
import type { NormalizedRobotMessage, RobotOutboundMessage } from "../../contracts/robot-message";
import { normalizeWeChatMessage, WECHAT_PROTOCOL_ENDPOINTS, wechatPollTimeoutMs, type WeChatCredential, type WeChatGetUpdatesResult, type WeChatLoginStateSnapshot, type WeChatQrLoginResult, type WeChatUpdate } from "./wechat-protocol";
import type { WeChatHttpPort } from "./wechat-http-port";
import type { WeChatCredentialStoragePort } from "./wechat-credential-storage";

/** 指数退避：1s → 2s → 5s → 10s → 30s 上限，不要高速重试。 */
export function wechatBackoffMs(retryCount: number): number {
  const steps = [1000, 2000, 5000, 10_000, 30_000];
  return steps[Math.min(Math.max(retryCount - 1, 0), steps.length - 1)];
}

export interface WeChatKernelProviderDeps {
  http: WeChatHttpPort;
  storage: WeChatCredentialStoragePort;
  /** Kernel transport 安全上界（默认 60s），getUpdates 长轮询外层 timeout 不能超过它。 */
  kernelPollTimeoutBoundMs?: number;
  onStatusChange?(status: RobotProviderRuntimeStatus): void;
  onLoginChange?(state: WeChatLoginStateSnapshot): void;
  onDispatchError?(error: unknown, update: WeChatUpdate): void;
  now?(): number;
  timeout?(fn: () => void, ms: number): () => void;
}

export class WeChatKernelProvider implements RobotProvider {
  readonly id: RobotProviderId = "wechat";
  readonly runtimeKind = "kernel" as const;

  private handler: (message: NormalizedRobotMessage) => void | Promise<void> = () => {};
  private statusValue: RobotProviderStatus = "disconnected";
  private credential: WeChatCredential | null = null;
  private loginSessionKey: string | null = null;
  private loginQrcode: string | null = null;
  private loginQrContent: string | null = null;
  private loginBaseUrl = "https://ilinkai.weixin.qq.com";
  private pendingVerifyCode: string | null = null;
  private pollGeneration = 0;
  private polling = false;
  private retryCount = 0;
  private readonly pendingSleepCancels = new Set<() => void>();

  constructor(private readonly deps: WeChatKernelProviderDeps) {}

  getStatus(): RobotProviderRuntimeStatus {
    return {
      provider: "wechat",
      runtimeKind: "kernel",
      availability: "available",
      status: this.statusValue,
      ...(this.credential ? { account: { accountId: this.credential.accountId, displayName: this.credential.displayName, authenticated: true } } : {}),
      updatedAt: this.deps.now?.() ?? Date.now(),
    };
  }

  setMessageHandler(handler: (message: NormalizedRobotMessage) => void | Promise<void>): void {
    this.handler = handler;
  }

  async connect(): Promise<RobotProviderRuntimeStatus> {
    this.setStatus("connecting");
    this.credential = await this.deps.storage.getCredential();
    if (!this.credential) {
      this.setStatus("waiting_qr");
      return this.getStatus();
    }
    await this.notifyStart();
    this.startPolling();
    return this.getStatus();
  }

  async disconnect(): Promise<void> {
    this.pollGeneration += 1;
    this.cancelSleeps();
    this.polling = false;
    this.setStatus("disconnected");
  }

  async dispose(): Promise<void> {
    await this.disconnect();
    this.handler = () => {};
  }

  async send(message: RobotOutboundMessage): Promise<{ ok: boolean; errorCode?: string; message?: string }> {
    if (!this.credential) return { ok: false, errorCode: "not_connected" };
    try {
      const result = await this.deps.http.request({
        baseUrl: this.credential.baseUrl,
        path: WECHAT_PROTOCOL_ENDPOINTS.sendMessage,
        headers: this.authHeaders(this.credential),
        body: {
          msg: {
            from_user_id: "",
            to_user_id: message.chatId,
            client_id: `siyuan-homepage-${this.now()}-${Math.floor(Math.random() * 1_000_000)}`,
            message_type: 2,
            message_state: 2,
            context_token: message.contextToken,
            item_list: [{ type: 1, text_item: { text: message.text } }],
          },
          base_info: this.baseInfo(),
        },
        timeoutMs: 15_000,
      });
      const parsed = this.parseJson(result.text);
      if (result.status >= 200 && result.status < 300 && (parsed.ret === undefined || parsed.ret === 0)) return { ok: true };
      const ret = typeof parsed.ret === "number" ? parsed.ret : typeof parsed.errcode === "number" ? parsed.errcode : null;
      const errorCode = ret === null ? "wechat_send_failed" : `wechat_send_ret_${ret}`;
      const detail = typeof parsed.errmsg === "string" && parsed.errmsg.trim() ? ` ${parsed.errmsg.trim().slice(0, 120)}` : "";
      return { ok: false, errorCode, message: `HTTP ${result.status}${ret === null ? "" : ` ret=${ret}`}${detail}` };
    } catch (error) {
      return { ok: false, errorCode: "wechat_send_failed", message: error instanceof Error ? error.message.slice(0, 200) : String(error) };
    }
  }

  // ── 登录 RPC 接线 ──

  async startLogin(): Promise<WeChatQrLoginResult> {
    const result = await this.deps.http.request({
      baseUrl: "https://ilinkai.weixin.qq.com",
      path: WECHAT_PROTOCOL_ENDPOINTS.startLogin,
      headers: this.commonHeaders(),
      body: { local_token_list: this.credential?.botToken ? [this.credential.botToken] : [] },
      timeoutMs: 15_000,
    });
    this.ensureHttpOk(result.status, "wechat_qrcode_failed");
    const parsed = this.parseJson(result.text);
    this.loginSessionKey = `wx_login_${this.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    this.loginQrcode = typeof parsed.qrcode === "string" ? parsed.qrcode : null;
    this.loginQrContent = typeof parsed.qrcode_img_content === "string" ? parsed.qrcode_img_content : null;
    this.loginBaseUrl = "https://ilinkai.weixin.qq.com";
    this.pendingVerifyCode = null;
    const qr: WeChatQrLoginResult = {
      sessionKey: this.loginSessionKey,
      qrcodeUrl: typeof parsed.qrcode_img_content === "string" ? parsed.qrcode_img_content : "",
      ...(typeof parsed.qrcode_img_content === "string" ? { qrcodeContent: parsed.qrcode_img_content } : {}),
      expiration: this.now() + 5 * 60 * 1000,
      status: "wait",
    };
    if (!this.loginQrcode || !qr.qrcodeUrl) throw new Error("微信二维码响应缺少必要字段");
    this.setStatus(qr.status === "need_verifycode" ? "waiting_verify_code" : "waiting_qr");
    return qr;
  }

  async getLoginState(): Promise<WeChatLoginStateSnapshot> {
    if (!this.loginQrcode || !this.loginSessionKey) {
      if (this.credential) {
        return {
          status: "confirmed",
          confirmed: true,
          accountId: this.credential.accountId,
          ...(this.credential.displayName ? { displayName: this.credential.displayName } : {}),
        };
      }
      return { status: "expired" };
    }
    let query = `qrcode=${encodeURIComponent(this.loginQrcode)}`;
    if (this.pendingVerifyCode) query += `&verify_code=${encodeURIComponent(this.pendingVerifyCode)}`;
    const result = await this.deps.http.request({
      baseUrl: this.loginBaseUrl,
      path: `${WECHAT_PROTOCOL_ENDPOINTS.getLoginState}?${query}`,
      method: "GET",
      headers: this.commonHeaders(),
      timeoutMs: 35_000,
    });
    this.ensureHttpOk(result.status, "wechat_login_poll_failed");
    const parsed = this.parseJson(result.text);
    const status = this.toLoginStatus(parsed.status);
    const snapshot: WeChatLoginStateSnapshot = {
      status,
      ...(this.loginQrContent && status !== "expired" && status !== "confirmed" ? { qrcodeContent: this.loginQrContent } : {}),
      ...(status === "scaned" ? { scanned: true } : {}),
      ...(status === "confirmed" ? { confirmed: true } : {}),
      ...(typeof parsed.ilink_bot_id === "string" ? { accountId: parsed.ilink_bot_id } : {}),
      ...(status === "need_verifycode" ? { needVerifyCode: true } : {}),
    };
    if (snapshot.status === "scaned") {
      this.pendingVerifyCode = null;
      this.setStatus("waiting_scan");
    }
    else if (snapshot.status === "scaned_but_redirect") {
      if (typeof parsed.redirect_host === "string" && parsed.redirect_host.trim()) {
        this.loginBaseUrl = `https://${parsed.redirect_host.trim()}`;
      }
      this.setStatus("waiting_scan");
    }
    else if (snapshot.status === "confirmed") {
      const accountId = typeof parsed.ilink_bot_id === "string" ? parsed.ilink_bot_id : "";
      const botToken = typeof parsed.bot_token === "string" ? parsed.bot_token : "";
      if (!accountId || !botToken) throw new Error("微信登录确认响应缺少账号或令牌");
      const credential: WeChatCredential = {
        accountId,
        botToken,
        baseUrl: typeof parsed.baseurl === "string" && parsed.baseurl.trim() ? parsed.baseurl : this.loginBaseUrl,
        ...(typeof parsed.ilink_user_id === "string" ? { userId: parsed.ilink_user_id } : {}),
      };
      await this.deps.storage.setCredential(credential);
      this.credential = credential;
      this.loginQrcode = null;
      this.loginQrContent = null;
      this.pendingVerifyCode = null;
      await this.notifyStart();
      this.startPolling();
    } else if (snapshot.status === "expired") this.setStatus("waiting_qr");
    else if (snapshot.status === "need_verifycode") this.setStatus("waiting_verify_code");
    else if (snapshot.status === "verify_code_blocked") this.setStatus("error");
    else if (snapshot.status === "binded_redirect") {
      if (this.credential) this.startPolling();
      else this.setStatus("reauth_required");
    }
    this.deps.onLoginChange?.(snapshot);
    return snapshot;
  }

  async submitVerifyCode(code: string): Promise<{ ok: boolean; errorCode?: string }> {
    const normalized = code.trim();
    if (!this.loginQrcode || !normalized) return { ok: false, errorCode: "wechat_verify_code_invalid" };
    // 腾讯协议没有独立的验证码提交接口；验证码随下一次状态轮询发送。
    this.pendingVerifyCode = normalized;
    return { ok: true };
  }

  async logout(): Promise<void> {
    if (this.credential) {
      try {
        await this.deps.http.request({
          baseUrl: this.credential.baseUrl,
          path: WECHAT_PROTOCOL_ENDPOINTS.notifyStop,
          headers: this.authHeaders(this.credential),
          body: { base_info: this.baseInfo() },
          timeoutMs: 15_000,
        });
      } catch {
        // 忽略登出网络错误
      }
    }
    this.pollGeneration += 1;
    this.cancelSleeps();
    await this.deps.storage.clearCredential();
    this.credential = null;
    this.loginQrcode = null;
    this.loginQrContent = null;
    this.pendingVerifyCode = null;
    this.setStatus("disconnected");
  }

  // ── 内部：轮询 ──

  private startPolling(): void {
    if (this.polling) return;
    this.polling = true;
    this.retryCount = 0;
    const generation = ++this.pollGeneration;
    this.setStatus("connected");
    void this.pollLoop(generation);
  }

  private async pollLoop(generation: number): Promise<void> {
    const credential = this.credential;
    if (!credential) {
      this.polling = false;
      return;
    }
    let nextLongPollMs = 35_000;
    while (generation === this.pollGeneration && (this.statusValue === "connected" || this.statusValue === "reconnecting")) {
      const previousBuf = await this.deps.storage.getUpdatesBuf();
      let result: WeChatGetUpdatesResult;
      try {
        const raw = await this.deps.http.request({
          baseUrl: credential.baseUrl,
          path: WECHAT_PROTOCOL_ENDPOINTS.getUpdates,
          headers: this.authHeaders(credential),
          body: {
            get_updates_buf: previousBuf ?? "",
            base_info: this.baseInfo(),
          },
          timeoutMs: wechatPollTimeoutMs(nextLongPollMs, this.deps.kernelPollTimeoutBoundMs ?? 60_000),
        });
        this.ensureHttpOk(raw.status, "wechat_getupdates_failed");
        result = this.parseGetUpdates(raw.text);
      } catch {
        if (generation !== this.pollGeneration) break;
        this.retryCount += 1;
        this.setStatus("reconnecting");
        await this.sleep(wechatBackoffMs(this.retryCount));
        if (generation !== this.pollGeneration) break;
        continue;
      }
      if (generation !== this.pollGeneration) break;

      if (result.sessionInvalid) {
        this.setStatus("reauth_required");
        break;
      }
      this.retryCount = 0;
      this.setStatus("connected");
      nextLongPollMs = result.longPollingTimeoutMs;
      if (result.getUpdatesBuf !== null) {
        await this.deps.storage.setUpdatesBuf(result.getUpdatesBuf);
      }
      const hadUpdates = result.updates.length > 0;
      for (const update of result.updates) {
        this.dispatch(update);
      }
      // 服务端已按 longpoll 阻塞过；若空返回则加一个极小的防抖再发起下一次。
      if (!hadUpdates) await this.sleep(200);
    }
    this.polling = false;
    if (generation === this.pollGeneration && this.statusValue === "connected") {
      // 退出循环但仍在运行（例如长轮询被中断）→ 重新进入下一轮。
      this.startPolling();
    }
  }

  private dispatch(update: WeChatUpdate): void {
    // getupdates 仅承载入站消息；仍防御性跳过能够明确识别的机器人回显。
    // 不可仅依赖 message_type：腾讯协议把该字段声明为可选，官方适配器也直接处理 msgs。
    if (update.type === "BOT" || update.type === "OTHER") return;
    const message = normalizeWeChatMessage({
      providerId: "wechat",
      accountId: this.credential?.accountId ?? "",
      update,
      receivedAt: this.now(),
    });
    // Provider 长轮询绝不能等待 Agent turn：写操作可能挂起等待下一条“确认/取消”消息。
    // 同一会话的普通 turn 串行由 Robot Core 自己负责，Provider 只负责持续收消息。
    void Promise.resolve(this.handler(message)).catch((error) => {
      this.deps.onDispatchError?.(error, update);
    });
  }

  private setStatus(status: RobotProviderStatus): void {
    this.statusValue = status;
    this.deps.onStatusChange?.(this.getStatus());
  }

  private async notifyStart(): Promise<void> {
    if (!this.credential) return;
    try {
      const result = await this.deps.http.request({
        baseUrl: this.credential.baseUrl,
        path: WECHAT_PROTOCOL_ENDPOINTS.notifyStart,
        headers: this.authHeaders(this.credential),
        body: { base_info: this.baseInfo() },
        timeoutMs: 10_000,
      });
      const parsed = this.parseJson(result.text);
      if (result.status < 200 || result.status >= 300 || (parsed.ret !== undefined && parsed.ret !== 0)) {
        // 启动通知只用于服务端在线状态协调，失败不阻断消息长轮询。
      }
    } catch {
      // 与腾讯官方实现一致：启动通知失败不阻断 Provider 启动。
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      let cancelTimer: (() => void) | null = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (cancel) this.pendingSleepCancels.delete(cancel);
        resolve();
      };
      const cancel = () => { cancelTimer?.(); finish(); };
      if (this.deps.timeout) {
        cancelTimer = this.deps.timeout(finish, ms);
        this.pendingSleepCancels.add(cancel);
      } else if (typeof globalThis.setTimeout === "function") {
        const id = globalThis.setTimeout(finish, ms);
        cancelTimer = () => globalThis.clearTimeout(id);
        this.pendingSleepCancels.add(cancel);
      } else {
        resolve();
      }
    });
  }

  private cancelSleeps(): void {
    for (const cancel of this.pendingSleepCancels) cancel();
    this.pendingSleepCancels.clear();
  }

  private toLoginStatus(value: unknown): WeChatLoginStateSnapshot["status"] {
    return typeof value === "string" && ["wait", "scaned", "confirmed", "expired", "need_verifycode", "verify_code_blocked", "scaned_but_redirect", "binded_redirect"].includes(value)
      ? value as WeChatLoginStateSnapshot["status"]
      : "wait";
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private parseJson(text: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(text) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }

  private parseGetUpdates(text: string): WeChatGetUpdatesResult {
    const parsed = this.parseJson(text);
    const ret = typeof parsed.ret === "number"
      ? parsed.ret
      : typeof parsed.errcode === "number"
        ? parsed.errcode
        : 0;
    const sessionInvalid = ret === -14;
    if (ret !== 0 && !sessionInvalid) {
      const detail = typeof parsed.errmsg === "string" && parsed.errmsg.trim()
        ? ` ${parsed.errmsg.trim().slice(0, 120)}`
        : "";
      throw new Error(`wechat_getupdates_ret_${ret}${detail}`);
    }
    const rawUpdates = Array.isArray(parsed.msgs) ? parsed.msgs : [];
    const updates: WeChatUpdate[] = [];
    for (const raw of rawUpdates) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      const messageType = typeof item.message_type === "number" ? item.message_type : 0;
      const fromUserId = typeof item.from_user_id === "string" ? item.from_user_id : "";
      const ownIds = new Set(
        [this.credential?.accountId, this.credential?.userId]
          .filter((value): value is string => typeof value === "string" && Boolean(value)),
      );
      const isOwnEcho = messageType === 2 && (!fromUserId || ownIds.has(fromUserId));
      const rawItems = Array.isArray(item.item_list) ? item.item_list.filter((entry) => entry && typeof entry === "object") as Record<string, unknown>[] : [];
      const textItem = rawItems.find((entry) => entry.type === 1);
      const mediaItem = rawItems.find((entry) => typeof entry.type === "number" && [2, 3, 4, 5].includes(entry.type));
      const mediaType = typeof mediaItem?.type === "number" ? mediaItem.type : 0;
      const nestedText = textItem?.text_item && typeof textItem.text_item === "object"
        ? (textItem.text_item as Record<string, unknown>).text
        : undefined;
      const messageId = typeof item.message_id === "number" || typeof item.message_id === "string"
        ? String(item.message_id).trim()
        : "";
      // 无稳定 message_id 的事件无法跨重连去重。为避免重复写入，不把它送进 Robot Core。
      if (!messageId) continue;
      updates.push({
        // 官方 getupdates 会返回 message_type 缺失的入站消息；有发送者即按用户消息处理。
        type: isOwnEcho ? "BOT" : fromUserId ? "USER" : "OTHER",
        fromUserId,
        messageId,
        sessionId: typeof item.session_id === "string" ? item.session_id : "",
        ...(typeof item.context_token === "string" ? { contextToken: item.context_token } : {}),
        ...(typeof nestedText === "string" ? { text: nestedText } : {}),
        messageKind: textItem ? "text" : mediaType === 2 ? "image" : mediaType === 3 ? "voice" : mediaType === 4 ? "file" : mediaType === 5 ? "video" : "other",
      });
    }
    return {
      getUpdatesBuf: typeof parsed.get_updates_buf === "string" ? parsed.get_updates_buf : null,
      longPollingTimeoutMs: typeof parsed.longpolling_timeout_ms === "number" && parsed.longpolling_timeout_ms > 0
        ? parsed.longpolling_timeout_ms
        : 30_000,
      updates,
      sessionInvalid,
    };
  }

  private commonHeaders(): Record<string, string> {
    return { "iLink-App-Id": "bot", "iLink-App-ClientVersion": "264449" };
  }

  private authHeaders(credential: WeChatCredential): Record<string, string> {
    return {
      ...this.commonHeaders(),
      AuthorizationType: "ilink_bot_token",
      Authorization: `Bearer ${credential.botToken}`,
      "X-WECHAT-UIN": encodeAsciiBase64(String(Math.floor(Math.random() * 0x1_0000_0000))),
      ...(credential.routeTag ? { SKRouteTag: credential.routeTag } : {}),
    };
  }

  private baseInfo(): Record<string, unknown> {
    return { channel_version: "4.9.1", bot_agent: "SiYuanHomepage/4.9.1" };
  }

  private ensureHttpOk(status: number, code: string): void {
    if (status < 200 || status >= 300) throw new Error(`${code}: HTTP ${status}`);
  }
}

function encodeAsciiBase64(value: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < value.length; i += 3) {
    const a = value.charCodeAt(i);
    const b = i + 1 < value.length ? value.charCodeAt(i + 1) : 0;
    const c = i + 2 < value.length ? value.charCodeAt(i + 2) : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += alphabet[(triple >>> 18) & 63] + alphabet[(triple >>> 12) & 63]
      + (i + 1 < value.length ? alphabet[(triple >>> 6) & 63] : "=")
      + (i + 2 < value.length ? alphabet[triple & 63] : "=");
  }
  return out;
}

