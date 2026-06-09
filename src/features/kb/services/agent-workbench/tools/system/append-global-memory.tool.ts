/**
 * edit_global_memory Tool
 * 对配置好的全局记忆文档进行段落级管理：list / create / update / delete / move
 */

import { z } from "zod";
import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  listGlobalMemoryItems,
  createGlobalMemoryItem,
  updateGlobalMemoryItemInDoc,
  deleteGlobalMemoryItemInDoc,
  moveGlobalMemoryItem,
  validateGlobalMemoryDocId,
} from "../../memory/global-memory-doc";

const editGlobalMemoryInputSchema = z.object({
  operation: z.enum(["list", "create", "update", "delete", "move"]).describe("操作：list 列出；create 新增；update 修改；delete 删除；move 移动排序"),
  item_id: z.string().optional().describe("update/delete/move 时的段落块 ID"),
  text: z.string().optional().describe("create/update 时的内容"),
  target_id: z.string().optional().describe("move 时参考块 ID（before/after 必填）"),
  position: z.enum(["top", "bottom", "before", "after"]).optional().describe("move 时的位置方向"),
});

type EditGlobalMemoryInput = z.infer<typeof editGlobalMemoryInputSchema>;

const editGlobalMemoryOutputSchema = z.object({
  ok: z.boolean(),
  items: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        index: z.number(),
      })
    )
    .optional(),
});

type EditGlobalMemoryOutput = z.infer<typeof editGlobalMemoryOutputSchema>;

export interface EditGlobalMemoryDeps {
  docId: string;
  maxEntryChars: number;
}

function squashToOneParagraph(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export function createEditGlobalMemoryTool(deps: EditGlobalMemoryDeps): ToolContract<EditGlobalMemoryInput, EditGlobalMemoryOutput> {
  return {
    name: "edit_global_memory",
    title: "编辑全局记忆",
    description: "对配置好的全局记忆文档进行段落级管理：列出、新增、修改、删除或移动记忆条目。",
    inputSchema: editGlobalMemoryInputSchema,
    outputSchema: editGlobalMemoryOutputSchema,
    readOnly: false,
    safety: { readOnly: false },
    source: "builtin",
    inputHint: "operation（list/create/update/delete/move），create/update 时提供 text，delete/update/move 时提供 item_id，move 时提供 position 和 target_id",
    boundary: "只能编辑配置好的全局记忆文档中的段落条目；update/delete 前会校验 item_id 归属；不接受任意 docId；不自动决定是否需要记住。",
    plannerVisible: true,

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

      const validation = await validateGlobalMemoryDocId(docId);
      if (!validation.valid) {
        return {
          ok: false,
          data: null,
          error: {
            code: "global_memory_doc_id_invalid",
            message: "全局记忆文档 ID 无效或不可用，请检查记忆设置页中的文档 ID。",
            recoverable: true,
          },
        };
      }

      const op = args.operation;

      if (op === "list") {
        const items = await listGlobalMemoryItems(docId);
        return {
          ok: true,
          data: {
            ok: true,
            items: items.map((it) => ({ id: it.id, text: it.text, index: it.index })),
          },
        };
      }

      if (op === "create") {
        const text = squashToOneParagraph(args.text ?? "");
        if (!text) {
          return {
            ok: false,
            data: null,
            error: { code: "empty_text", message: "create 时 text 不能为空", recoverable: true },
          };
        }
        if (text.length > deps.maxEntryChars) {
          return {
            ok: false,
            data: null,
            error: { code: "text_too_long", message: `text 超过 ${deps.maxEntryChars} 字符上限`, recoverable: true },
          };
        }
        const newId = await createGlobalMemoryItem(docId, text);
        if (!newId) {
          return {
            ok: false,
            data: null,
            error: { code: "edit_failed", message: "创建记忆失败", recoverable: true },
          };
        }
        const items = await listGlobalMemoryItems(docId);
        return {
          ok: true,
          data: {
            ok: true,
            items: items.map((it) => ({ id: it.id, text: it.text, index: it.index })),
          },
        };
      }

      if (op === "update") {
        const itemId = args.item_id ?? "";
        const text = squashToOneParagraph(args.text ?? "");
        if (!itemId) {
          return {
            ok: false,
            data: null,
            error: { code: "missing_item_id", message: "update 时 item_id 不能为空", recoverable: true },
          };
        }
        if (!text) {
          return {
            ok: false,
            data: null,
            error: { code: "empty_text", message: "update 时 text 不能为空", recoverable: true },
          };
        }
        if (text.length > deps.maxEntryChars) {
          return {
            ok: false,
            data: null,
            error: { code: "text_too_long", message: `text 超过 ${deps.maxEntryChars} 字符上限`, recoverable: true },
          };
        }
        const ok = await updateGlobalMemoryItemInDoc(docId, itemId, text);
        if (!ok) {
          return {
            ok: false,
            data: null,
            error: { code: "item_not_found", message: "没有在全局记忆文档中找到该记忆条目。", recoverable: true },
          };
        }
        const items = await listGlobalMemoryItems(docId);
        return {
          ok: true,
          data: {
            ok: true,
            items: items.map((it) => ({ id: it.id, text: it.text, index: it.index })),
          },
        };
      }

      if (op === "delete") {
        const itemId = args.item_id ?? "";
        if (!itemId) {
          return {
            ok: false,
            data: null,
            error: { code: "missing_item_id", message: "delete 时 item_id 不能为空", recoverable: true },
          };
        }
        const ok = await deleteGlobalMemoryItemInDoc(docId, itemId);
        if (!ok) {
          return {
            ok: false,
            data: null,
            error: { code: "item_not_found", message: "没有在全局记忆文档中找到该记忆条目。", recoverable: true },
          };
        }
        const items = await listGlobalMemoryItems(docId);
        return {
          ok: true,
          data: {
            ok: true,
            items: items.map((it) => ({ id: it.id, text: it.text, index: it.index })),
          },
        };
      }

      if (op === "move") {
        const itemId = args.item_id ?? "";
        const position = args.position;
        const targetId = args.target_id;
        if (!itemId) {
          return {
            ok: false,
            data: null,
            error: { code: "missing_item_id", message: "move 时 item_id 不能为空", recoverable: true },
          };
        }
        if (!position || !["top", "bottom", "before", "after"].includes(position)) {
          return {
            ok: false,
            data: null,
            error: { code: "invalid_position", message: "move 时 position 必须是 top/bottom/before/after", recoverable: true },
          };
        }
        if ((position === "before" || position === "after") && !targetId) {
          return {
            ok: false,
            data: null,
            error: { code: "missing_target_id", message: "move 为 before/after 时 target_id 不能为空", recoverable: true },
          };
        }
        const ok = await moveGlobalMemoryItem(docId, itemId, position, targetId);
        if (!ok) {
          return {
            ok: false,
            data: null,
            error: { code: "edit_failed", message: "移动记忆失败", recoverable: true },
          };
        }
        const items = await listGlobalMemoryItems(docId);
        return {
          ok: true,
          data: {
            ok: true,
            items: items.map((it) => ({ id: it.id, text: it.text, index: it.index })),
          },
        };
      }

      return {
        ok: false,
        data: null,
        error: { code: "unsupported_operation", message: "不支持的编辑操作", recoverable: true },
      };
    },

    summarizeResult(result: ToolResult<EditGlobalMemoryOutput>): string {
      if (!result.ok) {
        return result.error?.message ?? "编辑全局记忆失败";
      }
      return "已编辑全局记忆";
    },
  };
}
