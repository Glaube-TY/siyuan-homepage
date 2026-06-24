/**
 * Built-in skill: 知识库检索与阅读。
 */

import type { SkillContract, SkillPromptSection, SkillRuntimeContext } from "../../contracts/skill-contract";

const TITLE = "知识库检索与阅读";

const BODY = `【知识库检索与阅读】

适用任务：全文检索、知识库结构理解、引用/反链查询、文档路径解析、只读 SQL 结构化查询。

优先工具（只使用这些工具完成主任务）：
- read_docs, get_doc_info: 文档全文读取与信息查询（只读）
- list_knowledge_map: 知识库结构查看（只读）
- search_scope: 关键词全文搜索定位候选文档（只读）
- list_items_by_time: 按时间查看文档/块（只读）
- siyuan_outline: 文档标题结构查看（只读）
- siyuan_ref: 反链/提及/引用块查询（只读）
- siyuan_doc_path: hpath/path/id 映射解析（只读）
- siyuan_search_extra: search_tag/search_template/search_embed_block 等特殊检索（只读）
- siyuan_block_read: 块信息/kramdown/children/breadcrumb 细粒度读取（只读）

辅助工具（仅在需要时使用，不要优先调用）：
- siyuan_sql_select: 只读 SQL 查询（仅 SELECT/WITH...SELECT），仅当专用检索工具无法满足时作为高级辅助。不要默认优先用 SQL

避免工具（非本 Skill 职责，非必要不调用）：
- 所有写工具 family: 本 Skill 只读，不写入/删除/修改

使用规则：
1. 检索前先看知识库结构，再用关键词搜索缩小范围
2. 搜索候选不等于正文证据；需要正文时用 read_docs 读取
3. siyuan_outline 只显示标题结构，不等于正文
4. 不要默认优先用 SQL；先用专用检索工具
5. 文档时间和元信息是定位线索，不等同于正文证据
6. 搜索结果为空不等于知识库没有资料
7. 工具返回失败时如实说明

证据规则：
1. 只有当前轮真实读取的正文或历史上下文 grounded 引用才能作为证据
2. docId/blockId 必须来自工具返回，不编造
3. 读过但未用于回答的资料不列 references

测试说明：测试本 Skill 时测试知识库结构查看、关键词搜索、文档读取等主工具。不要调用写工具。`;

export const BUILTIN_KB_SKILL_NAME = "builtin_knowledge_base_qa";

export function createKnowledgeBaseQaSkill(): SkillContract {
  return {
    name: BUILTIN_KB_SKILL_NAME,
    title: TITLE,
    description: "帮助理解知识库范围、证据边界、正文引用和本地来源约束。",
    priority: 100,
    enabledByDefault: true,
    intentKeywords: ["搜索", "查找", "检索", "阅读", "知识库", "文档", "引用", "反链", "路径", "大纲", "结构"],
    primaryToolNames: [
      "read_docs", "get_doc_info",
      "list_knowledge_map", "search_scope", "list_items_by_time",
      "siyuan_outline", "siyuan_ref", "siyuan_doc_path",
      "siyuan_search_extra", "siyuan_block_read",
    ],
    helperToolNames: ["siyuan_sql_select"],
    avoidToolNames: [
      "create_doc", "rename_doc", "delete_doc", "move_block",
      "update_block", "insert_block", "delete_blocks", "replace_doc_content",
    ],
    usageRules: [
      "先看结构，再搜索，最后读取正文",
      "搜索候选≠正文证据",
      "不要默认优先用 SQL",
      "不编造 ID/路径",
    ],
    examples: [
      "搜索知识库中关于项目管理的文档",
      "查看最近一周新增的文档",
      "阅读文档 xxx 的完整正文",
      "查看文档 xxx 被哪些文档引用",
    ],
    testInstructions: ["测试本 Skill 时测试知识库结构查看、关键词搜索、文档读取等主工具。不要调用写工具。"],

    buildPromptSection(ctx: SkillRuntimeContext): SkillPromptSection {
      return {
        title: TITLE,
        body: BODY,
        priority: 100,
        meta: {
          skillName: BUILTIN_KB_SKILL_NAME,
          bytesEstimate: BODY.length,
          primaryToolNames: [
            "read_docs", "get_doc_info",
            "list_knowledge_map", "search_scope", "list_items_by_time",
            "siyuan_outline", "siyuan_ref", "siyuan_doc_path",
            "siyuan_search_extra", "siyuan_block_read",
          ],
          helperToolNames: ["siyuan_sql_select"],
          isPrimary: ctx.primarySkillName === BUILTIN_KB_SKILL_NAME,
          isTestSkillMode: ctx.isTestSkillMode,
        },
      };
    },
  };
}
