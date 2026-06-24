import type { SkillContract, SkillPromptSection, SkillRuntimeContext } from "../../contracts/skill-contract";

const TITLE = "笔记本与文档树管理";

const BODY = `【笔记本与文档树管理】

适用任务：管理笔记本（创建/打开/关闭/重命名/删除/配置）和文档树组织（列出/移动/复制/排序/重命名）。

优先工具（只使用这些工具完成主任务）：
- siyuan_notebook_manage: 笔记本列表/创建/打开/关闭/重命名/删除/配置（list/get_conf 只读，其余需确认）
- siyuan_doc_tree: 文档树列出子节点/移动/复制/排序/重复（list_children 只读，move/duplicate/sort 需确认）
- siyuan_doc_path: hpath/path/id 映射解析，仅用于路径确认（注意 list_children 需要物理 path，先用 hpath_by_path 解析 hpath → path）

辅助工具（仅在需要时使用）：
- siyuan_doc_transform: 文档结构转换（doc/heading/list item），不属于本 Skill 主路径

避免工具（非本 Skill 职责，非必要不调用）：
- create_doc, update_block, insert_block, delete_blocks, replace_doc_content: 正文编辑不属于本 Skill
- read_docs, list_knowledge_map: 全文检索不属于本 Skill
- siyuan_sql_select: 不要默认用 SQL 管理文档树

使用规则：
1. list_children 需要物理 path，应先用 siyuan_doc_path action="hpath_by_path" 解析 hpath → path
2. 不要直接把 hpath 当 path 传给 list_children
3. 重命名/删除/移动文档树节点必须确认
4. 本 Skill 不处理具体文档正文内容
5. 工具返回失败时如实说明，不得声称成功

测试说明：测试本 Skill 时只测试笔记本列表、文档树列表、路径解析等主工具。不要调用正文编辑或知识库检索工具。`;

export const BUILTIN_NOTEBOOK_DOC_TREE_SKILL_NAME = "builtin_notebook_doc_tree";

export function createNotebookDocTreeSkill(): SkillContract {
  return {
    name: BUILTIN_NOTEBOOK_DOC_TREE_SKILL_NAME,
    title: TITLE,
    description: "管理笔记本和文档树组织，不处理具体正文内容。",
    priority: 84,
    enabledByDefault: false,
    intentKeywords: ["笔记本", "文档树", "notebook", "doc tree", "文档结构", "文件夹", "目录"],
    primaryToolNames: ["siyuan_notebook_manage", "siyuan_doc_tree", "siyuan_doc_path"],
    helperToolNames: ["siyuan_doc_transform"],
    avoidToolNames: ["create_doc", "update_block", "insert_block", "delete_blocks", "replace_doc_content", "read_docs", "list_knowledge_map", "siyuan_sql_select"],
    usageRules: [
      "list_children 需要物理 path，先用 hpath_by_path 解析",
      "不要直接传 hpath 给 list_children",
      "写操作必须确认",
      "本 Skill 不处理正文内容",
    ],
    examples: [
      "列出所有笔记本",
      "查看笔记本 xxx 下的文档树",
      "把文档从 A 笔记本移动到 B 笔记本",
      "重命名文档 xxx",
    ],
    testInstructions: ["测试本 Skill 时只测试笔记本列表、文档树列表、路径解析。不要调用正文编辑或知识库检索工具。"],

    buildPromptSection(ctx: SkillRuntimeContext): SkillPromptSection {
      return {
        title: TITLE,
        body: BODY,
        priority: 84,
        meta: {
          skillName: BUILTIN_NOTEBOOK_DOC_TREE_SKILL_NAME,
          bytesEstimate: BODY.length,
          primaryToolNames: ["siyuan_notebook_manage", "siyuan_doc_tree", "siyuan_doc_path"],
          helperToolNames: ["siyuan_doc_transform"],
          isPrimary: ctx.primarySkillName === BUILTIN_NOTEBOOK_DOC_TREE_SKILL_NAME,
          isTestSkillMode: ctx.isTestSkillMode,
        },
      };
    },
  };
}
