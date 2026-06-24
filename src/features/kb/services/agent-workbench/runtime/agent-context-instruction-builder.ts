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
  runtimeToolsSettings?: RuntimeToolsSettings;
}

export interface AgentContextInstructions {
  toolManifest: readonly ToolManifest[];
  skillSections: readonly SkillPromptSection[];
  contextInstructions: string;
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

  const skillSections = params.skillRegistry.buildSkillPromptSections({
    question: params.question,
    toolManifest: skillToolManifest,
    enabledSkillNames: [],
    observations: params.observationLog.getContextEvidence(),
    userEnabledSkillNames: [],
    userDisabledSkillNames: params.userDisabledSkillNames ?? [],
  });

  const contextInstructions = [
    renderContextInstructions({
      conversationContext: params.conversationContext,
      globalMemory: params.globalMemory,
      attachedDocs: params.attachedDocs,
    }),
    renderAttachedDocObservationContext(params.observationLog.getContextEvidence()),
    params.externalSkillIndexPrompt ?? "",
    renderSkillInstructions(skillSections),
    params.runtimeToolsSettings ? buildRuntimeToolContextInstructions(params.runtimeToolsSettings) : "",
  ]
    .filter((block) => block.trim().length > 0)
    .join("\n\n");

  return {
    toolManifest: skillToolManifest,
    skillSections,
    contextInstructions,
  };
}
