export const AGENT_PROFILE_SCHEMA_VERSION = 2 as const;

export const AGENT_CAPABILITY_IDS = [
  "conversation",
  "tools",
  "siyuan",
  "global-memory",
  "homepage",
  "web",
  "local-workspace",
  "external-skills",
  "mcp",
] as const;

export type AgentCapabilityId = typeof AGENT_CAPABILITY_IDS[number];

export const AGENT_CONTEXT_SOURCE_IDS = [
  "conversation",
  "knowledge",
  "global-memory",
  "attached-documents",
  "skills",
  "external-skills",
  "runtime-tools",
] as const;

export type AgentContextSourceId = typeof AGENT_CONTEXT_SOURCE_IDS[number];
export type AgentResourceAccess = "*" | readonly string[];

export interface AgentProfilePermissions {
  contextSources: readonly AgentContextSourceId[];
  tools: {
    names: AgentResourceAccess;
    /** `names` 为白名单时，聚合工具必须同时声明允许的 action。 */
    actions: Readonly<Record<string, AgentResourceAccess>>;
  };
  memory: {
    read: boolean;
    write: boolean;
  };
  externalSkillIds: AgentResourceAccess;
  mcpServerIds: AgentResourceAccess;
  mcpToolNames: AgentResourceAccess;
}

export interface AgentProfile {
  schemaVersion: typeof AGENT_PROFILE_SCHEMA_VERSION;
  id: string;
  label: string;
  capabilities: readonly AgentCapabilityId[];
  permissions: AgentProfilePermissions;
  execution: {
    defaultMaxToolCalls: number;
  };
}

const profiles = new Map<string, AgentProfile>();
const capabilityIds = new Set<string>(AGENT_CAPABILITY_IDS);
const contextSourceIds = new Set<string>(AGENT_CONTEXT_SOURCE_IDS);

function validateResourceAccess(access: AgentResourceAccess, label: string): void {
  if (access === "*") return;
  if (!Array.isArray(access) || access.some((id) => typeof id !== "string" || id.trim().length === 0)) {
    throw new Error(`Agent Profile ${label} 白名单无效`);
  }
}

function freezeResourceAccess(access: AgentResourceAccess): AgentResourceAccess {
  return access === "*" ? access : Object.freeze([...new Set(access)]);
}

function resourceAccessAllows(access: AgentResourceAccess, id: string): boolean {
  return access === "*" || access.includes(id);
}

export function registerAgentProfile(profile: AgentProfile): AgentProfile {
  if (profile.schemaVersion !== AGENT_PROFILE_SCHEMA_VERSION) {
    throw new Error(`Agent Profile 版本不受支持: ${profile.schemaVersion}`);
  }
  if (!/^[a-z][a-z0-9-]*$/.test(profile.id)) {
    throw new Error(`Agent Profile id 无效: ${profile.id}`);
  }
  if (!Number.isInteger(profile.execution.defaultMaxToolCalls) || profile.execution.defaultMaxToolCalls < 1) {
    throw new Error(`Agent Profile 最大工具调用次数无效: ${profile.id}`);
  }
  if (profiles.has(profile.id)) {
    throw new Error(`Agent Profile 已注册: ${profile.id}`);
  }
  const unsupportedCapability = profile.capabilities.find((id) => !capabilityIds.has(id));
  if (unsupportedCapability) {
    throw new Error(`Agent Profile 能力不受支持: ${unsupportedCapability}`);
  }
  const unsupportedContextSource = profile.permissions.contextSources.find((id) => !contextSourceIds.has(id));
  if (unsupportedContextSource) {
    throw new Error(`Agent Profile 上下文来源不受支持: ${unsupportedContextSource}`);
  }
  const capabilities = new Set(profile.capabilities);
  const requireCapability = (condition: boolean, capability: AgentCapabilityId, label: string): void => {
    if (condition && !capabilities.has(capability)) {
      throw new Error(`Agent Profile ${label} 缺少能力: ${capability}`);
    }
  };
  requireCapability(profile.permissions.contextSources.includes("conversation"), "conversation", "对话上下文");
  requireCapability(
    profile.permissions.contextSources.some((id) => id === "knowledge" || id === "attached-documents"),
    "siyuan",
    "知识上下文",
  );
  requireCapability(
    profile.permissions.contextSources.includes("global-memory")
      || profile.permissions.memory.read
      || profile.permissions.memory.write,
    "global-memory",
    "全局记忆",
  );
  requireCapability(
    profile.permissions.contextSources.some((id) => id === "skills" || id === "external-skills"),
    "external-skills",
    "Skill 上下文",
  );
  validateResourceAccess(profile.permissions.tools.names, "工具");
  validateResourceAccess(profile.permissions.externalSkillIds, "Skill");
  validateResourceAccess(profile.permissions.mcpServerIds, "MCP Server");
  validateResourceAccess(profile.permissions.mcpToolNames, "MCP 工具");
  for (const [toolName, actions] of Object.entries(profile.permissions.tools.actions)) {
    if (!toolName.trim()) throw new Error("Agent Profile action 白名单工具名无效");
    validateResourceAccess(actions, `${toolName} action`);
  }

  const frozenActions = Object.freeze(Object.fromEntries(
    Object.entries(profile.permissions.tools.actions)
      .map(([toolName, actions]) => [toolName, freezeResourceAccess(actions)]),
  ));

  const registered = Object.freeze({
    ...profile,
    capabilities: Object.freeze([...new Set(profile.capabilities)]),
    permissions: Object.freeze({
      contextSources: Object.freeze([...new Set(profile.permissions.contextSources)]),
      tools: Object.freeze({
        names: freezeResourceAccess(profile.permissions.tools.names),
        actions: frozenActions,
      }),
      memory: Object.freeze({ ...profile.permissions.memory }),
      externalSkillIds: freezeResourceAccess(profile.permissions.externalSkillIds),
      mcpServerIds: freezeResourceAccess(profile.permissions.mcpServerIds),
      mcpToolNames: freezeResourceAccess(profile.permissions.mcpToolNames),
    }),
    execution: Object.freeze({ ...profile.execution }),
  });
  profiles.set(profile.id, registered);
  return registered;
}

export function getAgentProfile(id: string): AgentProfile {
  const profile = profiles.get(id);
  if (!profile) throw new Error(`Agent Profile 未注册: ${id}`);
  return profile;
}

export function agentProfileHasCapability(
  profile: AgentProfile,
  capability: AgentCapabilityId,
): boolean {
  return profile.capabilities.includes(capability);
}

export function agentProfileAllowsContext(
  profile: AgentProfile,
  source: AgentContextSourceId,
): boolean {
  return profile.permissions.contextSources.includes(source);
}

export function agentProfileAllowsTool(profile: AgentProfile, toolName: string): boolean {
  return agentProfileHasCapability(profile, "tools")
    && resourceAccessAllows(profile.permissions.tools.names, toolName);
}

export function agentProfileAllowsToolAction(
  profile: AgentProfile,
  toolName: string,
  action: string,
): boolean {
  if (!agentProfileAllowsTool(profile, toolName)) return false;
  const access = profile.permissions.tools.actions[toolName];
  if (access) return resourceAccessAllows(access, action);
  return profile.permissions.tools.names === "*";
}

export function agentProfileAllowsMemory(
  profile: AgentProfile,
  operation: "read" | "write",
): boolean {
  return agentProfileHasCapability(profile, "global-memory")
    && profile.permissions.memory[operation];
}

export function agentProfileResourceAllowList(access: AgentResourceAccess): readonly string[] | undefined {
  return access === "*" ? undefined : access;
}

export const KNOWLEDGE_CHAT_AGENT_PROFILE_ID = "knowledge-chat";

registerAgentProfile({
  schemaVersion: AGENT_PROFILE_SCHEMA_VERSION,
  id: KNOWLEDGE_CHAT_AGENT_PROFILE_ID,
  label: "AI 知识库对话",
  capabilities: [...AGENT_CAPABILITY_IDS],
  permissions: {
    contextSources: [...AGENT_CONTEXT_SOURCE_IDS],
    tools: { names: "*", actions: {} },
    memory: { read: true, write: true },
    externalSkillIds: "*",
    mcpServerIds: "*",
    mcpToolNames: "*",
  },
  execution: {
    defaultMaxToolCalls: 20,
  },
});
