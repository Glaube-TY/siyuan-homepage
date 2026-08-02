/**
 * Siyuan tool deps: scope access for built-in siyuan tools.
 * Independent of Skill directory.
 */

import type { AgentScope } from "../../scope/types";
import type { KbSettings } from "../../../../types/settings";
import type { ConfirmationRoute } from "../../../agent-core/permissions/confirmation-bridge";

export interface SiyuanToolDeps {
  getScope(): AgentScope | undefined;
  getEffectiveScope(): AgentScope | undefined;
  getSettings?(): Partial<KbSettings> | undefined;
  loadPluginData?<T = unknown>(key: string): Promise<T | null>;
  savePluginData?<T = unknown>(key: string, data: T): Promise<void>;
  abortSignal?: AbortSignal;
  confirmationRoute?: ConfirmationRoute;
}
