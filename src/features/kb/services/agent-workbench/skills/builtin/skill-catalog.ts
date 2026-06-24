/**
 * Builtin Skill Catalog (Read-Only)
 *
 * Used by settings UI to display built-in skill info.
 * Data from agent-workbench skill definitions.
 */

import { BUILTIN_DOC_CONTENT_EDITING_SKILL_NAME } from "./doc-content-editing.skill";
import { BUILTIN_DATABASE_ASSISTANT_SKILL_NAME } from "./database-assistant.skill";
import { BUILTIN_KB_SKILL_NAME } from "./knowledge-base-qa.skill";
import { BUILTIN_SCHEDULE_TASK_DIARY_SKILL_NAME } from "./schedule-task-diary.skill";
import { BUILTIN_NOTEBOOK_DOC_TREE_SKILL_NAME } from "./notebook-doc-tree.skill";
import { BUILTIN_TAG_BOOKMARK_OUTLINE_SKILL_NAME } from "./tag-bookmark-outline.skill";
import { BUILTIN_ASSET_MANAGEMENT_SKILL_NAME } from "./asset-management.skill";
import { BUILTIN_RIFF_REVIEW_SKILL_NAME } from "./riff-review.skill";

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
    title: "强化日记助手",
    source: "builtin",
    enabledByDefault: true,
    description: "围绕任务、日记、快速记录、复盘和计划承接做查询与受控写入。任务写操作统一使用 manage_diary_task。",
    boundary: "查询工具为只读；任务写操作统一使用 manage_diary_task（新增/迁移/修改状态/更新字段/推迟/删除）；快速记录写操作统一使用 manage_diary_record（新增/修改/删除）；复盘写操作统一使用 manage_diary_review（保存字段/标记完成/跳过/恢复）；日记结构写操作统一使用 manage_diary_structure（确保今日日记、补模板）；docId/blockId/taskId/recordId 必须来自工具返回或 grounding 上下文，不编造；不能用 create 冒充 migrate。",
    guidance: "相对时间应参考 runtimeNow；新增任务前先确保今日日记存在；迁移/修改/推迟/删除已有任务前必须先 query_tasks 获取真实 ID；修改/删除已有快速记录前必须先 query_diary_records 获取真实 recordId/headingBlockId/date；保存复盘前确认已有对应复盘根区块；复盘 docId 必须来自 find_diary_docs 或 grounding 上下文；未返回的信息不能当成事实。",
  },
  {
    name: BUILTIN_DATABASE_ASSISTANT_SKILL_NAME,
    title: "数据库助手",
    source: "builtin",
    enabledByDefault: true,
    description: "查询和操作思源数据库/属性视图，并执行受控写入。",
    boundary: "只处理思源属性视图/数据库；只读不确认；写工具默认开启执行前确认，用户可在设置中关闭；不删除数据库，不批量替换整库。",
    guidance: "先查找真实 databaseId，再读取 schema；databaseId、viewId、keyId、rowId、boundBlockId 不得混用或编造；字段名/行标题不能代替 keyId/rowId；boundBlockId 不能直接当 rowId，需用映射工具转换。",
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
  {
    name: BUILTIN_NOTEBOOK_DOC_TREE_SKILL_NAME,
    title: "笔记本与文档树管理",
    source: "builtin",
    enabledByDefault: false,
    description: "管理笔记本和文档树组织，不处理具体正文内容。",
    boundary: "只管理笔记本、文档树、路径和 ID 解析；不重复创建文档、重命名文档、删除文档工具；写入结构变更必须确认。",
    guidance: "先用只读 action 确认 notebook/path/docId/hpath，再执行移动、复制、排序或笔记本配置变更；正文编辑交给文档编辑 Skill。",
  },
  {
    name: BUILTIN_TAG_BOOKMARK_OUTLINE_SKILL_NAME,
    title: "标签、书签与大纲",
    source: "builtin",
    enabledByDefault: false,
    description: "管理标签和书签，并共享文档大纲读取能力。",
    boundary: "标签和书签写入必须确认；大纲只读且不等同于正文证据；不修改正文。",
    guidance: "标签用 siyuan_tag_manage，书签用 siyuan_bookmark_manage，大纲用 siyuan_outline；需要详细内容证据时继续 read_docs。",
  },
  {
    name: BUILTIN_ASSET_MANAGEMENT_SKILL_NAME,
    title: "资产管理",
    source: "builtin",
    enabledByDefault: false,
    description: "管理思源 assets 和受限工作区文件。",
    boundary: "只访问 assets 和白名单工作区目录；不访问系统任意路径、其他插件 storage、conf、data/.siyuan；删除、重命名、OCR/标注写入必须确认。",
    guidance: "资源读取用 siyuan_asset_read，资源写入用 siyuan_asset_manage，受限文件操作用 siyuan_workspace_file；路径被拒绝时不要绕过。",
  },
  {
    name: BUILTIN_RIFF_REVIEW_SKILL_NAME,
    title: "闪卡复习",
    source: "builtin",
    enabledByDefault: false,
    description: "管理思源闪卡 deck 和 card 的查询与受控复习写入。",
    boundary: "create deck 已支持但属于写入操作，必须用户确认；AI 不得为添加卡片自动创建 deck。deckID/cardID/blockID 不能编造；复习/跳过/重置/删除/设到期时间都必须确认。",
    guidance: "查询全部卡片用 siyuan_riff_card list_cards(deckID='')，deck 为空不代表没有闪卡。先读取 due cards 或 cards by block ids，确认真实 ID 后再执行复习状态写入。",
  },
];
