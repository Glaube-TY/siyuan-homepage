import { z } from "zod";
import type { ExternalSkillSettings } from "../../../../types/settings";
import type { AggregateActionHelp, ToolContract, ToolResult } from "../../contracts/tool-contract";
import {
  AGGREGATE_TOOL_CATALOG,
  findAggregateActionMeta,
  findAggregateToolMeta,
} from "./aggregate-tool-metadata";
import {
  listAllExternalSkillEntries,
  readExternalSkillEntryFile,
} from "../../skills/external/external-skill-index";

const helpActionSchema = z.enum([
  "list_tools",
  "describe_tool",
  "list_actions",
  "describe_action",
  "list_custom_skills",
  "describe_custom_skill",
]);

const agentToolHelpInputSchema = z.object({
  action: helpActionSchema,
  toolName: z.string().optional(),
  actionName: z.string().optional(),
  skillName: z.string().optional(),
}).strict();

const agentToolHelpInputJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: [
        "list_tools",
        "describe_tool",
        "list_actions",
        "describe_action",
        "list_custom_skills",
        "describe_custom_skill",
      ],
      description: "帮助动作。",
    },
    toolName: { type: "string", description: "聚合工具名，例如 siyuan_kb。" },
    actionName: { type: "string", description: "工具 action 名，例如 search。" },
    skillName: { type: "string", description: "外部/自定义 Skill ID。" },
  },
  required: ["action"],
};

type AggregateToolCatalogEntry = typeof AGGREGATE_TOOL_CATALOG[number];

export interface AvailableToolSnapshot {
  name: string;
  actions?: string[];
  /** 每个聚合 action 的真实帮助元数据，优先用于 describe_action。 */
  actionHelp?: Record<string, AggregateActionHelp>;
  /** 工具当前 provider-visible 的 input JSON Schema；若存在则 describe_tool 优先用它覆盖静态 argsSchema。 */
  argsSchema?: unknown;
}

export interface AgentToolHelpOptions {
  externalSkillSettings: ExternalSkillSettings;
  availableTools: readonly AvailableToolSnapshot[];
}

function compactTool(tool: AggregateToolCatalogEntry, availableActions?: string[]) {
  const actions = availableActions ?? tool.actions.map((a) => a.name);
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    readOnly: tool.readOnly,
    requiresConfirmation: tool.requiresConfirmation === true,
    actionCount: actions.length,
  };
}

function findAvailableTool(
  toolName: string,
  availableTools: ReadonlyMap<string, AvailableToolSnapshot>,
) {
  const snapshot = availableTools.get(toolName);
  const tool = findAggregateToolMeta(toolName);
  return tool && snapshot ? { tool, snapshot } : null;
}

function filterActions(
  tool: AggregateToolCatalogEntry,
  availableActions?: string[],
) {
  if (availableActions === undefined) return tool.actions;
  const allowed = new Set(availableActions);
  return tool.actions.filter((action) => allowed.has(action.name));
}

function describeTool(
  toolName: string,
  availableTools: ReadonlyMap<string, AvailableToolSnapshot>,
) {
  const entry = findAvailableTool(toolName, availableTools);
  if (!entry) return null;
  const { tool, snapshot } = entry;
  const actions = filterActions(tool, snapshot.actions);
  return {
    ...compactTool(tool, snapshot.actions),
    boundary: tool.boundary,
    argsSchema: snapshot.argsSchema ?? tool.argsSchema,
    inputHint: tool.inputHint,
    examples: tool.examples,
    notes: tool.notes,
    ...(actions.length === 0 ? {
      note: `${tool.name} 不是 action 聚合工具，请直接按该工具的 input schema 调用，不要使用 describe_action。`,
    } : {}),
    actions: actions.map((action) => ({
      name: action.name,
      title: action.title,
      description: action.description,
      readOnly: action.readOnly,
      requiresConfirmation: !action.readOnly,
      required: action.required ?? [],
      boundary: action.boundary,
    })),
  };
}

function describeAction(
  toolName: string,
  actionName: string,
  availableTools: ReadonlyMap<string, AvailableToolSnapshot>,
) {
  const entry = findAvailableTool(toolName, availableTools);
  if (!entry) return null;
  const { tool, snapshot } = entry;
  const actions = filterActions(tool, snapshot.actions);
  if (actions.length === 0) {
    return {
      toolName: tool.name,
      toolTitle: tool.title,
      action: "",
      title: tool.title,
      description: `${tool.name} 不是 action 聚合工具，不能使用 describe_action；请直接按该工具的 input schema 调用。`,
      readOnly: tool.readOnly,
      requiresConfirmation: tool.requiresConfirmation === true,
      required: [],
      boundary: tool.boundary,
      argsUsage: "该工具不使用聚合 action 参数。",
      hasActions: false,
    };
  }
  const action = findAggregateActionMeta(toolName, actionName);
  const availableActions = snapshot.actions ?? tool.actions.map((a) => a.name);
  if (!action || !availableActions.includes(action.name)) return null;
  const actionHelp = snapshot.actionHelp?.[action.name];
  const effectiveReadOnly = actionHelp?.readOnly ?? action.readOnly;
  return {
    toolName: tool.name,
    toolTitle: tool.title,
    action: action.name,
    title: action.title,
    description: action.description,
    readOnly: effectiveReadOnly,
    requiresConfirmation: actionHelp?.requiresConfirmation ?? !effectiveReadOnly,
    required: action.required ?? [],
    boundary: actionHelp?.boundary ?? action.boundary ?? tool.boundary,
    argsUsage: `调用 ${tool.name} 时传入 { "action": "${action.name}", "args": { ... } }。args 使用该 action 的参数对象，可根据参数校验错误补齐字段。`,
    argsSchema: actionHelp?.argsSchema ?? action.argsSchema,
    inputHint: actionHelp?.inputHint,
    examples: action.examples,
    notes: action.notes,
    hasActions: true,
  };
}

async function listCustomSkills(settings: ExternalSkillSettings) {
  const skills = await listAllExternalSkillEntries({ disabledSkillIds: settings.disabledSkillIds ?? [] });
  return {
    total: skills.length,
    skills: skills.map((entry) => ({
      id: entry.id,
      title: entry.title,
      description: entry.description,
      sourceType: entry.sourceType,
      tags: entry.tags,
      triggers: entry.triggers,
      requiredEnvVars: entry.requiredEnvVars ?? [],
      enabled: entry.enabled !== false,
    })),
  };
}

async function describeCustomSkill(settings: ExternalSkillSettings, skillName: string) {
  const skills = await listAllExternalSkillEntries({ disabledSkillIds: settings.disabledSkillIds ?? [] });
  const entry = skills.find((item) => item.id === skillName)
    ?? skills.find((item) => item.id === `user_${skillName}`);
  if (!entry) return null;
  const read = await readExternalSkillEntryFile({
    entry,
    relativeFile: entry.entry || "SKILL.md",
    maxChars: Math.min(settings.maxSkillReadChars || 8000, 12000),
  });
  return {
    id: entry.id,
    title: entry.title,
    description: entry.description,
    sourceType: entry.sourceType,
    source: entry.source,
    trusted: entry.trusted,
    riskLevel: entry.riskLevel,
    tags: entry.tags,
    triggers: entry.triggers,
    requiredEnvVars: entry.requiredEnvVars ?? [],
    entryFile: read.relativePath,
    content: read.content,
    truncated: read.truncated,
    chars: read.chars,
  };
}

export function createAgentToolHelpTool(options: AgentToolHelpOptions): ToolContract<z.infer<typeof agentToolHelpInputSchema>> {
  const availableTools = new Map(options.availableTools.map((t) => [t.name, t]));
  const settings = options.externalSkillSettings;
  return {
    name: "agent_tool_help",
    title: "Agent 工具帮助",
    description: "只读帮助工具。列出可用聚合工具，查看工具 action、关键参数、读写风险和使用边界；也可列出外部/自定义 Skill。",
    inputSchema: agentToolHelpInputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "system",
    providerVisible: true,
    inputHint: "action=list_tools/describe_tool/list_actions/describe_action/list_custom_skills/describe_custom_skill；describe_tool/list_actions 需要 toolName；describe_action 需要 toolName+actionName；describe_custom_skill 需要 skillName。",
    boundary: "不执行业务，不写思源，不读取敏感配置；内置 Skill 不作为可管理 Skill 返回。",
    inputJsonSchemaOverride: agentToolHelpInputJsonSchema,
    availability() {
      return { available: true };
    },
    async execute(_ctx, args): Promise<ToolResult> {
      if (args.action === "list_tools") {
        return {
          ok: true,
          data: {
            tools: AGGREGATE_TOOL_CATALOG
              .filter((tool) => availableTools.has(tool.name))
              .map((tool) => compactTool(tool, availableTools.get(tool.name)?.actions)),
          },
        };
      }

      if (args.action === "describe_tool") {
        const toolName = args.toolName?.trim() ?? "";
        const tool = describeTool(toolName, availableTools);
        return tool
          ? { ok: true, data: tool }
          : { ok: false, data: null, error: { code: "tool_not_available", message: "指定工具当前未注册或已禁用。", recoverable: true } };
      }

      if (args.action === "list_actions") {
        const toolName = args.toolName?.trim() ?? "";
        const entry = findAvailableTool(toolName, availableTools);
        if (!entry) {
          return { ok: false, data: null, error: { code: "tool_not_available", message: "指定工具当前未注册或已禁用。", recoverable: true } };
        }
        const actions = filterActions(entry.tool, entry.snapshot.actions);
        return {
          ok: true,
          data: {
            toolName: entry.tool.name,
            actions: actions.map((action) => ({ name: action.name, title: action.title, readOnly: action.readOnly })),
            ...(actions.length === 0 ? {
              note: `${entry.tool.name} 不是 action 聚合工具，请直接按该工具的 input schema 调用。`,
            } : {}),
          },
        };
      }

      if (args.action === "describe_action") {
        const toolName = args.toolName?.trim() ?? "";
        const actionName = args.actionName?.trim() ?? "";
        const entry = findAvailableTool(toolName, availableTools);
        if (!entry) {
          return { ok: false, data: null, error: { code: "tool_not_available", message: "指定工具当前未注册或已禁用。", recoverable: true } };
        }
        const actions = filterActions(entry.tool, entry.snapshot.actions);
        if (actions.length === 0) {
          return { ok: false, data: null, error: { code: "tool_has_no_actions", message: "指定工具不是 action 聚合工具，不能查询 action。", recoverable: true } };
        }
        const action = describeAction(toolName, actionName, availableTools);
        return action
          ? { ok: true, data: action }
          : { ok: false, data: null, error: { code: "action_not_found", message: "未找到指定 action。", recoverable: true } };
      }

      if (args.action === "list_custom_skills") {
        return { ok: true, data: await listCustomSkills(settings) };
      }

      const skillName = args.skillName?.trim() ?? "";
      const skill = await describeCustomSkill(settings, skillName);
      return skill
        ? { ok: true, data: skill }
        : { ok: false, data: null, error: { code: "skill_not_found", message: "未找到指定外部/自定义 Skill。", recoverable: true } };
    },
  };
}
