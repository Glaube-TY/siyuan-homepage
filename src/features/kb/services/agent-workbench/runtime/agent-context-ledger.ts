import { estimateTextTokensConservative } from "../../../types/context-usage";

export type AgentContextLayer = "constraints" | "working-state" | "recent-verbatim" | "summary" | "retrieval-index";


export type AgentContextSourceId =
  | "current-turn"
  | "compaction-snapshot"
  | "recent-turns"
  | "working-target"
  | "global-memory"
  | "attached-documents"
  | "attached-document-content"
  | "external-skills"
  | "skill-instructions"
  | "runtime-tools"
  | "tool-manifest";
export interface AgentContextManifestEntry {
  source: AgentContextSourceId;
  layer: AgentContextLayer;
  included: boolean;
  chars: number;
  estimatedTokens: number;
  reason?: string;
  coverage?: { startTurnIndex?: number; endTurnIndex?: number };
}

export interface AgentContextManifest {
  version: 1;
  entries: AgentContextManifestEntry[];
  includedChars: number;
  estimatedTokens: number;
}

export function createAgentContextManifestEntry(
  source: AgentContextSourceId,
  layer: AgentContextLayer,
  value: unknown,
  options: Pick<AgentContextManifestEntry, "reason" | "coverage"> = {},
): AgentContextManifestEntry {
  const text = typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);
  const chars = text.length;
  return {
    source,
    layer,
    included: chars > 0,
    chars,
    estimatedTokens: estimateTextTokensConservative(text),
    ...(chars === 0 && options.reason ? { reason: options.reason } : {}),
    ...(options.coverage ? { coverage: options.coverage } : {}),
  };
}

export function buildAgentContextManifest(params: {
  currentTurn: unknown;
  compactionSnapshot?: unknown;
  compactionCoverage?: { startTurnIndex?: number; endTurnIndex?: number };
  recentTurns: unknown;
  workingTarget?: unknown;
  globalMemory?: string;
  attachedDocuments?: unknown;
}): AgentContextManifest {
  const entries = [
    createAgentContextManifestEntry("current-turn", "constraints", params.currentTurn),
    createAgentContextManifestEntry("compaction-snapshot", "summary", params.compactionSnapshot, {
      reason: "尚未生成上下文压缩快照",
      coverage: params.compactionCoverage,
    }),
    createAgentContextManifestEntry("recent-turns", "recent-verbatim", params.recentTurns),
    createAgentContextManifestEntry("working-target", "working-state", params.workingTarget, { reason: "没有活动工作对象" }),
    createAgentContextManifestEntry("global-memory", "summary", params.globalMemory, { reason: "本轮未授权或没有全局记忆" }),
    createAgentContextManifestEntry("attached-documents", "retrieval-index", params.attachedDocuments, { reason: "本轮未附加文档" }),
  ];
  return {
    version: 1,
    entries,
    includedChars: entries.reduce((sum, item) => sum + (item.included ? item.chars : 0), 0),
    estimatedTokens: entries.reduce((sum, item) => sum + (item.included ? item.estimatedTokens : 0), 0),
  };
}

export function mergeAgentContextManifestEntries(entries: AgentContextManifestEntry[]): AgentContextManifest {
  return {
    version: 1,
    entries,
    includedChars: entries.reduce((sum, item) => sum + (item.included ? item.chars : 0), 0),
    estimatedTokens: entries.reduce((sum, item) => sum + (item.included ? item.estimatedTokens : 0), 0),
  };
}
