/**
 * Builtin Skill Catalog (Read-Only)
 *
 * Used by settings UI to display built-in skill info.
 * Data from agent-workbench skill definitions.
 */

import { BUILTIN_KB_SKILL_NAME } from "./knowledge-base-qa.skill";
import { BUILTIN_SCHEDULE_TASK_DIARY_SKILL_NAME } from "./schedule-task-diary.skill";

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
    guidance: "查看知识结构、搜索候选结果、读取正文、回答用户问题。结构结果不是正文，搜索结果只是候选，只有读取工具返回的正文才用于详细总结分析；回答使用具体来源时应在 answer.references 中列出真实 docId/title。",
  },
  {
    name: BUILTIN_SCHEDULE_TASK_DIARY_SKILL_NAME,
    title: "日程、任务与日记助手",
    source: "builtin",
    enabledByDefault: true,
    description: "围绕任务、日记、快速记录、复盘和计划承接做只读问答。",
    boundary: "只读任务和日记信息；不创建、不修改、不删除、不迁移任务或记录，不创建日记，不补模板，不标记复盘完成或跳过复盘。",
    guidance: "根据 runtimeNow 理解相对时间；按需查询任务、日记工作台、快速记录或定位日记文档。需要正文时先定位真实 docId，再使用读取工具；引用来源必须来自工具返回的真实 docId/blockId。",
  },
];
