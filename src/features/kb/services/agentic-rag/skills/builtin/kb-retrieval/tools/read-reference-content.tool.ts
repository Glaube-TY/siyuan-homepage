import { z } from "zod";
import type {
  ToolAvailability,
  ToolContract,
  ToolObservation,
  ToolResult,
  ToolRuntimeContext,
} from "../../../../workbench/contracts/tool-contract";
import { extractErrorFacts } from "../../../../workbench/contracts/tool-contract";
import type { KbRetrievalToolDeps } from "../adapters/kb-retrieval-tool-deps";
import { executeReadCandidateDocs } from "../adapters/read-candidate-docs.adapter";
import {
  type PlannerVisibleReadItem,
  readCandidateDocsOutputSchema,
} from "../schemas/read-candidate-docs.schema";

const readReferenceContentInputSchema = z.object({
  docs: z.array(z.object({
    sourceType: z.literal("siyuan_doc").optional().default("siyuan_doc"),
    docId: z.string().trim().min(1).max(120).optional(),
    blockId: z.string().trim().min(1).max(120).optional(),
  }).refine((d) => d.docId || d.blockId, { message: "docId 或 blockId 至少提供一个" })).min(1).max(20).optional(),
  docIds: z.array(z.string().trim().min(1).max(120)).min(1).max(20).optional(),
  blockIds: z.array(z.string().trim().min(1).max(120)).min(1).max(20).optional(),
  readMode: z.enum(["default", "full", "range"]).optional().default("default"),
  startOffset: z.number().int().min(0).optional(),
  maxCharsPerDoc: z.number().int().min(2000).max(100000).optional(),
}).strict().refine((d) => d.docs || d.docIds || d.blockIds, { message: "docs/docIds/blockIds 至少提供一种" });

export function createReadReferenceContentTool(deps: KbRetrievalToolDeps): ToolContract {
  return {
    name: "read_reference_content",
    title: "读取已展示来源内容",
    description: "读取 Planner 显式提供的已展示来源 docId，返回内容片段。思源引用直接返回 docId。",
    capability: "根据 list_recent_references 或其他工具返回的 docId 读取内容片段。当前支持已映射为可读文档的来源；其他来源以结构化错误返回。",
    inputSchema: readReferenceContentInputSchema,
    outputSchema: readCandidateDocsOutputSchema,
    outputKind: "content",
    safety: { readOnly: true },
    boundary: "只消费 docId/blockId，不搜索、不自动改参、不自动继续读取、不暴露内部标识。",
    source: "builtin",
    inputHint: "docs/docIds/blockIds（至少一种），readMode（default/full/range，可选），startOffset（range 可选），maxCharsPerDoc（2000-100000，可选）",

    availability(_ctx: ToolRuntimeContext): ToolAvailability {
      if (!deps.getScope()) {
        return {
          available: false,
          reasonCode: "prerequisite_missing",
          hint: "当前知识范围不可用。",
        };
      }
      return { available: true };
    },

    async execute(args: unknown, _ctx: ToolRuntimeContext): Promise<ToolResult> {
      const parsed = readReferenceContentInputSchema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          outputKind: "content",
          data: null,
          error: {
            errorCode: "invalid_args",
            message: "读取已展示来源的参数格式不正确。",
            recoverable: true,
            hint: "请提供 docs/docIds/blockIds 至少一种；range 模式可附带 startOffset。",
          },
        };
      }

      try {
        const result = await executeReadCandidateDocs(deps, {
          docs: parsed.data.docs,
          docIds: parsed.data.docIds,
          blockIds: parsed.data.blockIds,
          readMode: parsed.data.readMode,
          startOffset: parsed.data.startOffset,
          maxCharsPerDoc: parsed.data.maxCharsPerDoc,
        });

        try {
          readCandidateDocsOutputSchema.parse(result.safeOutput);
        } catch {
          return {
            ok: false,
            outputKind: "content",
            data: null,
            error: {
              errorCode: "tool_internal_error",
              message: "已展示来源读取结果格式校验失败。",
              recoverable: false,
              hint: "请稍后重试。",
            },
          };
        }

        return {
          ok: true,
          outputKind: "content",
          data: result.safeOutput,
        };
      } catch {
        return {
          ok: false,
          outputKind: "content",
          data: null,
          error: {
            errorCode: "tool_internal_error",
            message: "读取已展示来源时发生异常。",
            recoverable: true,
            hint: "请检查 docId 是否仍然有效。",
          },
        };
      }
    },

    observationFormatter(result: ToolResult, _ctx: ToolRuntimeContext): ToolObservation {
      if (!result.ok) {
        const errorFacts = extractErrorFacts(result);
        return {
          toolName: "read_reference_content",
          ok: false,
          outputKind: "content",
          facts: {
            errorCode: errorFacts.errorCode,
            errorMessage: errorFacts.errorMessage,
            errorHint: errorFacts.errorHint,
            errorRecoverable: errorFacts.errorRecoverable,
          },
          summary: errorFacts.errorMessage ?? "已展示来源内容读取失败。",
        };
      }

      const data = result.data as {
        items: PlannerVisibleReadItem[];
        contentItemCount: number;
        readDocCount: number;
        truncated: boolean;
        errors?: Array<{ code: string; message: string; hint: string }>;
      };
      const firstError = data.errors?.[0];
      const firstTruncated = data.items.find((item) => item.truncated);
      const returnedChars = firstTruncated?.returnedContentChars ?? 0;
      const remainingChars = firstTruncated?.remainingChars ?? 0;

      return {
        toolName: "read_reference_content",
        ok: true,
        outputKind: "content",
        facts: {
          contentItemCount: data.contentItemCount,
          readDocCount: data.readDocCount,
          errorCode: firstError?.code,
          errorMessage: firstError?.message,
          errorHint: firstError?.hint,
          isZeroHits: data.contentItemCount === 0,
        },
        summary: data.contentItemCount === 0
          ? (firstError?.message ?? "未读取到已展示来源内容片段。")
          : data.truncated
            ? `已读取文档前 ${returnedChars} 字符，仍有 ${remainingChars} 字符未读，可使用 nextCursor 继续读取。`
            : "已读取已展示来源内容片段。",
        content: {
          type: "content_items",
          items: data.items,
          truncated: data.truncated,
        },
      };
    },
  };
}
