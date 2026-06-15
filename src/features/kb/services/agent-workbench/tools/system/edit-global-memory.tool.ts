/**
 * edit_global_memory Tool
 * 用 AI 提供的完整记忆文本替换当前配置的全局记忆文档。
 * 不暴露 docId / item_id / operation 给 AI。
 */

import { z } from "zod";
import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  readGlobalMemory,
  replaceGlobalMemoryContent,
  normalizeGlobalMemoryText,
} from "../../memory/global-memory-doc";

const editGlobalMemoryInputSchema = z.object({
  memory: z.string().describe("修改后的完整全局记忆内容。每行/段代表一条记忆，不是增量补丁。"),
}).strict();

const editGlobalMemoryInputJsonSchemaOverride = {
  type: "object",
  properties: {
    memory: { type: "string", description: "修改后的完整全局记忆内容。每行/段代表一条记忆，不是增量补丁。" },
  },
  additionalProperties: false,
  required: ["memory"],
};

type EditGlobalMemoryInput = z.infer<typeof editGlobalMemoryInputSchema>;

const editGlobalMemoryOutputSchema = z.object({
  ok: z.boolean(),
  changed: z.boolean(),
  memoryChars: z.number().optional(),
  memoryLineCount: z.number().optional(),
  message: z.string().optional(),
});

type EditGlobalMemoryOutput = z.infer<typeof editGlobalMemoryOutputSchema>;

export interface EditGlobalMemoryDeps {
  docId: string;
  maxMemoryChars: number;
}

export function createEditGlobalMemoryTool(deps: EditGlobalMemoryDeps): ToolContract<EditGlobalMemoryInput, EditGlobalMemoryOutput> {
  return {
    name: "edit_global_memory",
    title: "编辑全局记忆",
    description:
      "用修改后的完整记忆内容替换当前配置的全局记忆文档，不暴露记忆文档 ID。",
    inputSchema: editGlobalMemoryInputSchema,
    outputSchema: editGlobalMemoryOutputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },
    source: "builtin",
    inputHint: "memory 为修改后的完整全局记忆，不是增量补丁。",
    boundary:
      "不接受 docId、不接受 item_id、不操作普通文档；只能替换配置好的全局记忆文档；未读取到完整当前记忆时不要调用；memory 为空字符串表示清空全部记忆。",
    providerVisible: true,
    inputJsonSchemaOverride: editGlobalMemoryInputJsonSchemaOverride,

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: EditGlobalMemoryInput): Promise<ToolResult<EditGlobalMemoryOutput>> {
      const docId = deps.docId.trim();
      if (!docId) {
        return {
          ok: false,
          data: null,
          error: {
            code: "global_memory_doc_id_missing",
            message: "未配置全局记忆文档 ID，请先到记忆设置页填写文档 ID。",
            recoverable: true,
          },
        };
      }

      // Check if current memory read failed — if so, can't safely replace
      const currentMemory = await readGlobalMemory(docId, deps.maxMemoryChars);
      if (!currentMemory.readOk) {
        return {
          ok: false,
          data: null,
          error: {
            code: "memory_read_failed",
            message: "当前全局记忆读取失败，AI 未获得完整记忆，不能全量替换。",
            recoverable: true,
          },
        };
      }

      // Check if current memory is truncated — if so, AI didn't get the full picture
      if (currentMemory.truncated) {
        return {
          ok: false,
          data: null,
          error: {
            code: "memory_truncated",
            message: "当前全局记忆超过可读取上限，AI 未获得完整记忆，不能全量替换。",
            recoverable: true,
          },
        };
      }

      // Validate memory length (based on normalized content)
      const normalized = normalizeGlobalMemoryText(args.memory);
      if (normalized.length > deps.maxMemoryChars) {
        return {
          ok: false,
          data: null,
          error: {
            code: "memory_too_long",
            message: `提供的记忆内容（${normalized.length} 字符）超过 ${deps.maxMemoryChars} 字符上限，不能写入。`,
            recoverable: true,
          },
        };
      }

      const result = await replaceGlobalMemoryContent(docId, args.memory);
      if (!result.ok) {
        return {
          ok: false,
          data: null,
          error: {
            code: "replace_failed",
            message: result.message,
            recoverable: true,
          },
        };
      }

      const memoryChars = normalized.length;
      const memoryLineCount = normalized ? normalized.split("\n").filter((l) => l.trim()).length : 0;

      return {
        ok: true,
        data: {
          ok: true,
          changed: true,
          memoryChars,
          memoryLineCount,
          message: result.itemCount === 0 ? "全局记忆已清空。" : `全局记忆已替换，共 ${result.itemCount} 条。`,
        },
      };
    },

    summarizeResult(result: ToolResult<EditGlobalMemoryOutput>): string {
      if (!result.ok) {
        return result.error?.message ?? "编辑全局记忆失败";
      }
      return result.data?.message ?? "全局记忆已替换。";
    },
  };
}
