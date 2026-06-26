import type { ChatActionBridgeSettings, ChatActionRuntimeSettings } from "../types";
import { checkFeishuLocalGatewayHealth } from "./feishu-local-gateway-client";

interface NodeRequireLike {
  (id: string): any;
}

interface GatewayProcessResult {
  ok: boolean;
  message: string;
  detail?: string;
}

let gatewayChild: any = null;

function getNodeRequire(): NodeRequireLike | null {
  const req = (globalThis as any)?.require ?? (globalThis as any)?.window?.require;
  return typeof req === "function" ? req as NodeRequireLike : null;
}

export function isFeishuLocalGatewaySpawnSupported(): boolean {
  return getNodeRequire() !== null;
}

function readWorkspacePathCandidates(): string[] {
  const system = (globalThis as any)?.window?.siyuan?.config?.system ?? {};
  return [
    system.workspaceDir,
    system.workspacePath,
    system.workspace,
    system.dataDir,
    system.dataPath,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function getPluginName(plugin: any): string {
  return typeof plugin?.name === "string" && plugin.name.trim() ? plugin.name.trim() : "siyuan-homepage";
}

function resolveGatewayScriptPath(req: NodeRequireLike, plugin: any): string | null {
  const fs = req("node:fs");
  const path = req("node:path");
  const processModule = req("node:process");
  const pluginName = getPluginName(plugin);
  const candidates: string[] = [];

  for (const workspacePath of readWorkspacePathCandidates()) {
    const normalized = path.normalize(workspacePath);
    const dataRoot = /[\\/]data$/i.test(normalized) ? normalized : path.join(normalized, "data");
    candidates.push(path.join(dataRoot, "plugins", pluginName, "scripts", "chat-action-feishu-gateway", "feishu-gateway.mjs"));
  }

  candidates.push(path.join(processModule.cwd(), "scripts", "chat-action-feishu-gateway", "feishu-gateway.mjs"));
  candidates.push(path.join(processModule.cwd(), "dist", "scripts", "chat-action-feishu-gateway", "feishu-gateway.mjs"));
  candidates.push(path.join(processModule.cwd(), "dev", "scripts", "chat-action-feishu-gateway", "feishu-gateway.mjs"));

  // Flattened fallback (for older builds or alternate install layouts)
  candidates.push(path.join(processModule.cwd(), "dist", "feishu-gateway.mjs"));
  candidates.push(path.join(processModule.cwd(), "dev", "feishu-gateway.mjs"));
  for (const workspacePath of readWorkspacePathCandidates()) {
    const normalized = path.normalize(workspacePath);
    const dataRoot = /[\\/]data$/i.test(normalized) ? normalized : path.join(normalized, "data");
    candidates.push(path.join(dataRoot, "plugins", pluginName, "feishu-gateway.mjs"));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function quoteCommandArg(value: string): string {
  if (/^[a-zA-Z0-9_@./\\:,-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

function getGatewayScriptPathForDisplay(plugin: any): string {
  const req = getNodeRequire();
  if (req) {
    const resolved = resolveGatewayScriptPath(req, plugin);
    if (resolved) return resolved;
  }
  const pluginName = getPluginName(plugin);
  return `<思源工作空间>/data/plugins/${pluginName}/scripts/chat-action-feishu-gateway/feishu-gateway.mjs`;
}

export function buildFeishuLocalGatewayManualCommand(
  plugin: any,
  settings: ChatActionBridgeSettings | ChatActionRuntimeSettings,
): string {
  const scriptPath = getGatewayScriptPathForDisplay(plugin);
  const appId = settings.feishu.appId || "<App ID>";
  const localAuthToken = settings.localGateway.localAuthToken || "<本地 token>";
  const port = settings.localGateway.port;
  const lines = [
    "# Windows PowerShell (推荐):",
    `$env:FEISHU_APP_SECRET="<App Secret>"; $env:CHAT_ACTION_LOCAL_AUTH_TOKEN=${quoteCommandArg(localAuthToken)}; node ${quoteCommandArg(scriptPath)} --app-id ${quoteCommandArg(appId)} --port ${port}`,
    "",
    "# Linux / macOS:",
    `FEISHU_APP_SECRET="<App Secret>" CHAT_ACTION_LOCAL_AUTH_TOKEN=${quoteCommandArg(localAuthToken)} node ${quoteCommandArg(scriptPath)} --app-id ${quoteCommandArg(appId)} --port ${port}`,
    "",
    "# 说明：App Secret 只从环境变量读取；不要把它追加为命令行参数。",
  ].join("\n");
  return lines;
}

async function waitForGatewayHealth(settings: ChatActionRuntimeSettings): Promise<boolean> {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await checkFeishuLocalGatewayHealth(settings)) return true;
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }
  return false;
}

export async function startFeishuLocalGatewayProcess(
  plugin: any,
  settings: ChatActionRuntimeSettings,
): Promise<GatewayProcessResult> {
  if (await checkFeishuLocalGatewayHealth(settings)) {
    return { ok: true, message: "本地飞书网关已运行。" };
  }
  if (gatewayChild) {
    return { ok: true, message: "本地飞书网关正在启动。" };
  }

  const req = getNodeRequire();
  if (!req) {
    return { ok: false, message: "当前环境不支持自动启动本地网关，请复制手动启动命令到终端运行。" };
  }

  const scriptPath = resolveGatewayScriptPath(req, plugin);
  if (!scriptPath) {
    return { ok: false, message: "本地飞书网关脚本缺失，请重新安装插件或检查发布包是否完整。" };
  }

  const path = req("node:path");
  const childProcess = req("node:child_process");
  const processModule = req("node:process");
  const args = [
    scriptPath,
    "--app-id",
    settings.feishu.appId,
    "--port",
    String(settings.localGateway.port),
  ];

  const child = childProcess.spawn("node", args, {
    cwd: path.dirname(scriptPath),
    stdio: "ignore",
    windowsHide: true,
    env: {
      ...processModule.env,
      FEISHU_APP_SECRET: settings.feishu.appSecret,
      CHAT_ACTION_LOCAL_AUTH_TOKEN: settings.localGateway.localAuthToken,
    },
  });
  gatewayChild = child;
  child.on("exit", () => {
    if (gatewayChild === child) {
      gatewayChild = null;
    }
  });

  const spawnResult = await new Promise<GatewayProcessResult>((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: true, message: "本地飞书网关已启动，正在等待连接。" });
    }, 500);
    child.once("error", (error: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      gatewayChild = null;
      resolve({ ok: false, message: "本地飞书网关启动失败。", detail: error.message });
    });
  });
  if (!spawnResult.ok) return spawnResult;

  const healthy = await waitForGatewayHealth(settings);
  if (!healthy) {
    return { ok: false, message: "本地飞书网关启动后未通过健康检查，请确认飞书后台配置和本地网关脚本完整。" };
  }
  return { ok: true, message: "本地飞书网关已启动。" };
}

export function stopFeishuLocalGatewayProcess(): void {
  const child = gatewayChild;
  gatewayChild = null;
  if (!child) return;
  try {
    child.kill();
  } catch {
    // Best-effort cleanup only.
  }
}
