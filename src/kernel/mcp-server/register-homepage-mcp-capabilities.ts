import { loadFavoritesForUI } from "../../features/favorites-manager/favorites-store";
import type { HomepageMcpWriteAccess } from "./homepage-mcp-write-access";
import type { NativeTool } from "../../features/kb/services/agent-core/tools/native-tool";
import type { NativeToolRegistry } from "../../features/kb/services/agent-core/tools/native-tool-registry";
import {
  buildHomepageMcpCapabilityPolicies,
  isHomepageMcpActionAllowed,
  isHomepageMcpWriteAction,
  type HomepageMcpCapabilityPolicy,
} from "./homepage-mcp-capability-policy";
import type {
  HomepageMcpAgent,
  HomepageMcpCapabilityConfig,
  HomepageMcpCapabilityHandler,
  HomepageMcpRegisteredCapability,
} from "./homepage-mcp-types";

export {
  buildHomepageMcpCapabilityPolicies,
  EXPECTED_HOMEPAGE_MCP_CAPABILITY_COUNT,
  HOMEPAGE_MCP_CAPABILITY_NAMES,
  HOMEPAGE_MCP_CAPABILITY_POLICY,
  isHomepageMcpActionAllowed,
  type HomepageMcpCapabilityName,
  type HomepageMcpCapabilityPolicy,
} from "./homepage-mcp-capability-policy";

export interface RegisteredHomepageMcpCapabilities {
  names: string[];
  records: HomepageMcpRegisteredCapability[];
}

export class HomepageMcpCapabilityRegistrationError extends Error {
  constructor(
    message: string,
    readonly registered: RegisteredHomepageMcpCapabilities,
  ) {
    super(message);
    this.name = "HomepageMcpCapabilityRegistrationError";
  }
}

export interface UnregisterHomepageMcpCapabilitiesResult {
  registered: RegisteredHomepageMcpCapabilities;
  errors: Array<{ name: string; error: unknown }>;
  allUnregistered: boolean;
}

export interface HomepageMcpHandlerOptions {
  isActive(): boolean;
  isEntitlementAvailable(): Promise<boolean>;
  writeAccess?: HomepageMcpWriteAccess;
  isWriteActive?(): boolean;
  runWrite?<T>(operation: () => Promise<T>): Promise<T>;
}

export interface HomepageMcpCallResult {
  ok: boolean;
  data?: unknown;
  summary?: string;
  confirmationId?: string;
  sideEffectState?: "unknown";
  error?: { code: string; message: string };
}

const CAPABILITY_TITLES: Record<string, string> = {
  siyuan_kb: "思源知识库只读查询",
  diary_task: "日记任务只读查询",
  siyuan_database: "思源数据库只读查询",
  homepage_components: "主页组件只读查询",
};

const CAPABILITY_DESCRIPTIONS: Record<string, string> = {
  siyuan_kb: "仅读取允许范围内的思源知识库资料、结构和检索结果。",
  diary_task: "仅读取允许范围内的日记、任务和记录信息。",
  siyuan_database: "仅读取允许范围内的思源数据库和条目。",
  homepage_components: "仅读取允许范围内的主页业务组件统计和记录。",
};

const REDACTED_OUTPUT_KEYS = new Set([
  "apikey",
  "authorization",
  "bearer",
  "password",
  "secret",
  "token",
  "license",
  "senderid",
  "path",
  "hpath",
  "filepath",
  "workspacepath",
  "storagepath",
  "absolutepath",
]);

const MAX_OUTPUT_DEPTH = 6;
const MAX_OUTPUT_ITEMS = 100;
const MAX_OUTPUT_KEYS = 80;
const MAX_OUTPUT_STRING_LENGTH = 4_000;

export async function registerHomepageMcpCapabilities(
  agent: HomepageMcpAgent | null | undefined,
  registry: NativeToolRegistry,
  options: HomepageMcpHandlerOptions,
): Promise<RegisteredHomepageMcpCapabilities> {
  if (!agent) throw new Error("siyuan.agent.registerCapability 不可用");

  let policies: HomepageMcpCapabilityPolicy[];
  try {
    policies = buildHomepageMcpCapabilityPolicies(registry, options.writeAccess?.enabled === true);
  } catch (error) {
    throw new HomepageMcpCapabilityRegistrationError(
      `主页 MCP 能力策略校验失败：${safeErrorSummary(error)}`,
      emptyRegisteredCapabilities(),
    );
  }

  const names: string[] = [];
  const records: HomepageMcpRegisteredCapability[] = [];
  let registeringName: string | null = null;
  try {
    for (const policy of policies) {
      const config = createCapabilityConfig(policy);
      registeringName = policy.name;
      const record = await agent.registerCapability(
        policy.name,
        config,
        createCapabilityHandler(policy, options),
      );
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        throw new Error(`${policy.name}: invalid registration record`);
      }
      names.push(policy.name);
      records.push(record);
      registeringName = null;
    }
  } catch (error) {
    // 宿主可能已提交注册但未返回有效响应，失败的最后一次尝试也必须清理。
    const rollback = await unregisterHomepageMcpCapabilities(agent, {
      names: registeringName ? [...names, registeringName] : names,
      records,
    });
    const rollbackMessage = rollback.errors.length > 0
      ? `；回滚失败：${rollback.errors.map(({ name, error: rollbackError }) => `${name}: ${safeErrorSummary(rollbackError)}`).join("；")}`
      : "";
    throw new HomepageMcpCapabilityRegistrationError(
      `主页 MCP 能力注册失败：${safeErrorSummary(error)}${rollbackMessage}`,
      rollback.registered,
    );
  }

  return { names, records };
}

export async function unregisterHomepageMcpCapabilities(
  agent: HomepageMcpAgent | null | undefined,
  registered: RegisteredHomepageMcpCapabilities,
): Promise<UnregisterHomepageMcpCapabilitiesResult> {
  const recordsByName = new Map<string, HomepageMcpRegisteredCapability>();
  registered.names.forEach((name, index) => {
    const record = registered.records[index];
    if (record) recordsByName.set(name, record);
  });

  const remainingNames: string[] = [];
  const errors: Array<{ name: string; error: unknown }> = [];
  for (const name of [...registered.names].reverse()) {
    try {
      if (!agent) throw new Error("siyuan.agent.unregisterCapability 不可用");
      await agent.unregisterCapability(name);
    } catch (error) {
      remainingNames.push(name);
      errors.push({ name, error });
    }
  }

  remainingNames.reverse();
  return {
    registered: {
      names: remainingNames,
      records: remainingNames
        .map((name) => recordsByName.get(name))
        .filter((record): record is HomepageMcpRegisteredCapability => !!record),
    },
    errors,
    allUnregistered: remainingNames.length === 0,
  };
}

function createCapabilityConfig(
  policy: HomepageMcpCapabilityPolicy,
): HomepageMcpCapabilityConfig {
  return {
    title: policy.actionEffects["homepage_favorites.add"]?.localWrite ? "主页组件查询与确认写入" : CAPABILITY_TITLES[policy.name],
    description: policy.actionEffects["homepage_favorites.add"]?.localWrite
      ? "读取主页业务组件数据；收藏新增仅限本次运行授权且经单次用户确认。"
      : CAPABILITY_DESCRIPTIONS[policy.name],
    inputSchema: policy.inputSchema,
    effects: { localRead: true, ...(policy.actionEffects["homepage_favorites.add"]?.localWrite ? { localWrite: true } : {}) },
    actionEffects: policy.actionEffects,
  };
}

function createCapabilityHandler(
  policy: HomepageMcpCapabilityPolicy,
  options: HomepageMcpHandlerOptions,
): HomepageMcpCapabilityHandler {
  const invoke = async (input: Record<string, unknown>): Promise<HomepageMcpCallResult> => {
    if (!options.isActive()) return failure("mcp_not_active", "主页 MCP 服务当前未启用。");
    if (!(await options.isEntitlementAvailable())) {
      return failure("mcp_entitlement_required", "当前会员状态不允许使用主页 MCP 服务。");
    }
    if (!isPlainRecord(input) || Object.keys(input).some((key) => !["action", "args", "confirmationId"].includes(key))) {
      return failure("mcp_invalid_input", "MCP 输入字段无效。");
    }
    const action = input.action;
    if (typeof action !== "string") return failure("mcp_invalid_input", "MCP 输入缺少合法的 action。");
    const write = isHomepageMcpWriteAction(policy.name, action);
    const metadata = getAggregateActionHelp(policy.tool, action);
    if (!policy.actions.includes(action) || !isHomepageMcpActionAllowed(policy.name, action, write)) {
      return metadata?.readOnly === false
        ? failure("mcp_write_not_allowed", "该写操作未获对外 MCP 授权。")
        : failure("mcp_action_not_allowed", "该 action 不在对外 MCP 白名单中。");
    }
    if (metadata?.readOnly !== !write) return failure("mcp_action_not_allowed", "action 安全元数据不一致。");
    if (write && (!options.isWriteActive?.() || !options.writeAccess?.enabled || !options.runWrite)) {
      return failure("mcp_write_not_allowed", "本次运行的 MCP 写入授权未开启。");
    }
    if (input.confirmationId !== undefined && (!write || typeof input.confirmationId !== "string" || !/^[a-f0-9]{64}$/.test(input.confirmationId))) {
      return failure("mcp_invalid_input", "确认 ID 无效。");
    }

    let toolInput: Record<string, unknown>;
    try {
      toolInput = { action, args: input.args === undefined ? {} : input.args };
      if (policy.tool.isReadOnlyCall?.(toolInput) !== !write) {
        return failure("mcp_write_not_allowed", "该调用的实际读写判定与授权不一致。");
      }
      if (!policy.tool.preflightValidate) return failure("mcp_schema_unavailable", "能力缺少严格参数校验。");
      if (!(await policy.tool.preflightValidate(toolInput)).ok) return failure("mcp_invalid_input", "MCP 参数校验失败。");
    } catch {
      return failure("mcp_invalid_input", "MCP 参数校验失败。");
    }

    if (write) {
      // 前面的异步校验期间权限可能已撤销；消费批准前再次检查。
      if (!(await options.isEntitlementAvailable())) return failure("mcp_entitlement_required", "当前会员状态不允许使用主页 MCP 服务。");
      if (!options.isActive() || !options.isWriteActive?.()) return failure("mcp_write_not_allowed", "MCP 写入授权已失效。");
      const args = toolInput.args as Record<string, unknown>;
      if (input.confirmationId === undefined) {
        try {
          const confirmationId = options.writeAccess!.create(policy.name, action, args);
          if (!confirmationId) return failure("mcp_confirmation_queue_full", "待处理写入请求已满或授权已关闭。");
          return { ...failure("mcp_confirmation_required", "请在主页插件设置中确认，然后携带相同参数和确认 ID 重试。"), confirmationId };
        } catch {
          return failure("mcp_confirmation_unavailable", "无法安全创建写入确认。");
        }
      }
      const code = options.writeAccess!.consume(input.confirmationId as string, policy.name, action, args);
      if (code) return { ...failure(code, "确认未批准、已失效、已消费或与当前操作不符。"), confirmationId: input.confirmationId as string };
    }

    try {
      const result = await policy.tool.execute(toolInput, {
        question: "External MCP capability invocation", callCounts: {},
      });
      if (write) {
        if (!result.ok) return uncertainWrite();
        const args = toolInput.args as { docId: string; groupId?: string | null };
        const after = await loadFavoritesForUI();
        const item = after.items.find((row) => row.id === args.docId);
        const data = result.data as { action?: string; result?: { docId?: string } } | undefined;
        if (!item || data?.action !== action || data.result?.docId !== args.docId ||
          (args.groupId !== undefined && (item.favoriteGroupId ?? null) !== (args.groupId?.trim() ?? null))) return uncertainWrite();
      } else if (!result.ok) {
        return failure(normalizeErrorCode(result.errorCode ?? result.code, "mcp_execution_failed"), "只读能力执行失败。");
      }
      return { ok: true, data: sanitizeExternalValue(result.data), summary: write ? "收藏新增并回读确认完成。" : "读取完成。" };
    } catch {
      return write ? uncertainWrite() : failure("mcp_execution_failed", "只读能力执行失败。");
    }
  };
  return (input) => {
    let call: Record<string, unknown>;
    try { call = structuredClone(input); }
    catch { return failure("mcp_invalid_input", "MCP 输入不是可用的结构化数据。"); }
    return isHomepageMcpWriteAction(policy.name, call?.action as string) && options.runWrite
      ? options.runWrite(() => invoke(call))
      : invoke(call);
  };
}

function uncertainWrite(): HomepageMcpCallResult {
  return { ...failure("mcp_write_result_uncertain", "写入结果未能确认，请先回读核对；不得自动重试。"), sideEffectState: "unknown" };
}

function getAggregateActionHelp(
  tool: NativeTool,
  action: string,
): { readOnly?: boolean } | undefined {
  const help = tool.aggregateActionHelp as Record<string, { readOnly?: boolean }> | undefined;
  return help?.[action];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sanitizeExternalValue(value: unknown, depth = 0): unknown {
  if (depth >= MAX_OUTPUT_DEPTH) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.slice(0, MAX_OUTPUT_STRING_LENGTH);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_OUTPUT_ITEMS).map((item) => sanitizeExternalValue(item, depth + 1));
  }
  if (typeof value !== "object") return undefined;

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, MAX_OUTPUT_KEYS)) {
    if (REDACTED_OUTPUT_KEYS.has(key.toLowerCase())) continue;
    output[key] = sanitizeExternalValue(child, depth + 1);
  }
  return output;
}

function failure(code: string, message: string): HomepageMcpCallResult {
  return { ok: false, error: { code, message } };
}

function normalizeErrorCode(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80);
  return normalized || fallback;
}

function emptyRegisteredCapabilities(): RegisteredHomepageMcpCapabilities {
  return { names: [], records: [] };
}

function safeErrorSummary(error: unknown): string {
  const text = String(error instanceof Error ? error.message : error ?? "未知错误")
    .replace(/[\r\n]+/g, " ")
    .trim();
  if (!text) return "未知错误";
  if (/(api[_ -]?key|authorization|bearer|access[_ -]?token|refresh[_ -]?token|password|secret|license)/i.test(text)) {
    return "错误详情包含敏感信息，已隐藏";
  }
  return text.slice(0, 240);
}
