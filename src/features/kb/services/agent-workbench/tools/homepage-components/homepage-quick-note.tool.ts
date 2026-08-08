import { z } from "zod";
import { getBlockByID } from "@/api";
import { getQuickNoteStatus, writeQuickNote } from "@/features/quick-note/quick-note-write-service";
import type { ToolContract } from "../../contracts/tool-contract";
import { alwaysAvailable, homepageComponentFailure } from "./homepage-component-tool-utils";

const statusSchema = z.object({}).strict();
const writeSchema = z.object({ content: z.string().trim().min(1).max(10000), sourceContext: z.string().trim().max(200).optional() }).strict();

export function createHomepageQuickNoteActionTools(): Array<{ action: "status" | "write"; tool: ToolContract }> {
  const status: ToolContract = {
    name: "homepage_quick_note_status", title: "查看快速笔记状态", description: "查看当前快速笔记配置状态。",
    inputSchema: statusSchema, readOnly: true, safety: { readOnly: true }, source: "builtin", providerVisible: false, availability: alwaysAvailable,
    async execute() { try { return { ok: true, data: await getQuickNoteStatus() }; } catch (error) { return homepageComponentFailure(error, "quick_note_status_failed", "读取快速笔记状态失败。"); } },
    summarizeResult: (result) => result.ok ? "快速笔记状态读取完成。" : result.error?.message ?? "读取失败。",
  };
  const write: ToolContract = {
    name: "homepage_quick_note_write", title: "写入快速笔记", description: "使用当前正式设置写入快速笔记。",
    inputSchema: writeSchema, readOnly: false, safety: { readOnly: false, canWrite: true, requiresConfirmation: true, riskLevel: "medium" }, source: "builtin", providerVisible: false, availability: alwaysAvailable,
    async execute(_ctx, raw) {
      const input = writeSchema.parse(raw);
      try {
        const result = await writeQuickNote({ content: input.content, source: "agent" });
        if (!result.ok) return { ok: false, data: null, error: { code: result.errorCode ?? "quick_note_write_failed", message: result.message, recoverable: true } };
        if (result.blockId) {
          const block = await getBlockByID(result.blockId);
          if (!block) return { ok: false, data: null, error: { code: "quick_note_write_unverified", message: "快速笔记已提交，但无法验证返回的内容块。", recoverable: false, details: { blockId: result.blockId } } };
        }
        return { ok: true, data: { changed: true, blockId: result.blockId, source: "agent", sourceContextProvided: Boolean(input.sourceContext), message: result.message } };
      } catch (error) { return homepageComponentFailure(error, "quick_note_write_failed", "快速笔记写入失败。"); }
    },
    summarizeResult: (result) => result.ok ? "快速笔记已记录。" : result.error?.message ?? "写入失败。",
  };
  return [{ action: "status", tool: status }, { action: "write", tool: write }];
}
