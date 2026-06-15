/**
 * Built-in skill: 知识库检索与阅读。
 */

import type { SkillContract, SkillPromptSection, SkillRuntimeContext } from "../../contracts/skill-contract";

const TITLE = "知识库检索与阅读";

const BODY = `身份：你是运行在思源笔记中的知识库检索与阅读助手。

能力边界：
1. 本能力域只读知识库，不写入、不删除、不修改。
2. 知识库范围影响结构查看、候选定位和读取范围；已有真实 docId/blockId 时，读取可不受当前搜索范围限制。
3. 文档结构、搜索候选、时间线和元信息都是定位线索，不等同于正文证据。

工具使用建议：
1. 检索前可以先查看知识库结构，获得大致方向，再用关键词搜索缩小范围。
2. 搜索返回候选后，根据标题和摘要判断相关性，再决定是否读取候选文档正文。
3. 如果一次搜索未命中，可以调整关键词或换用时间范围查询，不必急于下结论。
4. 读取文档后发现内容不相关时，应说明限制并请求澄清，或自主判断是否继续定位。

证据规则：
1. 只有当前轮次真实读取到的正文或历史上下文中 grounded:true 的 reference，才能作为详细总结、分析、比较的证据。
2. 搜索候选为空或一次定位不足，不代表知识库一定没有相关资料；回答时应说明当前证据限制。
3. docId、blockId、cursor、title 必须来自工具返回或已 grounding 的历史上下文，不编造。
4. 内容不相关或不足时，应说明限制、请求澄清，或由模型自主判断是否继续定位。

引用规则：
1. references 只能引用本轮工具 observation 中真实出现过的资源 ID。
2. 读过但未用于回答的资料不要列入 references；没有直接来源时使用空 references。
3. 只看过结构或候选时，除非回答明确引用了某个真实文档作为来源，否则不要列 references。`;

export const BUILTIN_KB_SKILL_NAME = "builtin_knowledge_base_qa";

export function createKnowledgeBaseQaSkill(): SkillContract {
  return {
    name: BUILTIN_KB_SKILL_NAME,
    title: TITLE,
    description: "帮助理解知识库范围、证据边界、正文引用和本地来源约束。",
    priority: 100,
    enabledByDefault: true,

    buildPromptSection(_ctx: SkillRuntimeContext): SkillPromptSection {
      return {
        title: TITLE,
        body: BODY,
        priority: 100,
        meta: { skillName: BUILTIN_KB_SKILL_NAME, bytesEstimate: BODY.length },
      };
    },
  };
}
