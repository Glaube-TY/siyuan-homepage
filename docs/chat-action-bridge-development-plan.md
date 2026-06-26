# 机器助手 Chat Action Bridge 开发方案

## 1. 功能定位

「机器助手」是 siyuan-homepage 插件的外部聊天入口，用于把飞书机器人收到的用户消息转换为插件内部可控动作，例如快速笔记、创建今日任务、查看今日任务等。

它不是外联通知桥。

* 外联通知桥：插件主动向外发送通知。
* 机器助手：外部聊天消息进入插件，并由插件执行动作。

用户可见名称建议：

* 主名称：机器助手
* 设置页名称：机器助手
* 飞书配置区名称：飞书聊天助手
* 内部模块名：chat-action-bridge

不要叫“消息速记”，因为本功能不只是记录消息，还会触发任务、查询、后续笔记操作等动作。

## 2. 第一版目标

第一版只实现飞书应用机器人，不实现 QQ。

最终效果：

1. 用户在手机飞书里给机器人发普通消息。
2. 如果消息不是特定命令，默认写入快速笔记。
3. 如果用户发送“菜单”“操作”“帮助”等命令，机器人返回可执行菜单。
4. 如果用户发送“操作 具体内容”，机器人返回针对该内容的操作列表：

   * 0. 不执行操作
   * 1. 记录快速笔记
   * 2. 创建今日任务
   * 3. 查看今日任务
   * 4. 查看逾期任务
5. 用户回复数字后，插件执行对应动作，并让飞书机器人回复执行结果。
6. 所有写入都复用插件已有快速笔记、强化日记任务能力，不重复造轮子。

第一版不做：

1. QQ 机器人。
2. 图片、语音、文件识别。
3. 离线暂存。思源关闭或插件未运行时不接收消息。
4. AI 自动理解意图。
5. 删除笔记、批量改文档、大范围编辑等高风险操作。
6. 任意文档查询。
7. 通过机器人直接暴露 Notebrain Agent 工具。
8. 通过机器人执行 MCP、本地命令、文件读写等高风险能力。
9. 复用外联通知桥的飞书自定义机器人 Webhook。
10. 恢复已经删除的全局“测试通知”区域。

## 3. 第一铁律边界

必须遵守：

1. 不破坏用户原有环境。
2. 不污染思源全局样式。
3. 不改无关功能。
4. 不破坏旧用户本地数据。
5. 所有外部写入默认关闭。
6. 用户不开启机器助手时，不建立飞书连接，不监听消息，不写入内容。
7. 非会员或高级功能不可用时，不启动机器助手。
8. 任何外部消息写入思源前都必须经过来源校验。
9. 不允许任何陌生飞书用户向用户思源写内容。
10. 不允许机器人返回本地路径、密钥、完整配置、完整错误堆栈。
11. 不新增 console.debug / console.log。
12. 如确实需要调试，走项目已有安全 debug 通道，并脱敏 App Secret、token、Webhook、用户消息全文。

## 4. 与现有代码的关系

当前快速笔记写入逻辑主要在：

* src/components/utils/widgetBlock/widget/quickNotes/quickNotesDialog.svelte

其中包含：

* quickNotesPosition
* quickNotesTimestampEnabled
* quickNotesAddPosition
* getChildBlocks
* insertBlock
* appendBlock

第一步必须把快速笔记写入能力抽成服务，避免机器助手直接引用 Svelte 弹窗组件逻辑。

当前任务创建 / 查询能力已有可复用基础：

* src/components/utils/widgetBlock/widget/tasksPlus/tasksPlusParser.ts
* src/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryActions.ts
* src/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceTaskService.ts
* src/features/kb/services/agent-workbench/tools/siyuan/impl/manage-diary-task.impl.ts
* src/features/kb/services/agent-workbench/tools/siyuan/impl/query-tasks.impl.ts

机器助手不要直接调用 Agent Tool，也不要伪造模型工具调用。应抽取或复用底层服务，例如：

* 创建今日任务：复用 getOrCreateTodayDiaryDocument + addNewTaskToDiary。
* 查看今日任务：复用 queryWorkspaceTasks 或抽取 queryTodayTasksForExternalAction。
* 格式化任务：返回简洁列表，不发送完整日记正文。

## 5. 新增模块结构

建议新增目录：

src/features/chat-action-bridge/

建议文件：

* types.ts
* constants.ts
* chat-action-settings-store.ts
* chat-action-secret-store.ts
* chat-action-history-store.ts
* chat-action-session-store.ts
* chat-action-redact.ts
* chat-action-router.ts
* chat-action-menu.ts
* chat-action-render.ts
* chat-action-service.ts
* chat-action-scheduler.ts
* quick-note-action-service.ts
* diary-task-action-service.ts
* feishu/feishu-client.ts
* feishu/feishu-event-client.ts
* feishu/feishu-message-normalizer.ts
* index.ts

不要把这些逻辑塞进：

* notify-bridge-service.ts
* quickNotesDialog.svelte
* enhancedDiary 组件 UI
* Agent 工具 runtime
* MCP 模块

## 6. 设置结构

新增 ChatActionBridgeSettings：

```ts
export interface ChatActionBridgeSettings {
  version: 1;
  enabled: boolean;
  provider: "feishu";
  defaultMode: "quick_note" | "menu";
  requireCommandPrefix: boolean;
  commandPrefixes: string[];
  maxMessageLength: number;
  sessionTtlMs: number;
  replyAfterAction: boolean;
  keepHistoryLimit: number;
  feishu: FeishuChatActionSettings;
  actions: ChatActionEnabledActions;
}

export interface FeishuChatActionSettings {
  enabled: boolean;
  appId: string;
  encryptedAppSecret: string;
  allowedOpenIds: string[];
  allowedUserIds: string[];
  allowedChatIds: string[];
  allowPrivateChat: boolean;
  allowGroupChat: boolean;
  requireMentionInGroup: boolean;
}

export interface ChatActionEnabledActions {
  quickNote: boolean;
  createTodayTask: boolean;
  viewTodayTasks: boolean;
  viewOverdueTasks: boolean;
}
```

默认值：

```ts
{
  version: 1,
  enabled: false,
  provider: "feishu",
  defaultMode: "quick_note",
  requireCommandPrefix: false,
  commandPrefixes: ["菜单", "操作", "帮助", "#menu", "#action", "#note"],
  maxMessageLength: 2000,
  sessionTtlMs: 10 * 60 * 1000,
  replyAfterAction: true,
  keepHistoryLimit: 200,
  feishu: {
    enabled: false,
    appId: "",
    encryptedAppSecret: "",
    allowedOpenIds: [],
    allowedUserIds: [],
    allowedChatIds: [],
    allowPrivateChat: true,
    allowGroupChat: false,
    requireMentionInGroup: true
  },
  actions: {
    quickNote: true,
    createTodayTask: true,
    viewTodayTasks: true,
    viewOverdueTasks: true
  }
}
```

敏感字段必须加密保存：

* feishu.appSecret

UI 中不显示明文 secret。留空表示不修改，用户明确点击“清除密钥”才删除。

## 7. 飞书接入方式

第一版使用飞书企业自建应用机器人，不使用飞书自定义机器人 Webhook。

原因：

1. 自定义机器人主要用于推送消息，不能满足聊天接收和菜单交互。
2. 应用机器人可以订阅接收消息事件。
3. 长连接模式不需要公网 IP，不需要内网穿透，适合本地思源插件运行时接收消息。
4. 思源关闭或插件未运行时不会接收消息，这是第一版明确限制。

飞书配置要求在设置页提示用户：

1. 创建飞书开放平台企业自建应用。
2. 启用机器人能力。
3. 配置事件订阅方式为长连接。
4. 订阅接收消息事件。
5. 开通发送消息能力。
6. 获取 App ID 和 App Secret。
7. 在机器助手设置中填写 App ID 和 App Secret。
8. 添加允许的用户 open_id / user_id 或允许的 chat_id。
9. 开启机器助手。

实现建议：

* 优先使用官方 Node SDK 的长连接能力。
* 新增依赖时注意构建体积和 Vite 打包兼容。
* 如果 SDK 在当前插件运行环境中无法启动，要在设置页显示明确错误，不要导致整个插件崩溃。
* 飞书连接启动失败只影响机器助手，不影响主页、通知桥、任务通知、倒数日通知、强化日记通知。

## 8. 快速笔记写入服务

新增：

src/features/chat-action-bridge/quick-note-action-service.ts

提供接口：

```ts
export interface ExternalQuickNoteInput {
  content: string;
  source: "feishu";
  senderId?: string;
  senderName?: string;
  chatId?: string;
  messageId?: string;
  receivedAt?: string;
}

export interface ExternalQuickNoteResult {
  ok: boolean;
  changed: boolean;
  blockId?: string;
  message: string;
  errorCode?: string;
}

export async function addExternalQuickNote(input: ExternalQuickNoteInput): Promise<ExternalQuickNoteResult>
```

要求：

1. 读取主页设置中的快速笔记配置。
2. 如果 quickNotesPosition 为空，返回错误，不写入。
3. 如果 content 为空，返回错误，不写入。
4. 如果 quickNotesTimestampEnabled=true，则沿用当前格式追加时间戳。
5. quickNotesAddPosition=bottom 时使用 appendBlock。
6. quickNotesAddPosition=top 时先 getChildBlocks。
7. 如果文档没有子块，top 模式 fallback 到 appendBlock，不能访问 docChildren[0].id 导致异常。
8. 不在这里 showMessage。
9. 返回结构化结果，由飞书回复层决定如何回复用户。
10. 不记录完整消息到 console。

## 9. 任务动作服务

新增：

src/features/chat-action-bridge/diary-task-action-service.ts

提供接口：

```ts
export async function createTodayTaskFromExternal(input: {
  content: string;
  source: "feishu";
  senderId?: string;
  messageId?: string;
}): Promise<ChatActionResult>

export async function queryTodayTasksForExternal(input: {
  limit?: number;
}): Promise<ChatActionResult>

export async function queryOverdueTasksForExternal(input: {
  limit?: number;
}): Promise<ChatActionResult>
```

创建今日任务要求：

1. 使用强化日记配置。
2. 获取或创建今日日记。
3. 写入“新任务”区域。
4. 第一版不做复杂自然语言解析。
5. 用户传入的内容直接作为任务名。
6. 如果用户已经写了任务管理 Plus 语法，如 `买耗材 📅2026-06-30 ❗❗`，尽量保留。
7. 不自动猜日期、优先级、提醒时间。
8. 不调用 AI。

查看任务要求：

1. 查询今日任务或逾期任务。
2. 最多返回设置中的 limit，默认 10。
3. 只返回任务名、日期、优先级、完成状态。
4. 不返回完整日记正文。
5. 如果没有任务，返回“暂无今日任务”或“暂无逾期任务”。

## 10. 消息处理流程

收到飞书消息后流程：

```text
飞书事件
  ↓
normalizeFeishuMessage
  ↓
安全校验
  ↓
消息去重
  ↓
判断是否已有 pending session
  ↓
如果是数字回复：执行 pending action
  ↓
否则解析命令
  ↓
普通消息默认写入快速笔记
  ↓
回复执行结果
```

### 10.1 只处理文本消息

第一版只处理 text 消息。

忽略：

* 图片
* 语音
* 文件
* 表情
* 卡片
* 富文本
* 机器人自己发出的消息
* 空消息
* 超过 maxMessageLength 的消息

对于不支持的消息类型，允许回复：

```text
当前只支持文本消息。
```

也可以静默忽略，推荐设置项控制，第一版可默认回复简短提示。

### 10.2 安全校验

必须通过以下校验才处理：

1. 机器助手总开关 enabled=true。
2. 飞书接入 feishu.enabled=true。
3. 高级功能可用。
4. appId 和 appSecret 已配置。
5. 消息来自允许的 open_id / user_id，或者来自允许的 chat_id。
6. 私聊 / 群聊符合设置。
7. 群聊中如果 requireMentionInGroup=true，必须 @ 机器人或使用命令前缀。
8. 消息长度不超过 maxMessageLength。

校验失败：

* 不写入思源。
* 不泄露原因给陌生用户。
* 可以静默忽略。
* 设置页最近状态中显示“已拒绝未授权消息”，但不要显示完整消息内容。

## 11. 菜单与会话

新增 session store：

src/features/chat-action-bridge/chat-action-session-store.ts

Pending session 类型：

```ts
export interface ChatActionPendingSession {
  id: string;
  provider: "feishu";
  chatId: string;
  senderId: string;
  messageId: string;
  content: string;
  menuType: "content_actions" | "main_menu";
  actions: ChatActionMenuItem[];
  createdAt: number;
  expiresAt: number;
}
```

会话 key：

```text
provider:chatId:senderId
```

同一个用户在同一个会话里只能有一个 pending session。新的操作菜单覆盖旧菜单。

会话 TTL 默认 10 分钟。过期后用户回复数字，应提示：

```text
这个操作菜单已过期，请重新发送“操作 内容”。
```

### 11.1 普通消息模式

默认设置 defaultMode=quick_note。

当用户发送普通文本，例如：

```text
明天问厂家确认验收材料
```

如果不匹配任何命令，则直接写入快速笔记，并回复：

```text
已记录到快速笔记。
回复“操作 明天问厂家确认验收材料”可选择创建任务等操作。
```

### 11.2 操作菜单模式

当用户发送：

```text
操作 明天问厂家确认验收材料
```

机器人回复：

```text
请选择要执行的操作：

0. 不执行操作
1. 记录快速笔记
2. 创建今日任务
3. 查看今日任务
4. 查看逾期任务

请直接回复数字。
```

用户回复 `2` 后：

1. 创建今日任务。
2. 清除 pending session。
3. 回复：

```text
已创建今日任务：明天问厂家确认验收材料
```

### 11.3 主菜单

当用户发送：

```text
菜单
```

或：

```text
帮助
```

机器人回复：

```text
机器助手可用操作：

1. 记录快速笔记：直接发送文字即可
2. 对一段内容选择操作：发送「操作 内容」
3. 查看今日任务：发送「今日任务」
4. 查看逾期任务：发送「逾期任务」

示例：
操作 明天联系厂家确认验收材料
```

### 11.4 直接命令

第一版支持这些直接命令：

```text
菜单
帮助
今日任务
查看今日任务
逾期任务
查看逾期任务
操作 <内容>
#action <内容>
#note <内容>
```

处理规则：

* `#note 内容`：直接记录快速笔记。
* `操作 内容`：弹出操作菜单。
* `今日任务`：直接返回今日任务列表。
* `逾期任务`：直接返回逾期任务列表。
* 普通文本：默认快速笔记。

## 12. 菜单动作定义

第一版菜单动作：

```ts
type ChatActionType =
  | "cancel"
  | "quick_note"
  | "create_today_task"
  | "view_today_tasks"
  | "view_overdue_tasks";
```

菜单项：

```ts
interface ChatActionMenuItem {
  index: number;
  type: ChatActionType;
  label: string;
  requiresContent: boolean;
  readOnly: boolean;
}
```

动作边界：

1. cancel 不写入。
2. quick_note 写入快速笔记。
3. create_today_task 写入今日日记任务区。
4. view_today_tasks 只读。
5. view_overdue_tasks 只读。

不提供删除、修改、移动、批量操作。

## 13. 飞书回复格式

第一版只发送文本消息，不做卡片。

原因：

1. 文本最稳定。
2. 手机端兼容好。
3. 数字回复流程简单。
4. 后续可升级为交互卡片，但第一版不做。

回复内容要简洁，不暴露内部错误堆栈。

成功示例：

```text
已记录到快速笔记。
```

```text
已创建今日任务：明天问厂家确认验收材料
```

查询示例：

```text
今日任务（3 条）：
1. 确认验收材料 ❗❗ 📅2026-06-27
2. 整理光刻机测试计划
3. 联系厂家补充报告
```

失败示例：

```text
写入失败：快速笔记目标文档未配置，请先在插件设置中配置快速笔记位置。
```

## 14. 最近处理记录

新增 history store：

src/features/chat-action-bridge/chat-action-history-store.ts

记录最近 keepHistoryLimit 条处理记录。

记录字段：

```ts
interface ChatActionHistoryItem {
  id: string;
  provider: "feishu";
  direction: "in" | "out";
  action?: ChatActionType;
  status: "received" | "ignored" | "rejected" | "executed" | "failed";
  senderIdMasked: string;
  chatIdMasked: string;
  messageId?: string;
  contentPreview?: string;
  resultSummary?: string;
  createdAt: number;
}
```

要求：

1. contentPreview 最多 80 字。
2. 不保存完整消息正文，或提供设置项让用户选择是否保存完整正文；第一版默认不保存完整正文。
3. senderId/chatId 脱敏。
4. 不保存 App Secret。
5. history 只用于设置页查看最近状态和排查问题。

## 15. 消息去重

飞书消息事件可能重复投递，必须去重。

新增 processed message store：

* 可与 history store 合并。
* messageId 作为去重 key。
* 已处理 messageId 在一定时间内不重复执行。
* 只要消息已经进入写入动作，就记录 messageId。
* 写入失败也记录，避免重复风暴；但可以允许用户重新发送同一内容。

去重 key：

```text
feishu:message:<messageId>
```

## 16. 设置页 UI

新增设置页标签：

```text
机器助手
```

或者在主页设置中新增二级区域。

设置页内容：

### 16.1 总开关

* 启用机器助手
* 当前状态：

  * 未启用
  * 未配置 App ID
  * 未配置 App Secret
  * 未授权用户
  * 正在连接飞书
  * 已连接
  * 连接失败
  * 已停止

### 16.2 飞书应用机器人

字段：

* App ID
* App Secret
* 清除密钥
* 测试连接
* 启动 / 停止连接
* 当前连接状态

App Secret 输入框：

* 不显示旧值。
* 留空表示不修改。
* 明确点击保存才更新。
* 明确点击清除才删除。

### 16.3 安全白名单

字段：

* 允许的 open_id，每行一个。
* 允许的 user_id，每行一个。
* 允许的 chat_id，每行一个。
* 允许私聊。
* 允许群聊。
* 群聊中必须 @ 机器人或使用命令前缀。

第一版不做自动获取用户 open_id。可以在最近处理记录里显示脱敏 ID，并提供“复制原始 ID”按钮时要谨慎。更安全的做法是检测到未授权用户时，在设置页显示一条脱敏记录，用户需要手动从飞书事件或调试信息中配置。

### 16.4 默认行为

字段：

* 普通消息默认处理：

  * 直接记录快速笔记
  * 只返回菜单，不自动写入
* 命令前缀：

  * 菜单
  * 操作
  * 帮助
  * #action
  * #note
* 最大消息长度。
* 菜单有效期。
* 操作成功后回复确认。

### 16.5 动作开关

字段：

* 允许记录快速笔记。
* 允许创建今日任务。
* 允许查看今日任务。
* 允许查看逾期任务。

关闭某个动作后，菜单中不显示该动作，直接命令也不可用。

### 16.6 最近处理记录

显示最近处理记录：

* 时间
* 来源
* 状态
* 动作
* 内容预览
* 结果摘要

不要显示完整正文和密钥。

样式要求：

* 样式限定在机器助手设置页容器内。
* 不污染 `.b3-button`、`.b3-text-field`、全局 `select/input/body/:root`。
* 可复用主题变量，但必须有 fallback。

## 17. 生命周期

在 src/index.ts 中接入：

初始化：

```ts
setChatActionBridgePlugin(this)
loadChatActionBridgeSettings()
startChatActionBridgeIfNeeded()
```

销毁：

```ts
destroyChatActionBridge()
```

监听事件：

* homepage-advanced-ready
* homepage-advanced-unavailable
* chat-action-bridge-settings-changed

启动条件：

1. 高级功能可用。
2. chatActionSettings.enabled=true。
3. feishu.enabled=true。
4. appId 存在。
5. appSecret 能解密。
6. 至少配置了 allowedOpenIds / allowedUserIds / allowedChatIds 中的一项。
7. 当前没有已启动连接。

停止条件：

1. 插件卸载。
2. 设置关闭。
3. 高级功能不可用。
4. appId/appSecret 被清空。
5. 飞书接入关闭。

重复启动必须幂等。不能启动多个长连接。

## 18. 错误处理

常见错误：

* missing_app_id
* missing_app_secret
* secret_decrypt_failed
* feishu_connect_failed
* feishu_send_failed
* unauthorized_sender
* unsupported_message_type
* duplicate_message
* quick_note_target_missing
* quick_note_write_failed
* task_create_failed
* task_query_failed
* menu_expired
* invalid_menu_choice

错误不能导致整个插件崩溃。

飞书连接失败时：

1. 设置页显示失败状态。
2. 不影响主页其他功能。
3. 不影响外联通知桥。
4. 可以提供“重试连接”按钮。
5. 自动重连可做轻量指数退避，但第一版不要复杂化；可每 60 秒尝试一次，用户关闭后停止。

## 19. 安全要求

必须实现：

1. 默认关闭。
2. 高级功能门控。
3. App Secret 加密保存。
4. 用户 / 群白名单。
5. 消息长度限制。
6. 消息去重。
7. 会话过期。
8. 不支持高风险动作。
9. 不发送完整日记正文。
10. 不暴露本地路径。
11. 不暴露栈信息。
12. 不把陌生人消息写入思源。
13. 不允许群聊中无 @ 或无前缀时误触发。
14. 不将飞书消息当作 Agent 提示词执行。
15. 不调用 MCP、本地命令、文件系统工具。

## 20. 第一版验收标准

构建验证：

```bash
pnpm build
pnpm exec tsc --noEmit
```

如果项目有 lint：

```bash
pnpm lint
```

功能验收：

1. 未开启机器助手时，不连接飞书。
2. 未配置 App ID / App Secret 时，不连接飞书。
3. 未配置白名单时，不处理任何消息。
4. 配置正确后，连接状态显示已连接。
5. 授权用户发送普通文本，默认写入快速笔记。
6. 写入快速笔记后，机器人回复“已记录到快速笔记”。
7. 快速笔记 top 模式且目标文档为空时，不崩溃，fallback 到 appendBlock。
8. 用户发送“操作 xxx”，机器人返回数字菜单。
9. 用户回复 0，不执行操作。
10. 用户回复 1，记录快速笔记。
11. 用户回复 2，创建今日任务。
12. 用户发送“今日任务”，机器人返回今日任务列表。
13. 用户发送“逾期任务”，机器人返回逾期任务列表。
14. 今日任务 / 逾期任务只返回摘要，不返回完整日记正文。
15. 非授权用户消息不写入思源。
16. 重复投递的同一 messageId 不重复写入。
17. 菜单过期后回复数字，不执行旧操作。
18. 群聊中 requireMentionInGroup=true 时，没有 @ 或命令前缀不触发。
19. 关闭机器助手后，长连接停止。
20. 会员过期或高级功能不可用时，长连接停止，消息不处理。
21. 外联通知桥、任务通知、倒数日通知、强化日记通知不受影响。
22. 已删除的全局“测试通知”区域没有恢复。

## 21. 后续版本方向

第一版完成后，后续再考虑：

1. QQ 官方机器人。
2. 云端中转服务，实现电脑不在线也能暂存。
3. 飞书交互卡片，点击按钮执行，不需要回复数字。
4. 图片 / 语音 / 文件转笔记。
5. AI 意图识别。
6. 写入强化日记记录区。
7. 指定文档追加。
8. 创建带日期、优先级、提醒的任务。
9. 查询更多笔记内容。
10. 通过机器人管理任务完成、推迟、迁移。

这些都不属于第一版，不要在本次开发中实现。
