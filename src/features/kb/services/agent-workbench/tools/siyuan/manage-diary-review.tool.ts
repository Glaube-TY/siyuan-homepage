import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  manageDiaryReviewInputSchema,
  manageDiaryReviewOutputSchema,
} from "./contracts/manage-diary-review.contract";
import type {
  ManageDiaryReviewInput,
  ManageDiaryReviewOutput,
} from "./contracts/manage-diary-review.contract";

export { manageDiaryReviewInputSchema, manageDiaryReviewOutputSchema } from "./contracts/manage-diary-review.contract";
export type {
  ManageDiaryReviewInput,
  ManageDiaryReviewOutput,
} from "./contracts/manage-diary-review.contract";

export interface ManageDiaryReviewDeps {
  executeManageDiaryReview(args: ManageDiaryReviewInput): Promise<{ ok: boolean; safeOutput: ManageDiaryReviewOutput; errorCode?: string }>;
}

export function createManageDiaryReviewTool(
  deps: ManageDiaryReviewDeps,
): ToolContract<ManageDiaryReviewInput, ManageDiaryReviewOutput> {
  return {
    name: "manage_diary_review",
    title: "管理复盘内容",
    description: "统一管理日记复盘：保存复盘字段（save_content）、标记完成/未完成/跳过/恢复（set_status）。",
    inputSchema: manageDiaryReviewInputSchema,
    outputSchema: manageDiaryReviewOutputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },
    source: "builtin",
    inputHint: "operation（必填）：save_content/set_status；docId 和 period 必填；save_content 需要 fields（label 必须来自模板字段）；set_status 需要 status：completed/pending/skipped。",
    boundary: "docId 必须来自 find_diary_docs 或 grounding 上下文，不编造；保存复盘前应确认文档中已有对应复盘根区块；缺失时先用 manage_diary_structure operation=append_template 补模板。",
    providerVisible: true,
    inputJsonSchemaOverride: {
      type: "object",
      properties: {
        operation: { type: "string", enum: ["save_content", "set_status"] },
        docId: { type: "string" },
        period: { type: "string", enum: ["day", "week", "month", "year"] },
        fields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string", minLength: 1, maxLength: 100 },
              content: { type: "string", maxLength: 10000 },
            },
            required: ["label", "content"],
            additionalProperties: false,
          },
          minItems: 1,
          maxItems: 10,
        },
        status: { type: "string", enum: ["completed", "pending", "skipped"] },
      },
      required: ["operation", "docId", "period"],
      additionalProperties: false,
    },

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: ManageDiaryReviewInput): Promise<ToolResult<ManageDiaryReviewOutput>> {
      try {
        const result = await deps.executeManageDiaryReview(args);
        if (!result.ok) {
          return {
            ok: false,
            data: null,
            error: {
              code: result.errorCode || "review_write_failed",
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
            message: "管理复盘内容执行异常。",
            recoverable: true,
          },
        };
      }
    },

    summarizeResult(result: ToolResult<ManageDiaryReviewOutput>): string {
      if (!result.ok || !result.data) return result.error?.message ?? "管理复盘内容失败。";
      return result.data.message;
    },
  };
}
