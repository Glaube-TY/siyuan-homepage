# 前端设计与 UI Agent 规范

> 本文件定义本项目稳定的视觉原则、UI/UX 约束、Agent Skill 调度方式以及设计规则维护方式。
>
> 本文件只在任务涉及前端 UI、布局、主题、样式、交互、动效、响应式、无障碍或前端体验时读取。纯业务逻辑、数据处理、同步、后端、构建脚本、测试或与界面无关的任务不得无条件加载本文件。
>
> 本文件不是具体功能实现文档。具体业务规则应放在其他 docs/agent/ 文档中。

---

# 1. 规则优先级

处理 UI 任务时，按以下优先级执行：

1. 用户当前明确要求
2. 当前项目已经确认并实际使用的设计语言
3. 本 DESIGN.md
4. 当前代码中的已有组件、Design Token 与交互模式
5. Agent Skills / MCP 给出的通用建议
6. Agent 自身默认设计偏好

任何 Skill 都只是辅助设计和审查工具，不得覆盖用户要求或破坏项目已经建立的视觉体系。

不得因为 Skill 建议某种设计，就无理由将现有界面整体改造成另一种设计语言。

开始 UI 修改前，还必须检查现有主题引擎、Widget Presentation manifest、共享区域、Design Token 和实际主题实现；不得另建平行布局、主题或组件适配层。

---

# 2. 本项目的设计定位

本项目属于产品型应用、工作台、Dashboard 或桌面软件，而不是营销型 Landing Page。

设计目标优先级：

1. 清晰
2. 高效
3. 一致
4. 稳定
5. 可维护
6. 精致
7. 视觉表现力

“高级感”不得以牺牲信息效率、操作效率或长期维护性为代价。

界面应该让用户感觉这是一个成熟的软件产品，而不是一张视觉海报。

---

# 3. 核心视觉原则

## 3.1 克制而不是平庸

允许存在明确的视觉个性，但避免：

* 大面积无意义渐变
* 过量玻璃拟态
* 所有内容全部卡片化
* 每一级内容都有边框
* 大量装饰性阴影
* 无意义发光
* 为视觉效果牺牲信息密度
* 典型 AI 生成页面的紫蓝渐变、超大圆角和大标题模板
* 每个区域都拥有不同的视觉语言

设计重点应放在：

* 排版
* 信息层级
* 间距
* 对齐
* 密度
* 状态
* 交互反馈
* 细节一致性

## 3.2 功能层级必须高于装饰层级

用户首先应该看到：

* 当前在哪里
* 当前可以做什么
* 最重要的内容是什么
* 当前状态是什么
* 下一步操作是什么

装饰元素不得抢夺主要功能的注意力。

## 3.3 减少“卡片套卡片”

卡片只用于表达真正独立的内容单元或层级。

如果仅通过留白、分组、字号、字重、背景层级或分隔线就能够建立结构，不应额外添加边框和卡片容器。

## 3.4 主题与业务边界

主题只改变呈现，不改变组件数据、布局、顺序、大小、持久化区域或业务状态。

样式只能挂在插件根容器、功能容器或组件局部类上。禁止无作用域覆盖 body、:root、.layout、.b3-*（包括 .b3-button、.b3-text-field、.b3-switch）或其他插件。

不生成雷达、仪表盘、扫描线数据等假业务信息，不使用远程视觉资源，不维护与真实主页不一致的预览界面。原生完整形状组件不强行套统一壳层。

---

# 4. Design Token

Agent 修改 UI 前应首先检查项目现有 Token、CSS Variables、主题变量和组件系统。

不得在已有 Design Token 的项目中随意写入新的孤立颜色、圆角或阴影值。

复用思源变量前必须确认其真实存在且稳定；不确定的 --b3-* 变量必须提供 fallback。自定义 Token 使用插件专属前缀。

推荐维护以下 Token：

## Color

* background
* surface
* surface-secondary
* surface-hover
* border
* border-strong
* text-primary
* text-secondary
* text-muted
* accent
* accent-hover
* success
* warning
* danger
* info

## Radius

保持有限数量的圆角级别。

例如：

* small
* medium
* large

不要一个页面同时出现大量不同圆角。

## Spacing

优先使用统一间距阶梯。

不得通过大量随机 5px、11px、17px、23px 修补布局。

## Typography

至少区分：

* 页面标题
* 区域标题
* 正文
* 辅助文字
* 标签
* 数据
* 操作文字

同层级文字保持一致。

---

# 5. 布局原则

工作台和应用类界面优先保证稳定布局。

## 导航

导航应该稳定、可预测。

不得为了“现代感”频繁改变导航位置或隐藏核心入口。

## 内容区域

复杂页面优先建立：

* 页面级
* Section 级
* Component 级

三级层次。

避免所有内容处于同一视觉平面。

## 信息密度

应用类软件允许比官网更高的信息密度。

不要为了“呼吸感”将正常工作界面拉成巨大的空白页面。

## 组件呈现契约

主题只识别稳定的呈现类别，不按业务组件名称堆叠选择器：

| 类别 | 含义 | 现有示例 |
| --- | --- | --- |
| collection | 重复条目、卡片或时间线内容流 | 最近文档、收藏、任务、最近日记 |
| metrics | 少量关键数字和短标签 | 天气、统计卡片 |
| visualization | 图表、热力图、数据画布或查询结果 | 热力图、SQL、图表 |
| editorial | 阅读、书写或长文本 | 自定义文档、便签、每日一句 |
| media | 图片、封面或播放内容 | 图片轮播、音乐播放器 |
| control | 单一目标明确的交互工具 | 专注计时、倒计时、赛博木鱼 |
| embedded | 外部页面或隔离运行时 | 网页浏览器 |
| workspace | 多区域、多状态的复合工作台 | 固定资产、强化日记、记账、AI 知识库 |
| intrinsic | 自带完整造型，不适合强制包卡片 | 仿真时钟、黄历 |

展示变体只登记会改变视觉骨架的稳定模式，例如标准、紧凑、沉浸、经典或仿真表盘。筛选、颜色、排序等业务配置不进入主题变体。

主题解析顺序固定为：变体 → 组件覆盖 → 类别 → 通用回退。

---

# 6. 交互原则

任何交互都必须拥有明确状态：

* default
* hover
* active
* focus
* disabled
* loading
* success
* error

如果存在异步行为，还应考虑：

* empty
* skeleton
* retry
* partial failure

不得只实现理想状态。

普通插件 UI 中唯一的会员标识是 PremiumMark，不使用 Emoji Crown 或文字 badge。

凡是用户可选择的 Premium 能力，都要在选择点逐项标识；父级 Premium 不取消子级可选择 Premium 项的标识。混合免费/Premium 控件必须在选择前显示各 Premium 选项。

PremiumMark 只提供视觉信息，真正的权限仍由 entitlement/runtime 控制。

---

# 7. 动效原则

动效服务于：

* 状态变化
* 空间关系
* 层级变化
* 操作反馈
* 注意力引导

不得为了“高级感”给所有元素加入动画。

优先：

* opacity
* transform
* scale
* lightweight transition

谨慎使用：

* 大面积 blur
* filter
* box-shadow 动画
* layout thrashing
* 长时间 spring

一般微交互应短而自然。

如果删除动画不会降低用户理解，则应认真考虑是否需要该动画。

必须尊重 prefers-reduced-motion。

---

# 8. 响应式原则

不得只验证当前开发窗口。

至少考虑：

* 标准桌面
* 较窄桌面
* 高 DPI
* 长文本
* 不同系统字体渲染
* 内容溢出

如果项目支持移动端，还必须验证：

* 手机纵向
* 手机横向
* 平板

响应式不是简单缩小组件，而是重新判断：

* 内容优先级
* 信息密度
* 导航方式
* 操作方式

响应式布局按容器空间处理，不用设备视口猜测组件空间。科技主题使用 @container hp-homepage。

---

# 9. 可访问性

至少检查：

* 键盘导航
* focus 状态
* 对比度
* semantic HTML
* Button 与 Link 语义
* Form Label
* ARIA
* 图标按钮可识别名称
* 可点击区域尺寸
* reduced motion

不能仅依靠颜色表达状态。

---

# 10. Agent Skill 调度规则

## 核心原则

不得每次 UI 任务无差别调用全部 Skills。

先判断任务类型，再选择对应 Skill。

通常一轮任务中的“设计阶段”选择 1～3 个 Skill 即可。

审查与验证阶段可以额外调用审查类工具。

不得为了使用 Skill 而制造改动。Skill 不得替代真实代码阅读、项目规则或运行时验证。

---

# 11. 各 Skill 职责

## ui-ux-pro-max

定位：UI/UX 设计系统顾问。

主要负责：

* UI 风格选择
* 配色
* Typography
* Design System
* 页面结构
* UX 模式
* 信息密度
* 通用设计规范

适合：

* 新页面
* 大范围界面重构
* 设计系统不明确
* 配色或排版需要重新确定

不应单独负责最终工程实现。

## frontend-design

定位：视觉设计负责人。

主要负责：

* 整体视觉方向
* 视觉层级
* 构图
* 页面辨识度
* 避免模板化 AI UI
* 建立明确但克制的设计观点

对于产品型应用，应限制其视觉自由度。

不得为了追求“独特”破坏：

* 功能效率
* 信息密度
* 已有设计系统
* 组件一致性

## frontend-ui-engineering

定位：前端 UI 工程实现负责人。

主要负责：

* 组件拆分
* 状态管理边界
* 可维护性
* 响应式实现
* Accessibility
* 错误与 Loading 状态
* 工程质量
* 交互完整性

视觉方案确定后，优先由该 Skill 指导真正的代码实现。

## impeccable

定位：系统级 UI 精修与 critique。

适合设计基本完成之后运行。

主要检查：

* hierarchy
* spacing
* typography
* color
* consistency
* responsive
* accessibility
* interaction quality
* polish

不应用于完全推翻已经确认的设计方向。

## make-interfaces-feel-better

定位：最后 10% 的微观精修。

重点关注：

* 光学对齐
* 圆角
* 阴影
* hit area
* hover
* 图标
* 字体细节
* 间距
* 微交互

主要用于重要页面的最终 polish。

## animate

定位：动效设计。

只有存在明确动效需求时使用。

负责：

* easing
* duration
* spring
* enter / exit
* transition
* micro interaction
* motion hierarchy

不得默认启动。

## web-design-guidelines

定位：UI/UX 上线审查。

在实现完成后使用。

负责：

* 可访问性
* 表单
* focus
* Typography
* UX
* Interaction
* Responsive
* Web 基础设计规范

它属于 Review Skill，而不是主设计 Skill。

## vercel-react-best-practices

定位：React / Next.js 性能与工程审查。

React 项目在功能或 UI 改动较大时使用。

重点关注：

* 不必要重渲染
* 请求瀑布
* bundle
* 状态边界
* caching
* client/server boundary
* rendering performance

非 React 项目跳过。

## baseline-ui

定位：基础 UI 规则纠偏。

适合：

* Tailwind
* shadcn
* UI 基础质量不稳定
* 页面出现明显 AI 模板化问题

它是约束型 Skill。

如果项目已经拥有成熟设计系统，不需要每次运行。

---

# 12. MCP 使用规则

## shadcn

用于：

* 查询现有组件
* 查看组件 API
* 安装标准组件
* 查找可组合 primitives

优先复用成熟组件，而不是无意义重复造轮子。

但不得因为 shadcn 中存在某组件，就强迫项目全部使用默认 shadcn 视觉样式。

## 21st

定位：

* UI 灵感
* 高质量组件参考
* 页面结构参考

原则：“参考实现”，不是“复制视觉”。

不得未经分析直接把第三方组件样式插入项目。

如果缺少 API_KEY_21ST，直接跳过，不得阻塞任务。

## Playwright

定位：真实页面验收。

用于验证：

* 页面是否正常渲染
* DOM 状态
* 用户流程
* 点击
* 表单
* Dialog
* Responsive
* Overflow
* Keyboard interaction

UI 修改完成后，如果环境允许，应优先进行真实浏览器验证。

## Chrome DevTools

定位：运行时与性能诊断。

重点检查：

* Console
* Network
* Layout
* Runtime error
* Performance
* CSS
* DOM
* Rendering

发现异常时必须根据实际运行结果修复，不得仅凭源码推测。

---

# 13. 推荐工作流

## A. 新页面 / 大范围 UI 重构

执行顺序：

1. 阅读本文件
2. 阅读相关真实代码与现有 UI
3. 确认现有 Design Token 与组件体系
4. ui-ux-pro-max
5. frontend-design
6. 输出简短设计计划
7. frontend-ui-engineering
8. 必要时使用 shadcn / 21st
9. 实现代码
10. impeccable
11. 必要时 make-interfaces-feel-better
12. 有真实动效需求时 animate
13. web-design-guidelines
14. React 项目执行 vercel-react-best-practices
15. 必要时 baseline-ui
16. Playwright 实际验收
17. Chrome DevTools 检查
18. 修复发现的问题
19. 执行项目规定的类型检查、Lint、Build 和测试

不应因为工作流存在就机械执行全部步骤；按任务范围选择必要步骤。

## B. 小范围 UI 修改

例如：

* 一个 Button
* 一个 Dialog
* 一处间距
* 一处布局
* 一个状态样式

无需运行完整设计链。

优先：

1. 阅读本文件相关部分
2. 检查邻近代码
3. 遵循已有组件和 Token
4. 修改
5. 必要时运行 make-interfaces-feel-better
6. 浏览器验证

## C. 纯视觉精修

优先：

1. impeccable
2. make-interfaces-feel-better
3. 必要时 animate
4. web-design-guidelines
5. 浏览器验收

不得擅自改变业务功能。

## D. 性能优化

优先：

1. 检查真实性能问题
2. React 项目使用 vercel-react-best-practices
3. Chrome DevTools
4. Playwright 回归测试

不得为了理论上的性能优化牺牲可维护性。

---

# 14. 禁止事项

Agent 不得：

* 一次性无差别调用全部 Skills
* 为了使用 Skill 而制造改动
* 未阅读真实代码就重构 UI
* 私自更换整个设计体系
* 私自引入大型 UI Framework
* 私自升级前端框架
* 私自替换项目现有组件库
* 把第三方示例直接复制进产品
* 因 Skill 建议而覆盖用户明确要求
* 为“高级感”添加无意义动画
* 使用大量随机 magic number 修补布局
* UI 修改过程中顺便重构无关业务逻辑
* 未经要求安装或升级新的 Skill / MCP

---

# 15. DESIGN.md 维护规则

本文件描述的是“长期有效规则”，不是开发日志。

## 应该更新本文件的情况

出现以下情况时，应考虑更新：

* 用户确认新的长期视觉方向
* 主色或 Design Token 发生正式改变
* Typography 系统正式改变
* 圆角、阴影、间距体系发生正式改变
* 新增全局组件模式
* 导航体系发生正式改变
* 新增正式动效规范
* 响应式策略发生变化
* 引入新的长期 UI Skill
* 删除或替换已有 UI Skill
* MCP 工作流改变
* 多次重复出现的 UI 决策已经成为项目标准

## 不应该更新的情况

以下内容不进入本文件：

* 一次性页面特殊处理
* 临时实验
* Bug 修复记录
* 某一个组件的具体实现
* 某个函数名
* 某一版本短期兼容代码
* 未确认采用的设计想法

这些内容应留在代码、Issue、CHANGELOG 或对应功能文档中。

---

# 16. 更新原则

修改本文件时必须：

1. 检查新规则是否与旧规则冲突
2. 冲突时修改旧规则，而不是不断追加例外
3. 删除已经失效的规则
4. 保持规则简洁
5. 保持 Skill 职责不重叠
6. 不记录 Skill 的短期版本号
7. 不把整个第三方 Skill 文档复制进来
8. 只记录“本项目为什么使用它以及什么时候使用它”

随着项目发展，本文件应该越来越准确，而不是越来越庞大。

---

# 17. 项目专属设计信息

本节用于记录当前项目已经正式确认的视觉标准。

如果尚未确认某项，保持为空，不得自行猜测。

## Brand / Accent

* 主色：
* 强调色：
* 成功：
* 警告：
* 错误：

## Typography

* UI 字体：
* 数据/代码字体：
* 标题规则：

## Radius

* Small：
* Medium：
* Large：

## Spacing

* 基础间距单位：
* 页面 Padding：
* Section 间距：

## Surface

* 页面背景：
* 一级 Surface：
* 二级 Surface：
* Border：

## Motion

* 默认 duration：
* 默认 easing：
* 页面切换：
* Dialog：
* Hover：

## 特殊约束

*
*
*

Agent 在项目已经存在实际 Token 时，应以真实代码为基础填写或更新本节，不得凭空创建一套与代码脱节的设计系统。

---

# 18. 项目现有主题与验证边界

## 科技主题

* 使用现有 --hp-tech-* 语义 Token；视觉基调是深蓝黑、青色主强调和少量琥珀重点。
* 低对比网格或静态装饰不能承载虚构数据。
* 普通内容组件按 technology.hud 和既有呈现类别适配；PicCaro、timedate.dial 等自带完整形状的组件不套 HUD 壳层。
* 不新增按业务名称分支。
* 主题访问级别、经典主题优先、名称、预览和无远程资源要求以设计契约为准；切换主题不得改变布局数据。
* 需要具体色值、间距、动效和主题契约时，再读取 docs/design/homepage-technology-theme/，不要把设计数值复制到根规则或每个组件。

## 验收边界

主题相关改动按影响范围运行 `pnpm typecheck`、`pnpm lint` 和生产构建；只改其他领域时不要运行这些检查。

UI 规则文档的更新本身只需执行 git diff --check；不要因为文档修改触发无关的 UI 构建。
