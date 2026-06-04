# 第一原则 — Skill-first Agent Workbench

本文件是思源笔记 AI 知识库的最高优先级规则。

## 极简硬原则

1. **代码只提供通用 Agent Workbench 能力，不承担业务决策。**
   Workbench 只负责校验参数、执行工具、返回 observation。不替 Planner 选工具，不根据工具结果自动调用下一个工具。

2. **AI Planner 是唯一业务决策者。**
   是否查看结构、搜索、读取、继续读取或回答，完全由 Planner 根据用户请求和 observation 自主决定。

3. **Tool 是全局独立能力。**
   每个工具只校验参数、执行动作、返回 observation。工具之间不能被代码串成固定流程。所有工具对所有 Skill 可见。

4. **Skill 只是中文能力说明。**
   Skill 描述工具能力、边界和通用建议。不拥有工具、不绑定工具、不规定固定步骤，不写成具体场景规则库。

5. **工具结果暴露真实可调用资源 ID。**
   使用 docId、blockId、url、fileId、resourceId。不使用隐藏 handle 映射。不暴露 path、internalMapping、realPath 等内部字段。

6. **final_answer 和 progress_answer 是全局回答工具，不属于任何 Skill。**
   final_answer 结束本轮，progress_answer 展示进展。references 只是展示来源，不是证据门槛。

7. **运行时提示语通用、中文、面向未来扩展。**
   不暴露内部代码结构、文件名、旧链路名、调试术语。

## 绝对禁止

- 代码根据用户问题、关键词、搜索结果、证据、预算、回答文本自动选择下一步。
- 工具之间互相调用来串流程（如 search_scope 自动调 read_candidate_docs）。
- 流程控制字段：recommendedAction、suggestedAction、fallbackAction、forcedNextTool、preferredNextStep、shouldUseWhen、finalizeAnswer、AUTO_*ACTION 等。
- read_docs、read_block_context 出现在 Planner 可见工具中。
- 在运行时提示语中暴露 adapter、schema、trace、diagnostics、harness、fallback、V3 等内部术语。
- 把 Skill 写成针对具体问题类型、文档类型或测试场景的规则库。
- 用正则/关键词/自然语言内容判断流程。
