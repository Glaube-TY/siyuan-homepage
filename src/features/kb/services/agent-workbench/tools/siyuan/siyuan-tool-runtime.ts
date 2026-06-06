/**
 * Siyuan tool runtime state — holds the AgentScope for a turn.
 * Lives in agent-workbench so tools don't depend on Skill directories.
 */

import type { AgentScope } from "../../scope/types";
import type { SiyuanToolDeps } from "./siyuan-tool-deps";
import type { KbSettings } from "../../../../types/settings";

export class SiyuanToolRuntimeState implements SiyuanToolDeps {
  private scope: AgentScope | undefined;
  private settings: Partial<KbSettings> | undefined;

  constructor(params: {
    scope: AgentScope;
    settings?: Partial<KbSettings>;
  }) {
    this.scope = params.scope;
    this.settings = params.settings;
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

  getSettings(): Partial<KbSettings> | undefined {
    return this.settings;
  }
}
