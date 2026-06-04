import type { AgentScope } from "../../../../scope/types";
import type {
  KbConversationTurnReferences,
  KbRetrievalToolDeps,
} from "./kb-retrieval-tool-deps";
import type { RecentTurnContext } from "../../../../workbench/contracts/recent-turn-context";
import type { KbSettings } from "../../../../../../types/settings";

export class KbRetrievalRuntimeState implements KbRetrievalToolDeps {
  private scope: AgentScope | undefined;
  private conversationTurns: readonly KbConversationTurnReferences[] | undefined;
  private settings: Partial<KbSettings> | undefined;
  private recentConversationContext: readonly RecentTurnContext[] | undefined;

  constructor(params: {
    scope: AgentScope;
    conversationTurns?: readonly KbConversationTurnReferences[];
    settings?: Partial<KbSettings>;
    recentConversationContext?: readonly RecentTurnContext[];
  }) {
    this.scope = params.scope;
    this.conversationTurns = params.conversationTurns;
    this.settings = params.settings;
    this.recentConversationContext = params.recentConversationContext;
  }

  setScope(scope: AgentScope): void {
    this.scope = scope;
  }

  getScope(): AgentScope | undefined {
    return this.scope;
  }

  getEffectiveScope(): AgentScope | undefined {
    return this.scope;
  }

  getConversationTurns(): readonly KbConversationTurnReferences[] | undefined {
    return this.conversationTurns;
  }

  getSettings(): Partial<KbSettings> | undefined {
    return this.settings;
  }

  getRecentConversationContext(): readonly RecentTurnContext[] | undefined {
    return this.recentConversationContext;
  }
}
