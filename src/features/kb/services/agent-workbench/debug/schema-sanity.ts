/**
 * Schema sanity check — development-time guard for tool JSON Schema quality.
 *
 * Does NOT depend on the siyuan API, does NOT call models, does NOT affect
 * runtime behavior. Results are stored via setSchemaSanityResult() in the
 * debug sink — accessed through window.__kbAgentDebug("all").
 * No automatic console output — silent by default.
 *
 * Hook via `runSchemaSanity(manifests)` in createAgentWorkbenchRuntime
 * (dev mode only).
 */

import type { ToolManifest } from "../contracts/tool-contract";
import type { SchemaSanityResult } from "./workbench-debug";
import { setSchemaSanityResult } from "./workbench-debug";

export type { SchemaSanityResult } from "./workbench-debug";

const BUILTIN_SIYUAN_TOOL_NAMES = new Set([
  "list_knowledge_map",
  "search_scope",
  "list_items_by_time",
  "read_docs",
  "get_daily_workspace_overview",
  "query_tasks",
  "query_diary_records",
  "find_diary_docs",
  "list_attribute_views",
  "read_attribute_view",
  "find_attribute_view_rows",
  "update_attribute_view_cell",
  "add_attribute_view_rows",
  "add_attribute_view_key",
]);

/**
 * Check all provider-visible tool schemas for structural correctness.
 * Built-in siyuan tools have extra checks (specific field requirements).
 */
export function checkToolSchemaSanity(manifests: ToolManifest[]): SchemaSanityResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const tool of manifests) {
    const name = tool.name;

    // ── 1. Every provider-visible tool must have inputJsonSchema or inputHint ──
    if (!tool.inputJsonSchema && !tool.inputHint) {
      errors.push(`Tool "${name}" has no inputJsonSchema nor inputHint.`);
      continue;
    }

    // ── 2. Built-in siyuan tools MUST have inputJsonSchema ──
    if (BUILTIN_SIYUAN_TOOL_NAMES.has(name)) {
      if (!tool.inputJsonSchema) {
        errors.push(`Built-in tool "${name}" must have inputJsonSchema.`);
        continue;
      }
    }

    // ── 3. Manifest must not contain Zod inputSchema ──
    if ("inputSchema" in tool) {
      errors.push(`Tool "${name}" manifest contains Zod inputSchema — only ToolContract should have this.`);
    }

    if (!tool.inputJsonSchema) continue;

    const schema = tool.inputJsonSchema as Record<string, unknown>;
    const props = schema.properties as Record<string, unknown> | undefined;

    // ── 4. Root must be type: "object" ──
    if (schema.type !== "object") {
      errors.push(`Tool "${name}" inputJsonSchema root type is not "object".`);
    }

    // ── 5. Must have properties ──
    if (!props || typeof props !== "object") {
      errors.push(`Tool "${name}" inputJsonSchema missing "properties".`);
    }

    // ── 6. Must have explicit additionalProperties ──
    if (!("additionalProperties" in schema)) {
      errors.push(`Tool "${name}" inputJsonSchema missing "additionalProperties".`);
    }

    // ── 7. Built-in tools: additionalProperties === false ──
    if (BUILTIN_SIYUAN_TOOL_NAMES.has(name)) {
      if (schema.additionalProperties !== false) {
        errors.push(`Tool "${name}" inputJsonSchema additionalProperties must be false.`);
      }
    }

    if (!props) continue;

    // ═══════════════════════════════════════════════════════════════
    //  search_scope specific checks
    // ═══════════════════════════════════════════════════════════════
    if (name === "search_scope") {
      // required must include "query"
      const required = (schema.required as string[] | undefined) ?? [];
      if (!required.includes("query")) {
        errors.push(`Tool "search_scope" inputJsonSchema must require "query".`);
      }

      // query.type === "string"
      const queryProp = props.query as Record<string, unknown> | undefined;
      if (queryProp?.type !== "string") {
        errors.push(`Tool "search_scope" properties.query.type must be "string".`);
      }

      // limit is integer, min 1, max 50
      const limitProp = props.limit as Record<string, unknown> | undefined;
      if (limitProp) {
        if (limitProp.type !== "integer" && limitProp.type !== "number") {
          errors.push(`Tool "search_scope" properties.limit must be integer.`);
        }
        if (typeof limitProp.minimum !== "number" || limitProp.minimum < 1) {
          warnings.push(`Tool "search_scope" properties.limit minimum should be 1.`);
        }
        if (typeof limitProp.maximum !== "number" || limitProp.maximum > 50) {
          warnings.push(`Tool "search_scope" properties.limit maximum should be 50.`);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    //  list_knowledge_map specific checks
    // ═══════════════════════════════════════════════════════════════
    if (name === "list_knowledge_map") {
      // view.enum must contain specific values
      const viewProp = props.view as Record<string, unknown> | undefined;
      if (!viewProp || !Array.isArray(viewProp.enum)) {
        errors.push(`Tool "list_knowledge_map" inputJsonSchema missing "view" enum property.`);
      } else {
        const expected = ["notebooks", "notebook_roots", "children", "subtree", "neighborhood", "list"];
        const missing = expected.filter((v) => !(viewProp.enum as string[]).includes(v));
        if (missing.length > 0) {
          warnings.push(`Tool "list_knowledge_map" view.enum missing: ${missing.join(", ")}.`);
        }
      }

      // limit maximum 500
      const limitProp = props.limit as Record<string, unknown> | undefined;
      if (limitProp && (typeof limitProp.maximum !== "number" || limitProp.maximum > 500)) {
        warnings.push(`Tool "list_knowledge_map" properties.limit maximum should be 500.`);
      }

      // maxDepth maximum 10
      const depthProp = props.maxDepth as Record<string, unknown> | undefined;
      if (depthProp && (typeof depthProp.maximum !== "number" || depthProp.maximum > 10)) {
        warnings.push(`Tool "list_knowledge_map" properties.maxDepth maximum should be 10.`);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    //  read_docs specific checks
    // ═══════════════════════════════════════════════════════════════
    if (name === "read_docs") {
      // properties must contain docIds, blockIds, cursor, maxChars
      for (const requiredKey of ["docIds", "blockIds", "cursor", "maxChars"]) {
        if (!(requiredKey in props)) {
          errors.push(`Tool "read_docs" inputJsonSchema missing properties.${requiredKey}.`);
        }
      }

      // docIds/blockIds are array with string items and min/maxLength
      for (const arrKey of ["docIds", "blockIds"]) {
        const arrProp = props[arrKey] as Record<string, unknown> | undefined;
        if (arrProp) {
          if (arrProp.type !== "array") {
            errors.push(`Tool "read_docs" properties.${arrKey} must be array.`);
          }
          const items = arrProp.items as Record<string, unknown> | undefined;
          if (items) {
            if (items.type !== "string") {
              warnings.push(`Tool "read_docs" properties.${arrKey}.items.type should be "string".`);
            }
            if (typeof items.minLength !== "number" || items.minLength < 1) {
              warnings.push(`Tool "read_docs" properties.${arrKey}.items.minLength should be >= 1.`);
            }
            if (typeof items.maxLength !== "number" || items.maxLength > 256) {
              warnings.push(`Tool "read_docs" properties.${arrKey}.items.maxLength should be <= 256.`);
            }
          }
        }
      }

      // cursor is string with min/maxLength
      const cursorProp = props.cursor as Record<string, unknown> | undefined;
      if (cursorProp) {
        if (cursorProp.type !== "string") {
          errors.push(`Tool "read_docs" properties.cursor must be string.`);
        }
        if (typeof cursorProp.minLength !== "number" || cursorProp.minLength < 1) {
          warnings.push(`Tool "read_docs" properties.cursor.minLength should be >= 1.`);
        }
        if (typeof cursorProp.maxLength !== "number" || cursorProp.maxLength > 240) {
          warnings.push(`Tool "read_docs" properties.cursor.maxLength should be <= 240.`);
        }
      }

      // maxChars min 2000 max 100000
      const maxCharsProp = props.maxChars as Record<string, unknown> | undefined;
      if (maxCharsProp) {
        if (maxCharsProp.type !== "integer" && maxCharsProp.type !== "number") {
          warnings.push(`Tool "read_docs" properties.maxChars should be integer.`);
        }
        if (typeof maxCharsProp.minimum !== "number" || maxCharsProp.minimum < 2000) {
          warnings.push(`Tool "read_docs" properties.maxChars.minimum should be 2000.`);
        }
        if (typeof maxCharsProp.maximum !== "number" || maxCharsProp.maximum > 100000) {
          warnings.push(`Tool "read_docs" properties.maxChars.maximum should be 100000.`);
        }
      }

      // ── oneOf mutex check: cursor vs docIds/blockIds ──
      const oneOf = schema.oneOf as Array<Record<string, unknown>> | undefined;
      if (!oneOf || oneOf.length < 2) {
        errors.push(`Tool "read_docs" inputJsonSchema must have oneOf with at least 2 branches (cursor vs docIds/blockIds).`);
      } else {
        // Branch 1: cursor-only (required cursor, NOT docIds/blockIds)
        const branch1 = oneOf[0] as Record<string, unknown> | undefined;
        const b1req = (branch1?.required as string[] | undefined) ?? [];
        if (!b1req.includes("cursor")) {
          errors.push(`Tool "read_docs" oneOf branch 1 must require "cursor".`);
        }
        const b1not = branch1?.not as Record<string, unknown> | undefined;
        const b1notAnyOf = b1not?.anyOf as Array<Record<string, unknown>> | undefined;
        const hasB1DocIdsBlockIdsNot = b1notAnyOf?.some(
          (r: Record<string, unknown>) => (r?.required as string[])?.[0] === "docIds" || (r?.required as string[])?.[0] === "blockIds",
        );
        if (!hasB1DocIdsBlockIdsNot) {
          warnings.push(`Tool "read_docs" oneOf branch 1 should have not.anyOf blocking docIds/blockIds.`);
        }

        // Branch 2: docIds/blockIds (anyOf docIds or blockIds, NOT cursor)
        const branch2 = oneOf[1] as Record<string, unknown> | undefined;
        const b2anyOf = branch2?.anyOf as Array<Record<string, unknown>> | undefined;
        const hasB2DocIdsOrBlockIds = b2anyOf?.some(
          (r: Record<string, unknown>) => (r?.required as string[])?.[0] === "docIds" || (r?.required as string[])?.[0] === "blockIds",
        );
        if (!hasB2DocIdsOrBlockIds) {
          errors.push(`Tool "read_docs" oneOf branch 2 must have anyOf requiring docIds or blockIds.`);
        }
        const b2not = branch2?.not as Record<string, unknown> | undefined;
        const b2notReq = (b2not?.required as string[] | undefined) ?? [];
        if (!b2notReq.includes("cursor")) {
          warnings.push(`Tool "read_docs" oneOf branch 2 should have not.required blocking cursor.`);
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Run sanity check and store results. Call during workbench init (dev mode only).
 * No automatic console output — results accessed via window.__kbAgentDebug("all").
 */
export function runSchemaSanity(manifests: ToolManifest[], _label?: string): SchemaSanityResult {
  const result = checkToolSchemaSanity(manifests);
  setSchemaSanityResult(result);
  return result;
}
