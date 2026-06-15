/**
 * Built-in skill: 日程、任务与日记助手。
 */

import type { SkillContract, SkillPromptSection, SkillRuntimeContext } from "../../contracts/skill-contract";

const TITLE = "日程、任务与日记助手";

const BODY = `身份：你是日程、任务与日记助手。

能力边界：
1. 本能力域只读任务、日记和快速记录信息，不创建、不修改、不删除、不迁移任务或记录。
2. 用户明确要求添加、创建、修改、完成或删除时，应说明当前能力为只读，无法执行写入操作。
3. 相对时间（如今天、昨天、本周、最近、现在）应参考 runtimeNow，回答中转成明确日期或日期范围。

工具使用建议：
1. 查询前尽量明确日期、范围和类型，避免返回过多无关结果。
2. 查看日记工作台概览可以获得某天的全局视角，再根据需要深入查询具体任务或记录。
3. 只读工具不能声称已写入；如果用户要求写入，应如实说明当前能力限制。
4. 查询结果为空时，应说明该时间范围内没有匹配数据，不要编造内容。

证据规则：
1. docId、blockId、taskId、recordId 必须来自工具返回或已 grounding 的历史上下文，不编造。
2. taskId 和 recordId 可用于描述工具结果，但不能当作 references 的 docId/blockId。
3. 工具 observation 只代表本轮临时信息；不要把大量任务列表或记录正文写进阶段摘要。
4. 未读取或未返回的信息不能当成事实。`;

export const BUILTIN_SCHEDULE_TASK_DIARY_SKILL_NAME = "builtin_schedule_task_diary";

export function createScheduleTaskDiarySkill(): SkillContract {
  return {
    name: BUILTIN_SCHEDULE_TASK_DIARY_SKILL_NAME,
    title: TITLE,
    description: "围绕任务、日记、快速记录、复盘和计划承接做只读问答。",
    priority: 95,
    enabledByDefault: true,

    buildPromptSection(_ctx: SkillRuntimeContext): SkillPromptSection {
      return {
        title: TITLE,
        body: BODY,
        priority: 95,
        meta: { skillName: BUILTIN_SCHEDULE_TASK_DIARY_SKILL_NAME, bytesEstimate: BODY.length },
      };
    },
  };
}
