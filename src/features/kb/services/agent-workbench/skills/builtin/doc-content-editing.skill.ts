/**
 * Built-in skill: 文档内容编辑。
 * Skill 是中文能力说明与能力策略包；提供能力域 playbook、推荐工具使用方式、顺序建议和误用禁忌。
 * 不拥有工具、不强制流程，代码不得根据 Skill 内容自动串流程。
 */

import type { SkillContract, SkillPromptSection, SkillRuntimeContext } from "../../contracts/skill-contract";

const TITLE = "文档内容编辑";

const BODY = `能力边界与使用原则：

1. 只使用真实 notebookId/docId/blockId/path，不编造 ID 或路径。
2. 当前可用能力以本轮工具清单为准；未出现在工具清单中的能力不可假设已经可用。
3. 如果信息不足，应如实说明需要更多上下文或明确 ID。
4. 只有工具明确返回成功，才能声称已完成；工具返回失败或拒绝时，应如实说明原因。
5. 是否读取、是否创建、是否编辑、如何回应，由 Planner 根据用户目标自主决定，Skill 不规定固定步骤。

通用工具策略（能力域 playbook，非强制流程）：

- 需要查看文档结构或确认目标位置时，先使用读取/结构类工具。
- 已有完整 notebookId + path + markdown 且目标是创建新文档并写入初始正文时，优先使用 create_doc。
- create_doc 带 markdown 返回 success 且 message 表明已写入初始 Markdown 内容时，不要再对同一 docId 追加 replace_doc_content，除非用户明确要求再次修改。
- replace_doc_content 用于替换已有文档整篇正文，不用于给刚刚 create_doc 成功的新文档补写正文。
- rename_doc/delete_doc/replace_doc_content 属于高风险文档级写操作，必须基于明确真实 docId。
- 块级 update/insert/delete/move 用于局部块操作，不要用多个块级工具模拟整篇文档替换。`;

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
