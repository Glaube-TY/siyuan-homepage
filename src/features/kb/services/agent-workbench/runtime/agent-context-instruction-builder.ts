import type { ToolRegistry } from "../registries/tool-registry";
import type { SkillRegistry } from "../registries/skill-registry";
import type { ToolResultLog } from "./tool-result-log";
import type { ConversationContextSnapshot } from "./conversation-context-builder";
import type { ToolManifest } from "../contracts/tool-contract";
import type { SkillPromptSection, SkillContextEvidence } from "../contracts/skill-contract";
import { renderContextInstructions } from "../../agent-core/prompts/context-instruction-renderer";
import { renderSkillInstructions } from "../../agent-core/prompts/skill-instruction-renderer";
import type { RuntimeToolsSettings } from "../../../types/settings";
import { buildRuntimeToolContextInstructions } from "../runtime-tools/runtime-tool-context";
import { pushAgentDebugEvent, setLastToolManifestCount } from "../debug/workbench-debug";
import {
  createAgentContextManifestEntry,
  mergeAgentContextManifestEntries,
  type AgentContextManifest,
} from "./agent-context-ledger";

export interface BuildAgentContextInstructionsParams {
  toolRegistry: ToolRegistry;
  skillRegistry: SkillRegistry;
  observationLog: ToolResultLog;
  question: string;
  abortSignal?: AbortSignal;
  userDisabledSkillNames?: readonly string[];
  conversationContext?: ConversationContextSnapshot;
  globalMemory?: string;
  attachedDocs?: readonly { docId: string; title?: string }[];
  externalSkillIndexPrompt?: string;
  includeSkillInstructions?: boolean;
  runtimeToolsSettings?: RuntimeToolsSettings;
  runtimeToolCapabilities?: {
    sandboxEnabled: boolean;
    localCommandToolEnabled: boolean;
    mcpClientEnabled: boolean;
  };
}

export interface AgentContextInstructions {
  toolManifest: readonly ToolManifest[];
  skillSections: readonly SkillPromptSection[];
  contextInstructions: string;
  manifest: AgentContextManifest;
}

function renderAttachedDocObservationContext(
  observations: readonly SkillContextEvidence[],
): string {
  const attached = observations.filter((observation) => {
    const content = observation.content as Record<string, unknown> | undefined;
    return content?.source === "attached_doc_hydration";
  });
  if (attached.length === 0) return "";

  const blocks = ["# Loaded Attached Document Content"];
  let used = 0;
  const budget = 24000;

  for (const observation of attached) {
    const content = observation.content as Record<string, unknown> | undefined;
    const items = Array.isArray(content?.items) ? content.items : [];
    const error = content?.error as Record<string, unknown> | undefined;
    if (error) {
      blocks.push(`Load failed: ${String(error.docId ?? "")} ${String(error.message ?? "")}`);
      continue;
    }
    for (const raw of items) {
      const item = raw as Record<string, unknown>;
      const title = typeof item.title === "string" ? item.title : "";
      const docId = typeof item.docId === "string" ? item.docId : "";
      const text = typeof item.content === "string" ? item.content : "";
      const entry = `## ${title} [docId=${docId}]\n${text}\n`;
      if (used + entry.length > budget) {
        blocks.push("[attached documents compacted: remaining content omitted]");
        return blocks.join("\n\n");
      }
      blocks.push(entry);
      used += entry.length;
    }
  }

  return blocks.join("\n\n");
}

/**
 * Build the Agent context — tool manifest, skill sections, and assembled
 * context instructions — for the current turn. Pure function, no side effects.
 */
export function buildAgentContextInstructions(params: BuildAgentContextInstructionsParams): AgentContextInstructions {
  const skillToolManifest = params.toolRegistry.getToolManifest({
    question: params.question,
    callCounts: params.observationLog.callCounts(),
    abortSignal: params.abortSignal,
  });
  const disabledSkillNames = new Set(params.userDisabledSkillNames ?? []);
  const includeSkillInstructions = params.includeSkillInstructions !== false;
  const enabledSkillNames = includeSkillInstructions
    ? params.skillRegistry
        .listSkills()
        .map((skill) => skill.name)
        .filter((name) => !disabledSkillNames.has(name))
    : [];

  const skillSections = includeSkillInstructions
    ? params.skillRegistry.buildSkillPromptSections({
        question: params.question,
        toolManifest: skillToolManifest,
        enabledSkillNames,
        observations: params.observationLog.getContextEvidence(),
        userEnabledSkillNames: enabledSkillNames,
        userDisabledSkillNames: params.userDisabledSkillNames ?? [],
      })
    : [];

  pushAgentDebugEvent("AGENT_CONTEXT_SKILLS_BUILT", {
    registeredSkillCount: params.skillRegistry.listSkills().length,
    enabledSkillCount: enabledSkillNames.length,
    disabledSkillCount: disabledSkillNames.size,
    enabledSkillNames,
    injectedSkillNames: skillSections.map((section) => section.meta?.skillName ?? section.title),
    toolManifestCount: skillToolManifest.length,
    toolNames: skillToolManifest.map((tool) => tool.name),
  }, "info");
  setLastToolManifestCount(skillToolManifest.length);

  const conversationInstructions = renderContextInstructions({
    conversationContext: params.conversationContext,
    globalMemory: params.globalMemory,
    attachedDocs: params.attachedDocs,
  });
  const attachedDocumentContent = renderAttachedDocObservationContext(params.observationLog.getContextEvidence());
  const externalSkills = params.externalSkillIndexPrompt ?? "";
  const skillInstructions = includeSkillInstructions ? renderSkillInstructions(skillSections) : "";
  const runtimeTools = params.runtimeToolsSettings
    ? buildRuntimeToolContextInstructions(params.runtimeToolsSettings, params.runtimeToolCapabilities)
    : "";
  const contextInstructions = [
    conversationInstructions,
    attachedDocumentContent,
    externalSkills,
    skillInstructions,
    runtimeTools,
  ]
    .filter((block) => block.trim().length > 0)
    .join("\n\n");

  return {
    toolManifest: skillToolManifest,
    skillSections,
    contextInstructions,
    manifest: mergeAgentContextManifestEntries([
      ...(params.conversationContext?.manifest.entries.filter((entry) => entry.source !== "global-memory") ?? []),
      createAgentContextManifestEntry("global-memory", "summary", params.globalMemory, { reason: "本轮未授权或没有匹配的长期记忆" }),
      createAgentContextManifestEntry("attached-document-content", "recent-verbatim", attachedDocumentContent, { reason: "没有已加载的附加文档正文" }),
      createAgentContextManifestEntry("external-skills", "retrieval-index", externalSkills, { reason: "外部 Skills 未启用或没有索引" }),
      createAgentContextManifestEntry("skill-instructions", "constraints", skillInstructions, { reason: "Skills 未授权或没有匹配项" }),
      createAgentContextManifestEntry("runtime-tools", "constraints", runtimeTools, { reason: "运行时工具未授权或未配置" }),
      createAgentContextManifestEntry("tool-manifest", "retrieval-index", skillToolManifest, { reason: "本轮没有可用工具" }),
    ]),
  };
}
