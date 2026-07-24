# 旧版本兼容代码生命周期清单

> 本文件只记录兼容层，不代表到期自动删除。

| 项目 | 值 |
|---|---|
| 首次审计日期 | 2026-07-21 |
| 审计时仓库版本 | v4.8.4（commit `2790b86`，2026-07-18） |
| 最近复查日期 | 2026-07-21 |

---

## 一、生命周期规则

### 1. 未发布的设备视图迁移

- 删除等待期从正式发布日开始计算，不从开发日期计算；
- 发布版本暂写"待发布"。

### 2. 一次性数据迁移

- 原则上至少保留 90 天且跨越两个稳定版本；
- 涉及长期离线用户、数据清理或不可逆来源的，建议至少保留 180 天；
- 到期只代表可以评估，不能自动删除。

### 3. 字段和接口别名

- 至少跨越两个稳定版本；
- 删除前全仓搜索必须为零引用；
- 导入旧配置测试必须明确不再支持。

### 4. 授权兼容

- 遵守代码和用户提示中的明确截止日期；
- 不得提前删除；
- 删除时必须同步清理提示、解析器和旧密钥引用；
- 受第一铁律保护的授权兼容分支不给出自动删除日期，只标注旧码验证截止。

### 5. 思源 API、浏览器能力和旧内核兼容

- 不按时间删除；
- 只有提高 `minAppVersion` 或运行环境要求后才能评估；
- 普通网络重试、错误兜底、默认值归一化不列为待删除迁移；
- 当前共享适配层（如 `openSiyuanEmojiPicker`、`notify-bridge` 仍在 `src/index.ts` 使用的导出）不列为到期删除代码。

---

## 二、状态分类说明

每条兼容条目按下表分类，同一条目可同时归属多个分类：

| 分类 | 含义 |
|---|---|
| 可评估删除的一次性迁移 | 旧数据/旧字段的一次性迁移代码，满足前置条件后可评估删除 |
| 长期读取兼容 | 运行期仍需读取旧字段/旧格式以兼容未迁移数据，不按迁移周期删除 |
| 当前正式适配层 | 当前正式使用的共享适配接口，旧调用方迁移完成前不得删除 |
| 受第一铁律保护 | 涉及会员授权、旧根数据等第一铁律约束，未经专项授权不得删除 |
| 非旧版本兼容 | 开发工具或非旧版本兼容代码，不列入待删除迁移清单 |

---

## 三、兼容条目清单

### LC-001：旧根主页布局和组件迁移到设备视图 Schema 2

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-001 |
| 功能模块 | 设备视图迁移（deviceView） |
| 兼容类型 | 数据迁移 |
| 状态分类 | 可评估删除的一次性迁移 |
| 当前代码位置 | `src/homepage/deviceView/deviceViewMigration.ts`：`ensureCurrentDeviceViewMigrated`、`runMigration`、`buildSettings`、`readMigratedWidgets`、`reconcileCompletedLegacyMigration`、`validateMigratedLayoutSections`；`src/homepage/deviceView/deviceViewLegacyLayout.ts`：`resolveLegacyProfile`、`getDesktopLayout`、`getSimpleLayout`、`buildSectionSettingsConfig`、`resolveStyleBySource`；`src/homepage/deviceView/deviceViewStorage.ts`：`readDeviceViewLayout`、`writeInitialDeviceViewFiles` 等 I/O；`src/homepage/deviceView/deviceViewPaths.ts`：路径工具 |
| 旧格式或旧行为 | 旧根 `widgetLayout.json`、`sidebarWidgetLayout.json`、`mobileHomepageWidgetLayout.json`、`homepageSettingConfig.json`、`widget-*.json` 组件文件；`homepageSettingConfig.deviceProfiles` 中可能有多个条目匹配同一硬件信息 |
| 新格式或新行为 | 设备视图目录 `/data/storage/petal/siyuan-homepage/device-views/{deviceId}/{surface}/` 下的 `layout.json`、`view.json`、`widgets/{instanceId}.json`、`manifest.json`（Schema 2）；当 `deviceProfiles` 中多个条目匹配同一硬件时，按 `lastSeenAt` 最新时间选择，时间相同或缺失时使用稳定对象键排序；desktop-sidebar 和 mobile-homepage 的 profile 专属 `widgetLayoutNumber` 和 `widgetGap` 也属于迁移内容（优先级：当前匹配 profile → 旧根布局 → 默认值） |
| 保留原因 | 旧用户首次升级到设备视图时需要一次性迁移旧根布局、设置和组件配置 |
| 首次引入提交 | 待确认（尚未发布） |
| 首次发布版本 | 待发布 |
| 首次发布日期 | 待发布 |
| 当前状态 | 开发中，尚未发布 |
| 最早评估删除日期 | 发布后 180 天（涉及长期离线用户） |
| 删除前置条件 | 1) 正式发布；2) 跨越至少两个稳定版本；3) 发布说明明确提示旧根文件不再迁移；4) 绝大多数用户已完成迁移 |
| 删除时需要同步删除的文件、类型、UI 和测试 | `deviceViewMigration.ts` 中所有 `LEGACY_*` 常量和 `readLegacyFile`/`buildSettings`/`readMigratedWidgets` 等函数；`deviceViewLegacyLayout.ts` 中 `resolveLegacyProfile`/`getDesktopLayout`/`getSimpleLayout`/`buildSectionSettingsConfig`/`resolveStyleBySource`；`legacyReadOnlyFallbacks` 相关代码 |
| 删除后的验证场景 | 新用户首次安装不触发旧根读取；已有设备视图的用户升级后布局不丢失 |
| 证据链接或提交 SHA | 待确认（尚未发布） |
| 信息可信度 | 部分确认（路径与代码位置已核对；发布信息待确认） |

---

### LC-002：focus、CYBMOK、countdown、fixed-assets、review-docs 旧数据库及旧根文件迁移到共享本地数据层

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-002 |
| 功能模块 | 共享组件本地存储（sharedLocalStorage） |
| 兼容类型 | 数据迁移 |
| 状态分类 | 可评估删除的一次性迁移 |
| 当前代码位置 | `src/components/utils/widgetBlock/widget/sharedLocalStorage/sharedWidgetMigration.ts`：`migrateFocus`、`migrateCYBMOK`、`migrateCountdown`、`migrateFixedAssets`、`migrateReviewDocs`、`assertSharedWidgetMigrationReady`、`ensureLegacySharedWidgetMigration`；`src/components/utils/widgetBlock/widget/sharedLocalStorage/legacySharedWidgetDatabase.ts`：`readLegacyFocusDatabase`、`readLegacyCYBMOKDatabase`、`readLegacyCountdownDatabase`、`readLegacyFixedAssetsDatabase`、`readLegacyReviewDocsDatabase` |
| 旧格式或旧行为 | 组件数据存储在思源数据库（AttributeView）和旧根 JSON 文件中 |
| 新格式或新行为 | 组件数据存储在插件本地共享存储 `storage/shared-widget/` 下 |
| 保留原因 | 旧用户升级后需要将数据库中的组件数据迁移到本地存储层 |
| 首次引入提交 | `bc0ffe7`（将使用数据库存储数据的组件转换为插件本地保存） |
| 首次发布版本 | v4.8.0 |
| 首次发布日期 | 2026-07-15 |
| 当前状态 | 已发布，正常使用 |
| 最早评估删除日期 | 2027-01-15（发布后 180 天，涉及不可逆数据来源） |
| 删除前置条件 | 1) 跨越至少两个稳定版本；2) 发布说明明确提示旧数据库不再迁移；3) 全仓搜索 `legacySharedWidgetDatabase` 零引用 |
| 删除时需要同步删除的文件、类型、UI 和测试 | `legacySharedWidgetDatabase.ts` 全文件；`sharedWidgetMigration.ts` 中所有 `migrate*` 函数和 `LEGACY_*` 常量；`ALIASES` 表 |
| 删除后的验证场景 | 新用户安装不触发数据库扫描；已迁移用户组件数据正常显示 |
| 证据链接或提交 SHA | `bc0ffe7`；`git tag --contains bc0ffe7` → v4.8.0 |
| 信息可信度 | 已确认 |

---

### LC-003：收藏文档旧 `custom-homepage-favorites` 属性迁移

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-003 |
| 功能模块 | 收藏组件（favorites） |
| 兼容类型 | 数据迁移 |
| 状态分类 | 可评估删除的一次性迁移 |
| 当前代码位置 | `src/components/tools/siyuanComponentDataApi.ts`：`migrateFavoritesIndexFromGlobalSql`（SQL 扫描 `ial LIKE '%custom-homepage-favorites%'` 并清理属性） |
| 旧格式或旧行为 | 收藏标记存储在文档块的 `custom-homepage-favorites` 属性中 |
| 新格式或新行为 | 收藏列表存储在本地索引 `favorites-index.json` |
| 保留原因 | 旧用户升级后需要从文档属性迁移到本地索引 |
| 首次引入提交 | 待确认（涉及多次修改） |
| 首次发布版本 | 待确认 |
| 首次发布日期 | 待确认 |
| 当前状态 | 已发布，正常使用 |
| 最早评估删除日期 | 待确认发布版本后 90 天 |
| 删除前置条件 | 1) 确认发布版本；2) 跨越两个稳定版本；3) 全仓搜索 `custom-homepage-favorites` 零引用 |
| 删除时需要同步删除的文件、类型、UI 和测试 | `migrateFavoritesIndexFromGlobalSql` 函数；相关 SQL 扫描和 `setBlockAttrsChecked` 清理逻辑 |
| 删除后的验证场景 | 新用户安装不触发属性扫描；已迁移用户收藏列表正常 |
| 证据链接或提交 SHA | 待确认 |
| 信息可信度 | 部分确认 |

---

### LC-004：复习文档旧 `custom-homepage-review-*` 属性迁移

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-004 |
| 功能模块 | 复习文档组件（reviewDocs） |
| 兼容类型 | 数据迁移 |
| 状态分类 | 可评估删除的一次性迁移 + 长期读取兼容 |
| 当前代码位置 | `src/components/utils/widgetBlock/widget/reviewDocs/reviewDocs.ts`：`REVIEW_ATTR_KEYS`（`custom-homepage-review-id` 等 13 个属性键）、`migrateReviewIndexFromGlobalSql`（SQL 扫描 `ial LIKE '%custom-homepage-review-next-date%'`） |
| 旧格式或旧行为 | 复习数据存储在文档块的 `custom-homepage-review-*` 属性中 |
| 新格式或新行为 | 复习数据存储在本地索引中 |
| 保留原因 | 旧用户升级后需要从文档属性迁移到本地索引；运行期仍需读取属性以兼容未迁移文档 |
| 首次引入提交 | `c9888f4`（release: v4.2.0） |
| 首次发布版本 | v4.2.0 |
| 首次发布日期 | 待确认（v4.2.0 tag 日期） |
| 当前状态 | 已发布，运行期仍使用 `REVIEW_ATTR_KEYS` 读取属性 |
| 最早评估删除日期 | 迁移函数待确认发布版本后 90 天；属性读取为运行期必需，不按迁移周期删除 |
| 删除前置条件 | 1) 复习数据完全迁移到本地索引；2) 不再需要读取文档属性；3) 全仓搜索 `custom-homepage-review` 零引用 |
| 删除时需要同步删除的文件、类型、UI 和测试 | `REVIEW_ATTR_KEYS` 常量；`REVIEW_ATTR_KEY_SET`；所有属性读取逻辑；`migrateReviewIndexFromGlobalSql` |
| 删除后的验证场景 | 复习文档功能正常；不再扫描文档属性 |
| 证据链接或提交 SHA | `c9888f4`；`git tag --contains c9888f4` → v4.2.0 |
| 信息可信度 | 部分确认 |

---

### LC-005：任务、统计、热力图、强化日记等旧索引格式和重建兼容

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-005 |
| 功能模块 | 主页索引管理（homepageIndexManagement） |
| 兼容类型 | 数据迁移 |
| 状态分类 | 长期读取兼容 |
| 当前代码位置 | `src/components/tools/homepageIndexManagement.ts`：`rebuildAllHomepageIndexes`（调用 `migrateFavoritesIndexFromGlobalSql`、`rebuildTaskIndexFromGlobalSql`、`rebuildHeatmapDailyIndexFromGlobalSql`、`rebuildStatIndexFromGlobalSql`、`migrateReviewIndexFromGlobalSql`、`rebuildEnhancedDiaryIndex` 等） |
| 旧格式或旧行为 | 直接使用思源 SQL 全库检索获取任务、统计、热力图数据 |
| 新格式或新行为 | 使用本地索引文件存储聚合数据，支持增量刷新和重建 |
| 保留原因 | 大库环境下 SQL 全库检索性能差，需要本地索引替代；旧用户需要重建索引 |
| 首次引入提交 | `d9b90f7`（对于需要使用全库检索的SQL组件及功能，改为使用本地索引进行检索） |
| 首次发布版本 | v4.6.0 |
| 首次发布日期 | 待确认（v4.6.0 tag 日期） |
| 当前状态 | 已发布，正常使用 |
| 最早评估删除日期 | 不适用（永久索引重建能力为排除项；仅真正读取旧格式的一次性 `migrate*` 逻辑可评估删除） |
| 删除前置条件 | 不适用（`rebuild*` 索引重建函数为运行期永久功能，不按迁移周期删除）；仅 `migrate*` 前缀的一次性旧格式读取函数在全仓搜索零引用后才可评估删除 |
| 删除时需要同步删除的文件、类型、UI 和测试 | 仅真正读取旧格式的一次性 `migrate*` 前缀函数可评估删除；`rebuild*` 索引重建函数为永久功能，明确列为排除项，不得删除 |
| 删除后的验证场景 | 索引重建功能正常；增量刷新正常 |
| 证据链接或提交 SHA | `d9b90f7`；`git tag --contains d9b90f7` → v4.6.0 |
| 信息可信度 | 已确认 |

---

### LC-006：notify-bridge、旧通知规则、channelIds 和旧通知历史迁移到通知中心

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-006 |
| 功能模块 | 通知中心（notification-center） |
| 兼容类型 | 数据迁移 |
| 状态分类 | 可评估删除的一次性迁移 |
| 当前代码位置 | `src/features/notification-center/notification-center-migration.ts`：`migrateCenterSettings`、`migrateSourceSettings`、`migrateLegacyHistories`、`ensureNotificationCenterMigration` |
| 旧格式或旧行为 | 通知设置存储在 `notify-bridge-settings.json`、`task-notify-settings.json`、`countdown-notify-settings.json`、`enhanced-diary-notify-settings.json`；通知历史存储在各 `*-history.json` 的 `sentKeys` 中 |
| 新格式或新行为 | 通知设置和历史统一存储在通知中心 `notification-center-settings.json` 和 `notification-center-history.json` |
| 保留原因 | 旧用户升级后需要将分散的通知设置和历史迁移到通知中心 |
| 首次引入提交 | `63c7d05`（新增通知中心进行统一通知调度） |
| 首次发布版本 | v4.8.0 |
| 首次发布日期 | 2026-07-15 |
| 当前状态 | 已发布，正常使用 |
| 最早评估删除日期 | 2026-10-15（发布后 90 天） |
| 删除前置条件 | 1) 跨越两个稳定版本；2) 全仓搜索 `notify-bridge-settings` 零引用；3) 确认旧历史文件不再需要迁移 |
| 删除时需要同步删除的文件、类型、UI 和测试 | 只记录 v1 旧设置和旧历史的一次性迁移代码（`notification-center-migration.ts` 中的 `migrateCenterSettings`、`migrateSourceSettings`、`migrateLegacyHistories`、`ensureNotificationCenterMigration`）；删除时必须同步移除启动调用、迁移错误 UI 和旧文件读取；未来新增的其他 schema 迁移不能被连带删除；`notify-bridge-settings-store.ts` 的删除范围见 LC-010 |
| 删除后的验证场景 | 新用户安装不触发旧设置迁移；已迁移用户通知正常 |
| 证据链接或提交 SHA | `63c7d05`；`git tag --contains 63c7d05` → v4.8.0 |
| 信息可信度 | 已确认 |

---

### LC-007：旧 AES 会员激活码兼容及 2026-08-31 验证截止

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-007 |
| 功能模块 | 会员授权（license） |
| 兼容类型 | 授权兼容 |
| 状态分类 | 受第一铁律保护 |
| 当前代码位置 | `src/components/tools/advanced.ts`：`LEGACY_AES_SECRET_KEY`、`LEGACY_COMPAT_END`、`isLegacyAesCompatActive`、`verifyLicense`（旧 AES 解密分支）；`src/index.ts:1358`（用户提示）；`src/homepage/homepageSetting/sections/VipSection.svelte:1430`（UI 警告） |
| 旧格式或旧行为 | 使用 AES 加密的旧版激活码（`licenseVersion: 1`，`legacy: true`） |
| 新格式或新行为 | 使用 SH 前缀的 ECDSA 签名激活码（`licenseVersion: 2`） |
| 保留原因 | 旧用户需要在兼容期内继续使用旧激活码；受第一铁律保护，未经专项授权不得删除 |
| 首次引入提交 | `b6a10ef`（优化会员服务1） |
| 首次发布版本 | v4.7.5 |
| 首次发布日期 | 2026-07-12 |
| 当前状态 | 已发布，旧码验证截止 2026-08-31 23:59:59 |
| 最早评估删除日期 | 不给出自动删除日期（受第一铁律保护） |
| 删除前置条件 | 1) 专项授权批准；2) 旧码验证截止日期 2026-08-31 已过；3) 用户提示已明确告知截止日期；4) 新版激活码已全面推广；5) 同步清理密钥、解析器、错误提示和兼容分支 |
| 删除时需要同步删除的文件、类型、UI 和测试 | `advanced.ts` 中 `LEGACY_AES_SECRET_KEY`、`LEGACY_COMPAT_END`、`isLegacyAesCompatActive`、`parseLicensePayload`、旧 AES 解密分支；`index.ts:1358` 提示；`VipSection.svelte:1430` 警告 UI；`CryptoJS` 依赖 |
| 删除后的验证场景 | 旧激活码无法激活并提示使用新版；新激活码正常 |
| 证据链接或提交 SHA | `b6a10ef`；`git tag --contains b6a10ef` → v4.7.5；代码中 `LEGACY_COMPAT_END = new Date(2026, 7, 31, ...)` |
| 信息可信度 | 已确认 |

> 注意：2026-08-31 只表示旧码验证截止，不等于自动删除日期。受第一铁律保护，未经专项授权不得删除密钥、解析、错误提示或兼容分支。

---

### LC-008：redemptionService 的 deprecated 类型别名

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-008 |
| 功能模块 | 会员服务（redemptionService） |
| 兼容类型 | 接口别名 |
| 状态分类 | 可评估删除的一次性迁移 |
| 当前代码位置 | `src/services/redemptionService.ts:59`：`@deprecated RedeemErrorCode`；`src/services/redemptionService.ts:69`：`@deprecated RedeemError` |
| 旧格式或旧行为 | 使用 `RedeemErrorCode` 和 `RedeemError` 类型 |
| 新格式或新行为 | 使用 `MembershipServiceErrorCode` 和 `MembershipServiceError` |
| 保留原因 | 旧引用可能仍在使用 deprecated 类型名 |
| 首次引入提交 | `f1eb21c`（优化会员服务4） |
| 首次发布版本 | v4.7.5 |
| 首次发布日期 | 2026-07-12 |
| 当前状态 | 已发布，标记为 deprecated |
| 最早评估删除日期 | 2026-09-12（发布后 60 天，跨越两个稳定版本） |
| 删除前置条件 | 1) 全仓搜索 `RedeemErrorCode` 和 `RedeemError` 零引用；2) 跨越两个稳定版本 |
| 删除时需要同步删除的文件、类型、UI 和测试 | `redemptionService.ts` 中 `RedeemErrorCode` 和 `RedeemError` 定义 |
| 删除后的验证场景 | 编译通过；无类型引用残留 |
| 证据链接或提交 SHA | `f1eb21c`；`git tag --contains f1eb21c` → v4.7.5 |
| 信息可信度 | 已确认 |

---

### LC-009：NotifyBridgeSettingsTab 旧文件名别名

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-009 |
| 功能模块 | 主页设置（homepageSetting） |
| 兼容类型 | 接口别名 |
| 状态分类 | 当前正式适配层 |
| 当前代码位置 | `src/homepage/homepageSetting/tabs/NotifyBridgeSettingsTab.svelte:2`：`@deprecated 保留旧文件名兼容；真实页面为 NotificationCenterSettingsTab` |
| 旧格式或旧行为 | 设置中使用 `NotifyBridgeSettingsTab` |
| 新格式或新行为 | 设置中使用 `NotificationCenterSettingsTab` |
| 保留原因 | 旧导入路径可能仍引用 `NotifyBridgeSettingsTab` |
| 首次引入提交 | `63c7d05`（新增通知中心） |
| 首次发布版本 | v4.8.0 |
| 首次发布日期 | 2026-07-15 |
| 当前状态 | 已发布，标记为 deprecated |
| 最早评估删除日期 | 2026-10-15（发布后 90 天） |
| 删除前置条件 | 1) 全仓搜索 `NotifyBridgeSettingsTab` 零引用（除自身定义）；2) 跨越两个稳定版本 |
| 删除时需要同步删除的文件、类型、UI 和测试 | `NotifyBridgeSettingsTab.svelte` 全文件 |
| 删除后的验证场景 | 设置页面正常显示通知中心标签页 |
| 证据链接或提交 SHA | `63c7d05`；`git tag --contains 63c7d05` → v4.8.0 |
| 信息可信度 | 已确认 |

---

### LC-010：notify-bridge 模块旧调用兼容映射

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-010 |
| 功能模块 | 通知桥接（notify-bridge） |
| 兼容类型 | 接口别名 |
| 状态分类 | 当前正式适配层 |
| 当前代码位置 | `src/features/notify-bridge/index.ts`：`@deprecated setNotifyBridgePlugin`、`isNotifyBridgePremiumAvailable`、`loadNotifyBridgeSettings`、`saveNotifyBridgeSettings`、`sendNotifyBridgeEvent`、`notifyBridge`、`clearNotifyBridgeDedupeCache`；`src/features/notify-bridge/notify-bridge-settings-store.ts`：`@deprecated normalizeNotifyBridgeSettings` |
| 旧格式或旧行为 | 调用 `notify-bridge` 模块的函数 |
| 新格式或新行为 | 调用 `notification-center` 模块的函数 |
| 保留原因 | `src/index.ts:74` 导入 `setNotifyBridgePlugin`，`src/index.ts:456` 仍正式调用 `setNotifyBridgePlugin(this)`；在该引用迁移前不得删除 notify-bridge |
| 首次引入提交 | `63c7d05`（新增通知中心） |
| 首次发布版本 | v4.8.0 |
| 首次发布日期 | 2026-07-15 |
| 当前状态 | 已发布，`setNotifyBridgePlugin` 仍被 `src/index.ts` 正式使用 |
| 最早评估删除日期 | 待确认（`src/index.ts` 引用迁移后才能评估） |
| 删除前置条件 | 1) `src/index.ts` 中的 `setNotifyBridgePlugin` 调用迁移到通知中心；2) 全仓搜索 `from "@/features/notify-bridge"` 零引用（除通知中心迁移代码）；3) 跨越两个稳定版本 |
| 删除时需要同步删除的文件、类型、UI 和测试 | `notify-bridge/index.ts`、`notify-bridge/notify-bridge-settings-store.ts`、`notify-bridge/types.ts`、`notify-bridge/constants.ts` |
| 删除后的验证场景 | 通知中心功能正常；无 notify-bridge 引用残留 |
| 证据链接或提交 SHA | `63c7d05`；`git tag --contains 63c7d05` → v4.8.0；`src/index.ts:456` 仍使用 `setNotifyBridgePlugin(this)` |
| 信息可信度 | 已确认 |

---

### LC-011：notesCount、DocsCount 等状态变量别名

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-011 |
| 功能模块 | 状态语（status-text） |
| 兼容类型 | 字段别名 |
| 状态分类 | 长期读取兼容 |
| 当前代码位置 | `src/homepage/status-text-config.ts:58`：`LEGACY_DEFAULT_STATS_INFO_TEXTS`（旧版状态语文本兼容）；`src/components/tools/statisticalAPI.ts`：`dailynotesCount` 字段名 |
| 旧格式或旧行为 | 状态语使用旧模板 `LEGACY_DEFAULT_STATS_INFO_TEXTS`；统计字段名 `dailynotesCount` |
| 新格式或新行为 | 状态语使用新模板 `DEFAULT_STATS_INFO_TEXT`；统计字段名 `docsCount` |
| 保留原因 | 旧用户保存的状态语文本可能使用旧模板；统计 API 字段名兼容 |
| 首次引入提交 | `5c87337`（新增状态语AI生成器）后续修改 |
| 首次发布版本 | 待确认 |
| 首次发布日期 | 待确认 |
| 当前状态 | 已发布，正常使用 |
| 最早评估删除日期 | 待确认 |
| 删除前置条件 | 1) 确认发布版本；2) 旧状态语文本已全部迁移；3) 全仓搜索 `LEGACY_DEFAULT_STATS_INFO_TEXTS` 零引用 |
| 删除时需要同步删除的文件、类型、UI 和测试 | `LEGACY_DEFAULT_STATS_INFO_TEXTS` 常量；旧模板匹配逻辑 |
| 删除后的验证场景 | 状态语显示正常；统计字段名统一 |
| 证据链接或提交 SHA | `5c87337`；`git tag --contains 5c87337` → v4.1.2 |
| 信息可信度 | 部分确认 |

---

### LC-012：emojiPicker 适配层与旧空操作别名

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-012 |
| 功能模块 | 主页设置（emojiPicker） |
| 兼容类型 | 接口别名 |
| 状态分类 | 当前正式适配层 + 可评估删除的一次性迁移 |
| 当前代码位置 | `src/homepage/homepageSetting/emojiPicker.ts`：`openSiyuanEmojiPicker`（当前正式共享适配层，封装思源 `openEmoji`）；`calculateEmojiPickerPosition`（旧空操作别名，返回 `null`）；`bindEmojiPickerEvents`（旧空操作别名，返回空清理函数） |
| 旧格式或旧行为 | 旧接口使用 `calculateEmojiPickerPosition` 和 `bindEmojiPickerEvents` 自定义定位和事件绑定 |
| 新格式或新行为 | `openSiyuanEmojiPicker` 直接使用思源内置 `openEmoji`，无需自定义定位和事件绑定 |
| 保留原因 | `openSiyuanEmojiPicker` 是当前正式共享适配层，不列为整体待删除；仅 `calculateEmojiPickerPosition` 和 `bindEmojiPickerEvents` 两个旧空操作别名可评估删除 |
| 首次引入提交 | 待确认 |
| 首次发布版本 | 待确认 |
| 首次发布日期 | 待确认 |
| 当前状态 | 已发布，`openSiyuanEmojiPicker` 正常使用；`calculateEmojiPickerPosition` 和 `bindEmojiPickerEvents` 为空操作别名 |
| 最早评估删除日期 | `openSiyuanEmojiPicker` 不适用（当前正式适配层）；两个空操作别名待确认发布版本后 90 天 |
| 删除前置条件 | `openSiyuanEmojiPicker`：不适用（当前正式适配层）；`calculateEmojiPickerPosition`/`bindEmojiPickerEvents`：1) 全仓搜索零引用（除自身定义）；2) 跨越两个稳定版本 |
| 删除时需要同步删除的文件、类型、UI 和测试 | 仅删除 `calculateEmojiPickerPosition` 和 `bindEmojiPickerEvents` 两个空操作别名；`openSiyuanEmojiPicker` 保留 |
| 删除后的验证场景 | emoji 选择器功能正常 |
| 证据链接或提交 SHA | 待确认 |
| 信息可信度 | 部分确认 |

---

### LC-013：API 中 rowID 旧包装函数兼容

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-013 |
| 功能模块 | 思源 API（api.ts） |
| 兼容类型 | 字段别名 |
| 状态分类 | 长期读取兼容 |
| 当前代码位置 | `src/api.ts:1218-1227`：`setAttributeViewBlockAttrWithCellChecked` 参数中 `rowID` 作为 `itemID` 的旧别名 |
| 旧格式或旧行为 | 调用方传入 `rowID` 参数 |
| 新格式或新行为 | 调用方传入 `itemID` 参数 |
| 保留原因 | 旧调用方可能仍使用 `rowID` 参数名 |
| 首次引入提交 | 待确认 |
| 首次发布版本 | 待确认 |
| 首次发布日期 | 待确认 |
| 当前状态 | 已发布，正常使用 |
| 最早评估删除日期 | 待确认 |
| 删除前置条件 | 1) 全仓搜索 `rowID` 零引用（除 api.ts 兼容定义）；2) 跨越两个稳定版本 |
| 删除时需要同步删除的文件、类型、UI 和测试 | `api.ts` 中 `rowID` 参数定义和转换逻辑 |
| 删除后的验证场景 | API 调用正常 |
| 证据链接或提交 SHA | 待确认 |
| 信息可信度 | 待确认 |

---

### LC-014：Agent 聚合工具旧工具名迁移映射

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-014 |
| 功能模块 | Agent 工作台（agent-workbench） |
| 兼容类型 | 数据迁移 + 接口别名 |
| 状态分类 | 可评估删除的一次性迁移 |
| 当前代码位置 | `src/features/kb/services/agent-workbench/tools/aggregate/aggregate-tool-migration.ts`：`OLD_TOOL_TO_AGGREGATE_TOOL`（旧独立小工具名 → 聚合工具名映射）；`src/features/kb/services/settings/kb-settings-service.ts:214`：`migrateDisabledBuiltinSkillsToTools` |
| 旧格式或旧行为 | 旧设置中使用独立小工具名（如 `search_scope`、`read_docs`、`query_tasks` 等） |
| 新格式或新行为 | 新设置中使用聚合工具名（如 `siyuan_kb`、`diary_task` 等） |
| 保留原因 | 旧用户设置中可能仍引用旧工具名；需要迁移到聚合工具名 |
| 首次引入提交 | `1192d69`（重构 agent 内置工具逻辑） |
| 首次发布版本 | v4.6.0 |
| 首次发布日期 | 待确认（v4.6.0 tag 日期） |
| 当前状态 | 已发布，正常使用 |
| 最早评估删除日期 | 2026-10-15（发布后 90 天，已跨越多个版本） |
| 删除前置条件 | 1) 全仓搜索 `OLD_TOOL_TO_AGGREGATE_TOOL` 零引用；2) 旧工具名不再出现在设置中；3) 跨越两个稳定版本 |
| 删除时需要同步删除的文件、类型、UI 和测试 | `aggregate-tool-migration.ts` 中 `OLD_TOOL_TO_AGGREGATE_TOOL`；`kb-settings-service.ts` 中 `migrateDisabledBuiltinSkillsToTools` |
| 删除后的验证场景 | Agent 工具正常；旧设置不再迁移 |
| 证据链接或提交 SHA | `1192d69`；`git tag --contains 1192d69` → v4.6.0 |
| 信息可信度 | 已确认 |

---

### LC-015：Agent 会话存储旧 answerSummary / answerItems 字段兼容

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-015 |
| 功能模块 | Agent 会话存储（kb-chat-session-storage） |
| 兼容类型 | 字段别名 |
| 状态分类 | 长期读取兼容 |
| 当前代码位置 | `src/features/kb/services/session/kb-chat-session-storage.ts:171`：`fromPersistedAgentTurnMemory`（注释 `Ignore legacy answerSummary / answerItems if present in old persisted data`） |
| 旧格式或旧行为 | 持久化的 Agent 回合内存包含 `answerSummary` 和 `answerItems` 字段 |
| 新格式或新行为 | 使用 `actionTraceSummary` 替代 |
| 保留原因 | 旧会话数据可能仍包含 `answerSummary` / `answerItems` |
| 首次引入提交 | 待确认 |
| 首次发布版本 | 待确认 |
| 首次发布日期 | 待确认 |
| 当前状态 | 已发布，读取时忽略旧字段 |
| 最早评估删除日期 | 待确认 |
| 删除前置条件 | 1) 旧会话数据已自然过期或迁移；2) 全仓搜索 `answerSummary` / `answerItems` 零引用 |
| 删除时需要同步删除的文件、类型、UI 和测试 | `fromPersistedAgentTurnMemory` 中的忽略注释；相关类型定义 |
| 删除后的验证场景 | Agent 会话历史正常加载 |
| 证据链接或提交 SHA | 待确认 |
| 信息可信度 | 待确认 |

---

### LC-016：attribute-view-normalizer 旧 readItemId 兼容

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-016 |
| 功能模块 | Agent 属性视图工具（attribute-view） |
| 兼容类型 | 接口别名 |
| 状态分类 | 长期读取兼容 |
| 当前代码位置 | `src/features/kb/services/agent-workbench/tools/siyuan/internal/attribute-view/attribute-view-normalizer.ts:273`：`@deprecated readItemId`（使用 `readStrictItemId` 代替，保留向后兼容） |
| 旧格式或旧行为 | 使用 `readItemId` 函数 |
| 新格式或新行为 | 使用 `readStrictItemId` 函数 |
| 保留原因 | 旧调用方可能仍引用 `readItemId` |
| 首次引入提交 | 待确认 |
| 首次发布版本 | 待确认 |
| 首次发布日期 | 待确认 |
| 当前状态 | 已发布，标记为 deprecated |
| 最早评估删除日期 | 待确认 |
| 删除前置条件 | 1) 全仓搜索 `readItemId` 零引用（除自身定义）；2) 跨越两个稳定版本 |
| 删除时需要同步删除的文件、类型、UI 和测试 | `attribute-view-normalizer.ts` 中 `readItemId` 函数 |
| 删除后的验证场景 | 属性视图工具正常 |
| 证据链接或提交 SHA | 待确认 |
| 信息可信度 | 待确认 |

---

### LC-018：task/review/countdown/enhanced-diary 通知 channelIds → deliveryTargets 迁移

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-018 |
| 功能模块 | 通知投递目标（task-notify、review-notify、countdown-notify、enhanced-diary-notify） |
| 兼容类型 | 数据迁移 |
| 状态分类 | 可评估删除的一次性迁移 |
| 当前代码位置 | `src/features/task-notify/task-notify-settings-store.ts:69`：`migrateChannelIds(value.channelIds) ?? [{ kind: "external-default" }]`；`src/features/review-notify/review-notify-settings-store.ts`：同类迁移逻辑 |
| 旧格式或旧行为 | 通知规则使用 `channelIds: string[]` 指定投递目标 |
| 新格式或新行为 | 通知规则使用 `deliveryTargets: NotificationDeliveryTarget[]`，支持外部默认、移动端等多种投递类型 |
| 保留原因 | 旧用户通知规则可能仍使用 `channelIds` 字段 |
| 首次引入提交 | 待确认 |
| 首次发布版本 | 待确认 |
| 首次发布日期 | 待确认 |
| 当前状态 | 已发布，读取旧配置时迁移 |
| 最早评估删除日期 | 待确认发布版本后 90 天 |
| 删除前置条件 | 1) 全仓搜索 `channelIds` 零引用（除迁移代码）；2) 跨越两个稳定版本 |
| 删除时需要同步删除的文件、类型、UI 和测试 | `migrateChannelIds` 函数；`channelIds` 字段读取逻辑 |
| 删除后的验证场景 | 通知规则正常使用 `deliveryTargets` |
| 证据链接或提交 SHA | 待确认 |
| 信息可信度 | 部分确认 |

---

### LC-019：Selection AI enabledActions、旧全局模型参数和废弃内置技能 ID 迁移

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-019 |
| 功能模块 | 选区 AI（selection-ai） |
| 兼容类型 | 数据迁移 |
| 状态分类 | 长期读取兼容 |
| 当前代码位置 | `src/features/kb/services/selection-ai/selection-ai-defaults.ts:114`：`migrateEnabledActions`；`src/features/kb/services/selection-ai/selection-ai-defaults.ts:125`：`LegacyGlobalConfig`（旧全局 `providerId`/`modelId`/`temperature`/`maxSelectedTextChars`/`maxOutputChars`/`stream`）；`src/features/kb/services/selection-ai/selection-ai-defaults.ts:280`：`hasLegacyEnabledActions` 判断 |
| 旧格式或旧行为 | 旧配置使用 `enabledActions` 数组和全局模型参数（`providerId`/`modelId` 等） |
| 新格式或新行为 | 使用 `SelectionAiSkill[]` 和独立技能配置 |
| 保留原因 | 旧用户配置可能仍包含 `enabledActions` 和旧全局参数 |
| 首次引入提交 | 待确认 |
| 首次发布版本 | 待确认 |
| 首次发布日期 | 待确认 |
| 当前状态 | 已发布，读取时迁移 |
| 最早评估删除日期 | 待确认 |
| 删除前置条件 | 1) 全仓搜索 `enabledActions`/`LegacyGlobalConfig` 零引用（除迁移代码）；2) 跨越两个稳定版本 |
| 删除时需要同步删除的文件、类型、UI 和测试 | `migrateEnabledActions` 函数；`LegacyGlobalConfig` 接口；旧全局参数读取逻辑 |
| 删除后的验证场景 | 选区 AI 配置正常加载 |
| 证据链接或提交 SHA | 待确认 |
| 信息可信度 | 部分确认 |

---

### LC-020：KB skillSettings → toolSettings、旧确认名称迁移

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-020 |
| 功能模块 | KB 设置（kb-settings） |
| 兼容类型 | 数据迁移 |
| 状态分类 | 可评估删除的一次性迁移 |
| 当前代码位置 | `src/features/kb/services/settings/kb-settings-service.ts:183`：`normalizeSkillSettings`（保留旧 `disabledBuiltinSkillNames` 迁移用）；`src/features/kb/services/settings/kb-settings-service.ts:292`：`migrateDisabledBuiltinSkillsToTools`；`src/features/kb/services/settings/kb-settings-service.ts:330`：`disabledDangerousSkillToolConfirmationNames` 归一化（迁移到 `disabledWriteToolConfirmationNames`）；`src/features/kb/services/settings/kb-settings-service.ts:247`：`normalizeToolActionConfirmOverrides`（旧 tool 级确认迁移到 action 级） |
| 旧格式或旧行为 | 旧设置使用 `skillSettings.disabledBuiltinSkillNames`、`disabledDangerousSkillToolConfirmationNames`、tool 级 `disabledWriteToolConfirmationNames` |
| 新格式或新行为 | 新设置使用 `toolSettings.disabledGlobalToolNames`、`toolActionConfirmOverrides`、`disabledWriteToolConfirmationNames`（仅无 action 直接工具） |
| 保留原因 | 旧用户设置可能仍引用旧字段名 |
| 首次引入提交 | 待确认 |
| 首次发布版本 | 待确认 |
| 首次发布日期 | 待确认 |
| 当前状态 | 已发布，读取时迁移 |
| 最早评估删除日期 | 待确认发布版本后 90 天 |
| 删除前置条件 | 1) 全仓搜索 `disabledBuiltinSkillNames`/`disabledDangerousSkillToolConfirmationNames` 零引用（除迁移代码）；2) 跨越两个稳定版本 |
| 删除时需要同步删除的文件、类型、UI 和测试 | `normalizeSkillSettings` 中旧字段读取；`migrateDisabledBuiltinSkillsToTools`；`disabledDangerousSkillToolConfirmationNames` 归一化逻辑 |
| 删除后的验证场景 | KB 设置正常加载；工具确认配置正常 |
| 证据链接或提交 SHA | 待确认 |
| 信息可信度 | 部分确认 |

---

### LC-021：chat provider 旧 provider ID 映射

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-021 |
| 功能模块 | 聊天提供商配置（chat-provider-config） |
| 兼容类型 | 字段别名 |
| 状态分类 | 长期读取兼容 |
| 当前代码位置 | `src/features/kb/services/settings/chat-provider-config.ts:127`：`legacyOpenaiCompatibleIds = ["hunyuan", "volcengine", "zhipu", "siliconflow", "minimax", "baidu-qianfan", "openrouter", "volcano"]`；`normalizeProviderTypeByKnownPreset` 中通过旧 ID 推断 `openai-compatible` |
| 旧格式或旧行为 | 旧配置使用第三方供应商 ID（如 `hunyuan`、`volcengine` 等） |
| 新格式或新行为 | 统一映射到 `openai-compatible` 类型 |
| 保留原因 | 旧用户配置可能仍包含旧 provider ID |
| 首次引入提交 | 待确认 |
| 首次发布版本 | 待确认 |
| 首次发布日期 | 待确认 |
| 当前状态 | 已发布，读取时迁移 |
| 最早评估删除日期 | 待确认 |
| 删除前置条件 | 1) 全仓搜索 `legacyOpenaiCompatibleIds` 零引用；2) 旧 provider ID 不再出现在配置中；3) 跨越两个稳定版本 |
| 删除时需要同步删除的文件、类型、UI 和测试 | `legacyOpenaiCompatibleIds` 常量；`normalizeProviderTypeByKnownPreset` 中旧 ID 匹配逻辑 |
| 删除后的验证场景 | 聊天 provider 配置正常加载 |
| 证据链接或提交 SHA | 待确认 |
| 信息可信度 | 部分确认 |

---

### LC-022：focus legacyTotals 旧累计数据兼容

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-022 |
| 功能模块 | 专注组件（focus） |
| 兼容类型 | 字段别名 |
| 状态分类 | 长期读取兼容 |
| 当前代码位置 | `src/components/utils/widgetBlock/widget/focus/focusData.ts:54`：`legacyTotals: FocusLegacyTotals`；`src/components/utils/widgetBlock/widget/focus/focusData.ts:240`：读取旧 `legacyTotals` 字段；`src/components/utils/widgetBlock/widget/focus/focusData.ts:342`：`sameFocusLegacyTotals` 校验 |
| 旧格式或旧行为 | 旧专注数据使用 `legacyTotals.totalFocusTime` 和 `legacyTotals.totalFocusTimes` 存储累计值 |
| 新格式或新行为 | 新数据使用 `totalFocusTime` 和 `totalFocusTimes` 字段，`legacyTotals` 仅用于兼容旧数据 |
| 保留原因 | 旧用户专注数据可能仍包含 `legacyTotals` 字段 |
| 首次引入提交 | 待确认 |
| 首次发布版本 | 待确认 |
| 首次发布日期 | 待确认 |
| 当前状态 | 已发布，读取时兼容 |
| 最早评估删除日期 | 待确认 |
| 删除前置条件 | 1) 旧 `legacyTotals` 数据已自然迁移；2) 全仓搜索 `legacyTotals` 零引用（除兼容读取） |
| 删除时需要同步删除的文件、类型、UI 和测试 | `FocusLegacyTotals` 类型；`legacyTotals` 字段读取和校验逻辑 |
| 删除后的验证场景 | 专注组件累计数据正常显示 |
| 证据链接或提交 SHA | 待确认 |
| 信息可信度 | 部分确认 |

---

### LC-023：CYBMOK legacy-daily 旧每日打卡数据兼容

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-023 |
| 功能模块 | CYBMOK 组件（cybmok） |
| 兼容类型 | 字段别名 |
| 状态分类 | 长期读取兼容 |
| 当前代码位置 | `src/components/utils/widgetBlock/widget/CYBMOK/cybmokData.ts:49`：`kind: "legacy-daily"`；`src/components/utils/widgetBlock/widget/CYBMOK/cybmokData.ts:249`：读取旧 `legacy-daily` 类型数据；`src/components/utils/widgetBlock/widget/sharedLocalStorage/sharedWidgetMigration.ts:938`：迁移时过滤 `legacy-daily` 批次 |
| 旧格式或旧行为 | 旧 CYBMOK 数据使用 `kind: "legacy-daily"` 和 `source: "legacy-daily"` 标识每日打卡 |
| 新格式或新行为 | 新数据使用新的 `kind` 和 `source` 类型 |
| 保留原因 | 旧用户 CYBMOK 数据可能仍包含 `legacy-daily` 类型 |
| 首次引入提交 | 待确认 |
| 首次发布版本 | 待确认 |
| 首次发布日期 | 待确认 |
| 当前状态 | 已发布，读取时兼容 |
| 最早评估删除日期 | 待确认 |
| 删除前置条件 | 1) 旧 `legacy-daily` 数据已自然迁移；2) 全仓搜索 `legacy-daily` 零引用（除兼容读取） |
| 删除时需要同步删除的文件、类型、UI 和测试 | `legacy-daily` kind/source 定义；相关读取和迁移逻辑 |
| 删除后的验证场景 | CYBMOK 组件打卡数据正常显示 |
| 证据链接或提交 SHA | 待确认 |
| 信息可信度 | 部分确认 |

---

### LC-024：configLoader 旧接口兼容

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-024 |
| 功能模块 | 主页配置加载（configLoader） |
| 兼容类型 | 接口别名 |
| 状态分类 | 长期读取兼容 |
| 当前代码位置 | `src/homepage/configLoader.ts:259-260`：注释 `注意：getDeviceLayout 已废弃，请使用当前设备视图布局读取接口。保留此函数仅为兼容旧代码，新代码不应再使用`；`src/homepage/configLoader.ts:4`：导入 `ensureCurrentDeviceViewMigrated`、`getLegacyReadOnlyFallback` |
| 旧格式或旧行为 | 旧代码使用 `getDeviceLayout` 等旧接口读取布局 |
| 新格式或新行为 | 新代码使用设备视图布局读取接口（`readDeviceViewLayout` 等） |
| 保留原因 | 旧调用方可能仍引用旧接口 |
| 首次引入提交 | 待确认 |
| 首次发布版本 | 待确认 |
| 首次发布日期 | 待确认 |
| 当前状态 | 已发布，标记为废弃但保留 |
| 最早评估删除日期 | 待确认 |
| 删除前置条件 | 1) 全仓搜索旧接口零引用（除兼容定义）；2) 跨越两个稳定版本 |
| 删除时需要同步删除的文件、类型、UI 和测试 | `configLoader.ts` 中旧接口定义和兼容注释 |
| 删除后的验证场景 | 主页配置正常加载 |
| 证据链接或提交 SHA | 待确认 |
| 信息可信度 | 部分确认 |

---

### LC-025：个人布局模板 V1（layoutItems-only 格式）兼容

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-025 |
| 功能模块 | 个人布局模板（template-center / userLayoutTemplates） |
| 兼容类型 | 格式兼容 + 应用语义兼容 |
| 状态分类 | 长期读取兼容 + 受第一铁律保护 |
| 当前代码位置 | `src/homepage/templates/userLayoutTemplates.ts`：`isValidUserLayoutTemplate`（V1/V2 格式判定）、`isLegacyUserLayoutTemplate`、`getLegacyUserLayoutTemplateAvailability`、`applyLegacyUserLayoutTemplateToCurrentDevice`、`buildUserLayoutTemplatePreview`；`src/homepage/features/templateCenter/TemplateCenterDialog.svelte`：加载、预览、应用、更新、删除调用链 |
| 旧格式或旧行为 | 正式发布版本 v4.7.8 及此前的 layoutItems-only 格式：仅包含 `id`、`name`、`description`、`createdAt`、`updatedAt`、`deviceId`、`columns`、`gap`、`layoutItems`，不包含 `widgetConfigs`、`layoutSnapshot` 和 `formatVersion` |
| 新格式或新行为 | Portable V2：显式 `formatVersion: 2`，同时携带 `widgetConfigs` 和 `layoutSnapshot`，应用时按可移植克隆流程创建新组件实例 |
| 保留原因 | 正式发布过的旧版个人布局模板文件必须继续可读、可预览、可应用；读取失败不等于空数据，旧格式不能当作损坏数据丢弃 |
| 首次引入提交 | 待确认（个人布局模板原始实现） |
| 首次发布版本 | v4.7.8 |
| 首次发布日期 | 2026-07-14（v4.7.8 tag 日期） |
| 当前状态 | 已发布，运行期读取并兼容应用；更新模板后自动转换为 V2 |
| 最早评估删除日期 | 不适用（受第一铁律保护） |
| 删除前置条件 | 1) 有真实用户采用率数据证明旧模板已无需兼容；2) 获得明确的删除审批；3) 发布说明明确告知旧版模板不再支持；4) 全仓搜索 V1 格式判定（`isLegacyUserLayoutTemplate` 等）零引用；5) 提供旧模板迁移或转换路径 |
| 删除时需要同步删除的文件、类型、UI 和测试 | `userLayoutTemplates.ts` 中 V1 分支（`getLegacyUserLayoutTemplateAvailability`、`applyLegacyUserLayoutTemplateToCurrentDevice`、V1 判定逻辑）；`TemplateCenterDialog.svelte` 中“旧版布局模板”标识和兼容状态展示；相关测试场景 |
| 删除后的验证场景 | 旧版模板文件仍能给出明确读取提示或转换入口；V2 模板的保存、预览、应用、备份、revision 和清理逻辑不受影响 |
| 证据链接或提交 SHA | `git tag --contains <原始提交> → v4.7.8`；v4.7.8 中 `src/homepage/templates/userLayoutTemplates.ts` 仅含基础字段和 `layoutItems` |
| 信息可信度 | 已确认（v4.7.8 tag 中文件已核对） |

> 注意：不得在没有真实用户采用率和明确删除审批时移除该兼容分支。V1 模板只使用当前设备已有组件，缺失组件在应用时跳过；用户点击“更新模板”后会重新捕获当前设备布局并转换为 V2。

---

## 四、排除项 / 开发工具

> 以下条目不列入待删除迁移清单，仅作记录。

### LC-017：confirmation-bridge Dev-only 兼容

| 字段 | 值 |
|---|---|
| 唯一编号 | LC-017 |
| 功能模块 | Agent 权限确认（agent-core） |
| 兼容类型 | 运行环境兼容 |
| 状态分类 | 非旧版本兼容 |
| 当前代码位置 | `src/features/kb/services/agent-core/permissions/confirmation-bridge.ts:8`：`@deprecated Dev-only bridge that always allows writes. Never use in production.` |
| 旧格式或旧行为 | 开发环境使用 always-allow 确认桥 |
| 新格式或新行为 | 生产环境使用正式权限确认流程 |
| 保留原因 | 开发环境调试用途，非旧版本兼容代码 |
| 首次引入提交 | 待确认 |
| 首次发布版本 | 待确认 |
| 首次发布日期 | 待确认 |
| 当前状态 | 仅开发环境使用 |
| 最早评估删除日期 | 不适用（开发工具，不按发布周期删除） |
| 删除前置条件 | 开发流程不再需要 |
| 删除时需要同步删除的文件、类型、UI 和测试 | `confirmation-bridge.ts` 全文件 |
| 删除后的验证场景 | Agent 写操作确认流程正常 |
| 证据链接或提交 SHA | 待确认 |
| 信息可信度 | 待确认 |

---

## 五、每次发布检查清单

- [ ] 新增迁移时在本文件登记新条目；
- [ ] 发布后补正式版本和日期到对应条目；
- [ ] 每个大版本复查到期项目；
- [ ] 删除前创建独立任务；
- [ ] 删除必须单独提交；
- [ ] 删除提交不得与新功能混合；
- [ ] 删除后验证旧数据已经不再承诺支持；
- [ ] 不得把普通默认值、网络回退、浏览器兼容、索引重建能力和当前共享适配层误列为到期删除代码。
