/**
 * KB retrieval skill: builtin_knowledge_base_qa
 *
 * Skill 仅描述能力与边界，不替 Planner 决定流程。
 * 具体 prompt 文案见 ./guidance.ts，工具集合见本文件。
 */

import type {
  SkillContract,
  SkillPromptSection,
  SkillRuntimeContext,
} from "../../../workbench/contracts/skill-contract";
import type { ToolManifest } from "../../../workbench/contracts/tool-contract";
import { KB_RETRIEVAL_GUIDANCE_LINES, KB_RETRIEVAL_BOUNDARY, KB_RETRIEVAL_ROLE_INSTRUCTION, KB_RETRIEVAL_TITLE, KB_RETRIEVAL_WHEN_USEFUL } from "./guidance";

/** Skill 唯一名。 */
export const BUILTIN_KB_SKILL_NAME = "builtin_knowledge_base_qa";

/** 优先级：影响 prompt 展示顺序，不触发自动执行。 */
export const BUILTIN_KB_SKILL_PRIORITY = 100;

/** 该 Skill 暴露给 Planner 的工具名集合（声明）。 */
export const BUILTIN_KB_SKILL_TOOL_NAMES: readonly string[] = [
  "list_knowledge_map",
  "search_scope",
  "focus_doc_scope",
  "list_scope_docs",
  "get_doc_tree_context",
  "get_conversation_used_references",
  "read_previous_evidence",
  "read_candidate_docs",
  "answer",
];

function pickSkillTools(
  ctx: SkillRuntimeContext,
): readonly ToolManifest[] {
  const allowed = new Set(BUILTIN_KB_SKILL_TOOL_NAMES);
  return ctx.toolManifest.filter((t) => allowed.has(t.name));
}

export function createBuiltinKnowledgeBaseQaSkill(): SkillContract {
  return {
    name: BUILTIN_KB_SKILL_NAME,
    title: KB_RETRIEVAL_TITLE,
    description:
      "基于思源知识库检索、读取、组织证据并回答用户问题。" +
      "默认激活；除非用户明确不需要知识库，或问题明显无需知识库资料。",
    roleInstruction: KB_RETRIEVAL_ROLE_INSTRUCTION,
    whenUseful: KB_RETRIEVAL_WHEN_USEFUL,
    boundary: KB_RETRIEVAL_BOUNDARY,
    toolNames: BUILTIN_KB_SKILL_TOOL_NAMES,
    guidance: KB_RETRIEVAL_GUIDANCE_LINES.join("\n"),
    priority: BUILTIN_KB_SKILL_PRIORITY,
    enabledByDefault: true,

    buildPromptSection(ctx: SkillRuntimeContext): SkillPromptSection {
      const tools = pickSkillTools(ctx);
      const toolLines = tools.length
        ? tools
            .map((t) => {
              const availabilityTag = t.availability.available
                ? "[available]"
                : `[unavailable:${t.availability.reasonCode ?? "unknown"}]`;
              return `- ${t.name} (${t.title}) — ${t.capability} ${availabilityTag}`;
            })
            .join("\n")
        : "- (no tools registered yet)";

      const body = [
        `## ${this.title}`,
        "",
        `**Role**: ${this.roleInstruction}`,
        "",
        `**When useful**: ${this.whenUseful}`,
        "",
        `**Boundary**: ${this.boundary}`,
        "",
        "**Guidance** (suggestion only — not enforced):",
        this.guidance,
        "",
        "**Tools available in this Skill** (Planner may also use other enabled skills' tools):",
        toolLines,
      ].join("\n");

      const bytesEstimate = body.length;
      return {
        title: this.title,
        body,
        priority: this.priority,
        meta: {
          skillName: this.name,
          bytesEstimate,
        },
      };
    },

    getTools(ctx: SkillRuntimeContext): readonly ToolManifest[] {
      return pickSkillTools(ctx);
    },
  };
}

export type BuiltinKbSkillToolName = (typeof BUILTIN_KB_SKILL_TOOL_NAMES)[number];

export function isBuiltinKbSkillToolName(name: string): name is BuiltinKbSkillToolName {
  return (BUILTIN_KB_SKILL_TOOL_NAMES as readonly string[]).includes(name);
}
