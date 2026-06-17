export type SelectionAiAction =
  | "ask"
  | "explain"
  | "translate"
  | "polish";

export type SelectionAiBuiltInAction = SelectionAiAction;

export type SelectionAiSkillPlacement = "toolbar" | "menu";

export interface SelectionAiSkill {
  id: string;
  name: string;
  promptTemplate: string;
  enabled: boolean;
  builtInAction?: SelectionAiBuiltInAction;
  builtin: boolean;
  order: number;
  includeDocumentContext: boolean;
  documentContextMaxChars: number;
  placement: SelectionAiSkillPlacement;
  // 每技能独立模型和生成参数（为空时使用 AI 知识库默认模型）
  modelProviderId?: string;
  modelId?: string;
  temperature?: number;
  maxSelectedTextChars?: number;
  maxOutputChars?: number;
  stream?: boolean;
}

export interface SelectionAiToolbarSettings {
  enabled: boolean;
  skills: SelectionAiSkill[];
  confirmBeforeReplace: boolean;
}

export interface SelectionAiRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface SelectionAiContext {
  selectedText: string;
  originalSelectedText: string;
  truncated: boolean;
  docId?: string;
  blockId?: string;
  docTitle?: string;
  documentText?: string;
  selectionStartInDocument?: number;
  source: "protyle-toolbar";
  createdAt: number;
  selectionRect?: SelectionAiRect;
  range?: Range;
}

export interface SelectionAiRequest {
  action: SelectionAiAction;
  context: SelectionAiContext;
  skillId?: string;
}

export interface SelectionAiRunCallbacks {
  onToken?: (token: string, fullText: string) => void;
  signal?: AbortSignal;
}

export interface SelectionAiRunResult {
  text: string;
  stopped?: boolean;
  error?: string;
  truncatedOutput?: boolean;
}
