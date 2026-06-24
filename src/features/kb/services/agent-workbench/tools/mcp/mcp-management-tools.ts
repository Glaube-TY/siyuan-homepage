import { z } from "zod";
import type { McpSettings, RuntimeToolsSettings } from "../../../../types/settings";
import type { ToolContract, ToolResult } from "../../contracts/tool-contract";
import {
  loadMcpServers,
  normalizeMcpServerConfig,
  upsertMcpServer,
} from "../../mcp/mcp-config-store";
import { loadMcpToolIndex, MCP_TOOL_INDEX_PATH, removeStaleServerTools } from "../../mcp/mcp-tool-index";
import { syncMcpServerTools, diagnoseStdioCommand } from "../../mcp/mcp-client-manager";
import { MCP_SERVER_PRESETS, findKnownBadPackage } from "../../mcp/mcp-presets";
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
}).strict();

const saveServerInputSchema = z.object({
  server: serverConfigSchema,
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
const emptyInputSchema = z.object({}).strict();

function mcpEnabled(settings: McpSettings) {
  return settings.enabled === true;
}

export function createMcpListServersTool(settings: McpSettings): ToolContract {
  return {
    name: "mcp_list_servers",
    title: "列出 MCP Server",
    description: "列出 Notebrain 已配置的 MCP Server，不连接外部进程。",
    inputSchema: emptyInputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "mcp",
    providerVisible: true,
    availability() {
      return mcpEnabled(settings) ? { available: true } : {
        available: false,
        reasonCode: "permission_denied",
        hint: "MCP Client 未启用。",
      };
    },
    async execute(): Promise<ToolResult> {
      const file = await loadMcpServers();
      return { ok: true, data: { total: file.servers.length, servers: file.servers } };
    },
  };
}

export function createMcpSaveServerTool(settings: McpSettings): ToolContract<z.infer<typeof saveServerInputSchema>> {
  return {
    name: "mcp_save_server",
    title: "保存 MCP Server 配置",
    description: "新增或更新 Notebrain MCP Server 配置，写入 notebrain/mcp/servers.json。保存后还需要 mcp_sync_tools 同步工具。",
    inputSchema: saveServerInputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, permissionScope: "notebrain.mcp" },
    source: "mcp",
    providerVisible: true,
    availability() {
      return mcpEnabled(settings) ? { available: true } : {
        available: false,
        reasonCode: "permission_denied",
        hint: "MCP Client 未启用。",
      };
    },
    async execute(_ctx, args): Promise<ToolResult> {
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
              message: `包 "${badPkg}" 不是已知的 MCP npm 包，可能不存在。已知可用的 MCP 包：@modelcontextprotocol/server-filesystem。请使用 mcp_list_presets 查看可用预设。`,
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
      return { ok: true, data: { server: normalized, total: file.servers.length } };
    },
  };
}

export function createMcpSyncToolsTool(settings: McpSettings, runtimeTools?: RuntimeToolsSettings): ToolContract<z.infer<typeof syncToolsInputSchema>> {
  return {
    name: "mcp_sync_tools",
    title: "同步 MCP 工具",
    description: "连接已配置 MCP Server，调用 tools/list，同步工具索引到 notebrain/mcp/tool-index.json。会访问外部进程或网络，需要确认。",
    inputSchema: syncToolsInputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, permissionScope: "notebrain.mcp" },
    source: "mcp",
    providerVisible: true,
    availability() {
      return mcpEnabled(settings) ? { available: true } : {
        available: false,
        reasonCode: "permission_denied",
        hint: "MCP Client 未启用。",
      };
    },
    async execute(_ctx, args): Promise<ToolResult> {
      const file = await loadMcpServers();
      const servers = file.servers
        .filter((server) => server.enabled !== false)
        .filter((server) => !args.serverId || server.id === args.serverId);
      if (servers.length === 0) {
        return {
          ok: false,
          data: null,
          error: { code: "mcp_server_not_found", message: "没有可同步的 MCP Server。", recoverable: true },
        };
      }
      const results = [];
      const errors = [];
      const env = getNotebrainRuntimeEnvironment();
      for (const server of servers) {
        // Pre-check stdio command availability
        if (server.transport === "stdio" && server.command) {
          if (!env.isPcElectron) {
            errors.push({
              serverId: server.id,
              error: "MCP stdio Server 仅支持 PC/Electron 环境，当前环境不能启动本地进程。请改用 HTTP/SSE MCP Server 或在 PC 桌面端执行。",
              code: "pc_electron_required",
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
            errors.push({ serverId: server.id, error: diag });
            continue;
          }
        }
        try {
          results.push(await syncMcpServerTools(server, runtimeTools));
        } catch (err) {
          const message = err instanceof Error ? err.message : "同步 MCP 工具失败。";
          errors.push({ serverId: server.id, error: message });
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
            message: errors.map((e) => `[${e.serverId}] ${e.error}`).join("\n"),
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

export function createMcpListToolsTool(settings: McpSettings): ToolContract<z.infer<typeof listToolsInputSchema>> {
  return {
    name: "mcp_list_tools",
    title: "列出 MCP 工具索引",
    description: "列出已同步的 MCP 工具索引缓存，不调用外部 MCP Server。",
    inputSchema: listToolsInputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "mcp",
    providerVisible: true,
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

export function createMcpReadToolTool(settings: McpSettings): ToolContract<z.infer<typeof readToolInputSchema>> {
  return {
    name: "mcp_read_tool",
    title: "读取 MCP 工具详情",
    description: "读取某个已同步 MCP 工具的名称、来源和 JSON Schema。",
    inputSchema: readToolInputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "mcp",
    providerVisible: true,
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
          .map((s) => s.id),
      );
      const tool = index.tools.find(
        (entry) =>
          (entry.internalName === args.name || entry.originalName === args.name) &&
          activeServerIds.has(entry.serverId),
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

export function createMcpListPresetsTool(settings: McpSettings): ToolContract {
  return {
    name: "mcp_list_presets",
    title: "列出 MCP Server 预设",
    description: "列出已知可用的 MCP Server 预设配置（如 filesystem）。使用预设中的参数模板调用 mcp_save_server 来创建 server。",
    inputSchema: emptyInputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "mcp",
    providerVisible: true,
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

export function createMcpCleanupStaleToolsTool(settings: McpSettings): ToolContract {
  return {
    name: "mcp_cleanup_stale_tools",
    title: "清理过时 MCP 工具",
    description: "删除不再存在或已禁用的 MCP Server 的旧工具索引条目。不会影响当前有效 server 的工具。通常不需要手动调用——同步时会自动清理。",
    inputSchema: emptyInputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, permissionScope: "notebrain.mcp" },
    source: "mcp",
    providerVisible: true,
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

