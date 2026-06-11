import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  getDocInfoInputSchema,
  getDocInfoOutputSchema,
} from "./contracts/get-doc-info.contract";
import type {
  GetDocInfoInput,
  GetDocInfoOutput,
} from "./contracts/get-doc-info.contract";

export { getDocInfoInputSchema } from "./contracts/get-doc-info.contract";
export type {
  GetDocInfoInput,
  GetDocInfoOutput,
} from "./contracts/get-doc-info.contract";

export interface GetDocInfoDeps {
  executeGetDocInfo(args: GetDocInfoInput): Promise<{ safeOutput: GetDocInfoOutput }>;
}

export function createGetDocInfoTool(deps: GetDocInfoDeps): ToolContract<GetDocInfoInput, GetDocInfoOutput> {
  return {
    name: "get_doc_info",
    title: "查看文档信息",
    description: "查看指定文档的标题、路径、笔记本、创建时间、更新时间和标签等元信息，不读取正文内容。",
    inputSchema: getDocInfoInputSchema,
    outputSchema: getDocInfoOutputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "builtin",
    inputHint: "docId（必填，文档 ID，必须来自工具返回或用户显式附加的真实 ID）。",
    boundary: "只返回文档元信息（标题、路径、笔记本、时间、标签），不读取正文。docId 必须来自真实资源 ID。",
    plannerVisible: true,

    inputJsonSchemaOverride: {
      type: "object",
      properties: {
        docId: { type: "string", minLength: 1, maxLength: 256 },
      },
      required: ["docId"],
      additionalProperties: false,
    },

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: GetDocInfoInput): Promise<ToolResult<GetDocInfoOutput>> {
      try {
        const result = await deps.executeGetDocInfo(args);
        return { ok: true, data: result.safeOutput };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const code = msg.startsWith("[resource_not_found]") ? "resource_not_found" : "tool_internal_error";
        return {
          ok: false, data: null,
          error: {
            code,
            message: msg.replace(/^\[resource_not_found\]\s*/, ""),
            recoverable: true,
            hint: code === "resource_not_found"
              ? "请确认 docId 来自真实文档 ID。"
              : "请检查 docId 是否正确后重试。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<GetDocInfoOutput>): string {
      if (!result.ok || !result.data) {
        return result.error?.message ?? "文档信息查看失败。";
      }
      const data = result.data;
      return `文档「${data.title}」信息已返回。`;
    },
  };
}
