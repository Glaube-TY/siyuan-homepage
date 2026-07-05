import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  manageDiaryStructureInputSchema,
  manageDiaryStructureOutputSchema,
} from "./contracts/manage-diary-structure.contract";
import type {
  ManageDiaryStructureInput,
  ManageDiaryStructureOutput,
} from "./contracts/manage-diary-structure.contract";

export { manageDiaryStructureInputSchema, manageDiaryStructureOutputSchema } from "./contracts/manage-diary-structure.contract";
export type {
  ManageDiaryStructureInput,
  ManageDiaryStructureOutput,
} from "./contracts/manage-diary-structure.contract";

export interface ManageDiaryStructureDeps {
  executeManageDiaryStructure(args: ManageDiaryStructureInput): Promise<{ ok: boolean; safeOutput: ManageDiaryStructureOutput; errorCode?: string }>;
}

export function createManageDiaryStructureTool(
  deps: ManageDiaryStructureDeps,
): ToolContract<ManageDiaryStructureInput, ManageDiaryStructureOutput> {
  return {
    name: "manage_diary_structure",
    title: "管理日记结构",
    description: "统一管理日记结构：确保今日日记存在（ensure_today）、补充日/周/月/年模板（append_template）。",
    inputSchema: manageDiaryStructureInputSchema,
    outputSchema: manageDiaryStructureOutputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },
    source: "builtin",
    inputHint: "operation（必填）：ensure_today 只需 operation，不接受 period/date/docId；append_template 必须有 period，date/docId 可选。",
    boundary: "模板必须来自强化日记设置，不接受 AI 传入的模板正文；不重复插入。",
    providerVisible: false,
    inputJsonSchemaOverride: {
      type: "object",
      properties: {
        operation: { type: "string", enum: ["ensure_today", "append_template"] },
        period: { type: "string", enum: ["day", "week", "month", "year"] },
        date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        docId: { type: "string" },
      },
      required: ["operation"],
      additionalProperties: false,
      oneOf: [
        {
          properties: { operation: { const: "ensure_today" } },
          not: {
            anyOf: [
              { required: ["period"] },
              { required: ["date"] },
              { required: ["docId"] },
            ],
          },
        },
        {
          properties: { operation: { const: "append_template" } },
          required: ["period"],
        },
      ],
    },

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: ManageDiaryStructureInput): Promise<ToolResult<ManageDiaryStructureOutput>> {
      try {
        const result = await deps.executeManageDiaryStructure(args);
        if (!result.ok) {
          return {
            ok: false,
            data: null,
            error: {
              code: result.errorCode || "diary_template_append_failed",
              message: result.safeOutput.message,
              recoverable: true,
            },
          };
        }
        return { ok: true, data: result.safeOutput };
      } catch {
        return {
          ok: false,
          data: null,
          error: {
            code: "tool_internal_error",
            message: "管理日记结构执行异常。",
            recoverable: true,
          },
        };
      }
    },

    summarizeResult(result: ToolResult<ManageDiaryStructureOutput>): string {
      if (!result.ok || !result.data) return result.error?.message ?? "管理日记结构失败。";
      return result.data.message;
    },
  };
}
