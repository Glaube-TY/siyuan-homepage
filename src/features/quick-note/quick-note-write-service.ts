import { appendBlock, getChildBlocks, insertBlock } from "@/api";
import { loadHomepageConfigDataStrict } from "@/homepage/configLoader";

export type QuickNoteSource = "local" | "feishu" | "quicker" | "external";

export interface QuickNoteWriteInput {
  content: string;
  source?: QuickNoteSource;
  senderId?: string;
  senderName?: string;
  chatId?: string;
  messageId?: string;
  receivedAt?: string;
  options?: {
    quickNotesPosition?: string;
    quickNotesTimestampEnabled?: boolean;
    quickNotesAddPosition?: string;
  };
}

export interface QuickNoteWriteResult {
  ok: boolean;
  changed: boolean;
  blockId?: string;
  message: string;
  errorCode?: string;
}

let pluginInstance: any = null;

export function setQuickNoteWritePlugin(plugin: any): void {
  pluginInstance = plugin;
}

function getPlugin(): any {
  if (!pluginInstance) {
    throw new Error("Quick note write service is not initialized.");
  }
  return pluginInstance;
}

function formatTimestamp(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} `
    + `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

function extractBlockId(result: unknown): string | undefined {
  const first = Array.isArray(result) ? result[0] : null;
  const id = first?.id ?? first?.doOperations?.[0]?.id;
  return typeof id === "string" ? id : undefined;
}

async function loadQuickNoteOptions(input: QuickNoteWriteInput) {
  if (input.options?.quickNotesPosition !== undefined) {
    return {
      quickNotesPosition: input.options.quickNotesPosition || "",
      quickNotesTimestampEnabled: input.options.quickNotesTimestampEnabled ?? true,
      quickNotesAddPosition: input.options.quickNotesAddPosition || "bottom",
    };
  }

  const config = (await loadHomepageConfigDataStrict(getPlugin())).data;
  return {
    quickNotesPosition: typeof config.quickNotesPosition === "string" ? config.quickNotesPosition : "",
    quickNotesTimestampEnabled: config.quickNotesTimestampEnabled ?? true,
    quickNotesAddPosition: typeof config.quickNotesAddPosition === "string" ? config.quickNotesAddPosition : "bottom",
  };
}

export async function writeQuickNote(input: QuickNoteWriteInput): Promise<QuickNoteWriteResult> {
  const content = (input.content ?? "").trim();
  if (!content) {
    return {
      ok: false,
      changed: false,
      message: "写入失败：内容为空。",
      errorCode: "empty_content",
    };
  }

  const options = await loadQuickNoteOptions(input);
  const targetId = (options.quickNotesPosition ?? "").trim();
  if (!targetId) {
    return {
      ok: false,
      changed: false,
      message: "写入失败：快速笔记目标文档未配置，请先在插件设置中配置快速笔记位置。",
      errorCode: "quick_note_target_missing",
    };
  }

  let contentToAdd = content;
  if (options.quickNotesTimestampEnabled) {
    contentToAdd += `    🕒${formatTimestamp()}`;
  }

  try {
    if (options.quickNotesAddPosition === "top") {
      const docChildren = await getChildBlocks(targetId);
      const firstChildId = Array.isArray(docChildren) && docChildren.length > 0 ? docChildren[0]?.id : "";
      if (firstChildId) {
        const result = await insertBlock("markdown", contentToAdd, firstChildId);
        return {
          ok: true,
          changed: true,
          blockId: extractBlockId(result),
          message: "已记录到快速笔记。",
        };
      }
    }

    const result = await appendBlock("markdown", contentToAdd, targetId);
    return {
      ok: true,
      changed: true,
      blockId: extractBlockId(result),
      message: "已记录到快速笔记。",
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "快速笔记写入失败。";
    return {
      ok: false,
      changed: false,
      message: `写入失败：${errorMsg}`,
      errorCode: "quick_note_write_failed",
    };
  }
}
