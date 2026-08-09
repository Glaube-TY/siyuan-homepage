import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const output = join(tmpdir(), `siyuan-homepage-wechat-provider-${process.pid}.mjs`);

try {
  await build({
    entryPoints: ["src/features/robot-assistant/providers/wechat/wechat-kernel-provider.ts"],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "esm",
    logLevel: "silent",
  });

  const { WeChatKernelProvider } = await import(`${pathToFileURL(output).href}?t=${Date.now()}`);
  const received = [];
  let pollCount = 0;
  let releaseFirstTurn;
  const firstTurn = new Promise((resolve) => { releaseFirstTurn = resolve; });
  let confirmationReceived;
  const confirmation = new Promise((resolve) => { confirmationReceived = resolve; });

  const provider = new WeChatKernelProvider({
    http: {
      async request({ path }) {
        if (path.includes("notifystart")) return { status: 200, text: JSON.stringify({ ret: 0 }) };
        if (!path.includes("getupdates")) throw new Error(`unexpected request: ${path}`);
        pollCount += 1;
        const text = pollCount === 1 ? "帮我记一笔午餐 15 元" : "确认";
        return {
          status: 200,
          text: JSON.stringify({
            ret: 0,
            get_updates_buf: `buffer-${pollCount}`,
            longpolling_timeout_ms: 30_000,
            msgs: [{
              from_user_id: "wechat-user",
              message_id: pollCount,
              context_token: `context-${pollCount}`,
              item_list: [{ type: 1, text_item: { text } }],
            }],
          }),
        };
      },
    },
    storage: {
      async getCredential() {
        return { accountId: "wechat-bot", botToken: "test-token", baseUrl: "https://example.invalid" };
      },
      async setCredential() {},
      async clearCredential() {},
      async getUpdatesBuf() { return null; },
      async setUpdatesBuf() {},
    },
  });

  provider.setMessageHandler(async (message) => {
    received.push(message.text);
    if (message.text === "帮我记一笔午餐 15 元") await firstTurn;
    if (message.text === "确认") {
      confirmationReceived();
      await provider.disconnect();
    }
  });

  await provider.connect();
  await Promise.race([
    confirmation,
    new Promise((_, reject) => setTimeout(() => reject(new Error("确认消息被等待中的 Agent turn 阻塞")), 1_000)),
  ]);
  releaseFirstTurn();

  assert.deepEqual(received.slice(0, 2), ["帮我记一笔午餐 15 元", "确认"]);
  assert.ok(pollCount >= 2, "Provider 应在第一条 Agent turn 挂起时继续长轮询");
  console.log("PASS: 微信确认消息可在上一条 Agent turn 等待期间进入处理链路");
} finally {
  await rm(output, { force: true });
}
