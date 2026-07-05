import { z } from "zod";
import type {
  AggregateActionHelp,
  ToolAvailability,
  ToolContract,
  ToolResult,
  ToolRuntimeContext,
  ToolSafetyInfo,
  ToolSource,
} from "../../contracts/tool-contract";
import type { AggregateToolName } from "./aggregate-tool-metadata";
import { findAggregateToolMeta } from "./aggregate-tool-metadata";
import { OLD_TOOL_TO_AGGREGATE_ACTION } from "./aggregate-tool-migration";

export interface AggregateActionBinding {
  action: string;
  tool: ToolContract;
}

export interface AggregateToolFactoryOptions {
  name: AggregateToolName;
  title: string;
  description: string;
  boundary: string;
  source?: ToolSource;
  actions: AggregateActionBinding[];
}

const aggregateArgsSchema = z.record(z.string(), z.unknown());

function createInputSchema(actions: readonly string[]) {
  const actionTuple = actions as [string, ...string[]];
  return z.object({
    action: z.enum(actionTuple).describe("要执行的 action。"),
    args: aggregateArgsSchema.optional().describe("该 action 的参数对象。具体参数可调用 agent_tool_help.describe_action 查询。"),
  }).strict();
}

function createInputJsonSchema(actions: readonly string[], toolName: string): unknown {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      action: {
        type: "string",
        enum: actions,
        description: "要执行的 action。",
      },
      args: {
        type: "object",
        additionalProperties: true,
        description: `action 参数对象。调用 agent_tool_help.describe_action 获取 ${toolName} 各 action 的参数说明。`,
      },
    },
    required: ["action"],
  };
}

function mergeAvailability(items: readonly AggregateActionBinding[], ctx: ToolRuntimeContext): ToolAvailability {
  if (items.length === 0) return { available: false, reasonCode: "tool_not_registered", hint: "没有可用 action。" };
  const unavailable = items
    .map((item) => item.tool.availability(ctx))
    .filter((availability) => availability.available !== true);
  if (unavailable.length === items.length) {
    return unavailable[0] ?? { available: false, reasonCode: "prerequisite_missing" };
  }
  return { available: true };
}

function buildSafety(actions: readonly AggregateActionBinding[]): ToolSafetyInfo {
  const hasWrite = actions.some((action) => !action.tool.readOnly);
  return hasWrite
    ? { readOnly: false, canWrite: true, requiresConfirmation: true }
    : { readOnly: true };
}

const TOOL_NAME_LEAK_KEYS = new Set(["toolName", "oldToolName", "sourceToolName"]);

function replaceOldToolNameInString(text: string): string {
  let out = text;
  for (const [oldName, mapping] of Object.entries(OLD_TOOL_TO_AGGREGATE_ACTION)) {
    out = out.split(oldName).join(`${mapping.tool}.${mapping.action}`);
  }
  return out;
}

function sanitizeProviderVisibleValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return replaceOldToolNameInString(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeProviderVisibleValue(item));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (TOOL_NAME_LEAK_KEYS.has(key)) continue;
      out[key] = sanitizeProviderVisibleValue(child);
    }
    return out;
  }
  return value;
}

function sanitizeErrorString(value: string | undefined): string | undefined {
  return typeof value === "string" ? replaceOldToolNameInString(value) : value;
}

function resolveActionArgsSchema(contract: ToolContract): unknown | undefined {
  if (contract.inputJsonSchemaOverride !== undefined) return contract.inputJsonSchemaOverride;
  try {
    return z.toJSONSchema(contract.inputSchema as z.ZodType, { io: "input" });
  } catch {
    return undefined;
  }
}

function buildInvalidActionArgsDetails(params: {
  action: string;
  binding: AggregateActionBinding;
  field?: string;
  required?: string[];
  notes?: string[];
}) {
  return {
    action: params.action,
    field: params.field,
    required: params.required,
    notes: params.notes,
    argsSchema: sanitizeProviderVisibleValue(resolveActionArgsSchema(params.binding.tool)),
    inputHint: sanitizeErrorString(params.binding.tool.inputHint),
    boundary: sanitizeErrorString(params.binding.tool.boundary),
  };
}

function buildAggregateActionHelp(
  actions: readonly AggregateActionBinding[],
): Record<string, AggregateActionHelp> {
  const help: Record<string, AggregateActionHelp> = {};
  for (const binding of actions) {
    const contract = binding.tool;
    help[binding.action] = {
      action: binding.action,
      argsSchema: sanitizeProviderVisibleValue(resolveActionArgsSchema(contract)),
      inputHint: sanitizeErrorString(contract.inputHint),
      boundary: sanitizeErrorString(contract.boundary),
      readOnly: contract.readOnly,
      requiresConfirmation: contract.safety.requiresConfirmation ?? !contract.readOnly,
    };
  }
  return help;
}

export function createAggregateTool(options: AggregateToolFactoryOptions): ToolContract {
  const actionNames = options.actions.map((item) => item.action);
  if (actionNames.length === 0) {
    throw new Error(`[createAggregateTool] ${options.name} must have at least one action.`);
  }
  const actionMap = new Map(options.actions.map((item) => [item.action, item]));
  const readOnly = options.actions.every((item) => item.tool.readOnly);
  const meta = findAggregateToolMeta(options.name);

  return {
    name: options.name,
    title: options.title,
    description: options.description,
    inputSchema: createInputSchema(actionNames),
    readOnly,
    safety: buildSafety(options.actions),
    source: options.source ?? "builtin",
    inputHint: `action 必须是：${actionNames.join(" / ")}。args 为该 action 的参数对象；不确定时先调用 agent_tool_help。`,
    boundary: options.boundary,
    providerVisible: true,
    inputJsonSchemaOverride: createInputJsonSchema(actionNames, options.name),
    aggregateActionHelp: buildAggregateActionHelp(options.actions),

    validateInputForPreview(rawArgs: unknown) {
      const parsed = createInputSchema(actionNames).safeParse(rawArgs);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return {
          ok: false,
          error: {
            message: `聚合工具参数校验失败：${issue?.message ?? "格式错误"}`,
            details: { field: issue?.path.join(".") || undefined },
          },
        };
      }
      const binding = actionMap.get(parsed.data.action);
      if (!binding) {
        return {
          ok: false,
          error: {
            message: `未知 action：${parsed.data.action}`,
            details: { action: parsed.data.action },
          },
        };
      }
      const actionArgs = parsed.data.args ?? {};
      const actionParsed = binding.tool.inputSchema.safeParse(actionArgs);
      if (!actionParsed.success) {
        const issue = actionParsed.error.issues[0];
        const actionMeta = meta?.actions.find((item) => item.name === parsed.data.action);
        return {
          ok: false,
          error: {
            code: "invalid_action_args",
            message: `action ${parsed.data.action} 参数校验失败：${issue?.message ?? "格式错误"}`,
            details: buildInvalidActionArgsDetails({
              action: parsed.data.action,
              field: issue?.path.join(".") || undefined,
              required: actionMeta?.required,
              notes: actionMeta?.notes,
              binding,
            }),
          },
        };
      }
      const actionValidation = binding.tool.validateInputForPreview?.(actionArgs);
      if (actionValidation && !actionValidation.ok) {
        return {
          ok: false,
          error: {
            message: actionValidation.error?.message ?? "参数校验失败。",
            details: actionValidation.error?.details,
          },
        };
      }
      return { ok: true };
    },

    availability(ctx) {
      return mergeAvailability(options.actions, ctx);
    },

    async execute(ctx: ToolRuntimeContext, rawArgs: unknown): Promise<ToolResult> {
      const parsed = createInputSchema(actionNames).safeParse(rawArgs);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return {
          ok: false,
          data: null,
          error: {
            code: "invalid_args",
            message: issue?.message ?? "聚合工具参数错误。",
            recoverable: true,
          },
        };
      }

      const binding = actionMap.get(parsed.data.action);
      if (!binding) {
        return {
          ok: false,
          data: null,
          error: {
            code: "unknown_action",
            message: `未知 action：${parsed.data.action}`,
            recoverable: true,
            hint: "请调用 agent_tool_help.list_actions 查看可用 action。",
          },
        };
      }

      const availability = binding.tool.availability(ctx);
      if (availability.available !== true) {
        return {
          ok: false,
          data: null,
          error: {
            code: availability.reasonCode ?? "action_unavailable",
            message: availability.hint ?? "该 action 当前不可用。",
            recoverable: true,
          },
        };
      }

      const actionArgs = parsed.data.args ?? {};
      const actionParsed = binding.tool.inputSchema.safeParse(actionArgs);
      if (!actionParsed.success) {
        const issue = actionParsed.error.issues[0];
        const actionMeta = meta?.actions.find((item) => item.name === parsed.data.action);
        return {
          ok: false,
          data: null,
          error: {
            code: "invalid_action_args",
            message: `action ${parsed.data.action} 参数校验失败：${issue?.message ?? "格式错误"}`,
            field: issue?.path.join(".") || undefined,
            recoverable: true,
            hint: "请调用 agent_tool_help.describe_action，并严格按返回的 argsSchema/examples 传入 args；不要猜字段名。",
            details: buildInvalidActionArgsDetails({
              action: parsed.data.action,
              field: issue?.path.join(".") || undefined,
              required: actionMeta?.required,
              notes: actionMeta?.notes,
              binding,
            }),
          },
        };
      }

      const result = await binding.tool.execute(ctx, actionParsed.data);
      if (!result.ok) {
        return {
          ok: false,
          data: null,
          error: {
            code: result.error?.code ?? "action_failed",
            message: sanitizeErrorString(result.error?.message) ?? `action ${parsed.data.action} 执行失败。`,
            recoverable: result.error?.recoverable,
            field: result.error?.field,
            expected: sanitizeErrorString(result.error?.expected),
            received: sanitizeErrorString(result.error?.received),
            hint: sanitizeErrorString(result.error?.hint),
            details: {
              action: parsed.data.action,
              details: sanitizeProviderVisibleValue(result.error?.details),
            },
          },
        };
      }

      return {
        ok: true,
        data: {
          action: parsed.data.action,
          result: sanitizeProviderVisibleValue(result.data),
        },
      };
    },

    summarizeResult(result: ToolResult): string {
      if (!result.ok) return result.error?.message ?? `${options.title} 执行失败。`;
      const data = result.data as { action?: string; result?: unknown } | null;
      const actionName = data?.action ?? "";
      const actionMeta = meta?.actions.find((item) => item.name === actionName);
      return actionMeta ? `${options.title}.${actionMeta.name} 执行完成。` : `${options.title} 执行完成。`;
    },
  };
}
