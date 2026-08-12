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
  "homepage-statistics",
  "editor-selection",
  "editor-document",
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
  if (!Number.isInteger(profile.execution.defaultMaxToolCalls) || profile.execution.defaultMaxToolCalls < 0) {
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
  if (capabilities.has("tools") && profile.execution.defaultMaxToolCalls < 1) {
    throw new Error(`Agent Profile 工具调用次数无效: ${profile.id}`);
  }
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
export const ROBOT_AGENT_PROFILE_ID = "remote-robot";
export const HOMEPAGE_STATUS_AGENT_PROFILE_ID = "homepage-status";
export const EDITOR_SELECTION_AGENT_PROFILE_ID = "editor-selection";
export const BACKGROUND_JOB_AGENT_PROFILE_ID = "background-job";

const BACKGROUND_SAFE_ACTIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  siyuan_kb: ["search", "read_docs", "read_evidence", "get_doc_info", "list_map", "list_by_time", "outline", "refs", "extra_search"],
  diary_task: ["overview", "query_tasks", "query_records", "find_docs"],
});

export function createBackgroundJobAgentProfile(input: {
  allowedToolNames: readonly string[];
  allowedActionNames: readonly string[];
  memoryAccess: "none" | "read";
  maxToolCalls: number;
}): AgentProfile {
  const names = [...new Set(input.allowedToolNames)].filter((name) => BACKGROUND_SAFE_ACTIONS[name]);
  const requestedActions = new Set(input.allowedActionNames);
  const actions = Object.fromEntries(names.map((name) => [name,
    BACKGROUND_SAFE_ACTIONS[name].filter((action) => requestedActions.has(`${name}:${action}`)),
  ]));
  const memoryRead = input.memoryAccess === "read";
  if (names.some((name) => actions[name].length === 0)) throw new Error("后台 Agent 工具必须明确授权至少一个只读 action。");
  const capabilities: AgentCapabilityId[] = ["tools", "siyuan"];
  const contextSources: AgentContextSourceId[] = ["knowledge"];
  if (memoryRead) { capabilities.push("global-memory"); contextSources.push("global-memory"); }
  return Object.freeze({
    schemaVersion: AGENT_PROFILE_SCHEMA_VERSION,
    id: BACKGROUND_JOB_AGENT_PROFILE_ID,
    label: "后台自动化任务",
    capabilities: Object.freeze(capabilities),
    permissions: Object.freeze({
      contextSources: Object.freeze(contextSources),
      tools: Object.freeze({ names: Object.freeze(names), actions: Object.freeze(actions) }),
      memory: Object.freeze({ read: memoryRead, write: false }),
      externalSkillIds: Object.freeze([]), mcpServerIds: Object.freeze([]), mcpToolNames: Object.freeze([]),
    }),
    execution: Object.freeze({ defaultMaxToolCalls: Math.max(0, input.maxToolCalls) }),
  });
}

export const ROBOT_AGENT_TOOL_NAMES = [
  "siyuan_kb",
  "diary_task",
  "siyuan_database",
  "siyuan_doc_edit",
  "siyuan_tree",
  "siyuan_meta",
  "siyuan_asset",
  "siyuan_riff",
  "homepage_quick_note",
  "homepage_focus",
  "homepage_accounting",
  "homepage_fixed_assets",
  "homepage_anniversary",
  "homepage_favorites",
  "homepage_review",
  "memory_manage",
  "automation_manage",
  "notification_manage",
] as const;

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

registerAgentProfile({
  schemaVersion: AGENT_PROFILE_SCHEMA_VERSION,
  id: ROBOT_AGENT_PROFILE_ID,
  label: "远程机器人对话",
  capabilities: ["conversation", "tools", "siyuan", "homepage", "global-memory"],
  permissions: {
    contextSources: ["conversation", "runtime-tools", "global-memory"],
    tools: {
      names: ROBOT_AGENT_TOOL_NAMES,
      actions: Object.fromEntries(ROBOT_AGENT_TOOL_NAMES.map((name) => [name, "*" as const])),
    },
    memory: { read: true, write: true },
    externalSkillIds: [],
    mcpServerIds: [],
    mcpToolNames: [],
  },
  execution: { defaultMaxToolCalls: 20 },
});

registerAgentProfile({
  schemaVersion: AGENT_PROFILE_SCHEMA_VERSION,
  id: HOMEPAGE_STATUS_AGENT_PROFILE_ID,
  label: "主页状态语",
  capabilities: ["homepage", "global-memory"],
  permissions: {
    contextSources: ["homepage-statistics", "global-memory"],
    tools: { names: [], actions: {} },
    memory: { read: true, write: false },
    externalSkillIds: [],
    mcpServerIds: [],
    mcpToolNames: [],
  },
  execution: { defaultMaxToolCalls: 0 },
});

registerAgentProfile({
  schemaVersion: AGENT_PROFILE_SCHEMA_VERSION,
  id: EDITOR_SELECTION_AGENT_PROFILE_ID,
  label: "编辑器划词 AI",
  capabilities: ["siyuan"],
  permissions: {
    contextSources: ["editor-selection", "editor-document"],
    tools: { names: [], actions: {} },
    memory: { read: false, write: false },
    externalSkillIds: [],
    mcpServerIds: [],
    mcpToolNames: [],
  },
  execution: { defaultMaxToolCalls: 0 },
});
