/**
 * ToolRegistry — registers, lists, and provides tool manifests.
 * Caches canonicalized JSON Schema at registration time, stable-sorts by name.
 */

import { z } from "zod";
import { pushAgentDebugEvent } from "../debug/workbench-debug";
import type {
  ToolContract,
  ToolManifest,
  ToolRuntimeContext,
  ToolSafetyInfo,
} from "../contracts/tool-contract";

interface RegisteredTool {
  tool: ToolContract;
  /** Registered tool entry, caches computed JSON Schema for provider manifest */
  registeredAt: number;
  /** Cached canonicalized JSON Schema for provider. Computed once at registration. */
  inputJsonSchema?: unknown;
}

export interface ToolRegistryAccess {
  allowsTool(name: string): boolean;
  allowsAction(toolName: string, action: string): boolean;
}

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  constructor(private readonly access?: ToolRegistryAccess) {}

  registerTool(tool: ToolContract): void {
    if (!tool?.name) {
      throw new Error("[ToolRegistry] Tool must have a name.");
    }
    if (this.access && !this.access.allowsTool(tool.name)) return;
    const accessibleTool = this.access ? restrictAggregateActions(tool, this.access) : tool;
    if (!accessibleTool) return;
    if (this.tools.has(accessibleTool.name)) {
      throw new Error(
        `[ToolRegistry] Tool "${accessibleTool.name}" is already registered. ` +
          `Call unregisterTool first to replace it.`,
      );
    }
    if (!accessibleTool.inputSchema || typeof (accessibleTool.inputSchema as { parse?: unknown }).parse !== "function") {
      throw new Error(
        `[ToolRegistry] Tool "${accessibleTool.name}" must declare a real ZodSchema as inputSchema.`,
      );
    }
    const inputJsonSchema = computeAndCanonicalizeSchema(accessibleTool);
    this.tools.set(accessibleTool.name, { tool: accessibleTool, registeredAt: Date.now(), inputJsonSchema });
  }

  /** Idempotent: register if not exists, skip if already present. */
  ensureTool(tool: ToolContract): void {
    if (this.tools.has(tool.name)) return;
    this.registerTool(tool);
  }

  unregisterTool(name: string): boolean {
    return this.tools.delete(name);
  }

  /** Get full tool contract (for execution) */
  getTool(name: string): ToolContract | undefined {
    return this.tools.get(name)?.tool;
  }

  /** List all registered tools */
  listTools(): ToolContract[] {
    return Array.from(this.tools.values()).map((e) => e.tool);
  }

  /** Get provider-visible tool manifests (only providerVisible: true), stable-sorted by name */
  getToolManifest(ctx: ToolRuntimeContext): ToolManifest[] {
    return this.listTools()
      .filter((t) => t.providerVisible)
      .map((t) => this.toManifest(t, ctx))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private toManifest(tool: ToolContract, ctx: ToolRuntimeContext): ToolManifest {
    const availability = tool.availability(ctx);
    const entry = this.tools.get(tool.name);
    return {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputJsonSchema: entry?.inputJsonSchema,
      inputHint: tool.inputHint,
      readOnly: tool.readOnly,
      safety: tool.safety,
      source: tool.source,
      boundary: tool.boundary,
      availability,
    };
  }
}

function restrictAggregateActions(tool: ToolContract, access: ToolRegistryAccess): ToolContract | null {
  const actionHelp = tool.aggregateActionHelp;
  if (!actionHelp) return tool;
  const actionNames = Object.keys(actionHelp);
  const allowedActions = actionNames.filter((action) => access.allowsAction(tool.name, action));
  if (allowedActions.length === actionNames.length) return tool;
  if (allowedActions.length === 0) return null;

  const allowed = new Set(allowedActions);
  const isAllowedCall = (rawArgs: unknown): boolean => {
    if (!rawArgs || typeof rawArgs !== "object") return false;
    const action = (rawArgs as Record<string, unknown>).action;
    return typeof action === "string" && allowed.has(action);
  };
  const filteredHelp = Object.fromEntries(
    Object.entries(actionHelp).filter(([action]) => allowed.has(action)),
  );
  const readOnly = Object.values(filteredHelp).every((item) => item.readOnly === true);
  const deniedSafety: ToolSafetyInfo = {
    readOnly: false,
    canWrite: true,
    requiresConfirmation: true,
    riskLevel: "high",
  };

  return {
    ...tool,
    readOnly,
    safety: readOnly ? { readOnly: true } : tool.safety,
    inputHint: `action 必须是：${allowedActions.join(" / ")}。args 为该 action 的参数对象。`,
    inputJsonSchemaOverride: filterActionEnum(tool.inputJsonSchemaOverride, allowedActions),
    aggregateActionHelp: filteredHelp,
    resolveCallSafety: (args) => isAllowedCall(args)
      ? tool.resolveCallSafety?.(args) ?? tool.safety
      : deniedSafety,
    validateInputForPreview: (rawArgs) => isAllowedCall(rawArgs)
      ? tool.validateInputForPreview?.(rawArgs) ?? { ok: true }
      : {
          ok: false,
          error: {
            message: "当前 Agent Profile 未授权该 action。",
            details: { code: "permission_denied" },
          },
        },
    async execute(ctx, args) {
      if (!isAllowedCall(args)) {
        return {
          ok: false,
          data: null,
          error: {
            code: "permission_denied",
            message: "当前 Agent Profile 未授权该 action。",
            recoverable: false,
          },
        };
      }
      return tool.execute(ctx, args);
    },
  };
}

function filterActionEnum(schema: unknown, actions: readonly string[]): unknown {
  if (!schema || typeof schema !== "object") return schema;
  const root = schema as Record<string, unknown>;
  const properties = root.properties;
  if (!properties || typeof properties !== "object") return schema;
  const action = (properties as Record<string, unknown>).action;
  if (!action || typeof action !== "object") return schema;
  return {
    ...root,
    properties: {
      ...properties as Record<string, unknown>,
      action: { ...action as Record<string, unknown>, enum: [...actions] },
    },
  };
}

/* ────────────────────────────────────────────────────────────────── */
/*  JSON Schema computation — override → z.toJSONSchema → normalize   */
/* ────────────────────────────────────────────────────────────────── */

function computeAndCanonicalizeSchema(tool: ToolContract): unknown | undefined {
  let raw: unknown;

  // 1. Prefer explicit override
  if (tool.inputJsonSchemaOverride !== undefined) {
    raw = tool.inputJsonSchemaOverride;
  } else {
    // 2. Fall back to Zod 4 official converter
    try {
      const jsonSchema = z.toJSONSchema(tool.inputSchema as z.ZodType, { io: "input" });
      if (!isUsefulJsonSchema(jsonSchema)) return undefined;
      raw = jsonSchema;
    } catch (err) {
      pushAgentDebugEvent("SCHEMA_CONVERT_FAILED", { tool: tool.name, error: sanitizeError(err) }, "warn");
      return undefined;
    }
  }

  // 3. Normalize / canonicalize
  return normalizeProviderInputJsonSchema(raw, tool.name);
}

/* ────────────────────────────────────────────────────────────────── */
/*  Schema normalization & validation                                 */
/* ────────────────────────────────────────────────────────────────── */

/**
 * Normalize and validate an input JSON Schema for the provider tool manifest.
 *
 * Provider-visible tool parameters schema MUST be a strict object schema:
 * - Root `type: "object"` with `properties`
 * - Explicit `additionalProperties` (recommended: false for built-in tools)
 * - JSON-serializable, no { type: "unknown" }, keys sorted
 *
 * Failure returns undefined → manifest falls back to inputHint.
 * Workbench does NOT auto-add missing fields — that would hide tool contract drift.
 */
function normalizeProviderInputJsonSchema(schema: unknown, toolName: string): unknown | undefined {
  if (!schema || typeof schema !== "object") {
    pushAgentDebugEvent("SCHEMA_NOT_OBJECT", { tool: toolName }, "warn");
    return undefined;
  }

  // Round-trip via JSON to ensure it's serialize-safe
  let text: string;
  try {
    text = JSON.stringify(schema);
  } catch {
    pushAgentDebugEvent("SCHEMA_NOT_SERIALIZABLE", { tool: toolName }, "warn");
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }

  if (!parsed || typeof parsed !== "object") return undefined;
  const obj = parsed as Record<string, unknown>;

  // 1. Reject { type: "unknown" }
  if (obj.type === "unknown") {
    pushAgentDebugEvent("SCHEMA_TYPE_UNKNOWN", { tool: toolName }, "warn");
    return undefined;
  }

  // 2. Root MUST be type: "object" for provider-native compatibility
  if (obj.type !== "object") {
    pushAgentDebugEvent("SCHEMA_NOT_OBJECT_ROOT", { tool: toolName }, "warn");
    return undefined;
  }

  // 3. MUST have `properties`
  if (!obj.properties || typeof obj.properties !== "object") {
    pushAgentDebugEvent("SCHEMA_MISSING_PROPERTIES", { tool: toolName }, "warn");
    return undefined;
  }

  // 4. MUST have explicit `additionalProperties`
  if (!("additionalProperties" in obj)) {
    pushAgentDebugEvent("SCHEMA_MISSING_ADDPROPS", { tool: toolName }, "warn");
    return undefined;
  }

  // Stable sort: recursively sort object keys for deterministic prompt output
  return sortKeys(obj);
}

function sortKeys(obj: unknown): unknown {
  if (obj == null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

function isUsefulJsonSchema(schema: unknown): boolean {
  if (!schema || typeof schema !== "object") return false;
  const s = schema as Record<string, unknown>;
  if (s.type === "unknown") return false;
  const keywords = ["type", "properties", "anyOf", "oneOf", "allOf", "$ref"];
  return keywords.some((k) => k in s);
}

function sanitizeError(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 120) : String(err).slice(0, 120);
}
