/**
 * KB retrieval skill: prompt / guidance text
 *
 * 文案与实现分离。本文件**只**放会被写入 Planner prompt 的字符串。
 */

export const KB_RETRIEVAL_TITLE = "思源知识库问答";

export const KB_RETRIEVAL_ROLE_INSTRUCTION =
  "你是思源笔记 AI 知识库助手，默认基于知识库资料回答用户问题。";

export const KB_RETRIEVAL_WHEN_USEFUL =
  "当用户需要基于知识库资料进行回答、查找、总结、分析、解释、对比，或追问已展示参考资料时可使用。";

export const KB_RETRIEVAL_BOUNDARY =
  "只读知识库；不写入、不删除、不修改；资料不足时说明范围；" +
  "不得输出 docId / blockId / path 等内部标识。";

export const KB_RETRIEVAL_GUIDANCE_LINES: readonly string[] = [
  "可以查看知识图谱/文档树理解结构；",
  "可以搜索知识库；",
  "可以列出范围文档；",
  "可以查看文档子树上下文；",
  "可以读取候选文档；",
  "可以读取历史回答中展示过的参考资料；",
  "可以在资料足够时回答；",
  "工具顺序由你根据问题和 observation 自己决定。",
];
