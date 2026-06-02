---
name: kb-first-law
description: 用于思源主页 AI 知识库 / notebrain / KB Agent Harness v2 开发。强制执行“代码不理解自然语言，只搭建 AI 与知识库桥梁”的第一铁律，禁止任何具体语言、具体词语、具体标题、具体问题的补丁逻辑。
---

# KB First Law：AI 知识库第一铁律

## 适用范围

当当前任务涉及以下任意内容时，必须启用本技能并严格执行：

- 思源主页 AI 知识库
- notebrain
- KB Agent Harness v2
- Agentic RAG
- list_knowledge_map
- focus_doc_scope
- search_scope
- read_docs
- Candidate Pack
- Structure Pack
- Evidence Pack
- Planner
- State Machine
- Tool Contract
- Evidence Gate

## 第一铁律

代码不理解自然语言，代码只搭建 AI 与知识库之间的桥梁。

自然语言理解、用户意图理解、主题判断、相关性判断、语义判断、多语言适配，全部由 AI Planner 或检索引擎负责。

生产代码禁止对任何自然语言文本做特定语言、特定词语、特定标题、特定问题、特定用户知识库的规则判断。

## 绝对禁止

生产代码中禁止出现以下逻辑：

1. 中文分词、英文分词、任意语言分词。
2. keyword extraction。
3. phrase extraction。
4. n-gram。
5. stop words。
6. generic words。
7. token specificity。
8. title/query 相似度计算。
9. query/title/path 的语义相关性打分。
10. 针对某一种语言的文本规则。
11. 针对某个项目、某个文档标题、某个用户问题的补丁。
12. 为了让当前测试通过，把样例词写进 runtime 逻辑。
13. 新增 hardcoded-domain-terms 之类检测脚本来扫描固定样例词。
14. 在 Candidate Pack、Knowledge Map Reader、Planner Materializer、State Machine、Evidence Gate 中写任何基于具体自然语言内容的判断。

## 允许代码做的事

代码只能做结构化、工程化、工具化工作：

1. 工具注册。
2. Tool Contract。
3. State Machine。
4. Action Runner。
5. Action Recovery。
6. 安全 handle 映射。
7. 文档树结构处理。
8. 父子、兄弟、祖先、后代关系处理。
9. 根据 AI 选择的 handle 展开结构范围。
10. 候选池管理。
11. 证据包管理。
12. 已读 / 未读状态。
13. 预算控制。
14. 权限与安全门禁。
15. trace / debug。
16. 把原始 query 传给 AI Planner 或 search_scope。
17. 按 AI Planner 明确选择的 handle、candidate index、tool action 执行工具。

## 文档要求

每次开发前必须优先阅读并遵守：

docs/notebrain/kb-agent-harness-v2/00-first-principles.md

如果该文档不存在，应先创建或恢复它。

其他 Harness v2 文档必须以此为最高原则：

- kb-agent-harness-v2-design.md
- kb-agent-harness-v2-tool-contract.md
- kb-agent-harness-v2-state-machine.md
- kb-agent-harness-v2-context-pack.md
- kb-agent-harness-v2-parity.md

## 实现原则

1. 这是新增的主页 AI 知识库组件模块，不需要旧版本兼容。
2. 以 KB Agent Harness v2 为准。
3. 旧逻辑如果违反第一铁律，可以直接删除。
4. 不要保留新旧两套并行逻辑。
5. 不要给旧链路打补丁。
6. 不要为了当前测试问题写专门规则。
7. 不要让代码代替 AI 判断文本含义。
8. 代码只负责让 AI 能看见结构、调用工具、读取证据、生成回答。

## 正确链路

全库问答应走通用 Agent Harness 流程：

1. list_knowledge_map 返回文档树结构和安全 handle。
2. AI Planner 根据结构树和用户问题理解应聚焦哪里。
3. AI Planner 调用 focus_doc_scope。
4. 代码根据 handle 展开父子 / 兄弟 / 后代结构。
5. Candidate Pack 只根据结构来源、已读状态、工具来源、AI 选择顺序、检索引擎结果组织候选。
6. read_docs / read_block_context 读取正文。
7. Evidence Pack 只包含已读取证据。
8. Compose 只能基于 Evidence Pack 回答。
9. Structure Pack 只能解释“为什么这些文档值得读取”，不能替代证据。

## 错误链路

以下做法必须拒绝或重构：

1. 代码根据 query 里的某个词判断哪个文档相关。
2. 代码根据 title 里的某个词给文档加分。
3. 代码根据某种语言的词表判断泛词。
4. 代码通过具体标题过滤候选。
5. 代码通过具体测试样例调整排序。
6. 代码新增固定词检测脚本来防止硬编码。
7. Candidate Pack 自己理解用户问题。
8. Knowledge Map Reader 自己理解标题语义。
9. Planner Materializer 自己根据自然语言重排候选。

## 修改前检查

每次改代码前，必须先问：

1. 这段逻辑是不是在理解自然语言？
2. 换一种语言后，这段逻辑是否仍成立？
3. 换一个用户知识库后，这段逻辑是否仍成立？
4. 这是不是某个测试样例的补丁？
5. 这是不是应该交给 AI Planner 或 search_scope 的事情？

只要任意答案显示它依赖具体文字、具体语言、具体标题或具体样例，就不能写进生产代码。

## 输出要求

修改代码时：

1. 使用 diff 模式。
2. 新建文件也使用 diff。
3. 删除违反第一铁律的旧逻辑。
4. 不新增 hardcoded 文本检测脚本。
5. 不改 src/components/tools/advanced.ts。
6. 不改会员 / VIP 激活逻辑。
7. 不引入 plugin.client。
8. 不动强化日记任务、记录、复盘写入逻辑。
9. 最后运行并修复：

npx tsc --noEmit
npm run build

## 最终验收

合格实现必须满足：

1. 生产代码不做自然语言理解。
2. 生产代码不做语言拆分。
3. 生产代码不做关键词提取。
4. 生产代码不做 title/query 语义打分。
5. 生产代码不写具体业务标题。
6. 生产代码不写具体测试问题。
7. AI Planner 负责理解用户问题。
8. search_scope 负责检索。
9. 代码负责结构、工具、状态、证据、预算和安全。
10. docs/notebrain/kb-agent-harness-v2/00-first-principles.md 保留并作为最高规则。