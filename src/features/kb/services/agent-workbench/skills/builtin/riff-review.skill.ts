import type { SkillContract, SkillPromptSection, SkillRuntimeContext } from "../../contracts/skill-contract";

const TITLE = "闪卡复习";

const BODY = `【闪卡复习】

适用任务：管理思源 Riff deck 和 card 的查询与受控复习写入。

优先工具（只使用这些工具完成主任务）：
- siyuan_riff_deck: 创建/查看/重命名/删除 deck（list 只读；create/rename/remove 需确认）
- siyuan_riff_card: 查询/审核/重置/设到期时间（查询只读；写入需确认）

辅助工具（仅在需要时使用）：
- 无

避免工具（非本 Skill 职责）：
- 正文编辑工具 family: 不要用普通文档编辑工具改闪卡内部结构
- read_docs、list_knowledge_map: 全文检索不属于闪卡复习
- siyuan_sql_select: 不要默认用 SQL 查闪卡

使用规则：
1. 不要只根据 getRiffDecks 空数组判断"没有闪卡"——deck 只代表自定义卡包，卡片可以不属于任何 deck
2. 用户问"我有哪些闪卡"时优先：list_cards(deckID='') 查全部卡片 → deck list 查自定义卡包
3. 添加卡片必须先有明确 deckID；如果没有自定义 deck，先用 siyuan_riff_deck create 创建 deck（需用户确认），再 add_cards。不要自动创建 deck——创建 deck 是写入操作，必须用户明确要求并确认
4. deckID、cardID、blockID 必须来自工具返回
5. 复习/跳过/重置/删除/设置到期时间必须确认
6. 复习前先读取 due_cards，确认真实 deckID+cardID 后再写入
7. 工具返回失败时如实说明，不得声称成功

测试说明：测试本 Skill 时先 call deck list + list_cards(deckID='')，再测试复习状态更新（需确认）。不要调用知识库检索或文档编辑工具。`;

export const BUILTIN_RIFF_REVIEW_SKILL_NAME = "builtin_riff_review";

export function createRiffReviewSkill(): SkillContract {
  return {
    name: BUILTIN_RIFF_REVIEW_SKILL_NAME,
    title: TITLE,
    description: "管理思源闪卡 deck 和 card 的查询与受控复习写入。",
    priority: 78,
    enabledByDefault: false,
    intentKeywords: ["闪卡", "复习", "riff", "card", "deck", "记忆卡", "抽认卡"],
    primaryToolNames: ["siyuan_riff_deck", "siyuan_riff_card"],
    helperToolNames: [],
    avoidToolNames: ["create_doc", "update_block", "insert_block", "delete_blocks", "replace_doc_content", "read_docs", "list_knowledge_map", "siyuan_sql_select"],
    usageRules: [
      "不要只根据 getRiffDecks 空数组判断没有闪卡",
      "用户问有哪些闪卡时优先 list_cards(deckID='')",
      "添加卡片必须有 deckID；无自定义 deck 时先 siyuan_riff_deck create（需确认），不要自动创建",
      "复习/跳过/重置/删除必须确认",
      "复习前先读 due_cards 确定 deckID+cardID",
    ],
    examples: [
      "列出所有闪卡 deck",
      "查看今天待复习的卡片",
      "复习卡片 xxx 并标记为完成",
      "把卡片 xxx 推迟到明天",
    ],
    testInstructions: ["先调用 siyuan_riff_deck list，再调用 siyuan_riff_card list_cards(deckID='') 查询全部卡片，最后测试复习状态更新（需确认）。不要调用知识库检索或文档编辑工具。"],

    buildPromptSection(ctx: SkillRuntimeContext): SkillPromptSection {
      return {
        title: TITLE,
        body: BODY,
        priority: 78,
        meta: {
          skillName: BUILTIN_RIFF_REVIEW_SKILL_NAME,
          bytesEstimate: BODY.length,
          primaryToolNames: ["siyuan_riff_deck", "siyuan_riff_card"],
          helperToolNames: [],
          isPrimary: ctx.primarySkillName === BUILTIN_RIFF_REVIEW_SKILL_NAME,
          isTestSkillMode: ctx.isTestSkillMode,
        },
      };
    },
  };
}
