import { writeQuickNote, setQuickNoteWritePlugin } from "@/features/quick-note/quick-note-write-service";
import { sanitizeChatActionErrorMessage } from "./chat-action-redact";
import type { ChatActionErrorCode } from "./types";

export interface ExternalQuickNoteInput {
  content: string;
  source: "feishu";
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

export interface ExternalQuickNoteResult {
  ok: boolean;
  changed: boolean;
  blockId?: string;
  message: string;
  errorCode?: ChatActionErrorCode;
}

export { setQuickNoteWritePlugin as setQuickNoteActionPlugin };

export async function addExternalQuickNote(input: ExternalQuickNoteInput): Promise<ExternalQuickNoteResult> {
  const result = await writeQuickNote({
    content: input.content,
    source: "feishu",
    senderId: input.senderId,
    senderName: input.senderName,
    chatId: input.chatId,
    messageId: input.messageId,
    receivedAt: input.receivedAt,
    options: input.options,
  });

  if (!result.ok) {
    return {
      ok: false,
      changed: false,
      message: sanitizeChatActionErrorMessage(result.message, "快速笔记写入失败。"),
      errorCode: (result.errorCode as ChatActionErrorCode) ?? "quick_note_write_failed",
    };
  }

  return {
    ok: true,
    changed: result.changed,
    blockId: result.blockId,
    message: result.message,
  };
}
