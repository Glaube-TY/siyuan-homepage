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

export function nativeToolsToOpenAITools(tools: readonly NativeTool[]): OpenAIToolDefinition[] {
  return tools.map(nativeToolToOpenAITool);
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

