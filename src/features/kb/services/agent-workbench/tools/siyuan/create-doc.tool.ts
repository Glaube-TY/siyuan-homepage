import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  createDocInputSchema,
  createDocOutputSchema,
} from "./contracts/create-doc.contract";
import type { CreateDocInput, CreateDocOutput } from "./contracts/create-doc.contract";
import { createDocInputJsonSchemaOverride } from "./contracts/create-doc.contract";

export interface CreateDocDeps {
  executeCreateDoc(args: CreateDocInput, abortSignal?: AbortSignal): Promise<{ output: CreateDocOutput }>;
}

export function createCreateDocTool(deps: CreateDocDeps): ToolContract<CreateDocInput, CreateDocOutput> {
  return {
    name: "create_doc",
    title: "创建文档",
    description:
      "在指定笔记本的指定文档路径创建新文档，可同时写入初始 Markdown 内容，并返回操作结果。",
    inputSchema: createDocInputSchema,
    outputSchema: createDocOutputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },
    source: "builtin",
    inputHint: "只允许传 notebookId、path、markdown 三个字段；notebookId 和 path 必填，markdown 可选。不要传 title、name、docTitle、parentId 等未声明字段；path 最后一段就是文档标题，例如 /父文档/子文档。",
    boundary: "只能基于明确给出的真实 notebookId 和 path 创建文档。path 是笔记本内的文档路径，可表示层级，最后一段作为标题；严格 Schema 拒绝任何未声明字段。",
    providerVisible: false,
    inputJsonSchemaOverride: createDocInputJsonSchemaOverride,

    availability() {
      return { available: true };
    },

    async execute(ctx: ToolRuntimeContext, args: CreateDocInput): Promise<ToolResult<CreateDocOutput>> {
      try {
        const result = await deps.executeCreateDoc(args, ctx.abortSignal);
        const data = result.output;
        if (data.status === "success") {
          return { ok: true, data };
        }
        if (data.status === "rejected") {
          return {
            ok: false,
            data: null,
            error: {
              code: "user_rejected",
              message: data.message || "用户已拒绝操作。",
              recoverable: false,
              details: data.target ? { target: data.target } : undefined,
            },
          };
        }
        return {
          ok: false,
          data: null,
          error: {
            code: "write_operation_failed",
            message: data.message || "写入操作失败。",
            recoverable: false,
            hint: "检查 notebookId、文档路径及同名文档状态；只有修正目标后才能重试。",
            details: data.target ? { target: data.target } : undefined,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          data: null,
          error: {
            code: "tool_internal_error",
            message: `文档创建失败：${message}`,
            recoverable: true,
            hint: "请检查 notebookId 和 path 是否有效。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<CreateDocOutput>): string {
      if (!result.ok || !result.data) {
        return result.error?.message ?? "文档创建失败。";
      }
      const data = result.data;
      if (data.status === "success") {
        return data.message || "文档已创建。";
      }
      if (data.status === "rejected") {
        return "用户已拒绝操作。";
      }
      return `文档未创建：${data.message}`;
    },
  };
}
