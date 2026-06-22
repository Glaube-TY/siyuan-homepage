# 复习文档组件开发方案

## 1. 功能定位

本方案用于在 `siyuan-homepage` 插件中新增一个主页组件：**复习文档**。

该组件与 AI 功能无关，不接入 AI Skill，不接入 Agent 工具，不修改现有知识库、数据库助手、强化日记助手和文档编辑工具链路。

复习文档组件的核心目标是：让用户可以手动把某个文档或块标记为“未来某一天需要复习”，主页组件自动收集这些带有复习标记的内容，并在到期时显示出来。用户可以在组件中完成本次复习、安排下一次复习、推迟复习、编辑复习计划、查看复习统计。

本组件必须做成**会员专属组件**，免费用户不能实际使用，不能写入复习属性，不能记录复习日志。

## 2. 第一铁律和边界

开发前必须先阅读：

```text
docs/00-global-first-principles.md
```

必须遵守项目第一铁律：

* 不破坏用户原有环境；
* 不污染思源全局样式；
* 不改无关功能；
* 不破坏旧用户本地数据；
* 所有写入操作必须可解释、可回退、可关闭；
* 不依赖思源内部不稳定数据结构；
* 不直接读写思源内部 `storage` 文件夹；
* 不接入思源闪卡内部数据；
* 不接入 AI。

本轮不要开发闪卡联动。复习文档组件只做“手动标记复习 + 主页提醒 + 属性状态 + 数据库记录统计”。

## 3. 最终实现效果

实现完成后，用户应能完成以下流程：

1. 用户在文档树右键、文档标题图标菜单、正文块右键菜单中看到“主页插件 / 加入复习计划”。
2. 用户点击后打开“加入复习计划”弹窗。
3. 用户可以设置：

   * 复习日期；
   * 复习备注；
   * 复习分类；
   * 复习优先级；
   * 复习计划类型；
   * 是否使用艾宾浩斯复习计划；
   * 自定义间隔天数。
4. 插件把复习计划写入目标文档或块的自定义属性。
5. 主页新增“复习文档👑”组件。
6. 组件每次打开时自动全局查询带复习属性的文档和块。
7. 组件根据复习日期显示：

   * 今日到期；
   * 已逾期；
   * 未来复习；
   * 全部复习；
   * 按分类；
   * 按优先级。
8. 用户可以在组件中：

   * 打开文档或块所在文档；
   * 完成本次并安排下一次；
   * 完成复习并移除计划；
   * 推迟到明天；
   * 推迟到一周后；
   * 选择某一天继续复习；
   * 编辑复习计划；
   * 编辑备注；
   * 删除复习计划。
9. 组件可以把每次标记、完成、推迟、编辑、移除等操作记录到思源数据库中。
10. 数据库只用于历史记录和统计分析，不作为“当前是否需要复习”的判断依据。
11. 当前是否需要复习，只能由目标文档或块上的自定义属性决定。
12. 点击“完成复习并移除计划”后，必须清空该目标文档或块上的全部复习相关自定义属性，而不是写入 `false`。

## 4. 会员专属要求

复习文档组件必须是会员专属。

必须同时做三层限制。

### 4.1 设置页限制

在 `contentSetting.svelte` 中新增组件选项：

```text
复习文档👑
```

免费用户不能正常配置该组件。可以显示该选项，但进入设置区域后必须显示 `AdvancedFeatureLock`，不能显示真实设置项，不能保存有效复习组件配置。

参考：

```text
src/components/utils/widgetBlock/widget/common/AdvancedFeatureLock.svelte
src/components/utils/widgetBlock/widget/CYBMOK/CYBMOKSet.svelte
src/components/utils/widgetBlock/widget/fixedAssets/fixedAssetsSet.svelte
```

### 4.2 运行时限制

`reviewDocs.svelte` 中必须读取：

```ts
plugin.ADVANCED
```

如果不是会员，直接显示 `AdvancedFeatureLock`，不要查询 SQL，不要读取数据库，不要写属性，不要显示复习列表。

### 4.3 右键菜单写入限制

文档树、标题图标、正文块右键菜单中的“加入复习计划 / 取消复习计划”必须检查：

```ts
this.ADVANCED
```

如果不是会员：

* 不打开复习计划弹窗；
* 不写入任何属性；
* 不写入数据库；
* 可以提示“复习文档为高级会员专属功能”。

## 5. 数据来源原则

本功能使用两套数据：

### 5.1 自定义属性：当前状态唯一来源

目标文档或块上的自定义属性用于判断“当前是否需要复习”。

也就是说，组件每次打开时必须全局查询 `blocks` 表中的 `ial` 字段，找出带有复习属性的文档或块。

只要目标文档或块上存在有效复习属性，组件就认为它是一个复习项目。

只要目标文档或块上的复习属性被清空，组件就不再显示它。

### 5.2 思源数据库：历史记录和统计来源

思源数据库只用于记录操作日志，例如：

* 什么时候加入复习计划；
* 什么时候完成本次复习；
* 什么时候推迟；
* 什么时候修改计划；
* 复习了几次；
* 哪些分类复习最多；
* 哪些内容逾期最多；
* 艾宾浩斯计划走到第几次。

数据库不决定一个内容是否需要复习。

如果数据库中存在记录，但目标文档或块已经没有复习属性，则组件不应该显示该内容为待复习。

如果目标文档或块有复习属性，但数据库没有记录，组件仍然应该显示该内容。

## 6. 自定义属性设计

所有属性必须以 `custom-homepage-review-` 开头，避免和用户其他属性冲突。

### 6.1 必需属性

```text
custom-homepage-review-id
custom-homepage-review-next-date
custom-homepage-review-created-at
custom-homepage-review-updated-at
```

含义：

| 属性                                  | 含义                | 示例                         |
| ----------------------------------- | ----------------- | -------------------------- |
| `custom-homepage-review-id`         | 复习计划 ID，用于关联数据库日志 | `review-lx8s2-abc123`      |
| `custom-homepage-review-next-date`  | 下一次应复习日期          | `2026-06-25`               |
| `custom-homepage-review-created-at` | 创建时间，ISO 字符串      | `2026-06-22T11:20:00.000Z` |
| `custom-homepage-review-updated-at` | 更新时间，ISO 字符串      | `2026-06-22T11:20:00.000Z` |

### 6.2 可选但默认支持的属性

```text
custom-homepage-review-note
custom-homepage-review-category
custom-homepage-review-priority
custom-homepage-review-plan
custom-homepage-review-intervals
custom-homepage-review-interval-index
custom-homepage-review-count
custom-homepage-review-last-reviewed-at
custom-homepage-review-target-type
```

含义：

| 属性                                        | 含义       | 示例                             |
| ----------------------------------------- | -------- | ------------------------------ |
| `custom-homepage-review-note`             | 复习备注     | `重点看第三节推导`                     |
| `custom-homepage-review-category`         | 分类       | `论文`、`课程`、`项目`                 |
| `custom-homepage-review-priority`         | 优先级      | `high`、`medium`、`low`          |
| `custom-homepage-review-plan`             | 计划类型     | `manual`、`ebbinghaus`、`custom` |
| `custom-homepage-review-intervals`        | 间隔天数     | `0,1,2,4,7,15,30,60`           |
| `custom-homepage-review-interval-index`   | 当前间隔索引   | `0`                            |
| `custom-homepage-review-count`            | 已完成复习次数  | `0`                            |
| `custom-homepage-review-last-reviewed-at` | 最近一次复习时间 | `2026-06-22T11:30:00.000Z`     |
| `custom-homepage-review-target-type`      | 目标类型     | `doc`、`block`                  |

### 6.3 清空属性

完成复习并移除计划时，必须清空所有复习属性：

```ts
{
  "custom-homepage-review-id": "",
  "custom-homepage-review-next-date": "",
  "custom-homepage-review-note": "",
  "custom-homepage-review-category": "",
  "custom-homepage-review-priority": "",
  "custom-homepage-review-plan": "",
  "custom-homepage-review-intervals": "",
  "custom-homepage-review-interval-index": "",
  "custom-homepage-review-count": "",
  "custom-homepage-review-last-reviewed-at": "",
  "custom-homepage-review-target-type": "",
  "custom-homepage-review-created-at": "",
  "custom-homepage-review-updated-at": ""
}
```

注意：不要写入 `false`，不要写入 `done=true`，不要保留无意义状态。

## 7. 复习动作语义

为避免“完成复习”和“继续复习”语义冲突，组件中必须区分两个按钮。

### 7.1 完成本次并安排下一次

按钮名称：

```text
完成本次
```

含义：

* 记录一次复习日志；
* 增加 `custom-homepage-review-count`；
* 更新 `custom-homepage-review-last-reviewed-at`；
* 如果是艾宾浩斯或自定义间隔计划，则根据下一个间隔计算新的 `custom-homepage-review-next-date`；
* 更新目标文档或块上的复习属性；
* 不清空计划，除非已经到达最后一次间隔。

如果已经到达最后一次间隔，可以弹出确认：

```text
已完成全部复习间隔，是否移除复习计划？
[移除计划] [继续手动选择下次日期]
```

### 7.2 完成复习并移除计划

按钮名称：

```text
结束复习
```

含义：

* 记录一次 `finish` 日志；
* 清空目标文档或块上的全部复习属性；
* 下次组件刷新时不再显示该项目。

### 7.3 推迟复习

按钮名称：

```text
推迟
```

支持：

* 推迟到明天；
* 推迟到三天后；
* 推迟到一周后；
* 自定义日期。

推迟只修改：

```text
custom-homepage-review-next-date
custom-homepage-review-updated-at
```

推迟不增加复习次数，不改变 interval index。

### 7.4 选择某一天继续复习

按钮名称：

```text
选择下次
```

含义：

* 手动设置下一次复习日期；
* 可以保持原计划类型；
* 如果用户选择“切换为手动计划”，则把 `custom-homepage-review-plan` 改为 `manual`。

## 8. 艾宾浩斯提醒规则

本组件不接入思源闪卡，不使用 FSRS。这里只实现轻量化“艾宾浩斯间隔提醒”。

### 8.1 默认艾宾浩斯间隔

默认间隔：

```text
0,1,2,4,7,15,30,60
```

含义：

* 第 0 次：当天；
* 第 1 次：1 天后；
* 第 2 次：2 天后；
* 第 3 次：4 天后；
* 第 4 次：7 天后；
* 第 5 次：15 天后；
* 第 6 次：30 天后；
* 第 7 次：60 天后。

### 8.2 初次标记

如果用户选择艾宾浩斯计划，默认：

```text
custom-homepage-review-plan="ebbinghaus"
custom-homepage-review-intervals="0,1,2,4,7,15,30,60"
custom-homepage-review-interval-index="0"
custom-homepage-review-count="0"
custom-homepage-review-next-date=用户选择的初次复习日期
```

### 8.3 完成本次后的计算

当用户点击“完成本次”：

1. 读取当前 `interval-index`；
2. 读取 `intervals`；
3. `nextIndex = currentIndex + 1`；
4. 如果 `nextIndex` 小于 intervals 长度：

   * `nextDate = 今天 + intervals[nextIndex] 天`；
   * 写回 `interval-index=nextIndex`；
   * 写回 `review-count + 1`；
   * 写回 `last-reviewed-at=now`；
   * 写回 `next-date=nextDate`。
5. 如果已经没有下一个 interval：

   * 弹出确认，让用户选择“结束复习”或“手动选择下次日期”。

### 8.4 自定义间隔

用户可以选择 `custom` 计划，自定义间隔字符串，例如：

```text
0,1,3,7,14,30
```

必须校验：

* 只能包含正整数和 0；
* 用英文逗号分隔；
* 自动去除空格；
* 最多 20 个间隔；
* 不允许负数；
* 不允许非数字；
* 不允许空字符串。

## 9. 思源数据库设计

复习日志数据库使用思源 Attribute View。参考现有：

```text
src/components/utils/widgetBlock/widget/countdown/countdownData.ts
src/components/utils/widgetBlock/widget/CYBMOK/cybmokData.ts
src/components/utils/widgetBlock/widget/fixedAssets/fixedAssetsData.ts
```

新增：

```text
src/components/utils/widgetBlock/widget/reviewDocs/reviewDocsData.ts
```

该文件负责：

* 读取数据库；
* 自动初始化字段；
* 写入复习日志；
* 读取统计信息；
* 兼容字段别名；
* 复用 checked API wrapper；
* 不直接在 Svelte 组件里写数据库细节。

### 9.1 数据库 ID

组件设置中提供：

```text
复习日志数据库 ID
```

同类复习文档组件应该共用数据库 ID。

需要扩展：

```text
src/components/utils/widgetBlock/widget/sharedDatabaseId.ts
```

把类型加入：

```ts
export type DatabaseWidgetType =
  | "fixedAssets"
  | "CYBMOK"
  | "focus"
  | "countdown"
  | "reviewDocs";
```

新增数据库 ID 字段：

```text
reviewDocsDatabaseId
```

如果当前组件没有填写数据库 ID，应尝试从同类组件配置中自动继承。

### 9.2 数据库字段

字段定义：

| 内部字段                  | 数据库字段名   | 类型     | 用途                                          |
| --------------------- | -------- | ------ | ------------------------------------------- |
| `title`               | `复习内容`   | block  | 主列，显示标题快照                                   |
| `logId`               | `日志ID`   | text   | 每条日志唯一 ID                                   |
| `reviewId`            | `复习计划ID` | text   | 对应自定义属性中的 review id                         |
| `targetId`            | `目标块ID`  | text   | 文档或块 ID                                     |
| `targetRootId`        | `所属文档ID` | text   | 块所属文档 ID                                    |
| `targetType`          | `目标类型`   | text   | doc/block                                   |
| `targetTitle`         | `标题快照`   | text   | 操作时的标题                                      |
| `targetPath`          | `路径快照`   | text   | 操作时的 hpath/path                             |
| `action`              | `操作`     | text   | create/review/postpone/update/finish/remove |
| `actionAt`            | `操作时间`   | text   | ISO 时间                                      |
| `previousDueDate`     | `原复习日期`  | text   | 操作前日期                                       |
| `nextDueDate`         | `下次复习日期` | text   | 操作后日期                                       |
| `reviewCountBefore`   | `原复习次数`  | number | 操作前次数                                       |
| `reviewCountAfter`    | `复习次数`   | number | 操作后次数                                       |
| `intervalIndexBefore` | `原间隔索引`  | number | 操作前索引                                       |
| `intervalIndexAfter`  | `间隔索引`   | number | 操作后索引                                       |
| `plan`                | `计划类型`   | text   | manual/ebbinghaus/custom                    |
| `intervals`           | `间隔配置`   | text   | 例如 0,1,2,4,7                                |
| `category`            | `分类`     | text   | 分类快照                                        |
| `priority`            | `优先级`    | text   | high/medium/low                             |
| `note`                | `备注`     | text   | 备注快照                                        |
| `createdAt`           | `创建时间`   | text   | 日志创建时间                                      |
| `archived`            | `已归档`    | text   | 默认 false                                    |

日志数据库原则：

* 只追加，不删除；
* 不用数据库判断当前是否待复习；
* 操作失败时不得写半条日志；
* 属性写入成功后再写日志；
* 如果日志写入失败，不要回滚已写入的属性，但要提示“复习计划已更新，日志记录失败”。

### 9.3 字段自动初始化

复用倒数日和赛博木鱼的实现方式：

* `getAttributeView`
* `getAttributeViewKeysByAvID`
* `addAttributeViewKeyChecked`
* `appendAttributeViewDetachedBlocksWithValuesChecked`
* `setAttributeViewBlockAttrWithCellChecked`

如果用户填写的数据库 ID 不存在或不是有效 Attribute View，应显示错误提示，不影响属性驱动的复习列表显示。

## 10. API wrapper 要求

当前 `api.ts` 的 `setBlockAttrs` 通过 `request()` 返回 `response.data`，而 `setBlockAttrs` 成功时可能返回 `data=null`。因此复习组件不要用返回值真假判断成功。

需要新增 checked wrapper：

```ts
export async function setBlockAttrsChecked(
  id: BlockId,
  attrs: { [key: string]: string }
): Promise<void> {
  const response = await requestRaw("/api/attr/setBlockAttrs", { id, attrs });
  if (response.code !== 0) {
    throw new Error(response.msg || "setBlockAttrs 失败");
  }
}
```

复习相关写属性、清属性必须使用 `setBlockAttrsChecked`。

保留旧 `setBlockAttrs` 不变，避免影响收藏文档等旧功能。

## 11. 查询逻辑

新增：

```text
src/components/utils/widgetBlock/widget/reviewDocs/reviewDocs.ts
```

负责：

* 查询带复习属性的文档和块；
* 解析 ial；
* 过滤到期/未来/全部；
* 排序；
* notebook 筛选；
* 搜索；
* 分类统计；
* 优先级统计。

### 11.1 SQL 查询

查询所有带复习日期的块：

```sql
SELECT
  id,
  parent_id,
  root_id,
  hash,
  box,
  path,
  hpath,
  name,
  alias,
  memo,
  tag,
  content,
  fcontent,
  markdown,
  length,
  type,
  subtype,
  ial,
  sort,
  created,
  updated
FROM blocks
WHERE ial REGEXP 'custom-homepage-review-next-date\\s*=\\s*"[0-9]{4}-[0-9]{2}-[0-9]{2}"'
ORDER BY updated DESC
```

再在 TypeScript 中解析 `ial`，不要把复杂逻辑全部放到 SQL 中。

### 11.2 日期过滤

支持这些视图：

| 视图   | 过滤条件                         |
| ---- | ---------------------------- |
| 今日到期 | `nextDate === today`         |
| 已逾期  | `nextDate < today`           |
| 待复习  | `nextDate <= today`          |
| 未来复习 | `nextDate > today` 且在未来天数范围内 |
| 全部   | 所有带有效复习日期的项目                 |

默认显示：

```text
待复习
```

### 11.3 排序

支持：

| 排序               | 说明          |
| ---------------- | ----------- |
| `dueAsc`         | 复习日期升序，逾期优先 |
| `priorityDesc`   | 高优先级优先      |
| `updatedDesc`    | 最近更新优先      |
| `createdDesc`    | 最近标记优先      |
| `reviewCountAsc` | 复习次数少的优先    |

默认：

```text
dueAsc
```

### 11.4 解析 ial

必须写独立 helper：

```ts
parseReviewAttrsFromIAL(ial: string): ReviewAttrs | null
```

不要在组件中散落正则。

需要支持转义和空值容错。

如果没有 `custom-homepage-review-id`，但有有效 `next-date`，可以生成临时 reviewId 并在用户下一次操作时补写属性。

## 12. 复习项目数据结构

建议定义：

```ts
export interface ReviewItem {
  id: string;
  rootId: string;
  parentId?: string;
  box: string;
  path: string;
  hpath: string;
  type: "doc" | "block";
  blockType: string;
  title: string;
  content: string;
  created: string;
  updated: string;
  attrs: ReviewAttrs;
  dueStatus: "overdue" | "today" | "future";
  overdueDays: number;
}
```

```ts
export interface ReviewAttrs {
  reviewId: string;
  nextDate: string;
  note: string;
  category: string;
  priority: "high" | "medium" | "low" | "";
  plan: "manual" | "ebbinghaus" | "custom" | "";
  intervals: number[];
  intervalIndex: number;
  reviewCount: number;
  lastReviewedAt: string;
  targetType: "doc" | "block" | "";
  createdAt: string;
  updatedAt: string;
}
```

## 13. 新增文件结构

新增目录：

```text
src/components/utils/widgetBlock/widget/reviewDocs/
```

新增文件：

```text
reviewDocs.svelte
reviewDocsSet.svelte
reviewDocs.ts
reviewDocsData.ts
reviewDocsDialog.svelte
reviewDocsTypes.ts
reviewDocsSchedule.ts
```

文件职责：

| 文件                        | 职责                   |
| ------------------------- | -------------------- |
| `reviewDocs.svelte`       | 主页组件 UI，展示列表、操作按钮、统计 |
| `reviewDocsSet.svelte`    | 组件设置                 |
| `reviewDocs.ts`           | 查询复习项目、解析属性、过滤排序     |
| `reviewDocsData.ts`       | 复习日志数据库读写和统计         |
| `reviewDocsDialog.svelte` | 加入/编辑复习计划弹窗          |
| `reviewDocsTypes.ts`      | 类型定义                 |
| `reviewDocsSchedule.ts`   | 艾宾浩斯/自定义间隔计算         |

## 14. 组件设置项

`reviewDocsSet.svelte` 支持：

| 设置项        | 默认值                  |
| ---------- | -------------------- |
| 组件标题       | `📚复习文档`             |
| 复习日志数据库 ID | 空                    |
| 显示数量       | 20                   |
| 默认视图       | `待复习`                |
| 显示未来项目     | true                 |
| 未来天数       | 7                    |
| 显示文档       | true                 |
| 显示块        | true                 |
| 显示备注       | true                 |
| 显示路径       | true                 |
| 显示统计卡片     | true                 |
| 默认排序       | `dueAsc`             |
| 启用悬浮预览     | true                 |
| 悬浮预览延迟     | 0.1                  |
| 默认艾宾浩斯间隔   | `0,1,2,4,7,15,30,60` |

免费用户进入设置项时显示锁定卡片，不显示真实配置。

## 15. 组件 UI 要求

### 15.1 顶部统计区

显示：

* 今日到期数量；
* 已逾期数量；
* 未来 7 天数量；
* 今日已复习数量；
* 总复习计划数量。

如果没有数据库 ID，今日已复习数量可以显示为 `--`，并提示“填写复习日志数据库 ID 后启用统计”。

### 15.2 筛选区

提供：

* 待复习；
* 今日；
* 逾期；
* 未来；
* 全部；
* 分类筛选；
* 优先级筛选；
* 搜索框。

### 15.3 列表项

每条复习项目展示：

* 类型图标：文档 / 块；
* 标题；
* 所属路径；
* 复习日期；
* 到期状态；
* 分类；
* 优先级；
* 复习次数；
* 备注；
* 计划类型；
* 操作按钮。

按钮包括：

```text
打开
完成本次
结束复习
推迟
选择下次
编辑
```

### 15.4 空状态

没有待复习内容时显示：

```text
暂无需要复习的内容。
你可以在文档树、文档标题或正文块右键菜单中选择「加入复习计划」。
```

免费用户显示会员锁定卡片。

## 16. 右键菜单设计

修改：

```text
src/index.ts
```

### 16.1 文档树菜单

在现有“主页插件”子菜单中加入：

```text
加入复习计划
取消复习计划
```

目标 ID 为文档 ID。

### 16.2 文档标题图标菜单

同文档树菜单。

### 16.3 正文块右键菜单

在现有任务编辑器菜单基础上，增加“主页插件”子菜单或合并进已有入口：

```text
主页插件
├─ 加入复习计划
└─ 取消复习计划
```

目标 ID 为块 ID。

### 16.4 菜单复用

不要复制三套逻辑。建议新增 helper：

```ts
private addHomepageReviewSubmenu(menu: any, target: ReviewMenuTarget): void
```

其中：

```ts
type ReviewMenuTarget = {
  id: string;
  type: "doc" | "block";
};
```

### 16.5 加入复习计划弹窗

点击“加入复习计划”后打开：

```text
reviewDocsDialog.svelte
```

传入：

```ts
{
  plugin,
  targetId,
  targetType,
  mode: "create" | "edit"
}
```

弹窗负责：

* 读取已有属性；
* 初始化表单；
* 保存属性；
* 写日志；
* 关闭弹窗；
* showMessage 成功或失败。

## 17. 加入/编辑复习计划弹窗

表单字段：

| 字段     | 控件           | 默认                   |
| ------ | ------------ | -------------------- |
| 复习日期   | 日期选择         | 今天                   |
| 复习计划   | select       | 手动                   |
| 艾宾浩斯间隔 | input        | `0,1,2,4,7,15,30,60` |
| 分类     | input/select | 空                    |
| 优先级    | select       | medium               |
| 备注     | textarea     | 空                    |

快捷日期：

```text
今天
明天
三天后
一周后
自定义
```

计划类型：

```text
手动计划
艾宾浩斯
自定义间隔
```

优先级：

```text
高
中
低
```

保存时写入全部复习属性。

## 18. 操作实现细节

新增 service 函数：

```ts
markReviewTarget(params)
updateReviewTarget(params)
completeReviewOnce(params)
finishReviewTarget(params)
postponeReviewTarget(params)
clearReviewTarget(params)
```

### 18.1 markReviewTarget

写入属性：

* review id；
* next date；
* note；
* category；
* priority；
* plan；
* intervals；
* interval index；
* count；
* target type；
* created at；
* updated at。

写入日志：

```text
action=create
```

### 18.2 completeReviewOnce

用于“完成本次”。

写入日志：

```text
action=review
```

根据 plan 计算下一次日期。

如果有下一次：

* 更新 next date；
* count + 1；
* interval index + 1；
* last reviewed at；
* updated at。

如果没有下一次：

* 弹确认；
* 用户选择结束复习则调用 finishReviewTarget；
* 用户选择继续则打开日期选择。

### 18.3 finishReviewTarget

用于“结束复习”。

执行：

* 写日志 `action=finish`；
* 清空所有复习属性。

### 18.4 postponeReviewTarget

用于“推迟”。

执行：

* 修改 next date；
* updated at；
* 写日志 `action=postpone`。

### 18.5 updateReviewTarget

用于编辑计划。

执行：

* 修改对应属性；
* 写日志 `action=update`。

### 18.6 clearReviewTarget

用于“取消复习计划”。

执行：

* 写日志 `action=remove`；
* 清空所有复习属性。

## 19. 日志写入失败处理

复习状态的第一优先级是目标文档或块的自定义属性。

因此：

* 属性写入失败：操作失败，不写日志；
* 属性写入成功但日志写入失败：操作视为成功，但提示日志记录失败；
* 清空属性成功但日志失败：复习计划仍应被移除；
* 数据库 ID 为空：操作正常执行，只是不记录日志；
* 数据库字段初始化失败：操作正常执行，只提示统计不可用。

## 20. 组件注册

修改：

```text
src/components/utils/widgetBlock/widgetMountRegistry.ts
```

新增 import：

```ts
import reviewDocs from "./widget/reviewDocs/reviewDocs.svelte";
```

注册：

```ts
"reviewDocs": reviewDocs
```

加入 `widgetNeedsPlugin`：

```ts
"reviewDocs"
```

## 21. 设置页接入

修改：

```text
src/components/utils/widgetBlock/contentSetting.svelte
```

新增 import：

```ts
import ReviewDocsSet from "./widget/reviewDocs/reviewDocsSet.svelte";
```

新增状态变量：

```ts
let reviewDocsTitle = $state("📚复习文档");
let reviewDocsDatabaseId = $state("");
let reviewDocsLimit = $state(20);
let reviewDocsDefaultView = $state("due");
let reviewDocsShowFuture = $state(true);
let reviewDocsFutureDays = $state(7);
let reviewDocsShowDocs = $state(true);
let reviewDocsShowBlocks = $state(true);
let reviewDocsShowNote = $state(true);
let reviewDocsShowPath = $state(true);
let reviewDocsShowStats = $state(true);
let reviewDocsSortBy = $state("dueAsc");
let reviewDocsShowFloatDoc = $state(true);
let reviewDocsFloatDocShowTime = $state(0.1);
let reviewDocsDefaultIntervals = $state("0,1,2,4,7,15,30,60");
```

加载已有配置时读取这些字段。

保存时写入：

```ts
contentTypeJson = {
  activeTab,
  type: "reviewDocs",
  blockId: currentBlockId,
  data: {
    reviewDocsTitle,
    reviewDocsDatabaseId,
    reviewDocsLimit,
    reviewDocsDefaultView,
    reviewDocsShowFuture,
    reviewDocsFutureDays,
    reviewDocsShowDocs,
    reviewDocsShowBlocks,
    reviewDocsShowNote,
    reviewDocsShowPath,
    reviewDocsShowStats,
    reviewDocsSortBy,
    reviewDocsShowFloatDoc,
    reviewDocsFloatDocShowTime,
    reviewDocsDefaultIntervals
  }
}
```

同时更新 `syncCurrentDatabaseWidgetConfig` 和 `resolveSelectedDatabaseIdIfNeeded`，支持 `reviewDocs` 共享数据库 ID。

## 22. 样式要求

所有样式必须限定在组件局部类名下，例如：

```scss
.review-docs-widget { ... }
.review-docs-card { ... }
.review-docs-toolbar { ... }
```

不得写全局：

```scss
.b3-button { ... }
body { ... }
:root { ... }
.protyle { ... }
```

可以使用思源主题变量：

```scss
var(--b3-theme-background)
var(--b3-theme-surface)
var(--b3-theme-primary)
var(--b3-border-color)
var(--b3-list-hover)
```

不确定存在的变量必须提供 fallback。

## 23. 打开文档/块

文档项目：

```ts
openDocs(plugin, item.id, 0)
```

块项目：

第一版先打开 `rootId` 所属文档：

```ts
openDocs(plugin, item.rootId, 0)
```

如果项目已有稳定的定位到块能力，可以增强为打开文档后定位块；如果没有，不要为了定位块引入不稳定 hack。

## 24. 安全和异常处理

必须处理：

* 目标块不存在；
* 目标文档被删除；
* 复习日期格式错误；
* 自定义间隔格式错误；
* 数据库 ID 为空；
* 数据库 ID 错误；
* 数据库字段缺失；
* SQL 查询失败；
* 属性写入失败；
* 日志写入失败；
* 免费用户调用菜单写入；
* 移动端打开文档。

被删除的目标：

* 如果 SQL 查不到该块，自然不会显示；
* 数据库历史记录保留，不主动清理。

## 25. 不做的内容

本轮明确不做：

* 不接入思源闪卡；
* 不读取 Riff 数据；
* 不调用思源 internal flashcard API；
* 不读写 `data/storage` 闪卡文件；
* 不开发 AI Skill；
* 不接入 Agent；
* 不自动扫描全文生成复习计划；
* 不自动修改用户正文内容；
* 不把复习状态只存数据库；
* 不把完成状态写成 `false` 或 `done=true`；
* 不对免费用户开放真实功能。

## 26. 需要修改的文件清单

新增：

```text
docs/review-docs-component-plan.md
src/components/utils/widgetBlock/widget/reviewDocs/reviewDocs.svelte
src/components/utils/widgetBlock/widget/reviewDocs/reviewDocsSet.svelte
src/components/utils/widgetBlock/widget/reviewDocs/reviewDocs.ts
src/components/utils/widgetBlock/widget/reviewDocs/reviewDocsData.ts
src/components/utils/widgetBlock/widget/reviewDocs/reviewDocsDialog.svelte
src/components/utils/widgetBlock/widget/reviewDocs/reviewDocsTypes.ts
src/components/utils/widgetBlock/widget/reviewDocs/reviewDocsSchedule.ts
```

修改：

```text
src/api.ts
src/index.ts
src/components/utils/widgetBlock/widgetMountRegistry.ts
src/components/utils/widgetBlock/contentSetting.svelte
src/components/utils/widgetBlock/widget/sharedDatabaseId.ts
src/components/tools/siyuanIcon.ts
```

如需要复用图标，可只用已有图标，不强制新增 SVG。

## 27. 实现完成后的标准

实现完成后应达到：

1. 会员用户可以创建复习文档组件；
2. 免费用户只能看到会员锁定提示；
3. 会员用户可以从文档树标记文档复习；
4. 会员用户可以从文档标题菜单标记文档复习；
5. 会员用户可以从正文块右键标记块复习；
6. 复习属性写入目标文档或块；
7. 主页组件能查出到期项目；
8. 主页组件能区分文档和块；
9. 主页组件能显示备注、分类、优先级、复习次数、到期状态；
10. 可以完成本次并自动计算下一次复习日期；
11. 可以结束复习并清空所有复习属性；
12. 可以推迟到指定日期；
13. 可以编辑计划；
14. 可以取消复习计划；
15. 可以把操作记录写入复习日志数据库；
16. 数据库不可用时，属性驱动的复习功能仍可用；
17. 不影响收藏文档、倒数日、赛博木鱼、固定资产、强化日记、AI 知识库等已有功能。

## 28. 开发注意事项

实现时必须优先复用现有模式：

* 收藏文档组件的属性查询方式；
* 倒数日组件的数据库字段初始化方式；
* 赛博木鱼组件的会员锁定方式；
* 固定资产组件的复杂表单和数据库统计方式；
* sharedDatabaseId 的同类组件数据库 ID 共享方式；
* openDocs 的文档打开方式；
* svelteDialog 的弹窗方式。

不要为了这个组件重构主页组件系统。

不要改变旧组件配置格式。

不要修改全局 `request()` 语义。

属性写入必须使用新增 checked wrapper。

所有新增功能都应尽量内聚在 `reviewDocs` 目录下。

## 29. 建议提交说明

最终提交说明可以写：

```text
feat(widget): add premium review docs component

- add review docs widget for manually scheduled document/block reviews
- store active review state in custom block attributes
- record review actions into optional Attribute View database
- support Ebbinghaus/custom interval scheduling
- add premium gating for settings, runtime and context menu actions
- add review plan dialog and review list actions
```
