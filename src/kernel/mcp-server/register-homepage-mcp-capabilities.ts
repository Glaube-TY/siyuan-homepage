import type { NativeTool } from "../../features/kb/services/agent-core/tools/native-tool";
import type { NativeToolRegistry } from "../../features/kb/services/agent-core/tools/native-tool-registry";
import {
  buildHomepageMcpCapabilityPolicies,
  isHomepageMcpActionAllowed,
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
}

export interface HomepageMcpCallResult {
  ok: boolean;
  data?: unknown;
  summary?: string;
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
    policies = buildHomepageMcpCapabilityPolicies(registry);
  } catch (error) {
    throw new HomepageMcpCapabilityRegistrationError(
      `主页 MCP 能力策略校验失败：${safeErrorSummary(error)}`,
      emptyRegisteredCapabilities(),
    );
  }

  const names: string[] = [];
  const records: HomepageMcpRegisteredCapability[] = [];
  try {
    for (const policy of policies) {
      const config = createCapabilityConfig(policy);
      const record = await agent.registerCapability(
        policy.name,
        config,
        createCapabilityHandler(policy, options),
      );
      if (!record || typeof record !== "object") {
        throw new Error(`${policy.name}: invalid registration record`);
      }
      names.push(policy.name);
      records.push(record);
    }
  } catch (error) {
    const rollback = await unregisterHomepageMcpCapabilities(agent, {
      names,
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
    title: CAPABILITY_TITLES[policy.name],
    description: CAPABILITY_DESCRIPTIONS[policy.name],
    inputSchema: policy.inputSchema,
    effects: { localRead: true },
    actionEffects: policy.actionEffects,
  };
}

function createCapabilityHandler(
  policy: HomepageMcpCapabilityPolicy,
  options: HomepageMcpHandlerOptions,
): HomepageMcpCapabilityHandler {
  return async (input): Promise<HomepageMcpCallResult> => {
    if (!options.isActive()) {
      return failure("mcp_not_active", "主页 MCP 服务当前未启用。");
    }
    if (!(await options.isEntitlementAvailable())) {
      return failure("mcp_entitlement_required", "当前会员状态不允许使用主页 MCP 服务。");
    }
    if (!isPlainRecord(input)) {
      return failure("mcp_invalid_input", "MCP 输入必须是结构化对象。");
    }

    const action = input.action;
    if (typeof action !== "string") {
      return failure("mcp_invalid_input", "MCP 输入缺少合法的 action。");
    }
    if (!isHomepageMcpActionAllowed(policy.name, action)) {
      const metadata = getAggregateActionHelp(policy.tool, action);
      return metadata?.readOnly === false
        ? failure("mcp_write_not_allowed", "对外 MCP 服务仅允许只读 action。")
        : failure("mcp_action_not_allowed", "该 action 不在对外 MCP 只读白名单中。");
    }

    const toolInput = { ...input, action };
    let readOnly = false;
    try {
      readOnly = policy.tool.isReadOnlyCall?.(toolInput) === true;
    } catch {
      readOnly = false;
    }
    if (!readOnly) {
      return failure("mcp_write_not_allowed", "对外 MCP 服务仅允许只读 action。");
    }
    if (!policy.tool.preflightValidate) {
      return failure("mcp_schema_unavailable", "该只读能力缺少可用的参数校验 Schema。");
    }

    try {
      const validation = await policy.tool.preflightValidate(toolInput);
      if (!validation.ok) {
        return failure("mcp_invalid_input", "MCP 输入未通过该只读能力的参数校验。");
      }
    } catch {
      return failure("mcp_invalid_input", "MCP 输入未通过该只读能力的参数校验。");
    }

    try {
      const result = await policy.tool.execute(toolInput, {
        question: "External MCP capability invocation",
        callCounts: {},
      });
      if (!result.ok) {
        return failure(
          normalizeErrorCode(result.errorCode ?? result.code, "mcp_execution_failed"),
          "只读能力执行失败。",
        );
      }
      return {
        ok: true,
        data: sanitizeExternalValue(result.data),
        summary: "读取完成。",
      };
    } catch {
      return failure("mcp_execution_failed", "只读能力执行失败。");
    }
  };
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
