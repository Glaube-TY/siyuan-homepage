import type {
  SelectionAiAction,
  SelectionAiBuiltInAction,
  SelectionAiSkill,
  SelectionAiSkillPlacement,
  SelectionAiToolbarSettings,
} from "./selection-ai-types";

export const SELECTION_AI_ACTIONS: SelectionAiAction[] = [
  "ask",
  "explain",
  "translate",
  "polish",
];

export const SELECTION_AI_ACTION_LABELS: Record<SelectionAiAction, string> = {
  ask: "AI 问答",
  explain: "解释",
  translate: "翻译",
  polish: "润色",
};

export const SELECTION_AI_ACTION_TOOLTIPS: Record<SelectionAiAction, string> = {
  ask: "在 AI 知识库侧边栏中基于选区继续提问",
  explain: "解释当前选中的文字",
  translate: "翻译当前选中的文字",
  polish: "润色当前选中的文字",
};

interface BuiltInSkillDefaults {
  promptTemplate: string;
  includeDocumentContext: boolean;
  documentContextMaxChars: number;
  placement: SelectionAiSkillPlacement;
  temperature: number;
  maxSelectedTextChars: number;
  maxOutputChars: number;
  stream: boolean;
}

const BUILT_IN_SKILL_DEFAULTS: Record<SelectionAiBuiltInAction, BuiltInSkillDefaults> = {
  ask: {
    promptTemplate: "请基于文档中的下列内容回答问题：\n> {{选择文字}}\n\n我的问题是：",
    includeDocumentContext: true,
    documentContextMaxChars: 5000,
    placement: "toolbar",
    temperature: 0.3,
    maxSelectedTextChars: 6000,
    maxOutputChars: 3000,
    stream: true,
  },
  explain: {
    promptTemplate: "请解释下面选中文字的含义、关键概念和必要背景。保持简洁。\n\n{{选择文字}}",
    includeDocumentContext: true,
    documentContextMaxChars: 5000,
    placement: "toolbar",
    temperature: 0.3,
    maxSelectedTextChars: 6000,
    maxOutputChars: 3000,
    stream: true,
  },
  translate: {
    promptTemplate: "请翻译下面选中的文字。中文翻译成英文，其他语言优先翻译成简体中文。只输出译文。\n\n{{选择文字}}",
    includeDocumentContext: false,
    documentContextMaxChars: 0,
    placement: "toolbar",
    temperature: 0.2,
    maxSelectedTextChars: 6000,
    maxOutputChars: 3000,
    stream: true,
  },
  polish: {
    promptTemplate: "请润色下面选中的文字，使表达更清晰、自然、准确。保留原意。\n\n{{选择文字}}",
    includeDocumentContext: true,
    documentContextMaxChars: 3000,
    placement: "toolbar",
    temperature: 0.5,
    maxSelectedTextChars: 6000,
    maxOutputChars: 3000,
    stream: true,
  },
};

export const DEFAULT_SELECTION_AI_SKILLS: SelectionAiSkill[] = (
  SELECTION_AI_ACTIONS.map((action, index) => {
    const defaults = BUILT_IN_SKILL_DEFAULTS[action];
    return {
      id: `builtin:${action}`,
      name: SELECTION_AI_ACTION_LABELS[action],
      promptTemplate: defaults.promptTemplate,
      enabled: true,
      builtInAction: action,
      builtin: true,
      order: index,
      includeDocumentContext: defaults.includeDocumentContext,
      documentContextMaxChars: defaults.documentContextMaxChars,
      placement: defaults.placement,
      temperature: defaults.temperature,
      maxSelectedTextChars: defaults.maxSelectedTextChars,
      maxOutputChars: defaults.maxOutputChars,
      stream: defaults.stream,
    };
  })
);

export const DEFAULT_SELECTION_AI_TOOLBAR_SETTINGS: SelectionAiToolbarSettings = {
  enabled: true,
  skills: DEFAULT_SELECTION_AI_SKILLS.map((s) => ({ ...s })),
  confirmBeforeReplace: true,
};

const MIGRATION_DEFAULT_ENABLED_ACTIONS: SelectionAiAction[] = ["ask", "explain", "translate", "polish"];

function migrateEnabledActions(value: unknown, hasLegacyField: boolean): SelectionAiAction[] {
  if (!hasLegacyField) return [...MIGRATION_DEFAULT_ENABLED_ACTIONS];
  if (!Array.isArray(value)) return [];

  const valid = new Set(SELECTION_AI_ACTIONS);
  const actions = value.filter((item): item is SelectionAiAction =>
    typeof item === "string" && valid.has(item as SelectionAiAction)
  );
  return [...new Set(actions)];
}

interface LegacyGlobalConfig {
  providerId?: string;
  modelId?: string;
  temperature?: number;
  maxOutputChars?: number;
  maxSelectedTextChars?: number;
  stream?: boolean;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeOptionalNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(min, Math.min(max, value));
}

function normalizeOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeSkill(
  item: Record<string, unknown>,
  defaultSkill: SelectionAiSkill | undefined,
  legacyGlobal: LegacyGlobalConfig
): SelectionAiSkill | null {
  const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : undefined;
  if (!id) return null;

  const builtin = item.builtin === true;
  const builtInAction = builtin
    ? (defaultSkill?.builtInAction ?? (typeof item.builtInAction === "string" ? item.builtInAction as SelectionAiBuiltInAction : undefined))
    : undefined;
  const name = typeof item.name === "string" && item.name.trim()
    ? item.name.trim()
    : (defaultSkill?.name ?? id);
  const promptTemplate = typeof item.promptTemplate === "string" && item.promptTemplate.trim()
    ? item.promptTemplate
    : (defaultSkill?.promptTemplate ?? "");
  const enabled = typeof item.enabled === "boolean"
    ? item.enabled
    : (defaultSkill?.enabled ?? false);
  const order = typeof item.order === "number" && Number.isFinite(item.order)
    ? item.order
    : 0;
  const includeDocumentContext = typeof item.includeDocumentContext === "boolean"
    ? item.includeDocumentContext
    : (defaultSkill?.includeDocumentContext ?? false);
  const documentContextMaxChars = typeof item.documentContextMaxChars === "number" && Number.isFinite(item.documentContextMaxChars)
    ? Math.max(0, Math.round(item.documentContextMaxChars))
    : (defaultSkill?.documentContextMaxChars ?? 0);
  const placement: SelectionAiSkillPlacement =
    item.placement === "toolbar" || item.placement === "menu"
      ? item.placement
      : (defaultSkill?.placement ?? "menu");

  // 每技能独立模型和生成参数：技能自身 → 旧全局 → 内置默认 → fallback
  const modelProviderId = normalizeOptionalString(item.modelProviderId)
    ?? normalizeOptionalString(legacyGlobal.providerId)
    ?? normalizeOptionalString(defaultSkill?.modelProviderId);
  const modelId = normalizeOptionalString(item.modelId)
    ?? normalizeOptionalString(legacyGlobal.modelId)
    ?? normalizeOptionalString(defaultSkill?.modelId);
  const temperature = normalizeOptionalNumber(item.temperature, 0, 2)
    ?? normalizeOptionalNumber(legacyGlobal.temperature, 0, 2)
    ?? normalizeOptionalNumber(defaultSkill?.temperature, 0, 2);
  const maxSelectedTextChars = normalizeOptionalNumber(item.maxSelectedTextChars, 1, 30000)
    ?? normalizeOptionalNumber(legacyGlobal.maxSelectedTextChars, 1, 30000)
    ?? normalizeOptionalNumber(defaultSkill?.maxSelectedTextChars, 1, 30000);
  const maxOutputChars = normalizeOptionalNumber(item.maxOutputChars, 256, 20000)
    ?? normalizeOptionalNumber(legacyGlobal.maxOutputChars, 256, 20000)
    ?? normalizeOptionalNumber(defaultSkill?.maxOutputChars, 256, 20000);
  const stream = normalizeOptionalBoolean(item.stream)
    ?? normalizeOptionalBoolean(legacyGlobal.stream)
    ?? normalizeOptionalBoolean(defaultSkill?.stream);

  return {
    id,
    name,
    promptTemplate,
    enabled,
    builtInAction,
    builtin,
    order,
    includeDocumentContext,
    documentContextMaxChars,
    placement,
    modelProviderId,
    modelId,
    temperature,
    maxSelectedTextChars,
    maxOutputChars,
    stream,
  };
}

// 已废弃的内置技能 id，归一化时应移除
const DEPRECATED_BUILTIN_IDS = new Set([
  "builtin:grammar",
  "builtin:tone",
  "builtin:summary",
]);

function normalizeSkills(raw: unknown, enabledActions: SelectionAiAction[], legacyGlobal: LegacyGlobalConfig): SelectionAiSkill[] {
  const defaults = DEFAULT_SELECTION_AI_SKILLS;
  const defaultsById = new Map(defaults.map((s) => [s.id, s]));

  if (!Array.isArray(raw) || raw.length === 0) {
    return defaults.map((s) => ({
      ...s,
      enabled: enabledActions.includes(s.builtInAction!),
    }));
  }

  const seen = new Set<string>();
  const result: SelectionAiSkill[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const itemId = (item as Record<string, unknown>).id;
    // 跳过已废弃的内置技能
    if (typeof itemId === "string" && DEPRECATED_BUILTIN_IDS.has(itemId)) continue;
    const skill = normalizeSkill(item as Record<string, unknown>, defaultsById.get(itemId as string), legacyGlobal);
    if (!skill || seen.has(skill.id)) continue;
    seen.add(skill.id);
    skill.order = result.length;
    result.push(skill);
  }

  // 补齐缺失的内置技能
  for (const defaultSkill of defaults) {
    if (!seen.has(defaultSkill.id)) {
      result.push({
        ...defaultSkill,
        enabled: enabledActions.includes(defaultSkill.builtInAction!),
      });
    }
  }

  return result;
}

export function normalizeSelectionAiToolbarSettings(
  raw: unknown
): SelectionAiToolbarSettings {
  const defaults = DEFAULT_SELECTION_AI_TOOLBAR_SETTINGS;
  if (!raw || typeof raw !== "object") {
    return { ...defaults, skills: defaults.skills.map((s) => ({ ...s })) };
  }

  const value = raw as Record<string, unknown>;
  // 仅用于旧配置迁移：从 enabledActions 推导内置技能启用状态
  const hasLegacyEnabledActions = Object.prototype.hasOwnProperty.call(value, "enabledActions");
  const migratedEnabledActions = migrateEnabledActions(value.enabledActions, hasLegacyEnabledActions);

  // 提取旧全局生成参数，用于迁移到每个技能
  // 兼容旧字段名：modelProviderId 和 providerId 都可能是旧全局模型字段
  const legacyGlobal: LegacyGlobalConfig = {
    providerId: normalizeOptionalString(value.modelProviderId)
      ?? normalizeOptionalString(value.providerId),
    modelId: normalizeOptionalString(value.modelId),
    temperature: normalizeOptionalNumber(value.temperature, 0, 2),
    maxOutputChars: normalizeOptionalNumber(value.maxOutputChars, 256, 20000),
    maxSelectedTextChars: normalizeOptionalNumber(value.maxSelectedTextChars, 1, 30000),
    stream: normalizeOptionalBoolean(value.stream),
  };

  const skills = normalizeSkills(value.skills, migratedEnabledActions, legacyGlobal);

  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : defaults.enabled,
    skills,
    confirmBeforeReplace: typeof value.confirmBeforeReplace === "boolean"
      ? value.confirmBeforeReplace
      : defaults.confirmBeforeReplace,
  };
}
