/**
 * KB retrieval tool deps: 注入 KB 工具所需的 scope、focus scope 等依赖。
 * 主线：直接使用 docId/blockId，不再维护 identifier 映射。
 */

import type { AgentScope } from "../../../../scope/types";
import type { KbSettings } from "../../../../../../types/settings";
import type { RecentTurnContext } from "../../../../workbench/contracts/recent-turn-context";
import type { ActiveFocusScope } from "../../../../tools/knowledge-map-types";

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
  /** Effective scope respecting focus_doc_scope. Tools like search/list/read should use this. */
  getEffectiveScope(): AgentScope | undefined;
  getConversationTurns?(): readonly KbConversationTurnReferences[] | undefined;
  getRecentConversationContext?(): readonly RecentTurnContext[] | undefined;
  getSettings?(): Partial<KbSettings> | undefined;
  getActiveFocusScope?(): ActiveFocusScope | undefined;
  saveActiveFocusScope?(scope: ActiveFocusScope): void;
}
