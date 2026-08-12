/**
 * Turn result types — shared between agent-workbench and orchestration layer.
 *
 * AgentWorkbenchEvent is defined in turn-event.ts. This file adds the
 * turn-level result types used by orchestration and the chat type system.
 */

import type { AgentScope, AgentScopeSummary } from "../scope/types";
import type { CitationSegment, ReferenceItem } from "../../../types/chat";
import type { AgentWorkbenchEvent } from "./turn-event";
import type { AgentTemporaryWorkbenchReference } from "../tools/homepage/homepage-workbench.tool";

/** Agent turn result returned to orchestration. */
export interface AgentTurnResult {
  scope: AgentScope;
  scopeSummary: AgentScopeSummary;
  answer: string;
  footerReferences: ReferenceItem[];
  /** 回答正文中的引用位置；与 footerReferences 的 index 对应。 */
  citationSegments?: CitationSegment[];
  warnings: string[];
  events: AgentWorkbenchEvent[];
  /** 本轮生成的工作台轻量引用；完整内容由统一工作台仓库存储。 */
  temporaryWorkbenches?: AgentTemporaryWorkbenchReference[];
  /** Agent-provided stage summary for current-session context compression. */
  stageSummary?: {
    summary: string;
  };
}
