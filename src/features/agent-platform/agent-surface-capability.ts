export type AgentSurfaceScope = "homepage" | "homepage-component";

export interface AgentContextProvider {
  id: string;
  title: string;
  scope: AgentSurfaceScope;
  sensitivity: "private";
  source: {
    toolName: string;
    actions: readonly string[];
  };
}

export interface AgentActionProvider {
  id: string;
  title: string;
  scope: AgentSurfaceScope;
  toolName: string;
  action: string;
  readOnly: boolean;
  idempotency: "read" | "non_idempotent";
  requiresConfirmation: boolean;
}

export interface AgentSurfaceCapabilitySnapshot {
  contexts: readonly AgentContextProvider[];
  actions: readonly AgentActionProvider[];
}

export function createAgentSurfaceCapabilitySnapshot(input: AgentSurfaceCapabilitySnapshot): AgentSurfaceCapabilitySnapshot {
  const ids = new Set<string>();
  for (const provider of [...input.contexts, ...input.actions]) {
    if (ids.has(provider.id)) throw new Error(`Agent surface capability duplicated: ${provider.id}`);
    ids.add(provider.id);
  }
  const readableActions = new Set(input.actions
    .filter((provider) => provider.readOnly)
    .map((provider) => `${provider.toolName}:${provider.action}`));
  for (const context of input.contexts) {
    for (const action of context.source.actions) {
      if (!readableActions.has(`${context.source.toolName}:${action}`)) {
        throw new Error(`Agent context source is not a registered read action: ${context.id}`);
      }
    }
  }
  return {
    contexts: [...input.contexts].sort((a, b) => a.id.localeCompare(b.id)),
    actions: [...input.actions].sort((a, b) => a.id.localeCompare(b.id)),
  };
}
