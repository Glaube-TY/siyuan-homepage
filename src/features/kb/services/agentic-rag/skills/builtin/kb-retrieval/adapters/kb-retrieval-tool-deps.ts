/**
 * KB retrieval tool deps: 注入 KB 工具所需的 scope、handle mapping 保存器等依赖。
 */

import type { AgentScope } from "../../../../scope/types";
import type { KnowledgeDocHandleMapping } from "../../../../tools/knowledge-map-types";

export interface KbConversationReference {
  docId?: string;
  docTitle: string;
}

export interface KbConversationTurnReferences {
  turnId?: string;
  footerRefs?: KbConversationReference[];
}

export interface KbRetrievalToolDeps {
  getScope(): AgentScope | undefined;
  getConversationTurns?(): readonly KbConversationTurnReferences[] | undefined;
  saveHandleMapping(mapping: KnowledgeDocHandleMapping[]): void;
}
