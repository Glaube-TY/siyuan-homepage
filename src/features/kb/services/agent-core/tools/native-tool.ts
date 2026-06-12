import type { JsonSchemaObject } from "./native-tool-schema";
import type { ToolSafetyInfo, ToolSource } from "../../agent-workbench/contracts/tool-contract";

export interface ToolExecutionContext {
  question: string;
  callCounts: Record<string, number>;
  abortSignal?: AbortSignal;
}

export interface ToolExecutionResult {
  ok: boolean;
  content: string;
  summary: string;
  code?: string;
  errorCode?: string;
  data?: unknown;
  safeTargetPreview?: {
    targetDocIds?: string[];
    targetBlockIds?: string[];
    targetTitles?: string[];
    requestedCount?: number;
    affectedCount?: number;
    reasonCode?: string;
  };
}

export interface NativeTool {
  name: string;
  title: string;
  description: string;
  parameters: JsonSchemaObject;
  readOnly: boolean;
  parallelSafe?: boolean;
  riskLevel?: "low" | "medium" | "high";
  providerVisible: boolean;
  source: ToolSource;
  safety: ToolSafetyInfo;
  execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolExecutionResult>;
  preview?(args: Record<string, unknown>): Promise<unknown>;
}

