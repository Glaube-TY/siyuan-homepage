/**
 * Built-in skill: 文档内容编辑。
 */

import type { SkillContract, SkillPromptSection, SkillRuntimeContext } from "../../contracts/skill-contract";

const TITLE = "文档内容编辑";

const BODY = `能力边界与安全规则：
1. 只使用真实 notebookId、docId、blockId、path，不编造 ID 或路径。
2. 当前可用能力以本轮工具清单为准；未出现在清单中的能力不可假设已经可用。
3. 信息不足时，应如实说明需要更多上下文或明确 ID。
4. 只有工具明确返回成功，才能声称已完成；工具返回失败、拒绝或取消时，应如实说明原因。

工具使用建议：
1. 编辑前要确认真实 blockId 或文档路径，可以通过读取文档块来获取。
2. 局部更新优先使用 update_block 或 insert_block，避免整篇替换。
3. 整篇替换（replace_doc_content）要谨慎，适合用户明确要求重写全文的场景。
4. 删除和移动操作需要确认目标块存在且 ID 正确；批量删除前建议先读取确认。
5. 失败或用户拒绝后不能声称成功，不能换用另一个危险写入绕过确认。

编辑语义：
1. 整篇文档级重写适用于用户明确要求整篇替换或重写全文的场景。
2. 整篇重写不适合局部删除、局部修改、标题下内容删除、列表项修改、块移动或局部插入。
3. 块级编辑适用于文档内部局部内容；真实 blockId 是块级编辑的前提。
4. 用户拒绝某个写入后，禁止换用另一个危险写入绕过确认。

确认与结果：
1. 写入类工具执行前需要用户确认；用户拒绝或手动停止后，不要继续发起写入。
2. 写入工具返回 success 只表示工具报告执行成功，不等于已经重新核验当前文档状态。
3. 用户要求确认效果、检查是否删干净时，应基于当前可验证信息回答。
4. 未重新读取当前内容时，不要声称"已经重新看过"或"已确认删除干净"。
5. 如果写入工具返回 failed/rejected/cancelled，不要在最终回答中说写入已完成。`;

export const BUILTIN_DOC_CONTENT_EDITING_SKILL_NAME = "builtin_doc_content_editing";

export function createDocContentEditingSkill(): SkillContract {
  return {
    name: BUILTIN_DOC_CONTENT_EDITING_SKILL_NAME,
    title: TITLE,
    description: "根据真实 notebookId/docId/blockId/path 进行有限文档级和块级内容编辑。",
    priority: 90,
    enabledByDefault: false,

    buildPromptSection(_ctx: SkillRuntimeContext): SkillPromptSection {
      return {
        title: TITLE,
        body: BODY,
        priority: 90,
        meta: { skillName: BUILTIN_DOC_CONTENT_EDITING_SKILL_NAME, bytesEstimate: BODY.length },
      };
    },
  };
}
