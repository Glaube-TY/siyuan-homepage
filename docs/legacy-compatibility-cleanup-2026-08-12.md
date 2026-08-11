# 大版本旧兼容清理说明

日期：2026-08-12

## 结论

本次按“大版本不兼容旧数据”的发布边界，删除了会扫描、转换或回填旧数据结构的执行器，以及已经确认没有现行调用方的接口别名。当前持久化协议、数据完整性保护、外部平台差异适配和仍在使用的安全存储格式继续保留。

升级后不会自动扫描、迁移或删除旧文件。旧文件可以继续留在磁盘中，但新版不再读取；这避免了清理过程误删用户数据。需要继续使用的内容应在旧版本中先导出，再按新版当前格式重新配置或导入。

## 已删除的高影响数据兼容

### 主页设备视图

- 删除旧根目录布局、主页设置和组件配置向设备视图目录的迁移器。
- 删除 `legacy-root`、`recovered-target` 对应的迁移执行器；清单中已经存在的同名来源值继续作为只读溯源元信息接受，避免把当前设备视图误判为损坏。
- `unresolvedLegacyWidgetIds` 作为已生成清单的只读完整性状态继续接受：运行时跳过明确缺失的组件配置并标记 degraded，避免拖垮整个 surface；它不再触发启动迁移。
- 删除 unresolved 组件的 Agent 清理工具和 manifest 回写接口，保留当前设备视图所需的只读降级恢复。
- 设备描述只接受 `physicalDeviceId`，不再接受旧 `deviceId` 字段。
- 当前目录完全为空时才创建当前格式空视图；文件部分存在、格式错误或版本不匹配时仍阻断写入，防止覆盖未知数据。

### 共享组件与组件数据

- 删除共享组件旧数据库、旧 AttributeView、旧根文件和启动时自动迁移。
- 删除 focus、CYBMOK、倒计时、固定资产、复习文档等组件的旧数据转换分支。
- 删除收藏文档旧 `custom-homepage-favorites` 属性扫描与迁移。
- 删除复习文档旧 `custom-homepage-review-*` 属性扫描与迁移。
- 收藏、复习、任务、热力图、统计卡片和强化日记只维护当前本地索引；设置页只提供当前索引的刷新或重建。
- 强化日记只通过思源官方 `custom-dailynote-YYYYMMDD` 属性识别日记，不再通过标题或路径猜测旧日记。
- 删除强化日记旧完成标记、旧空日记特判和旧版本项目移动中断属性修复。
- 删除倒计时事件输入中的 `anniversary` 布尔别名，仅接受当前 `kind`。

### 通知、机器人与会员

- 删除通知中心旧通知桥接、外部通知历史合并和迁移状态字段。
- 删除机器人旧会话索引迁移、可视消息回填 AgentMessage、旧明文凭据和旧设置版本转换。
- 删除会员 AES V1 激活码的密钥、解密、校验、兼容期限、结果字段和 UI 提示；会员只走当前云端流程与 SH/ECDSA 授权验证。

### AI 与 Agent 配置

- 删除旧 provider 类型 `kimi`、`mimo`、`deepseek`；只接受 `kimi-api`、`kimi-coding`、`mimo-api`、`mimo-coding-plan`、`deepseek-api` 和 `openai-compatible`。
- 删除旧 Agent compatibility 配置键、旧 provider 映射、旧工具名分发提示、旧工具展示名和历史工具 action 推断。
- 删除旧工具参数别名，包括书签、文档树、AttributeView、块 ID 和通知桥接参数别名。
- 删除旧 AI 设置、默认 provider/tool 映射和个人模板 V1 读取。

### 主页设置字段

- 删除共享设置从各 surface `view.json` 和旧移动端归属字段中回填的逻辑。
- 删除 `autoOpenMobileHomepage`，只使用 `mobileAutoOpenEnabled` 与 `mobileAutoOpenTarget`。
- 收藏、复习和任务的 `favoritesMigrationStatus`、`reviewDocsMigrationStatus`、`taskIndexMigrationStatus` 仍是当前 `view.json` 与共享设置采用的持久化字段名，因此保留；这里只删除它们曾经触发的旧数据扫描/迁移执行器，设置页继续把这些对象用作现行索引操作状态。
- 删除天气 `city`、自定义表单和组件内容设置的旧回退字段。
- `dailynotesCount` 是当前统计索引和已保存 AI 统计选项采用的键，继续作为持久化主键；组件表单产生的 `dailyNotesCount` 在读取边界统一到该主键。
- `notesCount` 与 `DocsCount` 仍出现在当前设备视图已保存的 `statsInfoText` 中，继续在模板渲染边界分别解析为 `blocksCount` 与 `docsCount`，但不会再由新版设置生成。

## 已删除的低风险接口别名

- `RedeemError`、`setDocContentEditConfirmationHandler` 等废弃导出。
- Emoji 空值别名、`rowID`、AttributeView `readItemId`、顶层 `blockId` 组件实例回退。
- 首页 Agent `ensureMigrated`、旧 manifest 更新、旧 unresolved 清理工具。
- 机器人设置/会话和通知中心中的零调用迁移方法。
- 仅为旧迁移服务的删除选项 `expectWidgetMissing`。
- 未使用的 accounting 类型别名和 overview 历史常量。

## 明确保留的机制

以下内容不是本次要删除的旧业务数据兼容，或其风险高于收益，因此继续保留：

- 当前设备视图的 schema、revision、写后重读、并发冲突检测、部分同步防覆盖和损坏阻断。
- 当前清单中的 `migration.source` 与 `unresolvedLegacyWidgetIds` 只读状态；它们是已经落盘的来源/完整性信息，不会重新启动旧迁移。
- 当前设置文件仍在使用的 `*MigrationStatus` 字段名，以及当前已保存状态文本所需的变量解析。
- 当前索引的初始化、刷新、重建、分页和 checked API；它们是现行数据维护机制，不是旧属性迁移。
- `api.ts` 中当前 checked 操作与宽松只读请求层：checked 操作用于完整性写入，宽松层用于可容错 UI 查询。
- 机器人 Secret Vault 和 KB 敏感配置使用的当前加密存储；不会因为删除会员 AES V1 激活而移除凭据加密。
- 已加密 KB secret 的只读解密保护，避免解密失败时用空值覆盖密文。
- 主题系统的 Classic / Semantic / Legacy presentation fallback、Classic 运行时 appearance 映射和图标 fallback；这是当前主题契约的一部分。
- `svelte/legacy` 编译运行辅助，这是 Svelte 运行方式，不是业务数据兼容。
- 旧版思源内核可能不要求显式创建目录的写入重试，以及浏览器/桌面 API 差异适配。
- 飞书 SDK 事件外壳兼容，这是外部协议输入保护。
- KB 会话终态竞态修复和显式开发测试 confirmation bridge，这是当前防损坏/测试机制。
- 强化日记中的“迁移任务”功能；它表示用户主动把历史任务移动到今日日记，不是数据结构迁移。

## 升级影响

- 旧主页根布局和旧共享组件数据不会自动出现在新版设备视图中。
- 旧收藏/复习属性不会自动进入本地索引，需要按当前方式重新收藏或新增复习计划。
- 没有官方日记属性、仅靠标题或目录日期命名的文档不再进入强化日记索引。
- 旧 provider 类型、旧工具名、旧参数名和旧设置字段会被忽略或判为无效。
- 旧 AES 激活码不再可用，需使用当前会员激活流程。
- 若设备视图目录中存在不完整或无法识别的数据，新版会停止自动写入并提示人工检查，不会静默重建覆盖。

## 验证

- `pnpm exec tsc --noEmit --pretty false`：通过；用于捕获 Vite 转译构建不会阻断的未定义标识符。
- `pnpm lint`：通过。
- `pnpm build:app`：通过，生产构建完成（3723 modules）。
- `pnpm build:kernel`：通过，Kernel 生产构建完成（621 modules）。
- `pnpm build:robot-electron`：通过，飞书与 QQ provider 构建完成。
- `pnpm verify:homepage-theme`：通过。
- `pnpm verify:widget-presentation`：通过。
- `pnpm verify:mouse-trail`：通过。
- `pnpm verify:falling-effect`：通过。
- `pnpm verify:agent-continuation`：通过。
- Robot provider secret bridge 专项验证：通过。
