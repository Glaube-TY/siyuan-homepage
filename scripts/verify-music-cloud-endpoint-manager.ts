import assert from "node:assert/strict";

import { SubsonicEndpointManager } from "../src/components/utils/widgetBlock/widget/musicPlayer/subsonic/subsonicEndpointManager";
import { SubsonicError } from "../src/components/utils/widgetBlock/widget/musicPlayer/subsonic/subsonicErrors";
import type { SubsonicEndpointKind, SubsonicEnvelope } from "../src/components/utils/widgetBlock/widget/musicPlayer/subsonic/subsonicTypes";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let remoteRequests = 0;
const client = {
  async request(
    _baseUrl: string,
    kind: SubsonicEndpointKind,
  ): Promise<SubsonicEnvelope> {
    if (kind === "local") {
      await delay(5);
      throw new Error("local timeout");
    }
    remoteRequests += 1;
    await delay(15);
    return {
      status: "ok",
      version: "1.16.1",
      type: "navidrome",
      serverVersion: "test",
      openSubsonic: true,
    };
  },
};

const manager = new SubsonicEndpointManager({
  localBaseUrl: "http://nas.local",
  remoteBaseUrl: "https://music.example.test",
}, client as never);

// 模拟本地探测失败时，窗口 focus/online 事件同时触发自动重连。
// 两个调用必须复用同一轮连接选择，不能让初始化误报两个地址均失败。
let concurrentRefresh: Promise<void> | null = null;
const unsubscribe = manager.subscribe((state) => {
  if (!concurrentRefresh && state.local.status === "offline" && state.remote.status === "idle") {
    concurrentRefresh = manager.refreshConnection();
  }
});

const initialized = await manager.initialize();
await concurrentRefresh;

assert.equal(initialized.activeKind, "remote");
assert.equal(initialized.remote.status, "online");
assert.equal(initialized.local.status, "offline");
assert.equal(remoteRequests, 1, "并发重连不应重复探测远程地址");

unsubscribe();
manager.destroy();

// 单个地址认证或协议异常也不能阻止另一个已配置地址继续尝试。
const authFallbackManager = new SubsonicEndpointManager({
  localBaseUrl: "http://wrong-service.local",
  remoteBaseUrl: "https://music.example.test",
}, {
  async request(_baseUrl: string, kind: SubsonicEndpointKind): Promise<SubsonicEnvelope> {
    if (kind === "local") throw new SubsonicError("auth_failed", "local auth failed");
    return { status: "ok", version: "1.16.1", type: "navidrome", openSubsonic: true };
  },
} as never);
const authFallbackState = await authFallbackManager.initialize();
assert.equal(authFallbackState.activeKind, "remote");
assert.equal(authFallbackState.local.status, "auth_error");
assert.equal(authFallbackState.remote.status, "online");
authFallbackManager.destroy();

console.log("Music cloud endpoint manager checks passed.");
