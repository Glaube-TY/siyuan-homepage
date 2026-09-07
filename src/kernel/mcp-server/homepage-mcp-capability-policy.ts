import type { NativeTool } from "../../features/kb/services/agent-core/tools/native-tool";
import type { NativeToolRegistry } from "../../features/kb/services/agent-core/tools/native-tool-registry";
import type { HomepageMcpJsonSchema } from "./homepage-mcp-types";

/** 对外 MCP 的固定顶层能力与 action 白名单。 */
export const HOMEPAGE_MCP_CAPABILITY_POLICY = {
  siyuan_kb: [
    "search",
    "read_docs",
    "read_evidence",
    "get_doc_info",
    "list_map",
    "list_by_time",
    "outline",
    "refs",
    "extra_search",
  ],
  diary_task: ["overview", "query_tasks", "query_records", "find_docs"],
  siyuan_database: ["list", "read", "find_rows", "extra_read"],
  homepage_components: [
    "quick_note.status",
    "focus.stats",
    "accounting.overview",
    "accounting.query_records",
    "accounting.summary",
    "accounting.list_accounts",
    "accounting.category_report",
    "fixed_assets.list",
    "fixed_assets.get",
    "fixed_assets.cost_summary",
    "anniversary.list",
    "anniversary.get",
    "anniversary.list_categories",
    "favorites.list",
    "favorites.list_groups",
    "review.list",
    "review.summary",
  ],
} as const;

export const HOMEPAGE_MCP_CAPABILITY_NAMES = Object.keys(
  HOMEPAGE_MCP_CAPABILITY_POLICY,
) as Array<keyof typeof HOMEPAGE_MCP_CAPABILITY_POLICY>;

export const EXPECTED_HOMEPAGE_MCP_CAPABILITY_COUNT =
  HOMEPAGE_MCP_CAPABILITY_NAMES.length;

export type HomepageMcpCapabilityName =
  keyof typeof HOMEPAGE_MCP_CAPABILITY_POLICY;

interface AggregateActionHelp {
  argsSchema?: unknown;
  readOnly?: boolean;
}

export interface HomepageMcpCapabilityPolicy {
  name: HomepageMcpCapabilityName;
  tool: NativeTool;
  actions: string[];
  inputSchema: HomepageMcpJsonSchema;
  actionEffects: Record<string, { localRead: true }>;
}

export class HomepageMcpPolicyError extends Error {
  constructor(readonly issues: string[]) {
    super(`主页 MCP 能力策略无效：${issues.join("；")}`);
    this.name = "HomepageMcpPolicyError";
  }
}

/** 只接受真实的 object args schema；禁止用空 schema 放宽边界。 */
function isBoundedObjectSchema(value: unknown): value is HomepageMcpJsonSchema {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const schema = value as Record<string, unknown>;
  if (schema.type !== "object") return false;
  if (
    schema.properties !== undefined &&
    (!schema.properties ||
      typeof schema.properties !== "object" ||
      Array.isArray(schema.properties))
  ) {
    return false;
  }
  if (schema.additionalProperties !== false) return false;
  if (
    schema.required !== undefined &&
    (!Array.isArray(schema.required) ||
      !schema.required.every((item) => typeof item === "string"))
  ) {
    return false;
  }
  return true;
}

function actionHelp(tool: NativeTool): Record<string, AggregateActionHelp> {
  return (tool.aggregateActionHelp ?? {}) as Record<
    string,
    AggregateActionHelp
  >;
}

function buildInputSchema(
  actions: Array<{ name: string; argsSchema: HomepageMcpJsonSchema }>,
): HomepageMcpJsonSchema {
  return {
    type: "object",
    oneOf: actions.map(({ name, argsSchema }) => ({
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", const: name },
        args: argsSchema,
      },
      required: ["action"],
    })),
  };
}

/**
 * 从共享 NativeTool Registry 生成只读 MCP 的过滤后 Schema。
 * 任一正式 allowlist action 缺失/非只读/无边界 Schema 都使本轮注册失败。
 */
export function buildHomepageMcpCapabilityPolicies(
  registry: NativeToolRegistry,
): HomepageMcpCapabilityPolicy[] {
  const policies: HomepageMcpCapabilityPolicy[] = [];
  const issues: string[] = [];

  for (const name of HOMEPAGE_MCP_CAPABILITY_NAMES) {
    const tool = registry.get(name);
    if (!tool) {
      issues.push(`${name}: tool_missing`);
      continue;
    }

    const help = actionHelp(tool);
    const validActions: Array<{
      name: string;
      argsSchema: HomepageMcpJsonSchema;
    }> = [];
    for (const action of HOMEPAGE_MCP_CAPABILITY_POLICY[name]) {
      const metadata = help[action];
      if (!metadata || metadata.readOnly !== true) {
        issues.push(`${name}.${action}: read_only_required`);
        continue;
      }
      if (!isBoundedObjectSchema(metadata.argsSchema)) {
        issues.push(`${name}.${action}: bounded_args_schema_required`);
        continue;
      }
      validActions.push({ name: action, argsSchema: metadata.argsSchema });
    }

    if (validActions.length === 0) {
      issues.push(`${name}: no_valid_actions`);
      continue;
    }
    policies.push({
      name,
      tool,
      actions: validActions.map((item) => item.name),
      inputSchema: buildInputSchema(validActions),
      actionEffects: Object.fromEntries(
        validActions.map((item) => [item.name, { localRead: true }]),
      ),
    });
  }

  if (issues.length > 0) throw new HomepageMcpPolicyError(issues);
  return policies;
}

export function isHomepageMcpActionAllowed(
  name: string,
  action: string,
): boolean {
  const actions =
    HOMEPAGE_MCP_CAPABILITY_POLICY[name as HomepageMcpCapabilityName];
  return actions?.some((candidate) => candidate === action) === true;
}
