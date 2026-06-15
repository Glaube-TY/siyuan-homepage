/**
 * Native Siyuan document editing write tools.
 *
 * Each tool's preview() reads local current content, generates a diff preview
 * (block diff or arrow flow), and returns display routing info to the
 * confirmation bridge. The execute() directly calls the confirmed executor
 * — NO internal requestDocContentEditConfirmation call.
 */

import type { NativeTool, ToolExecutionContext, ToolExecutionResult } from "../native-tool";
import type { NativeToolRegistry } from "../native-tool-registry";
import { ensureObjectJsonSchema } from "../native-tool-schema";
import { sql, getBlockKramdown } from "../../../../../../api";
import type { EditDiffPreview, DocContentEditArrowFlow } from "../../../doc-content-edit/doc-content-edit-types";
import { buildEditDiffPreview } from "../../../doc-content-edit/diff/edit-diff-preview-builder";
import { toDisplayMarkdownFromKramdown } from "../../../doc-content-edit/doc-content-edit-diff";
import { assessDocContentEditRisk } from "../../../doc-content-edit/doc-content-edit-risk";
import { createDocContentEditConfirmation } from "../../../doc-content-edit/doc-content-edit-confirmation-service";
import { executeConfirmedUpdateBlock } from "../../../doc-content-edit/doc-content-edit-update-block-executor";
import { executeConfirmedInsertBlock } from "../../../doc-content-edit/doc-content-edit-insert-block-executor";
import { executeConfirmedDeleteBlocks } from "../../../doc-content-edit/doc-content-edit-delete-blocks-executor";
import { executeConfirmedMoveBlock } from "../../../doc-content-edit/doc-content-edit-move-block-executor";
import { executeConfirmedCreateDoc } from "../../../doc-content-edit/doc-content-edit-create-doc-executor";
import { executeConfirmedRenameDoc } from "../../../doc-content-edit/doc-content-edit-rename-doc-executor";
import { executeConfirmedDeleteDoc } from "../../../doc-content-edit/doc-content-edit-delete-doc-executor";
import { executeConfirmedReplaceDocContent } from "../../../doc-content-edit/doc-content-edit-replace-doc-content-executor";
import { createArrowFlowCompare } from "../../../doc-content-edit/doc-content-edit-diff";

function escapeSqlId(id: string): string {
  return id.replace(/'/g, "''");
}

const CHINESE_TOOL_NAMES: Record<string, string> = {
  update_block: "更新内容块",
  insert_block: "插入内容块",
  delete_blocks: "删除内容块",
  replace_doc_content: "替换文档正文",
  move_block: "移动内容块",
  create_doc: "新建文档",
  rename_doc: "重命名文档",
  delete_doc: "删除文档",
};

function getChineseToolName(toolName: string): string {
  return CHINESE_TOOL_NAMES[toolName] ?? toolName;
}

function compactResult(ok: boolean, toolName: string, data: Record<string, unknown>, failMessage?: string): ToolExecutionResult {
  const cnName = getChineseToolName(toolName);
  return {
    ok,
    content: JSON.stringify({ ok, toolName, data }),
    summary: ok ? `已执行：${cnName}` : `执行失败：${cnName}${failMessage ? `：${failMessage}` : ""}`,
  };
}

/**
 * Read a window of sibling blocks around target blocks for diff previews.
 * Supports targets from different parents by grouping and processing each parent separately.
 * Returns ordered IAL-delimited content for the window,
 * plus a filtered version with targets removed for the "new" side.
 */
async function readSiblingWindow(
  targetBlockIds: string[],
  contextCount: number = 4,
): Promise<{ oldContent: string; newContent: string }> {
  if (targetBlockIds.length === 0) return { oldContent: "", newContent: "" };
  const targetSet = new Set(targetBlockIds);

  try {
    // Group targets by parent_id
    const parentGroups = new Map<string, string[]>();
    for (const blockId of targetBlockIds) {
      const row = await sql(`SELECT parent_id FROM blocks WHERE id = '${escapeSqlId(blockId)}'`);
      const pid = (row[0] as { parent_id?: string } | undefined)?.parent_id ?? "__none__";
      if (!parentGroups.has(pid)) parentGroups.set(pid, []);
      parentGroups.get(pid)!.push(blockId);
    }

    // Fallback for missing parent: per-block preview without context
    if (parentGroups.has("__none__") && parentGroups.size === 1) {
      // All targets have no parent — build per-block preview
      const oldParts: string[] = [];
      for (const blockId of targetBlockIds) {
        try {
          const kr = await getBlockKramdown(blockId);
          const display = toDisplayMarkdownFromKramdown(kr?.kramdown ?? "");
          oldParts.push(`{: id="${blockId}"}`);
          oldParts.push(display.trim() || "(空块)");
        } catch {
          oldParts.push(`{: id="${blockId}"}`);
          oldParts.push("(无法读取)");
        }
      }
      return { oldContent: oldParts.join("\n"), newContent: "" };
    }

    // Process each parent group and concatenate
    const allOld: string[] = [];
    const allNew: string[] = [];
    let firstGroup = true;

    for (const [pid, ids] of parentGroups) {
      if (pid === "__none__") continue;

      const groupSet = new Set(ids);
      const siblings = await sql(
        `SELECT * FROM blocks WHERE parent_id = '${escapeSqlId(pid)}' ORDER BY sort`,
      );
      const arr = siblings as Block[];

      const targetIndices: number[] = [];
      for (let i = 0; i < arr.length; i++) {
        if (groupSet.has(arr[i].id)) targetIndices.push(i);
      }
      if (targetIndices.length === 0) continue;

      const windowStart = Math.max(0, Math.min(...targetIndices) - contextCount);
      const windowEnd = Math.min(arr.length, Math.max(...targetIndices) + contextCount + 1);

      if (!firstGroup) {
        allOld.push(""); // separator
        allNew.push("");
      }
      firstGroup = false;

      for (let i = windowStart; i < windowEnd; i++) {
        const sid = arr[i].id;
        const isTarget = targetSet.has(sid);
        let kramdown = "";
        try {
          const kr = await getBlockKramdown(sid);
          kramdown = kr?.kramdown ?? "";
        } catch {
          kramdown = (arr[i] as Block).markdown ?? "";
        }
        const display = toDisplayMarkdownFromKramdown(kramdown);
        const blockText = display.trim() || "(空块)";

        allOld.push(`{: id="${sid}"}`);
        allOld.push(blockText);

        if (!isTarget) {
          allNew.push(`{: id="${sid}"}`);
          allNew.push(blockText);
        }
      }
    }

    return {
      oldContent: allOld.join("\n"),
      newContent: allNew.join("\n"),
    };
  } catch {
    return { oldContent: "", newContent: "" };
  }
}

// ─── update_block ───────────────────────────────────────────────────

function createNativeUpdateBlockTool(deps: { conversationId: string }): NativeTool {
  return {
    name: "update_block",
    title: "Update Block",
    description: "Update the Markdown content of a specified block.",
    parameters: ensureObjectJsonSchema({
      type: "object",
      properties: {
        blockId: { type: "string", description: "Block ID to update" },
        markdown: { type: "string", description: "New Markdown content" },
      },
      required: ["blockId", "markdown"],
      additionalProperties: false,
    }),
    readOnly: false,
    parallelSafe: false,
    riskLevel: "medium",
    providerVisible: true,
    source: "builtin",
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },

    async preview(args: Record<string, unknown>) {
      const blockId = String(args.blockId ?? "").trim();
      const markdown = String(args.markdown ?? "");

      const rows = await sql(
        `SELECT * FROM blocks WHERE id = '${escapeSqlId(blockId)}'`,
      );
      const block = rows[0] as Block | undefined;
      if (!block) throw new Error("目标块不存在。");

      let oldKramdown: string;
      try {
        const kr = await getBlockKramdown(blockId);
        oldKramdown = kr?.kramdown ?? "";
      } catch {
        oldKramdown = (block as Block).markdown ?? "";
      }

      // Use sibling window for context, then substitute target content
      // Use IAL-based targeting to avoid mismatching identical text in different blocks
      const windowContent = (await readSiblingWindow([blockId], 4)).oldContent;
      const targetIAL = `{: id="${blockId}"}`;

      // Build newFull: replace target block content between its IAL and next IAL
      const targetStart = windowContent.indexOf(targetIAL);
      let newFull: string;
      if (targetStart >= 0) {
        const afterIAL = targetStart + targetIAL.length;
        const nextIAL = windowContent.indexOf("\n{: id=\"", afterIAL);
        const prefix = windowContent.slice(0, afterIAL);
        const suffix = nextIAL >= 0 ? windowContent.slice(nextIAL) : "";
        newFull = prefix + "\n" + toDisplayMarkdownFromKramdown(markdown) + suffix;
      } else {
        // Fallback: IAL not found, use window as-is with new content appended
        newFull = windowContent + "\n" + targetIAL + "\n" + toDisplayMarkdownFromKramdown(markdown);
      }

      const diffPreview = buildEditDiffPreview({
        title: "更新内容块",
        oldContent: windowContent,
        newContent: newFull,
        targetBlockIds: [blockId],
        toolName: "update_block",
      });

      const risk = assessDocContentEditRisk({
        operation: "update_block",
        target: { blockId },
        markdownLength: markdown.length,
      });
      const confirmation = await createDocContentEditConfirmation({
        conversationId: deps.conversationId,
        action: "update_block",
        toolName: "update_block",
        toolInput: { blockId, markdown },
        target: { blockId, docId: block.root_id, title: block.content?.slice(0, 100) },
        beforeSnapshot: oldKramdown,
        afterSnapshot: markdown,
        riskLevel: risk.riskLevel,
      });

      return {
        displayMode: "block_diff" as const,
        confirmationId: confirmation.id,
        editDiffPreview: diffPreview,
      };
    },

    async execute(args: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
      const blockId = String(args.blockId ?? "").trim();
      const confirmationId = String((args as Record<string, unknown>)._confirmationId ?? "");
      if (!confirmationId) {
        return compactResult(false, "update_block", { blockId, changed: false, error: "missing confirmationId" }, "缺少确认 ID");
      }
      const res = await executeConfirmedUpdateBlock({ confirmationId });
      const success = res.ok && res.status === "success";
      return compactResult(success, "update_block", {
        blockId,
        changed: success,
        status: res.status,
        message: res.message,
      }, success ? undefined : res.message);
    },
  };
}

// ─── insert_block ───────────────────────────────────────────────────

function createNativeInsertBlockTool(deps: { conversationId: string }): NativeTool {
  return {
    name: "insert_block",
    title: "Insert Block",
    description: "Insert new content before/after/as-child of a reference block.",
    parameters: ensureObjectJsonSchema({
      type: "object",
      properties: {
        referenceBlockId: { type: "string", description: "Reference block ID" },
        position: { type: "string", description: "Position: before / after / child" },
        markdown: { type: "string", description: "Markdown content to insert" },
      },
      required: ["referenceBlockId", "position", "markdown"],
      additionalProperties: false,
    }),
    readOnly: false,
    parallelSafe: false,
    riskLevel: "medium",
    providerVisible: true,
    source: "builtin",
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },

    async preview(args: Record<string, unknown>) {
      const referenceBlockId = String(args.referenceBlockId ?? "").trim();
      const position = String(args.position ?? "after").trim();
      const markdown = String(args.markdown ?? "");

      // Use sibling window for context
      const window = await readSiblingWindow([referenceBlockId], 4);
      const oldFull = window.oldContent;
      const refIAL = `{: id="${referenceBlockId}"}`;
      const newBlockIAL = `{: id="__new__"}`;
      const newBlockContent = toDisplayMarkdownFromKramdown(markdown);
      const insertBlock = [newBlockIAL, newBlockContent].join("\n");

      let newFull: string;
      const refFound = oldFull && oldFull.includes(refIAL);

      if (refFound && position === "before") {
        newFull = oldFull.replace(refIAL, insertBlock + "\n" + refIAL);
      } else if (refFound && position === "child") {
        newFull = oldFull.replace(refIAL + "\n", refIAL + "\n" + insertBlock + "\n");
      } else if (refFound) {
        // after: insert after the reference block's content (next block or end)
        const refBlockStart = oldFull.indexOf(refIAL);
        const afterRef = oldFull.indexOf("\n{: id=\"", refBlockStart + refIAL.length);
        if (afterRef >= 0) {
          newFull = oldFull.slice(0, afterRef) + "\n" + insertBlock + "\n" + oldFull.slice(afterRef);
        } else {
          newFull = oldFull + "\n" + insertBlock;
        }
      } else {
        // Fallback: empty document or reference block not found
        // Show diff as pure addition
        newFull = oldFull ? oldFull + "\n" + insertBlock : insertBlock;
      }

      const diffPreview = buildEditDiffPreview({
        title: "插入内容块",
        oldContent: oldFull,
        newContent: newFull,
        toolName: "insert_block",
      });

      const risk = assessDocContentEditRisk({
        operation: "insert_block",
        target: { blockId: referenceBlockId },
        markdownLength: markdown.length,
      });
      const confirmation = await createDocContentEditConfirmation({
        conversationId: deps.conversationId,
        action: "insert_block",
        toolName: "insert_block",
        toolInput: { referenceBlockId, position, markdown },
        target: { referenceBlockId },
        beforeSnapshot: oldFull,
        afterSnapshot: newFull,
        riskLevel: risk.riskLevel,
      });

      return {
        displayMode: "block_diff" as const,
        confirmationId: confirmation.id,
        editDiffPreview: diffPreview,
      };
    },

    async execute(args: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
      const confirmationId = String((args as Record<string, unknown>)._confirmationId ?? "");
      if (!confirmationId) {
        return compactResult(false, "insert_block", { changed: false, error: "missing confirmationId" }, "缺少确认 ID");
      }
      const res = await executeConfirmedInsertBlock({ confirmationId });
      const success = res.ok && res.status === "success";
      return compactResult(success, "insert_block", {
        changed: success,
        status: res.status,
        message: res.message,
      }, success ? undefined : res.message);
    },
  };
}

// ─── delete_blocks ──────────────────────────────────────────────────

function createNativeDeleteBlocksTool(deps: { conversationId: string }): NativeTool {
  return {
    name: "delete_blocks",
    title: "Delete Blocks",
    description: "Delete one or more blocks by their IDs. For a single block, pass a single-element array. For multiple blocks, pass all blockIds at once.",
    parameters: ensureObjectJsonSchema({
      type: "object",
      properties: {
        blockIds: {
          type: "array",
          items: { type: "string" },
          description: "Block IDs to delete",
        },
      },
      required: ["blockIds"],
      additionalProperties: false,
    }),
    readOnly: false,
    parallelSafe: false,
    riskLevel: "high",
    providerVisible: true,
    source: "builtin",
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },

    async preview(args: Record<string, unknown>) {
      const rawIds = (args.blockIds as string[]) ?? [];
      const blockIds = rawIds.map((id) => id.trim()).filter(Boolean);

      // Use sibling window for correct order and clean new side
      const window = blockIds.length > 0
        ? await readSiblingWindow(blockIds, 4)
        : { oldContent: "", newContent: "" };

      const diffPreview = buildEditDiffPreview({
        title: "删除内容块",
        oldContent: window.oldContent,
        newContent: window.newContent,
        targetBlockIds: blockIds,
        toolName: "delete_blocks",
      });

      const risk = assessDocContentEditRisk({
        operation: "delete_blocks",
        target: { blockId: blockIds[0] },
      });
      const confirmation = await createDocContentEditConfirmation({
        conversationId: deps.conversationId,
        action: "delete_blocks",
        toolName: "delete_blocks",
        toolInput: { blockIds },
        target: { blockId: blockIds[0] },
        beforeSnapshot: window.oldContent,
        afterSnapshot: window.newContent,
        riskLevel: risk.riskLevel,
      });

      return {
        displayMode: "block_diff" as const,
        confirmationId: confirmation.id,
        editDiffPreview: diffPreview,
      };
    },

    async execute(args: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
      const confirmationId = String((args as Record<string, unknown>)._confirmationId ?? "");
      if (!confirmationId) {
        return compactResult(false, "delete_blocks", { deleted: false, error: "missing confirmationId" }, "缺少确认 ID");
      }
      const res = await executeConfirmedDeleteBlocks({ confirmationId });
      const success = res.ok && res.status === "success";
      return compactResult(success, "delete_blocks", {
        deletedCount: res.deletedCount ?? 0,
        status: res.status,
        message: res.message,
      }, success ? undefined : res.message);
    },
  };
}

// ─── replace_doc_content ────────────────────────────────────────────

function createNativeReplaceDocContentTool(deps: { conversationId: string }): NativeTool {
  return {
    name: "replace_doc_content",
    title: "Replace Document Content",
    description: "Fully replace the Markdown body of a document.",
    parameters: ensureObjectJsonSchema({
      type: "object",
      properties: {
        docId: { type: "string", description: "Document ID" },
        markdown: { type: "string", description: "New Markdown body" },
      },
      required: ["docId", "markdown"],
      additionalProperties: false,
    }),
    readOnly: false,
    parallelSafe: false,
    riskLevel: "high",
    providerVisible: true,
    source: "builtin",
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },

    async preview(args: Record<string, unknown>) {
      const docId = String(args.docId ?? "").trim();
      const markdown = String(args.markdown ?? "");

      const rows = await sql(
        `SELECT * FROM blocks WHERE id = '${escapeSqlId(docId)}' AND type = 'd'`,
      );
      const block = rows[0] as Block | undefined;
      if (!block) throw new Error("目标文档不存在。");

      let oldContent: string;
      try {
        const kr = await getBlockKramdown(docId);
        oldContent = kr?.kramdown ?? "";
      } catch {
        oldContent = "";
      }

      const oldDisplay = toDisplayMarkdownFromKramdown(oldContent);
      const newDisplay = toDisplayMarkdownFromKramdown(markdown);

      const isLongDoc = oldContent.length > 30000 || markdown.length > 30000;

      if (isLongDoc) {
        const confirmation = await createDocContentEditConfirmation({
          conversationId: deps.conversationId,
          action: "replace_doc_content",
          toolName: "replace_doc_content",
          toolInput: { docId, markdown },
          target: { docId, title: block.content?.slice(0, 100) },
          beforeSnapshot: oldContent,
          afterSnapshot: markdown,
          riskLevel: "high",
          warnings: ["文档内容较长，替换将完全覆盖当前正文。"],
        });

        const longPreview: EditDiffPreview = {
          mode: "block_diff",
          title: "替换文档正文",
          summary: `替换文档正文 · 长文档 (${oldContent.length}→${markdown.length} 字符) · 高风险`,
          entries: [],
          stats: { addedLines: 0, removedLines: 0, modifiedBlocks: 0, addedBlocks: 0, removedBlocks: 0 },
          displayOptions: { defaultView: "split", collapseUnchanged: true, contextBlocks: 1 },
          truncated: true,
        };

        return {
          displayMode: "summary" as const,
          confirmationId: confirmation.id,
          editDiffPreview: longPreview,
        };
      }

      const diffPreview = buildEditDiffPreview({
        title: "替换文档正文",
        oldContent: oldDisplay,
        newContent: newDisplay,
        toolName: "replace_doc_content",
      });

      const risk = assessDocContentEditRisk({
        operation: "replace_doc_content",
        target: { docId },
        markdownLength: markdown.length,
      });
      const confirmation = await createDocContentEditConfirmation({
        conversationId: deps.conversationId,
        action: "replace_doc_content",
        toolName: "replace_doc_content",
        toolInput: { docId, markdown },
        target: { docId, title: block.content?.slice(0, 100) },
        beforeSnapshot: oldContent,
        afterSnapshot: markdown,
        riskLevel: risk.riskLevel,
      });

      return {
        displayMode: "block_diff" as const,
        confirmationId: confirmation.id,
        editDiffPreview: diffPreview,
      };
    },

    async execute(args: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
      const confirmationId = String((args as Record<string, unknown>)._confirmationId ?? "");
      const docId = String(args.docId ?? "").trim();
      if (!confirmationId) {
        return compactResult(false, "replace_doc_content", { docId, changed: false, error: "missing confirmationId" }, "缺少确认 ID");
      }
      const res = await executeConfirmedReplaceDocContent({ confirmationId });
      const success = res.ok && res.status === "success";
      return compactResult(success, "replace_doc_content", {
        docId,
        changed: success,
        status: res.status,
        message: res.message,
      }, success ? undefined : res.message);
    },
  };
}

// ─── move_block ─────────────────────────────────────────────────────

function createNativeMoveBlockTool(deps: { conversationId: string }): NativeTool {
  return {
    name: "move_block",
    title: "Move Block",
    description: "Move a block to a new location.",
    parameters: ensureObjectJsonSchema({
      type: "object",
      properties: {
        blockId: { type: "string", description: "Block ID to move" },
        previousID: { type: "string", description: "Move after this block (optional)" },
        parentID: { type: "string", description: "Move under this block (optional)" },
      },
      required: ["blockId"],
      additionalProperties: false,
    }),
    readOnly: false,
    parallelSafe: false,
    riskLevel: "medium",
    providerVisible: true,
    source: "builtin",
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },

    async preview(args: Record<string, unknown>) {
      const blockId = String(args.blockId ?? "").trim();
      const previousID = String(args.previousID ?? "").trim() || undefined;
      const parentID = String(args.parentID ?? "").trim() || undefined;

      const rows = await sql(
        `SELECT * FROM blocks WHERE id = '${escapeSqlId(blockId)}'`,
      );
      const block = rows[0] as Block | undefined;
      if (!block) throw new Error("目标块不存在。");

      const blockLabel = block.content?.slice(0, 50) || blockId;
      const toLabel = previousID
        ? `之后 ${previousID}`
        : parentID
          ? `之下 ${parentID}`
          : "新位置";

      const arrow: DocContentEditArrowFlow = createArrowFlowCompare(
        blockLabel,
        toLabel,
        { fromDescription: "当前位置", toDescription: "目标位置" },
      );

      const risk = assessDocContentEditRisk({
        operation: "move_block",
        target: { blockId },
      });

      let beforeSnapshot = "";
      try {
        const kr = await getBlockKramdown(blockId);
        beforeSnapshot = kr?.kramdown ?? "";
      } catch {
        // Read failure is non-fatal; executor will still check block existence
      }

      const confirmation = await createDocContentEditConfirmation({
        conversationId: deps.conversationId,
        action: "move_block",
        toolName: "move_block",
        toolInput: { blockId, previousID, parentID },
        target: { blockId, previousID, parentID },
        beforeSnapshot,
        riskLevel: risk.riskLevel,
      });

      return {
        displayMode: "arrow_flow" as const,
        confirmationId: confirmation.id,
        arrowFlow: arrow,
      };
    },

    async execute(args: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
      const confirmationId = String((args as Record<string, unknown>)._confirmationId ?? "");
      if (!confirmationId) {
        return compactResult(false, "move_block", { moved: false, error: "missing confirmationId" }, "缺少确认 ID");
      }
      const res = await executeConfirmedMoveBlock({ confirmationId });
      const success = res.ok && res.status === "success";
      return compactResult(success, "move_block", {
        moved: success,
        status: res.status,
        message: res.message,
        target: res.target,
      }, success ? undefined : res.message);
    },
  };
}

// ─── create_doc ─────────────────────────────────────────────────────

function createNativeCreateDocTool(deps: { conversationId: string }): NativeTool {
  return {
    name: "create_doc",
    title: "Create Document",
    description: "Create a new document in a notebook.",
    parameters: ensureObjectJsonSchema({
      type: "object",
      properties: {
        notebookId: { type: "string", description: "Notebook ID" },
        path: { type: "string", description: "Document path starting with /" },
        markdown: { type: "string", description: "Initial Markdown content" },
      },
      required: ["notebookId", "path", "markdown"],
      additionalProperties: false,
    }),
    readOnly: false,
    parallelSafe: false,
    riskLevel: "medium",
    providerVisible: true,
    source: "builtin",
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },

    async preview(args: Record<string, unknown>) {
      const notebookId = String(args.notebookId ?? "").trim();
      const path = String(args.path ?? "").trim();
      const markdown = String(args.markdown ?? "");
      const title = path.split("/").pop() || path;

      const arrow: DocContentEditArrowFlow = createArrowFlowCompare("无", title, {
        fromDescription: "当前无此文档",
        toDescription: `新建文档 ${path}`,
      });

      const risk = assessDocContentEditRisk({
        operation: "create_doc",
        target: { notebookId, docPath: path },
        markdownLength: markdown.length,
      });
      const confirmation = await createDocContentEditConfirmation({
        conversationId: deps.conversationId,
        action: "create_doc",
        toolName: "create_doc",
        toolInput: { notebookId, path, markdown },
        target: { notebookId, docPath: path, title },
        afterSnapshot: markdown,
        riskLevel: risk.riskLevel,
      });

      return {
        displayMode: "arrow_flow" as const,
        confirmationId: confirmation.id,
        arrowFlow: arrow,
      };
    },

    async execute(args: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
      const confirmationId = String((args as Record<string, unknown>)._confirmationId ?? "");
      if (!confirmationId) {
        return compactResult(false, "create_doc", { created: false, error: "missing confirmationId" }, "缺少确认 ID");
      }
      const res = await executeConfirmedCreateDoc({ confirmationId });
      const success = res.ok && res.status === "success";
      return compactResult(success, "create_doc", {
        created: success,
        docId: res.target?.docId,
        status: res.status,
        message: res.message,
      }, success ? undefined : res.message);
    },
  };
}

// ─── rename_doc ─────────────────────────────────────────────────────

function createNativeRenameDocTool(deps: { conversationId: string }): NativeTool {
  return {
    name: "rename_doc",
    title: "Rename Document",
    description: "Rename a document title.",
    parameters: ensureObjectJsonSchema({
      type: "object",
      properties: {
        docId: { type: "string", description: "Document ID" },
        title: { type: "string", description: "New title" },
      },
      required: ["docId", "title"],
      additionalProperties: false,
    }),
    readOnly: false,
    parallelSafe: false,
    riskLevel: "low",
    providerVisible: true,
    source: "builtin",
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },

    async preview(args: Record<string, unknown>) {
      const docId = String(args.docId ?? "").trim();
      const title = String(args.title ?? "").trim();

      const rows = await sql(
        `SELECT * FROM blocks WHERE id = '${escapeSqlId(docId)}' AND type = 'd'`,
      );
      const block = rows[0] as Block | undefined;
      const previousTitle = block?.content || block?.name || "未命名";

      const arrow: DocContentEditArrowFlow = createArrowFlowCompare(previousTitle, title, {
        fromDescription: `文档 ID：${docId}`,
        toDescription: `重命名为：${title}`,
      });

      const risk = assessDocContentEditRisk({
        operation: "rename_doc",
        target: { docId },
      });
      const confirmation = await createDocContentEditConfirmation({
        conversationId: deps.conversationId,
        action: "rename_doc",
        toolName: "rename_doc",
        toolInput: { docId, title },
        target: { docId, title },
        beforeSnapshot: previousTitle,
        riskLevel: risk.riskLevel,
      });

      return {
        displayMode: "arrow_flow" as const,
        confirmationId: confirmation.id,
        arrowFlow: arrow,
      };
    },

    async execute(args: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
      const confirmationId = String((args as Record<string, unknown>)._confirmationId ?? "");
      if (!confirmationId) {
        return compactResult(false, "rename_doc", { renamed: false, error: "missing confirmationId" }, "缺少确认 ID");
      }
      const res = await executeConfirmedRenameDoc({ confirmationId });
      const success = res.ok && res.status === "success";
      return compactResult(success, "rename_doc", {
        renamed: success,
        status: res.status,
        message: res.message,
      }, success ? undefined : res.message);
    },
  };
}

// ─── delete_doc ─────────────────────────────────────────────────────

function createNativeDeleteDocTool(deps: { conversationId: string }): NativeTool {
  return {
    name: "delete_doc",
    title: "Delete Document",
    description: "Permanently delete a document.",
    parameters: ensureObjectJsonSchema({
      type: "object",
      properties: {
        docId: { type: "string", description: "Document ID" },
      },
      required: ["docId"],
      additionalProperties: false,
    }),
    readOnly: false,
    parallelSafe: false,
    riskLevel: "high",
    providerVisible: true,
    source: "builtin",
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },

    async preview(args: Record<string, unknown>) {
      const docId = String(args.docId ?? "").trim();

      const rows = await sql(
        `SELECT * FROM blocks WHERE id = '${escapeSqlId(docId)}' AND type = 'd'`,
      );
      const block = rows[0] as Block | undefined;
      const title = block?.content || block?.name || "未命名";

      const arrow: DocContentEditArrowFlow = createArrowFlowCompare(
        title || "未命名",
        "删除",
        { fromDescription: `文档 ID：${docId}`, toDescription: "文档将被永久删除" },
      );

      const risk = assessDocContentEditRisk({
        operation: "delete_doc",
        target: { docId },
      });
      const confirmation = await createDocContentEditConfirmation({
        conversationId: deps.conversationId,
        action: "delete_doc",
        toolName: "delete_doc",
        toolInput: { docId },
        target: { docId, title },
        beforeSnapshot: title,
        afterSnapshot: "",
        riskLevel: risk.riskLevel,
      });

      return {
        displayMode: "arrow_flow" as const,
        confirmationId: confirmation.id,
        arrowFlow: arrow,
      };
    },

    async execute(args: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
      const confirmationId = String((args as Record<string, unknown>)._confirmationId ?? "");
      if (!confirmationId) {
        return compactResult(false, "delete_doc", { deleted: false, error: "missing confirmationId" }, "缺少确认 ID");
      }
      const res = await executeConfirmedDeleteDoc({ confirmationId });
      const success = res.ok && res.status === "success";
      return compactResult(success, "delete_doc", {
        deleted: success,
        status: res.status,
        message: res.message,
      }, success ? undefined : res.message);
    },
  };
}

// ─── Registration ───────────────────────────────────────────────────

export interface NativeSiyuanWriteToolsOptions {
  conversationId: string;
}

export const NATIVE_WRITE_TOOL_NAMES = new Set([
  "update_block",
  "insert_block",
  "delete_blocks",
  "replace_doc_content",
  "move_block",
  "create_doc",
  "rename_doc",
  "delete_doc",
]);

export function registerNativeSiyuanWriteTools(
  registry: NativeToolRegistry,
  options: NativeSiyuanWriteToolsOptions,
): void {
  registry.register(createNativeUpdateBlockTool(options));
  registry.register(createNativeInsertBlockTool(options));
  registry.register(createNativeDeleteBlocksTool(options));
  registry.register(createNativeReplaceDocContentTool(options));
  registry.register(createNativeMoveBlockTool(options));
  registry.register(createNativeCreateDocTool(options));
  registry.register(createNativeRenameDocTool(options));
  registry.register(createNativeDeleteDocTool(options));
}
