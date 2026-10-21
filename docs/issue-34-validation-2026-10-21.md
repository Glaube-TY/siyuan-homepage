# Issue #34 内部验收记录

- 日期：2026-10-21（Asia/Shanghai）。
- Issue：https://github.com/Glaube-TY/siyuan-homepage/issues/34。
- 起点：`main`，`e71da0f4b60a74bbb458ef3d90748dd010a9f04d`，工作区干净，版本 5.1.11。
- 不改版本号、存储结构或业务数据，不创建 tag/Release，不上传或替换已发布产物，不部署正式插件，不关闭或评论 Issue。

## 附件与真实环境边界

Issue 正文和两张附件链接已取得。图片读取被重定向后的资源访问限制阻断；备用浏览器入口也未能取得图片。因此不能从截图确认用户主题、融合方式细节或实际组件高度。正文的第二张图片标注宽度 184，不等同于已测得实际容器宽度。

CodeGraph 已查询相关组件和调用关系。Chrome DevTools / Playwright MCP 的默认 Chrome 通道缺少 Chrome 可执行文件；本机未发现运行中的 SiYuan 客户端。改用本机已有 Edge 的隔离无头浏览器验证生产 Svelte 组件和主题 SCSS，使用合成歌曲、封面和主题参数，不读取或修改用户主页、播放器或正式存储。这是浏览器组件验收，不是已安装插件的真实 SiYuan 验收。

## 横幅按钮根因与修复

设置控件的 input 回调、草稿签名、自动保存、保存字段、配置归一化读取和主页热更新链路均包含 `bannerButtonColor`，问题在呈现链路：

1. 只有 Classic 从主页运行时兼容配置取得按钮颜色，并在主题容器注入 `--homepage-banner-button-color`。卡片、纸张、手绘、科技主题支持 `data-banner-content="all"`，却没有取得此变量，落到共享规则的白色回退。
2. 共享规则原先只设置前景色；Classic 的 flat/glass 交互规则优先级更高，会重新设置 hover/focus 前景，边框也仍受主题规则控制。浅色文字、图标与较淡边框在明亮横幅上辨识度不足。

主页根节点现在以现有 CSS 变量传递当前按钮颜色，保留 Classic 原有兼容映射。共享规则只作用于融合横幅内的快捷按钮和状态语刷新按钮，用局部选择器覆盖默认、hover、focus-visible、disabled 的颜色与边框；SVG 继续继承 currentColor。增加文字、图标和边缘的暗色阴影以及键盘焦点轮廓，不重写用户选择的颜色；保留主题背景及禁用透明度。手绘按钮的既有蒙版边缘也继承当前颜色。无新增 `!important`，溢出菜单条目和非融合布局不受此规则影响。标题、状态语文本和配置保持原状。

受影响的非经典主题为 `builtin.card`、`builtin.paper`、`builtin.hand-drawn`、`builtin.technology`；Classic 的颜色兼容机制保留并修复其交互样式覆盖。`builtin.simple-test` 不支持横幅融合，不在适用范围。附件中的实际主题未知。

## 微型播放器

- micro 采用左侧 `2.5rem` 封面、右侧歌曲信息；16px 根字号下封面为 40×40 CSS px。
- 184×180、220×180、280×180 CSS px 均验证封面和原有控制可见。还验证 184×144、184×120；低高度时控制分组共享一行，保留播放/暂停、前后切歌、详情和队列入口。
- 184×80 验证核心控制和详情/队列入口可用，此高度隐藏封面、信息与进度。以 16px 根字号计，高度低于 112px 时主动隐藏这些内容；建议封面布局至少使用 184×120，常规布局使用 184×180 或更大。没有声称更小宽度可容纳所有控制。
- micro 下 showCover=false 隐藏封面按钮并收回其网格列；无封面时沿用原有 musicNote 占位图标；封面点击仍调用原有详情入口。full/compact 的主要布局及原有 showCover 呈现保持不变。
- 超长标题省略；复用 currentTrack.coverObjectUrl，未增加下载、解析、缓存、轮询、计时器或 ResizeObserver。原有基于 border-box 的单一观察器和标准 padding 归一化算法不变。

## 验证结果

- `pnpm verify:music-player-mini-layout`：通过。扩展窄宽度、低高度、有无封面、showCover 开关和长标题渲染检查；保留原有尺寸反馈、RAF 去重和生命周期回归。
- `node scripts/verify-homepage-banner-buttons.mjs`：通过。覆盖编辑/自动保存/归一化读取/根节点传递契约、Classic 三种按钮样式映射、四个融合主题入口、颜色原值保留及融合规则作用域。
- Edge，deviceScaleFactor=1.5：32 组播放器布局状态通过（8 个尺寸 × 亮/暗主题变量 × showCover 开/关），包括 360×320 compact 和 500×500 full。检查所有播放及详情/队列按钮未被卡片裁切，短布局控制不重叠；封面点击和播放/前后切歌回调通过。
- Edge：224 组横幅按钮状态通过，涉及五个融合主题、Classic default/flat/glass、融合/非融合、深色/白色用户颜色、快捷/刷新按钮、默认/hover/focus/disabled。融合状态的文字、SVG color/fill 与边框均为用户指定色。非融合结果比较通过（允许原有颜色过渡的微小插值误差）。
- 六次合成切歌及有无封面的异步更新未引发布局模式 class 反复变化；原有固定外框反馈回归通过。此结论限定于隔离组件和现有专项测试，不等同真实音频设备、正式库和长期使用验收。
- `pnpm typecheck`、`pnpm lint`：通过。仓库 lint 按现有配置排除 Svelte；Svelte 通过专项编译及生产 app 构建检查。
- 唯一一次 `SIYUAN_SKIP_DEV_DEPLOY=1 pnpm build`：通过，包含 robot providers、app、kernel 和仓库内 dev 目录同步；app 37.79 秒、kernel 3.12 秒。日志无正式插件目录部署记录，未产生新的构建警告。
- 最终 `git status --short`、`git diff --stat`、`git diff --check` 已核对：仅本轮三个源码、两个验证脚本和本报告；已有文件保持 LF，无 BOM/编码重写。版本文件和锁文件未变。普通提交及远端 SHA 校验结果见本轮最终交付回执。

本轮不执行无关专项测试、真实音频/网络封面加载或正式客户端配置切换。没有真实 SiYuan UI 验收结论；不会以合成组件验收代替它。
