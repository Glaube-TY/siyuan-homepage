/**
 * Built-in skill: 文档内容编辑。
 */

import type { SkillContract, SkillPromptSection, SkillRuntimeContext } from "../../contracts/skill-contract";

const TITLE = "文档内容编辑";

const BODY = `【文档内容编辑】

适用任务：文档正文创建/读取/更新/删除、块属性修改、块引用/迁移、块状态管理、文档结构转换。

优先工具（只使用这些工具完成主任务）：
- create_doc, rename_doc, delete_doc, move_block: 文档/块级创建与结构操作（写需确认）
- read_doc_blocks: 按文档读取块内容（只读）
- siyuan_block_read: 块信息/kramdown/children/sibling 细粒度读取（只读）
- update_block, insert_block, delete_blocks, replace_doc_content: 块级编辑（写需确认）
- siyuan_block_attr: 块属性 get/set/batch_set/batch_get（set 需确认）
- siyuan_block_ref: 引用读取/迁移（transfer_ref 高风险，需确认）
- siyuan_block_state: 折叠/展开/提醒/任务 marker（写需确认）
- siyuan_doc_transform: 文档结构转换 doc/heading/list item（写需确认）

辅助工具（仅在需要时使用）：
- siyuan_doc_path: 路径/ID 解析，仅当确认 docId/path/hpath 时使用
- siyuan_outline: 查看文档标题结构，定位目标区域
- siyuan_ref: 查看反链/提及，辅助理解文档间关系

避免工具（非本 Skill 职责）：
- siyuan_notebook_manage: 笔记本管理层不属于本 Skill
- siyuan_doc_tree: 文档树组织不属于本 Skill
- siyuan_asset_read/manage: 资产管理不属于本 Skill
- siyuan_riff_deck/card: 闪卡复习不属于本 Skill

使用规则：
1. 编辑前先读取确认真实 blockId/docId
2. 局部更新优先 update_block/insert_block，避免整篇替换
3. 块属性写入、引用迁移、状态修改必须确认
4. 失败或拒绝后不得声称成功，不得换工具绕过
5. 不编造 ID 或路径
6. 工具返回失败时如实说明

测试说明：测试本 Skill 时应先读取文档内容定位 blockId，再测试局部编辑。不要调用笔记本管理或知识库全文检索。`;

export const BUILTIN_DOC_CONTENT_EDITING_SKILL_NAME = "builtin_doc_content_editing";

export function createDocContentEditingSkill(): SkillContract {
  return {
    name: BUILTIN_DOC_CONTENT_EDITING_SKILL_NAME,
    title: TITLE,
    description: "根据真实 notebookId/docId/blockId/path 进行有限文档级和块级内容编辑。",
    priority: 90,
    enabledByDefault: false,
    intentKeywords: ["编辑", "修改", "创建文档", "删除", "块属性", "引用", "折叠", "任务", "文档转换", "插入", "更新"],
    primaryToolNames: [
      "create_doc", "rename_doc", "delete_doc", "move_block",
      "read_doc_blocks", "siyuan_block_read",
      "update_block", "insert_block", "delete_blocks", "replace_doc_content",
      "siyuan_block_attr", "siyuan_block_ref", "siyuan_block_state", "siyuan_doc_transform",
    ],
    helperToolNames: ["siyuan_doc_path", "siyuan_outline", "siyuan_ref"],
    avoidToolNames: ["siyuan_notebook_manage", "siyuan_doc_tree", "siyuan_asset_read", "siyuan_asset_manage", "siyuan_riff_deck", "siyuan_riff_card"],
    usageRules: [
      "编辑前先读取确认 blockId/docId",
      "局部更新优先，避免整篇替换",
      "写操作必须确认",
      "失败/拒绝后不得声称成功",
    ],
    examples: [
      "在文档 xxx 的某个标题下插入一段文字",
      "修改文档 xxx 中第 3 个段落的文本",
      "删除文档 xxx 中的某个列表项",
      "把文档 xxx 的标题层级从 h2 改为 h3",
    ],
    testInstructions: ["测试本 Skill 时应先读取文档内容定位 blockId，再测试局部编辑。不要调用笔记本管理或知识库全文检索。"],

    buildPromptSection(ctx: SkillRuntimeContext): SkillPromptSection {
      return {
        title: TITLE,
        body: BODY,
        priority: 90,
        meta: {
          skillName: BUILTIN_DOC_CONTENT_EDITING_SKILL_NAME,
          bytesEstimate: BODY.length,
          primaryToolNames: [
            "create_doc", "rename_doc", "delete_doc", "move_block",
            "read_doc_blocks", "siyuan_block_read",
            "update_block", "insert_block", "delete_blocks", "replace_doc_content",
            "siyuan_block_attr", "siyuan_block_ref", "siyuan_block_state", "siyuan_doc_transform",
          ],
          helperToolNames: ["siyuan_doc_path", "siyuan_outline", "siyuan_ref"],
          isPrimary: ctx.primarySkillName === BUILTIN_DOC_CONTENT_EDITING_SKILL_NAME,
          isTestSkillMode: ctx.isTestSkillMode,
        },
      };
    },
  };
}
