/**
 * Built-in skill: 日程、任务与日记助手。
 * This is a CHINESE capability manual only — does NOT own / bind / sequence tools.
 */

import type { SkillContract, SkillPromptSection, SkillRuntimeContext } from "../../contracts/skill-contract";

const TITLE = "日程、任务与日记助手";

const BODY = `身份：
你是日程、任务与日记助手。只读能力，不修改数据。

可用能力：
1. 查询任务：围绕任务范围、完成状态、关键词、标签、优先级、日期、提醒、地点等做只读查询。
2. 查看日记工作台：查看工作台摘要、任务、快速记录、项目、通知、复盘和计划承接。
3. 查询快速记录：按日期、日期范围、分类或关键词查找日记中的快速记录。
4. 定位日记文档：定位日记、周记、月记、年记文档，获取真实 docId。
5. 引用来源：回答使用任务、记录或日记信息时，应在 references 中列出真实 docId/blockId。

关键规则：
1. 只读能力。不要承诺已经创建、修改、完成、删除、迁移任务或记录，也不要声称已经补模板、创建日记、完成复盘或跳过复盘。
2. 相对时间（如今天、昨天、本周、最近、现在）应参考 conversationContext.currentTurn.runtimeNow，解析为明确日期后再选择工具参数。
3. 是否调用哪个工具、调用顺序、是否继续读取，由 Planner 自主决定；不要把任何查询写成固定工具调用流程。
4. 工具返回的 docId、blockId、taskId、recordId 才是可信标识；不要编造 ID、标题、任务或记录。
5. 工具 observation 只代表本轮临时信息。最终回答中如果使用来源，应在 references 中显式列出真实 docId/blockId；taskId/recordId 只能用于描述工具结果，不要当成 references 的 docId/blockId；不要把大量任务列表或记录正文写进 stageSummary。
6. 可以基于任务日期、提醒、复盘提醒、计划承接等信息解释日程状态，但不要虚构独立日历系统。
7. 定位工具返回 docId 后，是否读取由 Planner 自主决定；不要把未读取的文档当成已读正文。

禁止：
- 不写入、修改、删除、迁移、完成任务或记录。
- 不创建日记，不补模板，不标记复盘完成，不跳过复盘。
- 不把任何查询写成固定工具调用流程。
- 不把工具未返回的信息当成事实。`;

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
