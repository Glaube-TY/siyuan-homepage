import type { ConversationContextSnapshot } from "../../agent-workbench/runtime/conversation-context-builder";

function stringifyCompact(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function renderContextInstructions(params: {
  conversationContext?: ConversationContextSnapshot;
  globalMemory?: string;
  attachedDocs?: readonly { docId: string; title?: string }[];
}): string {
  const blocks: string[] = [];

  if (params.globalMemory?.trim()) {
    blocks.push("# Global Memory");
    blocks.push("This is long-term user memory. It is preference/context, not a substitute for current evidence.");
    blocks.push(params.globalMemory.trim());
  }

  if (params.attachedDocs?.length) {
    blocks.push("# Current Turn Attached Documents");
    blocks.push(stringifyCompact(params.attachedDocs.map((doc) => ({
      docId: doc.docId,
      title: doc.title ?? "",
    }))));
  }

  if (params.conversationContext) {
    const contextWithoutMemory = params.globalMemory
      ? { ...params.conversationContext, globalMemory: undefined }
      : params.conversationContext;
    blocks.push("# Conversation Context");
    blocks.push("This context is lightweight memory and history. It does not contain raw historical tool observations.");
    blocks.push(stringifyCompact(contextWithoutMemory));
  }

  return blocks.join("\n\n");
}

