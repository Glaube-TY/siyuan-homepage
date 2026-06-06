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
} from "../contracts/tool-contract";

interface RegisteredTool {
  tool: ToolContract;
  registeredAt: number;
  /** Cached canonicalized JSON Schema for planner. Computed once at registration. */
  inputJsonSchema?: unknown;
}

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  registerTool(tool: ToolContract): void {
    if (!tool?.name) {
      throw new Error("[ToolRegistry] Tool must have a name.");
    }
    if (this.tools.has(tool.name)) {
      throw new Error(
        `[ToolRegistry] Tool "${tool.name}" is already registered. ` +
          `Call unregisterTool first to replace it.`,
      );
    }
    if (!tool.inputSchema || typeof (tool.inputSchema as { parse?: unknown }).parse !== "function") {
      throw new Error(
        `[ToolRegistry] Tool "${tool.name}" must declare a real ZodSchema as inputSchema.`,
      );
    }
    const inputJsonSchema = computeAndCanonicalizeSchema(tool);
    this.tools.set(tool.name, { tool, registeredAt: Date.now(), inputJsonSchema });
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

  /** Get planner-visible tool manifests (only plannerVisible: true), stable-sorted by name */
  getPlannerManifest(ctx: ToolRuntimeContext): ToolManifest[] {
    return this.listTools()
      .filter((t) => t.plannerVisible)
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
  return normalizePlannerInputJsonSchema(raw, tool.name);
}

/* ────────────────────────────────────────────────────────────────── */
/*  Schema normalization & validation                                 */
/* ────────────────────────────────────────────────────────────────── */

/**
 * Normalize and validate an input JSON Schema for the Planner/provider manifest.
 *
 * Provider-visible tool parameters schema MUST be a strict object schema:
 * - Root `type: "object"` with `properties`
 * - Explicit `additionalProperties` (recommended: false for built-in tools)
 * - JSON-serializable, no { type: "unknown" }, keys sorted
 *
 * Failure returns undefined → manifest falls back to inputHint.
 * Workbench does NOT auto-add missing fields — that would hide tool contract drift.
 */
function normalizePlannerInputJsonSchema(schema: unknown, toolName: string): unknown | undefined {
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
