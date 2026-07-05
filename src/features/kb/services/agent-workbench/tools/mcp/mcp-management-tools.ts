import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import { z } from "zod";
import type { McpSettings, RuntimeToolsSettings } from "../../../../types/settings";
import type { ToolContract, ToolResult } from "../../contracts/tool-contract";
import type { McpServerConfig, McpToolIndexEntry } from "../../mcp/mcp-types";
import {
  deleteMcpServer,
  loadMcpServers,
  normalizeMcpServerConfig,
  upsertMcpServer,
} from "../../mcp/mcp-config-store";
import { loadMcpToolIndex, MCP_TOOL_INDEX_PATH, removeStaleServerTools } from "../../mcp/mcp-tool-index";
import { callMcpTool, syncMcpServerTools, diagnoseStdioCommand } from "../../mcp/mcp-client-manager";
import { normalizeMcpResultContent, redactMcpSyncError } from "../../mcp/mcp-result-normalizer";
import { MCP_SERVER_PRESETS, findKnownBadPackage } from "../../mcp/mcp-presets";
import { isDangerousCommand } from "../../mcp/mcp-safety";
import { getNotebrainRuntimeEnvironment } from "../../workspace/notebrain-runtime-env";

const serverConfigSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  transport: z.enum(["stdio", "http", "sse"]),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  trusted: z.boolean().optional(),
  auth: z.object({
    type: z.enum(["none", "bearer", "apiKey", "customHeaders", "oauth2"]).optional().default("none"),
    bearerToken: z.string().optional(),
    apiKey: z.string().optional(),
    apiKeyHeaderName: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    oauth: z.object({
      clientId: z.string().optional(),
      authorizationEndpoint: z.string().optional(),
      tokenEndpoint: z.string().optional(),
      scopes: z.array(z.string()).optional(),
      accessToken: z.string().optional(),
      refreshToken: z.string().optional(),
      expiresAt: z.number().optional(),
    }).optional(),
  }).optional(),
});

const saveServerInputSchema = z.object({
  server: serverConfigSchema,
}).strict();
const deleteServerInputSchema = z.object({
  serverId: z.string().min(1).describe("要删除的 MCP Server ID"),
}).strict();
const syncToolsInputSchema = z.object({
  serverId: z.string().min(1).optional(),
}).strict();
const listToolsInputSchema = z.object({
  serverId: z.string().min(1).optional(),
  query: z.string().optional(),
  limit: z.number().int().positive().optional(),
}).strict();
const readToolInputSchema = z.object({
  name: z.string().min(1).describe("内部工具名，例如 mcp__server__tool。"),
}).strict();
const callToolInputSchema = z.object({
  serverId: z.string().min(1),
  toolName: z.string().min(1).describe("MCP 工具名，可用内部名或原始名。"),
  args: z.record(z.string(), z.unknown()),
}).strict();
const emptyInputSchema = z.object({}).strict();

function mcpEnabled(settings: McpSettings) {
  return settings.enabled === true;
}

/**
 * Redact sensitive arguments in a command-line args array for ToolResult display.
 * Handles paired flags (--token xxx), KEY=VALUE, and enc:v1.
 */
function redactMcpArgsPreview(args: string[]): string[] {
  const sensitiveFlags = new Set([
    "--token", "--api-key", "--apikey", "--key", "--secret", "--password",
    "-t", "-k",
  ]);
  const result: string[] = [];
  let nextRedacted = false;
  for (const arg of args) {
    if (nextRedacted) {
      result.push("***");
      nextRedacted = false;
      continue;
    }
    const lower = arg.toLowerCase();
    if (sensitiveFlags.has(lower)) {
      result.push(arg);
      nextRedacted = true;
      continue;
    }
    const eqIdx = arg.indexOf("=");
    if (eqIdx > 0) {
      const key = arg.slice(0, eqIdx);
      if (/key|token|secret|password|authorization|access_token|refresh_token|client_secret|accessToken|refreshToken|clientSecret/i.test(key)) {
        result.push(`${key}=***`);
        continue;
      }
    }
    if (/^enc:v1:/i.test(arg)) {
      result.push("enc:v1:***");
      continue;
    }
    result.push(arg);
  }
  return result;
}

/**
 * Sanitize a server config for ToolResult — removes all secrets.
 * Returns only metadata + existence flags, never plaintext tokens or enc:v1.
 */
function sanitizeMcpServerForToolResult(server: McpServerConfig): Record<string, unknown> {
  const auth = server.auth;
  const result: Record<string, unknown> = {
    id: server.id,
    title: server.title,
    enabled: server.enabled,
    transport: server.transport,
    timeoutMs: server.timeoutMs,
    trusted: server.trusted,
    ...(server.url ? { url: server.url } : {}),
    ...(server.command ? { command: server.command } : {}),
    ...(server.args ? {
      argsCount: server.args.length,
      argsPreview: redactMcpArgsPreview(server.args).slice(0, 10),
    } : {}),
  };
  if (auth) {
    result.auth = {
      type: auth.type,
      hasBearerToken: !!auth.bearerToken,
      hasApiKey: !!auth.apiKey,
      headerKeys: auth.headers ? Object.keys(auth.headers) : [],
      hasOauth: !!auth.oauth,
      hasOauthAccessToken: !!auth.oauth?.accessToken,
      hasOauthRefreshToken: !!auth.oauth?.refreshToken,
    };
  }
  if (server.env) {
    result.envKeys = Object.keys(server.env);
  }
  return result;
}

function validateMcpServerSafety(rawServer: unknown): { ok: true } | { ok: false; error: { code: string; message: string; hint: string } } {
  const normalized = normalizeMcpServerConfig(rawServer);
  if (!normalized) return { ok: true };
  if (normalized.transport === "stdio" && normalized.command) {
    const danger = isDangerousCommand(normalized.command, normalized.args || []);
    if (danger.hardDeny) {
      return {
        ok: false,
        error: {
          code: "high_risk_command_blocked",
          message: `MCP Server 命令被安全策略拒绝，不会保存配置：${danger.reasons.join("；")}。`,
          hint: "请使用已知安全的 MCP Server 预设（mcp_manage.list_presets）或移除危险命令/参数。",
        },
      };
    }
  }
  return { ok: true };
}

function compileMcpArgsValidator(schema: unknown): ValidateFunction | null {
  try {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const candidate = schema && typeof schema === "object"
      ? schema as Record<string, unknown>
      : { type: "object", properties: {}, additionalProperties: true };
    return ajv.compile(candidate);
  } catch {
    return null;
  }
}

function ajvErrorsToMessage(errors: ErrorObject[] | null | undefined): string {
  if (!Array.isArray(errors) || errors.length === 0) return "参数校验失败。";
  return errors.slice(0, 5)
    .map((err) => `${err.instancePath || "/"} ${err.message || ""}`.trim())
    .join("; ");
}

function findCallableMcpTool(params: {
  tools: readonly McpToolIndexEntry[];
  serverId: string;
  toolName: string;
  settings: McpSettings;
}): McpToolIndexEntry | null {
  const disabledTools = new Set(params.settings.disabledToolNames ?? []);
  return params.tools.find((tool) =>
    tool.serverId === params.serverId &&
    tool.enabled !== false &&
    !disabledTools.has(tool.internalName) &&
    !disabledTools.has(tool.originalName) &&
    (tool.internalName === params.toolName || tool.originalName === params.toolName)
  ) ?? null;
}

export function createListServersActionTool(settings: McpSettings): ToolContract {
  return {
    name: "list_servers_action",
    title: "列出 MCP Server（action）",
    description: "mcp_manage.list_servers 聚合 action 的内部执行契约。不单独对 provider 暴露。",
    inputSchema: emptyInputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "mcp",
    providerVisible: false,
    availability() {
      return mcpEnabled(settings) ? { available: true } : {
        available: false,
        reasonCode: "permission_denied",
        hint: "MCP Client 未启用。",
      };
    },
    async execute(): Promise<ToolResult> {
      const file = await loadMcpServers();
      const servers = file.servers.map(sanitizeMcpServerForToolResult);
      return { ok: true, data: { total: servers.length, servers } };
    },
  };
}

export function createSaveServerActionTool(settings: McpSettings): ToolContract<z.infer<typeof saveServerInputSchema>> {
  return {
    name: "save_server_action",
    title: "保存 MCP Server 配置（action）",
    description: "mcp_manage.save_server 聚合 action 的内部执行契约。不单独对 provider 暴露。",
    inputSchema: saveServerInputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, permissionScope: "notebrain.mcp" },
    source: "mcp",
    providerVisible: false,
    validateInputForPreview(rawArgs) {
      const parsed = saveServerInputSchema.safeParse(rawArgs);
      if (!parsed.success) return { ok: true };
      const safety = validateMcpServerSafety(parsed.data.server);
      if (safety.ok === false) {
        return {
          ok: false,
          error: {
            message: safety.error.message,
            details: { code: safety.error.code, hint: safety.error.hint },
          },
        };
      }
      return { ok: true };
    },
    availability() {
      return mcpEnabled(settings) ? { available: true } : {
        available: false,
        reasonCode: "permission_denied",
        hint: "MCP Client 未启用。",
      };
    },
    async execute(_ctx, args): Promise<ToolResult> {
      const safety = validateMcpServerSafety(args.server);
      if (safety.ok === false) {
        return {
          ok: false,
          data: null,
          error: {
            code: safety.error.code,
            message: safety.error.message,
            recoverable: true,
            hint: safety.error.hint,
          },
        };
      }
      const normalized = normalizeMcpServerConfig(args.server);
      if (!normalized) {
        return {
          ok: false,
          data: null,
          error: { code: "invalid_mcp_server", message: "MCP Server 配置不完整。", recoverable: true },
        };
      }
      // Lightweight validation: detect common AI mistakes with node/npx
      if (normalized.transport === "stdio" && normalized.command) {
        const cmd = normalized.command.toLowerCase().replace(/\.(cmd|exe|bat)$/i, "");
        const argsList = normalized.args ?? [];
        // If command is "node" but args look like npx usage (e.g. -y, @scope/pkg)
        if (cmd === "node" || cmd.endsWith("\\node") || cmd.endsWith("/node")) {
          const looksLikeNpx = argsList.some((a) =>
            a === "-y" || a === "--yes" || a.startsWith("@") || a.includes("mcp-server")
          );
          if (looksLikeNpx) {
            return {
              ok: false,
              data: null,
              error: {
                code: "mcp_command_mismatch",
                message: "command 设置为 node，但参数看起来像是 npx 的用法（包含 -y 或 @scope/... 包名）。请将 command 改为 npx 或 npx.cmd 而不是 node。",
                recoverable: true,
              },
            };
          }
        }
        // Check for known-bad / non-existent npm packages
        const badPkg = findKnownBadPackage(argsList);
        if (badPkg) {
          return {
            ok: false,
            data: null,
            error: {
              code: "mcp_bad_package",
              message: `包 "${badPkg}" 不是已知的 MCP npm 包，可能不存在。已知可用的 MCP 包：@modelcontextprotocol/server-filesystem。请使用 mcp_manage.list_presets 查看可用预设。`,
              recoverable: true,
            },
          };
        }
        // Warn: serverId=fetch but args point to filesystem
        const argsJoined = argsList.join(" ").toLowerCase();
        if (normalized.id === "fetch" && argsJoined.includes("server-filesystem")) {
          return {
            ok: false,
            data: null,
            error: {
              code: "mcp_id_mismatch",
              message: "serverId 设置为 fetch，但参数指向 server-filesystem。请将 serverId 改为 filesystem。",
              recoverable: true,
            },
          };
        }
      }
      const file = await upsertMcpServer(normalized);
      return { ok: true, data: { server: sanitizeMcpServerForToolResult(normalized), total: file.servers.length } };
    },
  };
}

export function createDeleteServerActionTool(settings: McpSettings): ToolContract<z.infer<typeof deleteServerInputSchema>> {
  return {
    name: "delete_server_action",
    title: "删除 MCP Server（action）",
    description: "mcp_manage.delete_server 聚合 action 的内部执行契约。不单独对 provider 暴露。",
    inputSchema: deleteServerInputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, permissionScope: "notebrain.mcp" },
    source: "mcp",
    providerVisible: false,
    availability() {
      return mcpEnabled(settings) ? { available: true } : {
        available: false,
        reasonCode: "permission_denied",
        hint: "MCP Client 未启用。",
      };
    },
    async execute(_ctx, args): Promise<ToolResult> {
      const current = await loadMcpServers();
      const serverToDelete = current.servers.find((s) => s.id === args.serverId);
      if (!serverToDelete) {
        return {
          ok: false,
          data: null,
          error: { code: "mcp_server_not_found", message: `MCP Server "${args.serverId}" 不存在。`, recoverable: true },
        };
      }
      const file = await deleteMcpServer(args.serverId);
      return {
        ok: true,
        data: {
          serverId: args.serverId,
          deleted: true,
          total: file.servers.length,
          title: serverToDelete.title,
          transport: serverToDelete.transport,
        },
      };
    },
  };
}

function classifyMcpSyncError(err: unknown): {
  error: string;
  code?: string;
  exitCode?: number;
  errorKind?: string;
  shortMessage: string;
} {
  const raw = err instanceof Error ? err.message : String(err);
  const error = redactMcpSyncError(raw);
  const errWithCode = err instanceof Error ? (err as { code?: unknown }) : undefined;
  const code = typeof errWithCode?.code === "string" ? errWithCode.code : undefined;

  let exitCode: number | undefined;
  const exitMatch = raw.match(/\b(?:exit\s*code|code)\s*[=:]?\s*(\d{1,3})\b/i);
  if (exitMatch) {
    const n = Number(exitMatch[1]);
    if (n >= 0 && n <= 255) exitCode = n;
  }

  let errorKind: string | undefined;
  let shortMessage: string;
  if (/MODULE_NOT_FOUND/.test(raw)) {
    errorKind = "MODULE_NOT_FOUND";
    shortMessage = "MCP stdio 进程找不到入口文件或依赖模块。";
  } else if (/ENOENT/.test(raw)) {
    errorKind = "ENOENT";
    shortMessage = "MCP stdio 命令不存在或无法访问。";
  } else if (/EACCES/.test(raw)) {
    errorKind = "EACCES";
    shortMessage = "MCP stdio 命令无执行权限。";
  } else if (exitCode !== undefined && exitCode !== 0) {
    errorKind = "PROCESS_EXITED";
    shortMessage = `MCP stdio 进程退出，exitCode=${exitCode}。`;
  } else {
    errorKind = "SYNC_FAILED";
    shortMessage = "MCP 工具同步失败。";
  }

  return { error, code, exitCode, errorKind, shortMessage };
}

export function createSyncToolsActionTool(settings: McpSettings, runtimeTools?: RuntimeToolsSettings): ToolContract<z.infer<typeof syncToolsInputSchema>> {
  return {
    name: "sync_tools_action",
    title: "同步 MCP 工具（action）",
    description: "mcp_manage.sync_tools 聚合 action 的内部执行契约。不单独对 provider 暴露。",
    inputSchema: syncToolsInputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, permissionScope: "notebrain.mcp" },
    source: "mcp",
    providerVisible: false,
    availability() {
      return mcpEnabled(settings) ? { available: true } : {
        available: false,
        reasonCode: "permission_denied",
        hint: "MCP Client 未启用。",
      };
    },
    async execute(_ctx, args): Promise<ToolResult> {
      const file = await loadMcpServers();
      const disabledServers = new Set(settings.disabledServerIds ?? []);
      const servers = file.servers
        .filter((server) => server.enabled !== false)
        .filter((server) => !disabledServers.has(server.id))
        .filter((server) => !args.serverId || server.id === args.serverId);
      if (servers.length === 0) {
        return {
          ok: false,
          data: null,
          error: { code: "mcp_server_not_found", message: "没有可同步的 MCP Server。", recoverable: true },
        };
      }
      const results: Array<{
        serverId: string;
        synced: number;
        indexUpdatedAt: number;
        cwdInfo?: { cwd: string; notebrainRoot: string; allowedDirHint: string };
      }> = [];
      const errors: Array<{
        serverId: string;
        error: string;
        shortMessage?: string;
        code?: string;
        exitCode?: number;
        errorKind?: string;
        recoverable?: boolean;
        [key: string]: unknown;
      }> = [];
      const env = getNotebrainRuntimeEnvironment();
      for (const server of servers) {
        // Pre-check stdio command availability
        if (server.transport === "stdio" && server.command) {
          if (!env.isPcElectron) {
            errors.push({
              serverId: server.id,
              error: "MCP stdio Server 仅支持 PC/Electron 环境，当前环境不能启动本地进程。请改用 HTTP/SSE MCP Server 或在 PC 桌面端执行。",
              shortMessage: "当前环境不支持 MCP stdio。",
              code: "pc_electron_required",
              recoverable: true,
              environment: env.platformLabel,
              platformLabel: env.platformLabel,
              reasonCode: env.reasonCode,
              aiHint: env.aiHint,
              userHint: env.userHint,
              unsupportedCapabilities: env.unsupportedCapabilities,
            });
            continue;
          }
          const diag = diagnoseStdioCommand(server.command, runtimeTools);
          if (diag) {
            errors.push({ serverId: server.id, ...classifyMcpSyncError(new Error(diag)) });
            continue;
          }
        }
        try {
          results.push(await syncMcpServerTools(server, runtimeTools));
        } catch (err) {
          errors.push({ serverId: server.id, ...classifyMcpSyncError(err) });
        }
      }
      // After syncing, auto-clean stale tool index entries.
      // Must use ALL enabled servers (not just the ones matching serverId filter)
      // to avoid accidentally deleting tools from other still-enabled servers.
      try {
        const allServers = await loadMcpServers();
        const activeIds = new Set(
          allServers.servers
            .filter((s) => s.enabled !== false)
            .map((s) => s.id),
        );
        await removeStaleServerTools(activeIds);
      } catch {
        // Best-effort cleanup — not fatal
      }
      if (results.length === 0 && errors.length > 0) {
        return {
          ok: false,
          data: { errors },
          error: {
            code: "mcp_sync_failed",
            message: errors.map((e) => `[${e.serverId}] ${e.shortMessage ?? e.error}`).join("\n"),
            recoverable: true,
          },
        };
      }
      return {
        ok: true,
        data: {
          indexPath: MCP_TOOL_INDEX_PATH,
          results: results.map((result) => ({
            serverId: result.serverId,
            synced: result.synced,
            indexUpdatedAt: result.indexUpdatedAt,
            ...(result.cwdInfo ? { cwdInfo: result.cwdInfo } : {}),
          })),
          ...(errors.length > 0 ? { errors } : {}),
        },
      };
    },
  };
}

export function createListToolsActionTool(settings: McpSettings): ToolContract<z.infer<typeof listToolsInputSchema>> {
  return {
    name: "list_tools_action",
    title: "列出 MCP 工具索引（action）",
    description: "mcp_manage.list_tools 聚合 action 的内部执行契约。不单独对 provider 暴露。",
    inputSchema: listToolsInputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "mcp",
    providerVisible: false,
    availability() {
      return mcpEnabled(settings) ? { available: true } : {
        available: false,
        reasonCode: "permission_denied",
        hint: "MCP Client 未启用。",
      };
    },
    async execute(_ctx, args): Promise<ToolResult> {
      const [index, serversFile] = await Promise.all([
        loadMcpToolIndex(),
        loadMcpServers(),
      ]);
      // Only show tools from active enabled servers
      const activeServerIds = new Set(
        serversFile.servers
          .filter((s) => s.enabled !== false)
          .filter((s) => !(settings.disabledServerIds ?? []).includes(s.id))
          .map((s) => s.id),
      );
      // Build server transport map for runtime availability
      const serverTransportMap = new Map(
        serversFile.servers.map((s) => [s.id, s.transport]),
      );
      const env = getNotebrainRuntimeEnvironment();
      const stdioBlocked = !env.isPcElectron;

      const query = args.query?.trim().toLowerCase() ?? "";
      const limit = Math.min(args.limit ?? 50, 100);
      const disabled = new Set(settings.disabledToolNames ?? []);
      const tools = index.tools
        .filter((tool) => activeServerIds.has(tool.serverId))
        .filter((tool) => !args.serverId || tool.serverId === args.serverId)
        .filter((tool) => !disabled.has(tool.internalName) && !disabled.has(tool.originalName))
        .filter((tool) => !query || [
          tool.internalName,
          tool.originalName,
          tool.title ?? "",
          tool.description ?? "",
          tool.serverId,
        ].join(" ").toLowerCase().includes(query))
        .slice(0, limit)
        .map((tool) => {
          const transport = serverTransportMap.get(tool.serverId) ?? "unknown";
          const isStdioBlocked = transport === "stdio" && stdioBlocked;
          return {
            ...tool,
            ...(isStdioBlocked ? {
              runtimeAvailability: {
                available: false,
                reasonCode: "pc_electron_required",
                environment: env.platformLabel,
                platformLabel: env.platformLabel,
                aiHint: env.aiHint,
                userHint: env.userHint,
                unsupportedCapabilities: env.unsupportedCapabilities,
                hint: "该 MCP stdio 工具只在 PC/Electron 桌面端可用，当前环境不能调用。请改用 HTTP/SSE MCP Server 或在 PC 桌面端执行。",
              },
            } : {}),
          };
        });

      const filteredStdioCount = stdioBlocked
        ? index.tools.filter((t) => activeServerIds.has(t.serverId) && serverTransportMap.get(t.serverId) === "stdio").length
        : 0;

      return {
        ok: true,
        data: {
          total: tools.length,
          tools,
          ...(filteredStdioCount > 0 ? {
            filteredStdioToolCount: filteredStdioCount,
            environmentNote: "当前环境不支持 MCP stdio；stdio Server 的工具已标注 runtimeAvailability。",
          } : {}),
        },
      };
    },
  };
}

export function createReadToolActionTool(settings: McpSettings): ToolContract<z.infer<typeof readToolInputSchema>> {
  return {
    name: "read_tool_action",
    title: "读取 MCP 工具详情（action）",
    description: "mcp_manage.read_tool 聚合 action 的内部执行契约。不单独对 provider 暴露。",
    inputSchema: readToolInputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "mcp",
    providerVisible: false,
    availability() {
      return mcpEnabled(settings) ? { available: true } : {
        available: false,
        reasonCode: "permission_denied",
        hint: "MCP Client 未启用。",
      };
    },
    async execute(_ctx, args): Promise<ToolResult> {
      const [index, serversFile] = await Promise.all([
        loadMcpToolIndex(),
        loadMcpServers(),
      ]);
      const activeServerIds = new Set(
        serversFile.servers
          .filter((s) => s.enabled !== false)
          .filter((s) => !(settings.disabledServerIds ?? []).includes(s.id))
          .map((s) => s.id),
      );
      const disabledTools = new Set(settings.disabledToolNames ?? []);
      const tool = index.tools.find(
        (entry) =>
          (entry.internalName === args.name || entry.originalName === args.name) &&
          activeServerIds.has(entry.serverId) &&
          !disabledTools.has(entry.internalName) &&
          !disabledTools.has(entry.originalName),
      );
      if (!tool) {
        return {
          ok: false,
          data: null,
          error: { code: "mcp_tool_not_found", message: "未找到 MCP 工具。", recoverable: true },
        };
      }
      // Attach runtime availability for stdio tools on non-PC environments
      const env = getNotebrainRuntimeEnvironment();
      const server = serversFile.servers.find((s) => s.id === tool.serverId);
      const isStdioBlocked = server?.transport === "stdio" && !env.isPcElectron;
      return {
        ok: true,
        data: {
          ...tool,
          ...(isStdioBlocked ? {
            runtimeAvailability: {
              available: false,
              reasonCode: "pc_electron_required",
              environment: env.platformLabel,
              platformLabel: env.platformLabel,
              aiHint: env.aiHint,
              userHint: env.userHint,
              unsupportedCapabilities: env.unsupportedCapabilities,
              hint: "该 MCP stdio 工具只在 PC/Electron 桌面端可用，当前环境不能调用。请改用 HTTP/SSE MCP Server 或在 PC 桌面端执行。",
            },
          } : {}),
        },
      };
    },
  };
}

export function createCallToolActionTool(
  settings: McpSettings,
  runtimeTools?: RuntimeToolsSettings,
): ToolContract<z.infer<typeof callToolInputSchema>> {
  return {
    name: "call_tool_action",
    title: "调用 MCP 工具（action）",
    description: "mcp_manage.call_tool 聚合 action 的内部执行契约。不单独对 provider 暴露。",
    inputSchema: callToolInputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, permissionScope: "notebrain.mcp" },
    source: "mcp",
    providerVisible: false,
    availability() {
      return mcpEnabled(settings) ? { available: true } : {
        available: false,
        reasonCode: "permission_denied",
        hint: "MCP Client 未启用。",
      };
    },
    async execute(_ctx, args): Promise<ToolResult> {
      const [serversFile, index] = await Promise.all([
        loadMcpServers(),
        loadMcpToolIndex(),
      ]);
      const disabledServers = new Set(settings.disabledServerIds ?? []);
      const server = serversFile.servers.find(
        (item) =>
          item.id === args.serverId &&
          item.enabled !== false &&
          !disabledServers.has(item.id),
      );
      if (!server) {
        return {
          ok: false,
          data: null,
          error: { code: "mcp_server_not_found", message: "未找到可调用的 MCP Server。", recoverable: true },
        };
      }
      const tool = findCallableMcpTool({
        tools: index.tools,
        serverId: server.id,
        toolName: args.toolName,
        settings,
      });
      if (!tool) {
        return {
          ok: false,
          data: null,
          error: { code: "mcp_tool_not_found", message: "未找到可调用的 MCP 工具。", recoverable: true },
        };
      }
      const env = getNotebrainRuntimeEnvironment();
      if (server.transport === "stdio" && !env.isPcElectron) {
        return {
          ok: false,
          data: null,
          error: {
            code: "pc_electron_required",
            message: "该 MCP stdio 工具只在 PC/Electron 桌面端可用，当前环境不能调用。",
            recoverable: true,
            details: {
              serverId: server.id,
              toolName: tool.originalName,
              environment: env.platformLabel,
              platformLabel: env.platformLabel,
              aiHint: env.aiHint,
              userHint: env.userHint,
              unsupportedCapabilities: env.unsupportedCapabilities,
            },
          },
        };
      }
      const validate = compileMcpArgsValidator(tool.inputSchema);
      if (validate && !validate(args.args)) {
        return {
          ok: false,
          data: null,
          error: {
            code: "invalid_args",
            message: "MCP 工具参数不符合 inputSchema。",
            recoverable: true,
            details: {
              serverId: server.id,
              toolName: tool.originalName,
              message: ajvErrorsToMessage(validate.errors),
            },
          },
        };
      }
      try {
        const result = await callMcpTool({
          server,
          tool,
          args: args.args,
        }, runtimeTools);
        const normalized = normalizeMcpResultContent(result);
        let message = normalized.summary;
        const readMediaHint = !normalized.ok && tool.originalName === "read_media_file"
          ? "read_media_file 只适合图片/音频/视频等媒体文件。文本文件请使用 read_text_file。"
          : undefined;
        if (readMediaHint) {
          message = "read_media_file 只适合图片/音频/视频等媒体文件，当前输入不是媒体文件或 MCP 返回了不兼容内容。";
        }
        const data = {
          serverId: server.id,
          toolName: tool.originalName,
          result: normalized.data,
          textPreview: normalized.contentText,
          truncated: normalized.truncated,
          ...(readMediaHint ? { hint: readMediaHint } : {}),
        };
        return normalized.ok
          ? { ok: true, data }
          : {
            ok: false,
            data: null,
            error: {
              code: "mcp_tool_error",
              message,
              recoverable: true,
              details: data,
            },
          };
      } catch (err) {
        const rawMessage = err instanceof Error ? err.message : "MCP 工具调用失败。";
        const message = redactMcpSyncError(rawMessage);
        return {
          ok: false,
          data: null,
          error: { code: "mcp_call_failed", message, recoverable: true },
        };
      }
    },
  };
}

export function createListPresetsActionTool(settings: McpSettings): ToolContract {
  return {
    name: "list_presets_action",
    title: "列出 MCP Server 预设（action）",
    description: "mcp_manage.list_presets 聚合 action 的内部执行契约。不单独对 provider 暴露。",
    inputSchema: emptyInputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "mcp",
    providerVisible: false,
    availability() {
      return mcpEnabled(settings) ? { available: true } : {
        available: false,
        reasonCode: "permission_denied",
        hint: "MCP Client 未启用。",
      };
    },
    async execute(): Promise<ToolResult> {
      const env = getNotebrainRuntimeEnvironment();
      return {
        ok: true,
        data: {
          total: MCP_SERVER_PRESETS.length,
          ...(!env.isPcElectron ? {
            environmentNote: "当前环境不支持 MCP stdio；filesystem 等 stdio 预设只能在 PC/Electron 桌面端使用。",
          } : {}),
          presets: MCP_SERVER_PRESETS.map((preset) => ({
            id: preset.id,
            title: preset.title,
            description: preset.description,
            transport: preset.transport,
            command: preset.command,
            args: preset.args,
            placeholders: preset.placeholders,
            verifiedPackage: preset.verifiedPackage,
            resolvedCwdHint: preset.resolvedCwdHint,
            ...(preset.transport === "stdio" ? {
              runtimeRequirement: "pc_electron_stdio",
              ...(!env.isPcElectron ? {
                runtimeAvailability: {
                  available: false,
                  reasonCode: "pc_electron_required",
                  environment: env.platformLabel,
                  platformLabel: env.platformLabel,
                  aiHint: env.aiHint,
                  userHint: env.userHint,
                  unsupportedCapabilities: env.unsupportedCapabilities,
                  hint: "该预设需要 stdio 传输，仅在 PC/Electron 桌面端可用。当前环境不能启动本地进程，请改用 HTTP/SSE MCP Server 或在 PC 桌面端执行。",
                },
              } : {}),
            } : {}),
          })),
        },
      };
    },
  };
}

export function createCleanupStaleToolsActionTool(settings: McpSettings): ToolContract {
  return {
    name: "cleanup_stale_tools_action",
    title: "清理过时 MCP 工具（action）",
    description: "mcp_manage.cleanup_stale_tools 聚合 action 的内部执行契约。不单独对 provider 暴露。",
    inputSchema: emptyInputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, permissionScope: "notebrain.mcp" },
    source: "mcp",
    providerVisible: false,
    availability() {
      return mcpEnabled(settings) ? { available: true } : {
        available: false,
        reasonCode: "permission_denied",
        hint: "MCP Client 未启用。",
      };
    },
    async execute(): Promise<ToolResult> {
      const serversFile = await loadMcpServers();
      const activeServerIds = new Set(
        serversFile.servers
          .filter((s) => s.enabled !== false)
          .map((s) => s.id),
      );
      const indexBefore = await loadMcpToolIndex();
      const staleBefore = indexBefore.tools.filter((t) => !activeServerIds.has(t.serverId)).length;
      const index = await removeStaleServerTools(activeServerIds);
      return {
        ok: true,
        data: {
          totalAfterCleanup: index.tools.length,
          staleRemoved: staleBefore,
          updatedAt: index.updatedAt,
        },
      };
    },
  };
}
