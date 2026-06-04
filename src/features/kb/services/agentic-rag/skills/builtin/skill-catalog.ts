/**
 * Builtin Skill Catalog (Read-Only)
 *
 * 只导出内置 Skill 的只读摘要信息，供设置页展示使用。
 * 不包含可变能力、流程控制字段或内部标识。
 * toolNames 只是展示归属，不代表执行顺序或推荐步骤。
 *
 * 数据来源：从真实 Skill 定义和 guidance 导入常量，避免信息漂移。
 */

import {
  BUILTIN_KB_SKILL_NAME,
  BUILTIN_KB_SKILL_TOOL_NAMES,
} from "./kb-retrieval/skill";

import {
  KB_RETRIEVAL_TITLE,
  KB_RETRIEVAL_DESCRIPTION,
  KB_RETRIEVAL_ROLE_INSTRUCTION,
  KB_RETRIEVAL_WHEN_USEFUL,
  KB_RETRIEVAL_BOUNDARY,
  KB_RETRIEVAL_GUIDANCE_LINES,
} from "./kb-retrieval/guidance";

export interface BuiltinSkillSummary {
  name: string;
  title: string;
  source: "builtin";
  enabledByDefault: boolean;
  description: string;
  roleInstruction: string;
  whenUseful: string;
  boundary: string;
  guidance: string;
  toolNames: readonly string[];
}

export const builtinSkills: BuiltinSkillSummary[] = [
  {
    name: BUILTIN_KB_SKILL_NAME,
    title: KB_RETRIEVAL_TITLE,
    source: "builtin",
    enabledByDefault: true,
    description: KB_RETRIEVAL_DESCRIPTION,
    roleInstruction: KB_RETRIEVAL_ROLE_INSTRUCTION,
    whenUseful: KB_RETRIEVAL_WHEN_USEFUL,
    boundary: KB_RETRIEVAL_BOUNDARY,
    guidance: KB_RETRIEVAL_GUIDANCE_LINES.join("\n"),
    toolNames: BUILTIN_KB_SKILL_TOOL_NAMES,
  },
];
