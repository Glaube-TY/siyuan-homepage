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
  memory: z.string().min(1, "edit_global_memory 不允许清空全局记忆；memory 不能为空字符串。").refine((value) => value.trim().length > 0, { message: "edit_global_memory 不允许清空全局记忆；memory 不能仅包含空白字符。如需清空，请在设置页或专门人工流程中操作。" }).describe("修改后的完整全局记忆全文。每行/段代表一条记忆，不是增量补丁；不允许空字符串或纯空白。"),
}).strict();

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
  const maxMemoryChars = deps.maxMemoryChars;
  const inputJsonSchemaOverride = {
    type: "object",
    properties: {
      memory: {
        type: "string",
        minLength: 1,
        maxLength: maxMemoryChars,
        description: `修改后的完整全局记忆全文。每行/段代表一条记忆，不是增量补丁；不允许空字符串或纯空白；不能超过当前上限 ${maxMemoryChars} 字符。`,
      },
    },
    additionalProperties: false,
    required: ["memory"],
  };

  function validateInputForPreview(rawArgs: unknown): { ok: true } | { ok: false; error: { message: string; details?: Record<string, unknown> } } {
    // Detect empty/whitespace-only memory early so it always maps to memory_empty_not_allowed,
    // regardless of whether Zod's refine or our normalization catches it.
    const rawMemory = rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)
      ? (rawArgs as Record<string, unknown>).memory
      : undefined;
    if (typeof rawMemory === "string" && rawMemory.trim().length === 0) {
      return {
        ok: false,
        error: {
          message: "edit_global_memory 不允许清空全局记忆；memory 不能为空字符串或仅包含空白字符。如需清空，请在设置页或专门人工流程中操作。",
          details: { code: "memory_empty_not_allowed" },
        },
      };
    }

    const parsed = editGlobalMemoryInputSchema.safeParse(rawArgs);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const message = firstIssue?.message ?? "参数校验失败。";
      const path = firstIssue?.path?.join(".") ?? "";
      // Strict-schema violations for extra fields (e.g. docId, item_id, operation).
      const isExtraFieldIssue = (i: { message: string }) =>
        i.message.includes("Unrecognized key") || i.message.includes("未知") || i.message.includes("additionalProperties");
      const extraFieldIssue = parsed.error.issues.find(isExtraFieldIssue);
      const code = path === "memory" && message.includes("不能为空") ? "memory_empty_not_allowed" : "invalid_args";
      const unsupportedFields = extraFieldIssue
        ? parsed.error.issues.filter(isExtraFieldIssue).map((i) => i.path.join("."))
        : [];
      const details: Record<string, unknown> = {
        code,
        issues: parsed.error.issues.slice(0, 3).map((i) => ({ path: i.path, message: i.message })),
      };
      if (unsupportedFields.length > 0) {
        details.unsupportedFields = unsupportedFields;
        details.allowedFields = ["memory"];
        details.note = "edit_global_memory 不接受 docId、item_id、operation 等额外字段。";
      }
      return {
        ok: false,
        error: {
          message: unsupportedFields.length > 0
            ? `edit_global_memory 不接受额外字段：${unsupportedFields.join(", ")}。只能传 memory。`
            : message,
          details,
        },
      };
    }

    const normalized = normalizeGlobalMemoryText(parsed.data.memory);
    if (!normalized) {
      return {
        ok: false,
        error: {
          message: "edit_global_memory 不允许清空全局记忆；memory 不能为空字符串或仅包含空白字符。如需清空，请在设置页或专门人工流程中操作。",
          details: { code: "memory_empty_not_allowed" },
        },
      };
    }

    if (normalized.length > maxMemoryChars) {
      return {
        ok: false,
        error: {
          message: `提供的记忆内容（${normalized.length} 字符）超过当前上限 ${maxMemoryChars} 字符，不能写入。`,
          details: { code: "memory_too_long", maxMemoryChars, receivedChars: normalized.length },
        },
      };
    }

    return { ok: true };
  }

  return {
    name: "edit_global_memory",
    title: "编辑全局记忆",
    description:
      `用 memory 提供的完整文本全量替换当前全局记忆；memory 不是增量补丁，不允许空字符串或纯空白清空；当前全局记忆写入上限为 ${maxMemoryChars} 字符。`,
    inputSchema: editGlobalMemoryInputSchema,
    outputSchema: editGlobalMemoryOutputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },
    source: "builtin",
    inputHint: `必须传入完整全局记忆全文。不要只传新增条目、摘要、测试内容或空字符串；当前写入上限为 ${maxMemoryChars} 字符。`,
    boundary:
      `会完全覆盖当前所有全局记忆；不接受 docId、不接受 item_id、不接收 operation；只能替换配置好的全局记忆文档；未读取到完整当前记忆时不要调用；不允许清空；当前全局记忆写入上限为 ${maxMemoryChars} 字符。`,
    providerVisible: true,
    inputJsonSchemaOverride,
    validateInputForPreview,

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

      // Validate normalized content: empty/whitespace is not allowed
      const normalized = normalizeGlobalMemoryText(args.memory);
      if (!normalized) {
        return {
          ok: false,
          data: null,
          error: {
            code: "memory_empty_not_allowed",
            message: "edit_global_memory 不允许清空全局记忆；memory 不能为空字符串或仅包含空白字符。如需清空，请在设置页或专门人工流程中操作。",
            recoverable: true,
          },
        };
      }

      // Validate memory length (based on normalized content)
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

      // Defense in depth: replaceGlobalMemoryContent should never report empty after our pre-check,
      // but if it does, treat it as a blocked clear operation.
      if (result.itemCount === 0) {
        return {
          ok: false,
          data: null,
          error: {
            code: "memory_empty_not_allowed",
            message: "edit_global_memory 不允许清空全局记忆。如需清空，请在设置页或专门人工流程中操作。",
            recoverable: true,
          },
        };
      }

      return {
        ok: true,
        data: {
          ok: true,
          changed: true,
          memoryChars,
          memoryLineCount,
          message: `全局记忆已替换，共 ${result.itemCount} 条。`,
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
