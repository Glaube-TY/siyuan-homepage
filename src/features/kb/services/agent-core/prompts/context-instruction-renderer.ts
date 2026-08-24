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
    blocks.push("# User Long-term Memory");
    blocks.push("Use these user facts silently for personalization. The current user message wins on conflicts. Never expose memory IDs, storage paths, or internal implementation.");
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
    const { manifest: _manifest, recentTurns: _recentTurns, ...contextWithoutManifest } = params.conversationContext;
    const contextWithoutMemory = params.globalMemory
      ? { ...contextWithoutManifest, globalMemory: undefined }
      : contextWithoutManifest;
    blocks.push("# Conversation Context");
    blocks.push("This context is lightweight memory and history. It does not contain raw historical tool observations.");
    blocks.push(stringifyCompact(contextWithoutMemory));
    const webAccess = params.conversationContext.currentTurn.webAccess;
    if (webAccess?.enabled) {
      blocks.push([
        "# Web Search",
        "联网搜索返回的是候选来源，不是已核验事实；需要以公开互联网信息为依据时，使用 web_search 获取候选，并用 web_fetch.read_page 核验重要页面。",
        webAccess.mode === "required"
          ? "本轮要求联网：必须实际成功调用 web_search；没有成功检索时不要把记忆或猜测当作当前事实。"
          : "本轮为智能联网模式：由模型根据用户语义自主决定是否调用 web_search；当回答依赖可能变化的公开互联网事实时应使用 web_search。本地 SiYuan、任务、日记或记忆问题选择对应本地能力。",
      ].join("\n"));
    }
  }

  return blocks.join("\n\n");
}
