import type { NativeTool } from "./native-tool";
import { ensureObjectJsonSchema } from "./native-tool-schema";

export interface OpenAIToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export function nativeToolToOpenAITool(tool: NativeTool): OpenAIToolDefinition {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: ensureObjectJsonSchema(tool.parameters),
    },
  };
}

/**
 * Budget projection shared by the selector and Prompt Budget. The OpenAI
 * compatible wire shape is the conservative common upper bound: all current
 * adapters send the same name/description/schema fields, while OpenAI adds
 * the per-tool function wrapper.
 */
export function nativeToolToProviderBudgetDefinition(tool: NativeTool): OpenAIToolDefinition {
  return nativeToolToOpenAITool(tool);
}

export function nativeToolsToOpenAITools(tools: readonly NativeTool[]): OpenAIToolDefinition[] {
  return tools.map(nativeToolToOpenAITool);
}

export function nativeToolsToProviderBudgetDefinitions(tools: readonly NativeTool[]): OpenAIToolDefinition[] {
  return tools.map(nativeToolToProviderBudgetDefinition);
}

function isNativeTool(value: unknown): value is NativeTool {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.name === "string"
    && typeof record.description === "string"
    && typeof record.execute === "function";
}

/** Convert internal NativeTool objects before a generic budget estimate. */
export function projectProviderToolBudgetInput(value: unknown): unknown {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isNativeTool)) return value;
  return nativeToolsToProviderBudgetDefinitions(value);
}

export function nativeToolsToGeminiFunctionDeclarations(tools: readonly NativeTool[]): Record<string, unknown>[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: ensureObjectJsonSchema(tool.parameters),
  }));
}

export function nativeToolsToAnthropicTools(tools: readonly NativeTool[]): Record<string, unknown>[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: ensureObjectJsonSchema(tool.parameters),
  }));
}

