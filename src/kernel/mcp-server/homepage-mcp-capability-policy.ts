import type { NativeTool } from "../../features/kb/services/agent-core/tools/native-tool";
import type { NativeToolRegistry } from "../../features/kb/services/agent-core/tools/native-tool-registry";
import type { HomepageMcpCapabilityEffects, HomepageMcpJsonSchema } from "./homepage-mcp-types";
import { getHomepageMcpWriteOperation, HOMEPAGE_MCP_WRITES_BY_TOOL } from "../../features/agent-platform/mcp-server/homepage-mcp-write-preview";

const databaseIdSchema = { type: "string", pattern: "^\\d{14}-[a-z0-9]{7}$" };
const databaseFieldNameSchema = { type: "string", minLength: 1, maxLength: 50, not: { pattern: "^\\s|\\s$" } };
// 自定义 Zod refine 不会转成 JSON Schema；外部约束必须明确声明，handler 仍执行 Zod 校验。
const databaseUpdateArgsSchema: HomepageMcpJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["databaseId", "rowId", "keyId", "valueText", "expectedFieldName"],
  properties: {
    databaseId: databaseIdSchema, rowId: databaseIdSchema, keyId: databaseIdSchema,
    valueText: { type: "string", minLength: 1, maxLength: 1000, pattern: "\\S" },
    expectedFieldName: databaseFieldNameSchema,
  },
};
const databaseClearArgsSchema: HomepageMcpJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["databaseId", "rowId", "keyId", "expectedFieldName"],
  properties: {
    databaseId: databaseIdSchema, rowId: databaseIdSchema, keyId: databaseIdSchema,
    expectedFieldName: databaseFieldNameSchema,
  },
};
const databaseDetachedAddArgsSchema: HomepageMcpJsonSchema = {
  type: "object", additionalProperties: false, required: ["databaseId", "detachedRows"],
  properties: {
    databaseId: databaseIdSchema,
    detachedRows: {
      type: "array", minItems: 1, maxItems: 1,
      items: {
        type: "object", additionalProperties: false, required: ["title"],
        properties: {
          // 使用 JS 与宿主 Go regexp 均支持的十六进制转义。
          title: { type: "string", minLength: 1, maxLength: 200, not: { pattern: "^\\s|\\s$|[\\x00-\\x1f\\x7f-\\x9f]" } },
        },
      },
    },
  },
};
const databaseAddArgsSchema: HomepageMcpJsonSchema = {
  type: "object",
  oneOf: [databaseDetachedAddArgsSchema, {
    type: "object", additionalProperties: false, required: ["databaseId", "blockIds"],
    properties: {
      databaseId: databaseIdSchema,
      blockIds: { type: "array", minItems: 1, maxItems: 1, items: databaseIdSchema },
    },
  }],
};
const databaseWriteArgsSchemas: Record<string, HomepageMcpJsonSchema> = {
  update_cell: databaseUpdateArgsSchema, clear_cell: databaseClearArgsSchema, add_rows: databaseAddArgsSchema,
  remove_rows: {
    type: "object", additionalProperties: false, required: ["databaseId", "rowIds", "expectedTitles"],
    properties: {
      databaseId: databaseIdSchema,
      rowIds: { type: "array", minItems: 1, maxItems: 1, items: databaseIdSchema },
      expectedTitles: { type: "array", minItems: 1, maxItems: 1, items: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S" } },
    },
  },
};

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
    "homepage_quick_note.status",
    "homepage_focus.stats",
    "homepage_accounting.overview",
    "homepage_accounting.query_records",
    "homepage_accounting.summary",
    "homepage_accounting.list_accounts",
    "homepage_accounting.category_report",
    "homepage_fixed_assets.list",
    "homepage_fixed_assets.get",
    "homepage_fixed_assets.cost_summary",
    "homepage_anniversary.list",
    "homepage_anniversary.get",
    "homepage_anniversary.list_categories",
    "homepage_favorites.list",
    "homepage_favorites.list_groups",
    "homepage_review.list",
    "homepage_review.summary",
  ],
} as const;

export function isHomepageMcpWriteAction(name: string, action: string): boolean {
  return getHomepageMcpWriteOperation(name, action) !== undefined;
}

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
  actionEffects: Record<string, HomepageMcpCapabilityEffects>;
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
  actions: Array<{ name: string; argsSchema: HomepageMcpJsonSchema; readOnly: boolean }>,
  toolName: string,
): HomepageMcpJsonSchema {
  return {
    type: "object",
    oneOf: actions.map(({ name, argsSchema, readOnly }) => ({
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", const: name },
        args: argsSchema,
        ...(!readOnly ? { confirmationId: { type: "string", pattern: "^[a-f0-9]{64}$" } } : {}),
      },
      required: toolName === "siyuan_database" && !readOnly ? ["action", "args"] : ["action"],
    })),
  };
}

/**
 * 从共享 NativeTool Registry 生成默认只读、精确授权写入的 MCP Schema。
 * 任一正式 allowlist action 缺失/读写元数据不符/无边界 Schema 都使本轮注册失败。
 */
export function buildHomepageMcpCapabilityPolicies(
  registry: NativeToolRegistry,
  allowWrite = false,
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
      readOnly: boolean;
    }> = [];
    const actions: string[] = [...HOMEPAGE_MCP_CAPABILITY_POLICY[name]];
    if (allowWrite && Object.prototype.hasOwnProperty.call(HOMEPAGE_MCP_WRITES_BY_TOOL, name)) actions.push(...Object.keys(HOMEPAGE_MCP_WRITES_BY_TOOL[name]));
    for (const action of actions) {
      const metadata = help[action];
      if (!metadata) {
        issues.push(`${name}.${action}: action_missing`);
        continue;
      }
      const readOnly = !isHomepageMcpWriteAction(name, action);
      if (metadata.readOnly !== readOnly) {
        issues.push(`${name}.${action}: ${readOnly ? "read_only_required" : "write_required"}`);
        continue;
      }
      if (!isBoundedObjectSchema(metadata.argsSchema)) {
        issues.push(`${name}.${action}: bounded_args_schema_required`);
        continue;
      }
      const argsSchema = name === "siyuan_database" && isHomepageMcpWriteAction(name, action)
        ? databaseWriteArgsSchemas[action] : metadata.argsSchema;
      if (!argsSchema) {
        issues.push(`${name}.${action}: external_args_schema_required`);
        continue;
      }
      validActions.push({ name: action, argsSchema, readOnly });
    }

    if (validActions.length === 0) {
      issues.push(`${name}: no_valid_actions`);
      continue;
    }
    policies.push({
      name,
      tool,
      actions: validActions.map((item) => item.name),
      inputSchema: buildInputSchema(validActions, name),
      actionEffects: Object.fromEntries(
        validActions.map((item) => [item.name, item.readOnly ? { localRead: true } : { localWrite: true }]),
      ),
    });
  }

  if (issues.length > 0) throw new HomepageMcpPolicyError(issues);
  return policies;
}

export function isHomepageMcpActionAllowed(
  name: string,
  action: string,
  allowWrite = false,
): boolean {
  if (allowWrite && isHomepageMcpWriteAction(name, action)) return true;
  const actions =
    HOMEPAGE_MCP_CAPABILITY_POLICY[name as HomepageMcpCapabilityName];
  return actions?.some((candidate) => candidate === action) === true;
}
