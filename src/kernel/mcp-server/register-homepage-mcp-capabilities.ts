import { fingerprintHomepageMcpValue, type HomepageMcpWriteAccess } from "./homepage-mcp-write-access";
import { HomepageMcpFavoritesConflict, prepareHomepageMcpFavoriteWrite, verifyHomepageMcpFavoriteWrite, type PreparedFavoriteWrite } from "./homepage-mcp-favorites-write";
import { HomepageMcpAnniversaryConflict, prepareHomepageMcpAnniversaryWrite, verifyHomepageMcpAnniversaryWrite, type PreparedAnniversaryWrite } from "./homepage-mcp-anniversary-write";
import { prepareHomepageMcpDatabaseWrite, verifyHomepageMcpDatabaseWrite, type PreparedDatabaseWrite } from "./homepage-mcp-database-write";
import { getHomepageMcpWriteOperation, homepageMcpDatabaseUpdateSchema, homepageMcpDatabaseClearSchema, homepageMcpDatabaseDetachedAddSchema, homepageMcpDatabaseBoundAddSchema, isHomepageMcpFavoriteWriteAction, isHomepageMcpAnniversaryWriteAction, type HomepageMcpDatabaseWriteAction, type HomepageMcpFavoriteWriteAction, type HomepageMcpAnniversaryWriteAction } from "../../features/agent-platform/mcp-server/homepage-mcp-write-preview";
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
  const writes = Object.entries(policy.actionEffects).filter(([, effect]) => effect.localWrite)
    .map(([action]) => getHomepageMcpWriteOperation(policy.name, action)!.name);
  return {
    title: writes.length ? (policy.name === "siyuan_database" ? "思源数据库查询与确认写入" : "主页组件查询与确认写入") : CAPABILITY_TITLES[policy.name],
    description: writes.length
      ? `${CAPABILITY_DESCRIPTIONS[policy.name]}${writes.join("、")}仅限本次运行授权且经逐次用户确认。`
      : CAPABILITY_DESCRIPTIONS[policy.name],
    inputSchema: policy.inputSchema,
    effects: { localRead: true, ...(writes.length ? { localWrite: true } : {}) },
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
      if (write && policy.name === "siyuan_database") {
        const schema = action === "add_rows"
          ? isPlainRecord(toolInput.args) && Object.prototype.hasOwnProperty.call(toolInput.args, "blockIds") ? homepageMcpDatabaseBoundAddSchema : homepageMcpDatabaseDetachedAddSchema
          : action === "update_cell" ? homepageMcpDatabaseUpdateSchema : action === "clear_cell" ? homepageMcpDatabaseClearSchema : undefined;
        if (!schema || !isPlainRecord(toolInput.args) || Object.keys(toolInput.args).some((key) => !Object.prototype.hasOwnProperty.call(schema.shape, key))) {
          throw new Error("数据库写入参数含未知字段。");
        }
        schema.parse(toolInput.args);
        if (action === "add_rows" && Array.isArray(toolInput.args.detachedRows) && toolInput.args.detachedRows.some((row) =>
          !isPlainRecord(row) || Object.keys(row).some((key) => key !== "title"))) throw new Error("新增条目含未知字段。");
      }
      if (write) {
        fingerprintHomepageMcpValue(toolInput);
        if (input.confirmationId !== undefined) {
          const code = options.writeAccess!.check(input.confirmationId as string, policy.name, action, toolInput.args as Record<string, unknown>);
          if (code) return failure(code, "确认未批准、已失效、已消费或与当前操作不符。");
        }
      }
      if (policy.tool.isReadOnlyCall?.(toolInput) !== !write) {
        return failure("mcp_write_not_allowed", "该调用的实际读写判定与授权不一致。");
      }
      if (!policy.tool.preflightValidate) return failure("mcp_schema_unavailable", "能力缺少严格参数校验。");
      if (!(await policy.tool.preflightValidate(toolInput)).ok) return failure("mcp_invalid_input", "MCP 参数校验失败。");
    } catch {
      if (write && typeof input.confirmationId === "string") options.writeAccess?.invalidate(input.confirmationId);
      return failure("mcp_invalid_input", "MCP 参数校验失败。");
    }

    let prepared: { domain: "favorites"; value: PreparedFavoriteWrite } | { domain: "anniversary"; value: PreparedAnniversaryWrite }
      | { domain: "database"; value: PreparedDatabaseWrite } | undefined;
    if (write) {
      // 前面的异步校验期间权限可能已撤销；消费批准前再次检查。
      if (!(await options.isEntitlementAvailable())) return failure("mcp_entitlement_required", "当前会员状态不允许使用主页 MCP 服务。");
      if (!options.isActive() || !options.isWriteActive?.()) return failure("mcp_write_not_allowed", "MCP 写入授权已失效。");
      const args = toolInput.args as Record<string, unknown>;
      try {
        if (policy.name === "homepage_components" && isHomepageMcpFavoriteWriteAction(action)) {
          prepared = { domain: "favorites", value: await prepareHomepageMcpFavoriteWrite(action, args) };
        } else if (policy.name === "homepage_components" && isHomepageMcpAnniversaryWriteAction(action)) {
          prepared = { domain: "anniversary", value: await prepareHomepageMcpAnniversaryWrite(action, args) };
        } else if (policy.name === "siyuan_database" && (action === "update_cell" || action === "clear_cell" || action === "add_rows")) {
          prepared = { domain: "database", value: await prepareHomepageMcpDatabaseWrite(action, args) };
        } else return failure("mcp_write_not_allowed", "未知 MCP 写入业务域。");
        if (!(await options.isEntitlementAvailable())) return failure("mcp_entitlement_required", "当前会员状态不允许使用主页 MCP 服务。");
        if (!options.isActive() || !options.isWriteActive?.()) return failure("mcp_write_not_allowed", "MCP 写入授权已失效。");
        if (input.confirmationId === undefined) {
          const confirmationId = options.writeAccess!.create(policy.name, action, args, prepared.value.preview, prepared.value.stateFingerprint);
          if (!confirmationId) return failure("mcp_confirmation_queue_full", "待处理写入请求已满或授权已关闭。");
          return { ...failure("mcp_confirmation_required", "请在主页插件设置中确认，然后携带相同参数和确认 ID 重试。"), confirmationId };
        }
        const code = options.writeAccess!.consume(input.confirmationId as string, policy.name, action, args, prepared.value.stateFingerprint);
        if (code) return failure(code, "确认已失效或业务状态已变化，请重新读取并申请确认。");
      } catch (error) {
        if (typeof input.confirmationId === "string") {
          options.writeAccess!.invalidate(input.confirmationId);
          return failure("mcp_confirmation_state_changed", "业务状态已变化或无法复核，确认已失效，请重新申请。");
        }
        return error instanceof HomepageMcpFavoritesConflict
          ? failure("mcp_favorites_conflict", "收藏版本或成员数量已变化，请重新读取后申请确认。")
          : error instanceof HomepageMcpAnniversaryConflict
            ? failure("mcp_anniversary_conflict", "纪念日版本或更新时间已变化，请重新读取后申请确认。")
            : failure("mcp_confirmation_unavailable", "无法可靠读取业务目标，未生成写入确认。");
      }
    }

    try {
      const result = await policy.tool.execute(toolInput, {
        question: "External MCP capability invocation", callCounts: {},
      });
      if (write) {
        if (!result.ok) {
          const code = normalizeErrorCode(result.errorCode ?? result.code, "mcp_execution_failed");
          return code === "conflict" || code.endsWith("_conflict") || code === "revision_mismatch" || code === "stale_revision"
            ? failure(code, "业务层报告版本冲突，请重新读取后申请确认。") : uncertainWrite();
        }
        const verified = prepared!.domain === "favorites"
          ? await verifyHomepageMcpFavoriteWrite(action as HomepageMcpFavoriteWriteAction, toolInput.args as Record<string, unknown>, prepared!.value as PreparedFavoriteWrite, result.data)
          : prepared!.domain === "anniversary"
            ? await verifyHomepageMcpAnniversaryWrite(action as HomepageMcpAnniversaryWriteAction, toolInput.args as Record<string, unknown>, prepared!.value as PreparedAnniversaryWrite, result.data)
            : await verifyHomepageMcpDatabaseWrite(action as HomepageMcpDatabaseWriteAction, toolInput.args as Record<string, unknown>, prepared!.value as PreparedDatabaseWrite, result.data);
        if (!verified) return uncertainWrite();
      } else if (!result.ok) {
        return failure(normalizeErrorCode(result.errorCode ?? result.code, "mcp_execution_failed"), "只读能力执行失败。");
      }
      return { ok: true, data: sanitizeExternalValue(result.data), summary: write ? "操作并回读确认完成。" : "读取完成。" };
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
