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
}).strict();

const editGlobalMemoryInputJsonSchemaOverride = {
  type: "object",
  properties: {
    operation: { type: "string", enum: ["list", "create", "update", "delete", "move"], description: "操作类型" },
    item_id: { type: "string", description: "update/delete/move 时的段落块 ID" },
    text: { type: "string", description: "create/update 时的内容" },
    target_id: { type: "string", description: "move 时参考块 ID（before/after 必填）" },
    position: { type: "string", enum: ["top", "bottom", "before", "after"], description: "move 时的位置方向" },
  },
  additionalProperties: false,
  required: ["operation"],
};

type EditGlobalMemoryInput = z.infer<typeof editGlobalMemoryInputSchema>;

const editGlobalMemoryOutputSchema = z.object({
  ok: z.boolean(),
  operation: z.enum(["list", "create", "update", "delete", "move"]),
  changed: z.boolean(),
  items: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        index: z.number(),
      })
    )
    .optional(),
  affectedItemIds: z.array(z.string()).optional(),
  message: z.string().optional(),
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
    description:
      "按条目管理配置好的全局记忆文档；list 只读取条目 ID 与内容，create/update/delete/move 会实际修改文档。",
    inputSchema: editGlobalMemoryInputSchema,
    outputSchema: editGlobalMemoryOutputSchema,
    readOnly: false,
    safety: { readOnly: false },
    source: "builtin",
    inputHint: "operation（list/create/update/delete/move），create/update 时提供 text，delete/update/move 时提供 item_id，move 时提供 position 和 target_id",
    boundary:
      "只能编辑配置好的全局记忆文档中的段落条目；update/delete 前会校验 item_id 归属；不接受任意 docId；不自动决定是否需要记住。list 不会修改记忆；只有 create/update/delete/move 成功后才代表记忆已变更。",
    plannerVisible: true,
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
            operation: "list",
            changed: false,
            items: items.map((it) => ({ id: it.id, text: it.text, index: it.index })),
            message: `已列出全局记忆，共 ${items.length} 条。`,
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
            operation: "create",
            changed: true,
            items: items.map((it) => ({ id: it.id, text: it.text, index: it.index })),
            affectedItemIds: [newId],
            message: "已新增 1 条全局记忆。",
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
            operation: "update",
            changed: true,
            items: items.map((it) => ({ id: it.id, text: it.text, index: it.index })),
            affectedItemIds: [itemId],
            message: "已更新 1 条全局记忆。",
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
            operation: "delete",
            changed: true,
            items: items.map((it) => ({ id: it.id, text: it.text, index: it.index })),
            affectedItemIds: [itemId],
            message: "已删除 1 条全局记忆。",
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
            operation: "move",
            changed: true,
            items: items.map((it) => ({ id: it.id, text: it.text, index: it.index })),
            affectedItemIds: [itemId],
            message: "已调整 1 条全局记忆顺序。",
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
      const data = result.data;
      if (data?.message) return data.message;
      if (data?.operation === "list") return `已列出全局记忆，共 ${data.items?.length ?? 0} 条。`;
      if (data?.operation === "create") return "已新增 1 条全局记忆。";
      if (data?.operation === "update") return "已更新 1 条全局记忆。";
      if (data?.operation === "delete") return "已删除 1 条全局记忆。";
      if (data?.operation === "move") return "已调整 1 条全局记忆顺序。";
      return "已编辑全局记忆";
    },
  };
}
