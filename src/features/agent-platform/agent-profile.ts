export const AGENT_PROFILE_SCHEMA_VERSION = 1 as const;

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

export interface AgentProfile {
  schemaVersion: typeof AGENT_PROFILE_SCHEMA_VERSION;
  id: string;
  label: string;
  capabilities: readonly AgentCapabilityId[];
  execution: {
    defaultMaxToolCalls: number;
  };
}

const profiles = new Map<string, AgentProfile>();
const capabilityIds = new Set<string>(AGENT_CAPABILITY_IDS);

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

  const registered = Object.freeze({
    ...profile,
    capabilities: Object.freeze([...new Set(profile.capabilities)]),
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

export const KNOWLEDGE_CHAT_AGENT_PROFILE_ID = "knowledge-chat";

registerAgentProfile({
  schemaVersion: AGENT_PROFILE_SCHEMA_VERSION,
  id: KNOWLEDGE_CHAT_AGENT_PROFILE_ID,
  label: "AI 知识库对话",
  capabilities: [...AGENT_CAPABILITY_IDS],
  execution: {
    defaultMaxToolCalls: 20,
  },
});
