/**
 * KB retrieval skill: prompt / guidance text.
 *
 * 本文件只提供中文能力说明，不拥有工具，不绑定工具，不规定固定流程。
 */

export const KB_RETRIEVAL_TITLE = "思源知识库问答";

export const KB_RETRIEVAL_DESCRIPTION =
  "说明如何参考思源知识库相关全局工具能力进行结构查看、检索、读取和引用。";

export const KB_RETRIEVAL_ROLE_INSTRUCTION =
  "可使用思源知识库资料辅助回答。";

export const KB_RETRIEVAL_WHEN_USEFUL =
  "当用户请求涉及知识库资料的查找、总结、解释、对比或引用时可参考。";

export const KB_RETRIEVAL_BOUNDARY =
  "只读知识库；不写入、不删除、不修改。可以使用工具返回的 docId/blockId/url/fileId/resourceId 作为后续工具参数；不得编造资源 ID。不得输出 path/internalMapping/realPath 等内部实现字段。";

export const KB_RETRIEVAL_GUIDANCE_LINES: readonly string[] = [
  "核心边界：代码只是 Agent Workbench 脚手架；Tool 是全局独立能力；Skill 只说明能力、边界和通用策略；是否列结构、检索、读取、继续读取或最终回答，由 Planner 根据用户请求和 observation 自主决定。",
  "工具失败只作为结构化 observation 返回。Planner 可自行修正参数、换用其他工具、说明限制或 final_answer；代码和 Skill 都不应写成固定恢复流程。",
  "",
  "结构查看能力：",
  "- list_knowledge_map 用于查看知识结构，不包含文档正文，不自动触发搜索或读取。",
  "- list_knowledge_map 支持 view=notebooks/notebook_roots/children/subtree/neighborhood/list；支持 notebookId、rootDocId、centerDocId、limit、cursor、maxDepth。",
  "- 大知识库场景下，通常更稳的是先查看有限范围，例如 notebooks、notebook_roots、children 或带 limit/cursor 的 list；是否继续翻页由 Planner 根据 observation 自主决定。",
  "- 只需要结构、目录、有哪些资料、笔记本或根文档概览时，通常不需要读取正文。",
  "- 结构节点中的 docId/notebookId/blockId 是真实可调用资源 ID；path、hPath、refPath、internalMapping 不是可调用资源 ID。",
  "- 有真实 docId 的文档节点通常可传给 read_candidate_docs 尝试读取；是否 empty_content 或 container_without_content 由 read_candidate_docs 的 observation 判断，不能仅因 hasChildren=true 就判为不可读。",
  "",
  "可选双链摘要：",
  "- list_knowledge_map 的 includeLinkedDocs=true 可返回轻量 linkedDocs 摘要，用于理解结构邻接关系。",
  "- linkedDocs 只包含 docId、title、relation、count、sampleBlockId、source；不会默认返回 blocks、dom、content、markdown、path、hPath 或 refPath。",
  "- 双链关系只是结构辅助信息，不是证据门槛，也不会自动触发正文读取。",
  "- relationLimit 用于限制每个节点返回的关系摘要数量；是否开启 includeLinkedDocs 由 Planner 根据任务和上下文自主决定。",
  "",
  "检索和读取能力：",
  "- search_scope 用于发现相关候选资料；搜索结果是候选定位信息，不等同于已读取正文。",
  "- 当用户给出明确标题、关键词或资源名称时，可考虑使用 search_scope 快速定位；若多次检索仍不稳定，可考虑回到结构工具获取上下文，而不是反复盲搜。",
  "- read_candidate_docs 只读取 Planner 显式传入的 docId/blockId，返回已读取内容片段和截断信息。",
  "- read_candidate_docs 支持 default/full/range/next；如果内容被截断，是否使用 nextCursor 继续读取由 Planner 根据任务需要自主决定。",
  "- 当用户要求总结、分析或比较正文内容时，通常需要依据已读取正文或内容片段；若当前只有结构信息或候选信息，可说明可见内容有限，或继续选择合适工具获取内容。",
  "",
  "最近上下文和引用：",
  "- 全局上下文工具 list_recent_references / read_reference_content 可查看本会话已展示来源；这些工具不属于 KB Skill。",
  "- 用户说“上面这些、刚才那几篇、继续总结”等跟进表达时，可优先理解最近上下文中明确出现的真实资源 ID。",
  "- 不能从自然语言正文里猜 docId；只有标题时只能当作标题线索。",
  "- final_answer 的 references 是通用展示来源，不是知识库证据门槛；不要求必须附带引用。",
  "",
  "final_answer / progress_answer 边界：",
  "- final_answer 是全局 system tool，会结束当前回合；仅在任务已完成、无需继续工具、需要澄清，或无法继续时使用。",
  "- 如果只是说明“我需要先查看列表/读取内容”，通常不要用 final_answer 结束，应继续由 Planner 选择工具或使用 progress_answer 展示阶段进展。",
  "- progress_answer 是全局 system tool，只展示进度，不结束任务；简单任务通常不需要 progress_answer。",
];
