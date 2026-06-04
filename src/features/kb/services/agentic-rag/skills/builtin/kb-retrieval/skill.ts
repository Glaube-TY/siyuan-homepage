/**
 * KB retrieval skill: builtin_knowledge_base_qa
 *
 * Skill 仅描述能力与边界，不替 Planner 决定流程。
 * 具体 prompt 文案见 ./guidance.ts，工具名参考见本文件。
 */

import type {
  SkillContract,
  SkillPromptSection,
  SkillRuntimeContext,
} from "../../../workbench/contracts/skill-contract";
import { KB_RETRIEVAL_GUIDANCE_LINES, KB_RETRIEVAL_BOUNDARY, KB_RETRIEVAL_ROLE_INSTRUCTION, KB_RETRIEVAL_TITLE, KB_RETRIEVAL_WHEN_USEFUL, KB_RETRIEVAL_DESCRIPTION } from "./guidance";

/** Skill 唯一名。 */
export const BUILTIN_KB_SKILL_NAME = "builtin_knowledge_base_qa";

/** 优先级：影响 prompt 展示顺序，不触发自动执行。 */
export const BUILTIN_KB_SKILL_PRIORITY = 100;

/**
 * 该 Skill 在文案中提到/参考的全局工具名集合。
 *
 * **不**代表绑定、拥有或执行顺序；Planner 仍可自由选择全局工具。
 * 该列表仅用于在 buildPromptSection 中向 Planner 提示"本 Skill 文案提到了哪些工具"。
 */
export const BUILTIN_KB_SKILL_TOOL_NAMES: readonly string[] = [
  "list_knowledge_map",
  "search_scope",
  "focus_doc_scope",
  "read_candidate_docs",
];

export function createBuiltinKnowledgeBaseQaSkill(): SkillContract {
  return {
    name: BUILTIN_KB_SKILL_NAME,
    title: KB_RETRIEVAL_TITLE,
    description: KB_RETRIEVAL_DESCRIPTION,
    roleInstruction: KB_RETRIEVAL_ROLE_INSTRUCTION,
    whenUseful: KB_RETRIEVAL_WHEN_USEFUL,
    boundary: KB_RETRIEVAL_BOUNDARY,
    toolNames: BUILTIN_KB_SKILL_TOOL_NAMES,
    guidance: KB_RETRIEVAL_GUIDANCE_LINES.join("\n"),
    priority: BUILTIN_KB_SKILL_PRIORITY,
    enabledByDefault: true,

    buildPromptSection(_ctx: SkillRuntimeContext): SkillPromptSection {
      const referencedTools = this.toolNames.length
        ? this.toolNames.map((name) => `- ${name}`).join("\n")
        : "- （无可参考工具）";

      const body = [
        `定位：${this.roleInstruction}`,
        `适用场景：${this.whenUseful}`,
        `边界：${this.boundary}`,
        "",
        "能力说明：",
        this.guidance,
        "",
        "本能力说明提到的可用工具：",
        referencedTools,
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
  };
}

export type BuiltinKbSkillToolName = (typeof BUILTIN_KB_SKILL_TOOL_NAMES)[number];

export function isBuiltinKbSkillToolName(name: string): name is BuiltinKbSkillToolName {
  return (BUILTIN_KB_SKILL_TOOL_NAMES as readonly string[]).includes(name);
}
