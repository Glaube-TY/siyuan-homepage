/**
 * Turn result types — shared between agent-workbench and orchestration layer.
 *
 * AgentWorkbenchEvent is defined in turn-event.ts. This file adds the
 * turn-level result types used by orchestration and the chat type system.
 */

import type { AgentScope, AgentScopeSummary } from "../scope/types";
import type { ReferenceItem } from "../../../types/chat";

/** Agent turn result returned to orchestration. */
export interface AgentTurnResult {
  scope: AgentScope;
  scopeSummary: AgentScopeSummary;
  answer: string;
  footerReferences: ReferenceItem[];
  warnings: string[];
  events: import("./turn-event").AgentWorkbenchEvent[];
  /** Planner-provided stage summary for current-session context compression. */
  stageSummary?: {
    summary: string;
  };
}
