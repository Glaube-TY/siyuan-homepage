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
  private loadPluginDataFn: (<T = unknown>(key: string) => Promise<T | null>) | undefined;
  private savePluginDataFn: (<T = unknown>(key: string, data: T) => Promise<void>) | undefined;

  constructor(params: {
    scope: AgentScope;
    settings?: Partial<KbSettings>;
    loadPluginData?: <T = unknown>(key: string) => Promise<T | null>;
    savePluginData?: <T = unknown>(key: string, data: T) => Promise<void>;
  }) {
    this.scope = params.scope;
    this.settings = params.settings;
    this.loadPluginDataFn = params.loadPluginData;
    this.savePluginDataFn = params.savePluginData;
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

  loadPluginData<T = unknown>(key: string): Promise<T | null> {
    if (!this.loadPluginDataFn) return Promise.resolve(null);
    return this.loadPluginDataFn<T>(key);
  }

  savePluginData<T = unknown>(key: string, data: T): Promise<void> {
    if (!this.savePluginDataFn) return Promise.resolve();
    return this.savePluginDataFn<T>(key, data);
  }
}
