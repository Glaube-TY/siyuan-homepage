/**
 * Conversation Reference Tool Helper
 *
 * 结构 helper：判断是否需要 get_conversation_used_references 工具。
 *
 * 职责：
 * - 只使用结构字段，不解析用户原文
 * - 不使用 relationToPrevious / coverageIntent / conversationReferents 影响工具选择
 */

import type { AgenticRagState } from "./state";

export function needsConversationReferenceTool(state: AgenticRagState): boolean {
  const recentContext = state.runtime?.recentContext;
  const conversationTurns = recentContext?.conversationTurns;

  let totalFooterRefCount = 0;
  if (conversationTurns) {
    for (const turn of conversationTurns) {
      totalFooterRefCount += turn.footerRefs?.length ?? 0;
    }
  }

  return totalFooterRefCount > 0;
}
