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
    description: "查看知识库结构、搜索并定位资料、总结和引用来源。",
    boundary: "只读知识库，不写入、不删除、不修改。只使用工具返回的真实资源 ID；不编造资源 ID。",
    guidance: "查看知识结构、搜索候选、回答问题。一次关键词搜索为空不代表资料一定不存在；入口不明确时可利用结构查看定位真实文档。结构和搜索只是线索，读取正文后才可作为详细回答证据。",
  },
  {
    name: BUILTIN_SCHEDULE_TASK_DIARY_SKILL_NAME,
    title: "日程、任务与日记助手",
    source: "builtin",
    enabledByDefault: true,
    description: "围绕任务、日记、快速记录、复盘和计划承接做只读问答。",
    boundary: "只读任务和日记信息；不创建、不修改、不删除、不迁移任务或记录，不创建日记，不补模板，不标记复盘完成或跳过复盘。",
    guidance: "根据运行时的当前时间理解相对时间；按需查询任务、日记工作台、快速记录或定位日记文档。工具返回的 ID 才是可信标识；不要编造 ID、标题、任务或记录。",
  },
];
