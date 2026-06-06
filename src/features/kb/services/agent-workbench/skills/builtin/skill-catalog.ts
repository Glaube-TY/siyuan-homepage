/**
 * Builtin Skill Catalog (Read-Only)
 *
 * Used by settings UI to display built-in skill info.
 * Data from agent-workbench skill definitions.
 */

import { BUILTIN_KB_SKILL_NAME } from "./knowledge-base-qa.skill";

export interface BuiltinSkillSummary {
  name: string;
  title: string;
  source: "builtin";
  enabledByDefault: boolean;
  description: string;
  boundary: string;
  guidance: string;
}

export const builtinSkills: BuiltinSkillSummary[] = [
  {
    name: BUILTIN_KB_SKILL_NAME,
    title: "知识库检索与阅读",
    source: "builtin",
    enabledByDefault: true,
    description: "帮助查看知识库结构、搜索资料、读取正文、总结和引用来源。",
    boundary: "只读知识库，不写入、不删除、不修改。使用工具返回的真实资源 ID（docId/blockId）作为后续工具参数；不编造资源 ID。",
    guidance: "查看知识结构、搜索候选结果、读取正文、回答用户问题。结构结果不是正文，搜索结果只是候选，只有阅读工具返回的正文才能用于详细总结分析；回答使用具体来源时应在 answer.references 中列出真实 docId/title。",
  },
];
