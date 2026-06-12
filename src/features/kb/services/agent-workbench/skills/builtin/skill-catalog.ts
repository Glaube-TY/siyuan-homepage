/**
 * Builtin Skill Catalog (Read-Only)
 *
 * Used by settings UI to display built-in skill info.
 * Data from agent-workbench skill definitions.
 */

import { BUILTIN_DOC_CONTENT_EDITING_SKILL_NAME } from "./doc-content-editing.skill";
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
    title: "知识库检索",
    source: "builtin",
    enabledByDefault: true,
    description: "帮助理解知识库范围、证据边界、正文引用和本地来源约束。",
    boundary: "只读知识库，不写入、不删除、不修改。文档结构、搜索候选、时间线和元信息都是定位线索，不等同于正文证据。",
    guidance: "详细回答必须基于已读取正文或 grounded 历史引用；不要编造 docId、blockId、cursor 或 title；没有直接来源时 references 为空。",
  },
  {
    name: BUILTIN_SCHEDULE_TASK_DIARY_SKILL_NAME,
    title: "日程、任务与日记助手",
    source: "builtin",
    enabledByDefault: true,
    description: "围绕任务、日记、快速记录、复盘和计划承接做只读问答。",
    boundary: "只读任务和日记信息；不创建、不修改、不删除、不迁移任务或记录，不创建日记，不补模板。",
    guidance: "相对时间应参考 runtimeNow；taskId 和 recordId 只能描述工具结果，不能当作 references 的 docId/blockId；未返回的信息不能当成事实。",
  },
  {
    name: BUILTIN_DOC_CONTENT_EDITING_SKILL_NAME,
    title: "文档编辑",
    source: "builtin",
    enabledByDefault: false,
    description: "根据真实 notebookId/docId/blockId/path 进行有限文档级和块级内容编辑。",
    boundary: "只使用真实 ID 和路径，不编造。写入前需要用户确认；拒绝、失败或取消时不能声称已完成。",
    guidance: "整篇重写和局部编辑语义不同；块级编辑需要真实 blockId。历史记忆可帮助理解目标，但不能替代当前读取或当前工具结果。",
  },
];
