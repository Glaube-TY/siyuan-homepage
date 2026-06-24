import type { SkillContract, SkillPromptSection, SkillRuntimeContext } from "../../contracts/skill-contract";

const TITLE = "标签、书签与大纲";

const BODY = `【标签、书签与大纲】

适用任务：标签搜索/列出/重命名/删除、书签读取/设置/移除、文档大纲查看。

优先工具（只使用这些工具完成主任务）：
- siyuan_tag_manage: 标签列表（action=list）、搜索（action=search）、重命名、删除（写 action 需确认）
- siyuan_bookmark_manage: 书签块列表（action=list_blocks 列出书签块）、书签标签列表（action=list）、重命名/删除（写 action 需确认）。不要用 SQL 查书签
- siyuan_outline: 文档大纲只读，仅用于理解标题结构

辅助工具（仅在需要时使用，不要优先调用）：
- siyuan_block_attr: get 读块属性，仅当确认书签相关属性时使用（set 需确认）
- siyuan_doc_path: 路径/ID 解析，仅当确认 docId/path/hpath 映射时使用

避免工具（非本 Skill 职责，非必要不调用）：
- skill_list: 只用于外部 Skill，不要用它判断内置 Skill 是否存在
- read_docs、list_knowledge_map、list_items_by_time: 知识库全文检索
- siyuan_sql_select: 不要默认用 SQL 查标签/书签，优先用专用工具
- siyuan_block_read: 不要默认读正文
- siyuan_ref: 反链/引用不属于标签/书签/大纲测试范围
- 所有写工具 family（create_doc, update_block 等）

使用规则：
1. 搜索标签用 siyuan_tag_manage action=search；列出标签用 siyuan_tag_manage action=list。不要用 siyuan_search_extra 搜标签
2. 列出书签块用 siyuan_bookmark_manage action=list_blocks
3. 不要用 SQL 查书签
4. 大纲只读，不等于正文证据
5. 写操作必须等待用户确认
6. skill_list 只用于外部 Skill，内置 Skill 从上下文判断
7. 工具返回失败时如实说明，不得声称成功

测试说明：测试本 Skill 时只测试标签搜索、书签块列表、大纲查看等主工具。不要测试模板、挂件、嵌入块、无效引用、反链、文档树、折叠展开。不要调用知识库检索工具。不要用 skill_list 判断内置 Skill。`;

export const BUILTIN_TAG_BOOKMARK_OUTLINE_SKILL_NAME = "builtin_tag_bookmark_outline";

export function createTagBookmarkOutlineSkill(): SkillContract {
  return {
    name: BUILTIN_TAG_BOOKMARK_OUTLINE_SKILL_NAME,
    title: TITLE,
    description: "管理标签和书签，并共享文档大纲读取能力。",
    priority: 82,
    enabledByDefault: false,
    intentKeywords: ["标签", "书签", "大纲", "bookmark", "tag", "outline"],
    primaryToolNames: ["siyuan_tag_manage", "siyuan_bookmark_manage", "siyuan_outline"],
    helperToolNames: ["siyuan_block_attr", "siyuan_doc_path"],
    avoidToolNames: ["skill_list", "read_docs", "list_knowledge_map", "list_items_by_time", "siyuan_sql_select", "siyuan_block_read", "siyuan_ref", "siyuan_search_extra", "create_doc", "update_block", "insert_block", "delete_blocks", "replace_doc_content"],
    usageRules: [
      "搜索标签用 siyuan_tag_manage action=search；列出标签用 siyuan_tag_manage action=list",
      "不要用 siyuan_search_extra 搜标签——它只能作为兼容辅助",
      "列出书签块用 siyuan_bookmark_manage action=list_blocks",
      "不要用 SQL 查书签",
      "大纲只读，不等于正文证据",
      "写操作必须确认",
      "skill_list 只用于外部 Skill",
    ],
    examples: [
      "帮我搜索标签 #项目A",
      "列出所有带书签的块",
      "查看文档 xxx 的大纲结构",
      "给文档 xxx 设置书签",
    ],
    testInstructions: ["只测试标签搜索、书签块列表、大纲查看等主工具。不要测试模板/挂件/嵌入块/无效引用/反链/文档树/折叠展开。不要用 skill_list 判断内置 Skill。"],

    buildPromptSection(ctx: SkillRuntimeContext): SkillPromptSection {
      return {
        title: TITLE,
        body: BODY,
        priority: 82,
        meta: {
          skillName: BUILTIN_TAG_BOOKMARK_OUTLINE_SKILL_NAME,
          bytesEstimate: BODY.length,
          primaryToolNames: ["siyuan_tag_manage", "siyuan_bookmark_manage", "siyuan_outline"],
          helperToolNames: ["siyuan_block_attr", "siyuan_doc_path"],
          isPrimary: ctx.primarySkillName === BUILTIN_TAG_BOOKMARK_OUTLINE_SKILL_NAME,
          isTestSkillMode: ctx.isTestSkillMode,
        },
      };
    },
  };
}
