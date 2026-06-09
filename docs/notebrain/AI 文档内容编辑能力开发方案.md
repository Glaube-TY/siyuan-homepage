# AI 文档内容编辑能力开发方案

## 1. 阶段定位

本阶段只实现“文档内容编辑”能力，不做完整的工作空间管理，也不做数据库、笔记本、资源文件、附件、属性视图等能力。

这个能力可以理解为一个更细的内置 Skill / 能力域：

* 名称：文档内容编辑
* 能力域 ID：builtin_doc_content_editing
* 简称：Doc Content Editing
* 用户侧理解：让 AI 在用户确认后帮助新增、修改、删除、移动思源文档内容。

本阶段不是做一个通用的“思源操作 Agent”，而是只做文档和文档内部块的增删改查。

## 2. 范围边界

### 2.1 本阶段包含

本阶段只包含两类对象。

第一类是文档级操作：

1. 创建文档。
2. 重命名文档。
3. 删除文档。
4. 替换或更新某个文档的正文内容。
5. 打开或定位目标文档。

第二类是文档内容块操作：

1. 读取指定文档或块的块级内容。
2. 更新某个块内容。
3. 在某个块前插入内容。
4. 在某个块后插入内容。
5. 向某个文档或块追加子块。
6. 删除某个块。
7. 移动某个块。
8. 对修改生成 diff。
9. 用户确认后应用修改。
10. 修改后支持回退。

### 2.2 本阶段不包含

以下能力全部不进入本阶段：

1. 数据库 / 属性视图读写。
2. 笔记本创建、删除、移动、重命名。
3. 资源文件、附件、图片、PDF、音视频管理。
4. 工作空间配置。
5. 标签系统批量整理。
6. 引用关系全局重写。
7. 模板系统管理。
8. 索引、同步、备份、快照配置。
9. 整库批量替换。
10. 跨笔记本批量迁移。
11. 自动去重、自动归档、自动分类等高层业务流程。

这些能力未来可以拆成独立的 Skill / 能力域，例如：

* 数据库编辑
* 笔记本管理
* 资源文件管理
* 引用关系维护
* 文档归档整理

## 3. 架构原则

1. 代码只提供通用 Agent Workbench 能力，不承担业务决策。
2. Planner 是唯一业务决策者。
3. Tool 只校验参数、执行动作、返回 observation。
4. Skill 只说明能力边界和通用策略，不拥有工具，不绑定工具，不写固定流程。
5. 内置 Skill 开关是设置层面的能力可见性边界。
6. 关闭“文档内容编辑”后，本轮不注入该能力说明，也不注册该能力域下的内部工具。
7. 文档内容编辑工具不放入全局工具页。
8. 所有写操作必须先生成可确认的修改提案。
9. 没有用户确认，不写入本地文档。
10. 修改后必须有可回退记录。
11. 工具不能接受 AI 自己传入的 confirmed=true 作为确认。
12. 用户确认必须来自 UI 点击。

## 4. Skill 设计

### 4.1 设置页显示

在“技能”设置页新增内置能力：

名称：文档内容编辑

描述：

> 读取文档块内容，并在用户确认后新增、修改、删除或移动文档内容。

边界说明：

> 仅限文档和文档内块内容；不操作数据库、笔记本、资源文件或属性视图。写入前会生成修改方案，用户确认后才会应用。

### 4.2 Skill 开关行为

开启时：

1. 注入“文档内容编辑”能力说明。
2. 注册该能力域下的只读工具和提案工具。
3. 允许 UI 显示修改提案卡片。

关闭时：

1. 不注入文档内容编辑能力说明。
2. 不注册文档内容编辑工具。
3. 已存在的历史修改记录仍可查看，但不能继续通过 AI 生成新提案。

注意：

* 这不是 Skill 拥有 Tool。
* 这是 composition root 根据内置能力域开关统一控制工具可见性。
* 全局工具和已有知识库检索不受该开关影响。

## 5. 工具分层

本阶段建议只让 Planner 看到“只读工具”和“生成提案工具”。

真正写入文档的 apply 操作不进入 Planner tool manifest，而是由用户点击 UI 确认后调用本地 service。

### 5.1 Planner 可见工具

第一批 Planner 可见工具：

1. read_doc_blocks
2. propose_doc_content_edit

这两个工具都不直接写文档。

### 5.2 Planner 不可见能力

以下能力不进入 Planner 工具清单：

1. apply_doc_content_edit_proposal
2. rollback_doc_content_edit
3. cancel_doc_content_edit_proposal

这些由 UI 按钮触发，确保用户确认不能被 AI 参数伪造。

## 6. 工具一：read_doc_blocks

### 6.1 作用

按块读取文档内容，比当前 read_docs 更细。

read_docs 适合读取整篇正文，read_doc_blocks 适合定点阅读、局部编辑、修改前确认上下文。

### 6.2 输入

```ts
{
  targetId: string;
  scope: "self" | "children" | "siblings_window" | "document_top";
  before?: number;
  after?: number;
  maxBlocks?: number;
  maxChars?: number;
}
```

### 6.3 输出

```ts
{
  targetId: string;
  scope: string;
  items: Array<{
    id: string;
    rootId?: string;
    parentId?: string;
    previousId?: string;
    nextId?: string;
    type: string;
    subType?: string;
    markdown?: string;
    kramdown?: string;
    content?: string;
    index?: number;
  }>;
  truncated: boolean;
}
```

### 6.4 支持范围

1. self：读取单个块。
2. children：读取目标块的直接子块。
3. siblings_window：读取目标块前后邻近块。
4. document_top：读取文档顶层块。

### 6.5 边界

1. 必须使用真实 docId 或 blockId。
2. 不根据标题、路径或自然语言猜 ID。
3. 返回内容需要限长。
4. 只读，不修改文档。
5. 读取结果可以作为正文证据。
6. 不返回内部路径映射。

## 7. 工具二：propose_doc_content_edit

### 7.1 作用

生成一个文档内容修改提案，包括目标、修改类型、before、after、diff、风险等级和 proposalId。

它不写入文档。

### 7.2 支持操作

第一阶段支持这些 operation：

```ts
"create_doc"
"rename_doc"
"delete_doc"
"replace_doc_content"
"update_block"
"insert_before"
"insert_after"
"append_child"
"prepend_child"
"delete_block"
"move_block"
```

### 7.3 输入

```ts
{
  operation:
    | "create_doc"
    | "rename_doc"
    | "delete_doc"
    | "replace_doc_content"
    | "update_block"
    | "insert_before"
    | "insert_after"
    | "append_child"
    | "prepend_child"
    | "delete_block"
    | "move_block";

  docId?: string;
  notebookId?: string;
  docPath?: string;
  newTitle?: string;

  targetBlockId?: string;
  parentBlockId?: string;
  referenceBlockId?: string;

  markdown?: string;

  move?: {
    blockId: string;
    position: "top" | "bottom" | "before" | "after" | "append_child";
    targetId?: string;
    parentId?: string;
  };

  reason?: string;
}
```

### 7.4 输出

```ts
{
  proposalId: string;
  operation: string;
  riskLevel: "low" | "medium" | "high";
  target: {
    docId?: string;
    notebookId?: string;
    docPath?: string;
    blockId?: string;
    parentBlockId?: string;
    referenceBlockId?: string;
    title?: string;
  };
  before?: string;
  after?: string;
  diff?: string;
  summary: string;
  requiresConfirmation: true;
  warnings?: string[];
}
```

### 7.5 重要规则

1. 工具只生成提案。
2. 工具不调用 createDocWithMd、updateBlock、deleteBlock、removeDocByID、moveBlock 等写接口。
3. 工具必须读取目标当前内容并保存快照。
4. 工具必须生成 diff。
5. 工具必须返回 proposalId。
6. proposalId 由系统生成，不能由 AI 指定。
7. proposal 绑定当前会话。
8. proposal 设置过期时间，例如 30 分钟。
9. 应用前必须再次验证目标内容是否变化。
10. 目标内容变化时，应用必须失败并要求重新生成提案。

## 8. 风险等级

### 8.1 低风险

1. 更新单个普通段落块。
2. 在普通段落前后插入一个普通段落。
3. 向文档末尾追加普通段落。
4. 创建空文档或短内容文档。

### 8.2 中风险

1. 更新标题块。
2. 更新列表项。
3. 删除单个普通块。
4. 移动单个普通块。
5. 替换文档正文。
6. 重命名文档。

### 8.3 高风险

1. 删除文档。
2. 删除带子块的块。
3. 删除标题块。
4. 移动带子块的块。
5. 覆盖整篇长文档。
6. 创建大量内容文档。
7. 跨文档移动块。
8. 操作目标不明确。
9. 修改内容超过长度阈值。
10. 目标块当前快照与提案时不一致。

第一阶段高风险操作可以生成提案，但应用时必须二次确认。最初也可以先只允许生成，不允许应用高风险操作，等低中风险稳定后再打开。

## 9. 用户确认机制

### 9.1 错误方式

不要这样做：

```ts
{
  proposalId: "...",
  confirmed: true
}
```

因为 AI 可以自己生成 confirmed=true。

### 9.2 正确方式

1. AI 调用 propose_doc_content_edit。
2. 工具返回 proposalId 和 diff。
3. UI 显示“文档修改方案”卡片。
4. 用户点击“应用修改”。
5. UI 调用 apply service。
6. apply service 检查 proposal、权限、快照和风险等级。
7. 检查通过后调用思源写接口。
8. 写入成功后记录回退历史。
9. UI 显示“修改已应用”。

## 10. 修改提案卡片

卡片标题：

> 文档修改方案

卡片内容：

1. 操作类型。
2. 目标文档或块 ID。
3. 风险等级。
4. 修改摘要。
5. diff 预览。
6. 警告信息。

按钮：

1. 应用修改。
2. 取消。
3. 打开目标文档或块。
4. 复制 diff。

高风险卡片需要明显提示。

第一阶段可以先不做复杂 split diff，只做 unified diff。

## 11. 应用服务

### 11.1 服务名称

```ts
applyDocContentEditProposal(proposalId: string)
```

### 11.2 应用前检查

必须检查：

1. proposal 存在。
2. proposal 未过期。
3. proposal 属于当前会话。
4. 用户通过 UI 点击确认。
5. 目标文档或块仍存在。
6. 目标当前内容与 proposal 的 beforeSnapshot 一致。
7. 风险等级允许应用。
8. 操作类型在本阶段允许范围内。

### 11.3 执行映射

文档级：

1. create_doc：调用 createDocWithMd。
2. rename_doc：调用 renameDocByID。
3. delete_doc：调用 removeDocByID。
4. replace_doc_content：优先调用 updateBlock("markdown", content, docId)，如不稳定则后续再做专门实现。

块级：

1. update_block：调用 updateBlock("markdown", markdown, blockId)。
2. insert_before：调用 insertBlock("markdown", markdown, nextID)。
3. insert_after：调用 insertBlock("markdown", markdown, undefined, previousID) 或项目已有 wrapper 对应形式。
4. append_child：调用 appendBlock("markdown", markdown, parentID)。
5. prepend_child：调用 prependBlock("markdown", markdown, parentID)。
6. delete_block：调用 deleteBlock(blockId)。
7. move_block：调用 moveBlock(id, previousID?, parentID?)。

注意：

* moveBlock 的 previousID 只能是前一个块 ID。
* parentID 才是父级块或文档 ID。
* 不要把 docId 传给 previousID。

## 12. 回退机制

### 12.1 目标

每次应用成功后，都生成一条可回退记录。

### 12.2 历史记录结构

```ts
{
  id: string;
  proposalId: string;
  conversationId: string;
  appliedAt: number;
  operation: string;
  riskLevel: "low" | "medium" | "high";
  targetIds: string[];

  before: {
    docId?: string;
    blockId?: string;
    markdown?: string;
    kramdown?: string;
    parentId?: string;
    previousId?: string;
    nextId?: string;
    rootId?: string;
    title?: string;
    docPath?: string;
  };

  after: {
    docId?: string;
    blockId?: string;
    markdown?: string;
    insertedBlockIds?: string[];
    title?: string;
    docPath?: string;
  };

  rollbackState: "available" | "rolled_back" | "unavailable";
}
```

### 12.3 回退策略

1. create_doc：删除新建文档。
2. rename_doc：改回旧标题。
3. delete_doc：第一阶段不建议直接支持完整恢复；如果要做，删除前必须保存完整 Markdown，并通过 createDocWithMd 重建。
4. replace_doc_content：恢复旧 Markdown。
5. update_block：恢复旧 Markdown。
6. insert_block：删除插入块。
7. delete_block：在原位置重新插入旧 Markdown。
8. move_block：移动回原 parent/previous 位置。

如果原位置不存在、目标已变化或风险过高，返回 rollback_unavailable，不强行写。

## 13. 数据存储

### 13.1 Pending proposal

存储在插件配置或本地插件存储，不写入思源文档。

建议 key：

```txt
notebrain.docContentEdit.pendingProposals
```

保留字段：

1. proposalId。
2. conversationId。
3. createdAt。
4. expiresAt。
5. operation。
6. target。
7. beforeSnapshot。
8. afterSnapshot。
9. diff。
10. riskLevel。
11. status。

### 13.2 Applied history

建议 key：

```txt
notebrain.docContentEdit.appliedHistory
```

保留最近 50 条。

### 13.3 不写入用户文档的内容

以下内容不能写进用户笔记：

1. proposal JSON。
2. diff 元数据。
3. 工具 observation。
4. Planner 过程。
5. 回退历史。

## 14. 文件结构建议

新增目录：

```txt
src/features/kb/services/doc-content-edit/
  doc-content-edit-types.ts
  doc-content-edit-risk.ts
  doc-content-edit-diff.ts
  doc-content-edit-proposal-store.ts
  doc-content-edit-history-store.ts
  doc-content-edit-read-service.ts
  doc-content-edit-proposal-service.ts
  doc-content-edit-apply-service.ts
  doc-content-edit-rollback-service.ts

src/features/kb/services/agent-workbench/tools/siyuan-doc-content-edit/
  contracts/read-doc-blocks.contract.ts
  contracts/propose-doc-content-edit.contract.ts
  read-doc-blocks.tool.ts
  propose-doc-content-edit.tool.ts
  impl/read-doc-blocks.impl.ts
  impl/propose-doc-content-edit.impl.ts

src/features/kb/services/agent-workbench/skills/builtin/
  doc-content-editing.skill.ts
```

如果第一阶段文件太多，可以先合并少量 service，但不要把 UI、Tool、API wrapper、风险判断、proposal store 全塞进一个文件。

## 15. API wrapper 要求

所有思源 API 调用必须通过 `src/api.ts` wrapper。

现有可复用：

1. getBlockKramdown
2. getChildBlocks
3. insertBlock
4. prependBlock
5. appendBlock
6. updateBlock
7. deleteBlock
8. moveBlock
9. sql
10. createDocWithMd

需要确认或补齐：

1. renameDocByID
2. removeDocByID
3. getDoc
4. listDocsByPath
5. getHPathByID 或等价方法

本阶段不要接入：

1. 数据库接口。
2. 笔记本接口。
3. 资源文件接口。
4. 同步接口。
5. 索引接口。
6. 资源上传接口。
7. 工作空间配置接口。

## 16. Prompt 约束

### 16.1 Planner prompt

增加通用约束：

1. 文档内容编辑需要真实 docId 或 blockId。
2. 不要编造 ID。
3. 修改前应生成文档修改提案。
4. 提案不等于已修改。
5. 只有用户确认并应用成功后，才能说已修改。
6. 如果只是读取或生成提案，必须如实说明。
7. 如果目标不明确，应请求用户提供文档或块，或先通过已有检索能力找候选。
8. 如果工具失败，应如实说明失败原因。
9. 不要声称修改了数据库、笔记本或资源文件，因为本能力不支持这些范围。

### 16.2 Final composer

增加通用约束：

1. 如果本轮只有 proposal，没有 apply 成功，不要说“已修改”。
2. 如果 proposal 正在等待确认，要说“已生成修改方案，等待确认”。
3. 如果用户确认并应用成功，才能说“修改已完成”。
4. 如果应用失败，要说明失败。
5. 不要把未执行的方案描述成已完成结果。

## 17. UI 入口

### 17.1 Skill 设置

在技能设置页新增“文档内容编辑”。

开关关闭时：

* 不注入说明。
* 不注册 read_doc_blocks / propose_doc_content_edit。
* 已有历史提案卡片不自动删除。

### 17.2 消息中的提案卡片

当 propose_doc_content_edit 返回 proposal 后，在 assistant 回答区域展示提案卡片。

卡片应该显示：

1. 修改类型。
2. 目标文档或块。
3. 风险等级。
4. 摘要。
5. diff。
6. 等待确认状态。

按钮：

1. 应用修改。
2. 取消。
3. 打开目标。
4. 复制 diff。

应用成功后显示：

1. 已应用。
2. 回退本次修改。

## 18. 开发阶段

### 阶段 0：方案落地与边界确认

完成度目标：10%

任务：

1. 确认第一原则。
2. 确认本阶段只做文档内容编辑。
3. 确认不做数据库、笔记本、资源文件。
4. 确认不照抄外部项目代码。
5. 检查现有工具注册和 Skill 开关体系。

验收：

* 开发文档更新。
* 能力边界明确。

### 阶段 1：内置 Skill 开关

完成度目标：20%

任务：

1. 新增 doc-content-editing.skill.ts。
2. skill-catalog 增加“文档内容编辑”。
3. 设置页能开启/关闭。
4. 关闭后不注册本能力工具。

验收：

* 技能页可见开关。
* 开启/关闭能影响 Tool manifest。

### 阶段 2：read_doc_blocks

完成度目标：35%

任务：

1. 新增 read_doc_blocks 工具。
2. 支持 self / children / siblings_window / document_top。
3. 返回块 ID、类型、内容、顺序信息。
4. 限制 maxBlocks 和 maxChars。

验收：

* 可以读取文档顶层块。
* 可以读取某块附近上下文。
* 不会过量注入上下文。

### 阶段 3：proposal store 与 diff

完成度目标：50%

任务：

1. 新增 proposal 类型。
2. 新增 proposal store。
3. 新增简单 unified diff。
4. 新增风险等级判断。
5. 新增过期机制。

验收：

* 可以生成 proposalId。
* 可以保存 before/after/diff。
* 可以区分低中高风险。

### 阶段 4：propose_doc_content_edit

完成度目标：65%

任务：

1. 新增工具契约。
2. 支持文档级 create/rename/delete/replace。
3. 支持块级 update/insert/delete/move。
4. 只生成提案，不写文档。
5. 处理过程显示“已生成文档修改方案”。

验收：

* 文档不会被直接修改。
* 能看到 proposalId 和 diff。
* 高风险操作有警告。

### 阶段 5：确认卡片与 apply service

完成度目标：80%

任务：

1. 在消息中显示提案卡片。
2. 实现应用按钮。
3. 实现 applyDocContentEditProposal。
4. 应用前验证目标快照。
5. 应用成功后记录 history。

验收：

* 用户不确认就不会写入。
* 用户确认后正确写入。
* 目标内容变化时应用失败。

### 阶段 6：回退能力

完成度目标：90%

任务：

1. 实现回退历史。
2. 实现 rollback service。
3. 应用成功后显示回退按钮。
4. 支持 update/insert/delete/move 的基础回退。
5. 对文档删除回退先保持谨慎，必要时仅提示不可自动回退。

验收：

* 常规块级修改可回退。
* 回退失败时不伪装成功。

### 阶段 7：收口

完成度目标：100%

任务：

1. 检查工具 description/boundary。
2. 检查 Skill 文案。
3. 检查 Planner 和 Final composer 诚实约束。
4. 检查关闭 Skill 后工具不可见。
5. 运行：

   * npx tsc --noEmit
   * npm run build

验收：

* 不破坏知识库问答。
* 不破坏全局记忆。
* 不破坏快捷提示语。
* 不破坏联网搜索。
* 所有写操作都需要用户确认。

## 19. 第一阶段不变量

1. 本阶段只操作文档和文档内块内容。
2. 不操作数据库。
3. 不操作笔记本。
4. 不操作资源文件。
5. 不操作附件。
6. 不操作属性视图。
7. 没有用户确认，不写文档。
8. 没有真实 ID，不生成写入提案。
9. 提案不等于修改。
10. 读取不等于修改。
11. 应用失败不等于修改。
12. 回退失败不能说成功。
13. Tool 不串流程。
14. Skill 不绑定工具。
15. Planner 才决定是否使用能力。
16. Composer 只能根据真实工具结果描述状态。

## 20. 后续拆分方向

本阶段稳定后，再做新的独立 Skill：

1. 数据库编辑 Skill。
2. 笔记本管理 Skill。
3. 资源文件管理 Skill。
4. 附件处理 Skill。
5. 引用关系维护 Skill。
6. 文档归档整理 Skill。
7. 工作空间维护 Skill。

这些不要提前混入“文档内容编辑”。
