import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  manageDiaryRecordInputSchema,
  manageDiaryRecordOutputSchema,
} from "./contracts/manage-diary-record.contract";
import type {
  ManageDiaryRecordInput,
  ManageDiaryRecordOutput,
} from "./contracts/manage-diary-record.contract";

export { manageDiaryRecordInputSchema, manageDiaryRecordOutputSchema } from "./contracts/manage-diary-record.contract";
export type {
  ManageDiaryRecordInput,
  ManageDiaryRecordOutput,
} from "./contracts/manage-diary-record.contract";

export interface ManageDiaryRecordDeps {
  executeManageDiaryRecord(args: ManageDiaryRecordInput): Promise<{ ok: boolean; safeOutput: ManageDiaryRecordOutput; errorCode?: string }>;
}

export function createManageDiaryRecordTool(
  deps: ManageDiaryRecordDeps,
): ToolContract<ManageDiaryRecordInput, ManageDiaryRecordOutput> {
  return {
    name: "manage_diary_record",
    title: "管理快速记录",
    description: "统一管理日记快速记录：新增（add）、修改（update）、删除（delete）。",
    inputSchema: manageDiaryRecordInputSchema,
    outputSchema: manageDiaryRecordOutputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },
    source: "builtin",
    inputHint: "operation（必填）：add/update/delete；add 需要 categoryTitle 和 content；update/delete 需要 target 中的 recordId 或 headingBlockId。",
    boundary: "修改/删除前必须通过 query_diary_records 获取真实 recordId/headingBlockId/date；不编造 ID；不用通用 block 操作冒充快速记录方法。",
    providerVisible: false,
    inputJsonSchemaOverride: {
      type: "object",
      properties: {
        operation: { type: "string", enum: ["add", "update", "delete"] },
        target: {
          type: "object",
          properties: {
            recordId: { type: "string" },
            headingBlockId: { type: "string" },
            date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          },
          additionalProperties: false,
        },
        categoryTitle: { type: "string", minLength: 1, maxLength: 100 },
        content: { type: "string", minLength: 1, maxLength: 5000 },
      },
      required: ["operation"],
      additionalProperties: false,
    },

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: ManageDiaryRecordInput): Promise<ToolResult<ManageDiaryRecordOutput>> {
      try {
        const result = await deps.executeManageDiaryRecord(args);
        if (!result.ok) {
          return {
            ok: false,
            data: null,
            error: {
              code: result.errorCode || "quick_record_write_failed",
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
            message: "管理快速记录执行异常。",
            recoverable: true,
          },
        };
      }
    },

    summarizeResult(result: ToolResult<ManageDiaryRecordOutput>): string {
      if (!result.ok || !result.data) return result.error?.message ?? "管理快速记录失败。";
      return result.data.message;
    },
  };
}
