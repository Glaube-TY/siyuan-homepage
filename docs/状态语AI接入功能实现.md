当前阶段新增功能：主页状态语支持 AI 智能生成，并抽出可复用的大模型文本生成能力，为后续主页组件调用 AI 打基础。

请先阅读项目第一铁律和真实代码，再开始判断和修改，除非你 100% 确定不用看代码。必须使用 codegraph 理解真实代码结构和调用关系。

第一铁律必须严格遵守：

代码只是通用 Agent Workbench 脚手架，不是业务流程控制器；
Planner 才是唯一业务决策者；
Tool 只是全局独立能力，只校验参数、执行动作、返回 observation；
Skill 只是中文能力说明包，只能说明能力边界、证据原则和通用使用策略，不能拥有工具、绑定工具、规定固定步骤，也不能写具体场景、问题类型、题材领域、关键词触发或固定工具流程；
测试用例可以具体，但不能固化进 Skill、Prompt、Tool 描述或代码逻辑。

本轮功能不是 Agent Workbench 功能，不新增 Tool，不新增 Skill，不接入 Planner，不进入 Observation，不改知识库问答流程。

本轮目标：

1. 主页状态语支持两种模式：

   * 自定义：沿用当前已实现的变量模板能力；
   * AI 智能生成：会员专属，调用用户选择的大模型生成状态语。

2. 在主页设置的“标题 / 状态语”区域增加模式选择：

   * 自定义；
   * AI 智能生成，标注会员专属，但不要用表情符号图标。

3. AI 智能生成模式下：

   * 用户可以填写状态语生成提示语，用来控制风格和格式；
   * 用户可以设置 AI 返回字符上限；
   * 传给 AI 的必须是已经计算好的真实数据，例如当前日期、第一篇笔记日期、笔记本数量、文档数量、块数量、任务数量等；
   * 不要把 `{{docsCount}}` 这类变量名传给 AI；
   * AI 只返回纯文本状态语；
   * 不输出 HTML；
   * 不要求 Markdown；
   * 不读取正文；
   * 不调用 Agent；
   * 不调用 Tool。

4. 在主页设置的“AI 知识库”标签中增加“状态语 AI 模型”设置：

   * 从已经配置的大模型中选择；
   * 独立于聊天问答当前模型；
   * 提供“思考模式”开关；
   * 若没有配置可用大模型，要在这里提示用户去“AI 知识库设置 → 大模型配置”添加模型；
   * 若状态语设置中启用了 AI 模式但没有可用模型，也要给出清楚提示。

5. 对需要添加图标的位置，必须使用思源内置图标：

   * 使用已有 `SiyuanIcon` 组件；
   * 不要新增表情符号图标；
   * 不要在新 UI 标题里写 `👑`、`🤖`、`✨` 之类表情符号。
   * 如果本轮顺手修改了 `AiKnowledgeBaseSettingsTab.svelte` 里现有的 `开启侧边栏对话👑`、`开启标签页对话👑` 文案，可以改成纯文字 + `SiyuanIcon name="vip"`，但不要扩大重构范围。

6. 状态语 AI 调用要使用通用大模型文本生成能力：

   * 不要直接导入或调用 `llm-client.ts`；
   * 只能通过现有公开入口 `callModelText()` 或新增的轻量封装调用；
   * 新封装要能给未来主页组件复用；
   * 这个封装不能知道 Agent、Tool、Skill、Planner。

7. 要做好缓存和回退：

   * 不要每次 Svelte 组件重新渲染都请求模型；
   * 同一组配置和统计数据在本次主页会话中应复用生成结果；
   * 打开主页时可生成一次；
   * 保存设置后配置变更再重新生成；
   * 生成失败时回退到自定义状态语或默认状态语；
   * 未开会员时不调用模型；
   * 未配置模型时不调用模型。

8. 修改必须使用 diff 模式。

9. 所有新增或调整的 import 必须是静态顶部 import。

10. 禁止动态 import / require。

11. 优先复用现有实现。

12. 不要运行 npm install。

13. 涉及官方接口、Svelte 5 语法、AI SDK、思源内置图标、思源 API、大模型 provider 参数时，必须先查官方文档或项目已有写法再改。

14. 修改后运行：

    * `npx tsc --noEmit`
    * `npm run build`

## 第一步：静态审计现有实现

必须用 codegraph 检查以下文件和调用关系：

* `src/homepage/homepage.svelte`
* `src/homepage/header/stats-loader.ts`
* `src/homepage/configLoader.ts`
* `src/homepage/homepageSetting/config.ts`
* `src/homepage/homepageSetting/homepageSetting.svelte`
* `src/homepage/homepageSetting/tabs/TitleSettingsTab.svelte`
* `src/homepage/homepageSetting/tabs/AiKnowledgeBaseSettingsTab.svelte`
* `src/features/kb/services/qa/kb-model-call.ts`
* `src/features/kb/services/qa/llm-client.ts`
* `src/features/kb/services/settings/kb-settings-service.ts`
* `src/features/kb/services/settings/chat-model-options.ts`
* `src/features/kb/services/settings/chat-provider-config.ts`
* `src/features/kb/types/settings.ts`
* `src/features/kb/types/chat-model-selection.ts`
* `src/components/utils/shared/SiyuanIcon.svelte`
* `src/components/tools/siyuanIcon.ts`
* 会员判断相关现有用法，例如 `plugin.ADVANCED`、`AdvancedFeatureLock.svelte`

先确认并输出：

1. 当前状态语在哪里显示；
2. 当前状态语变量模板在哪里替换；
3. 当前主页设置如何保存 `statsInfoText`；
4. 当前 AI 知识库主页设置标签能否读取 / 展示模型配置；
5. 现有大模型文本调用应该复用哪个入口；
6. 是否存在可复用的模型选项构建 helper；
7. 当前会员判断应复用哪个字段；
8. 新功能是否需要进入 Agent Workbench，结论应为不需要。

## 第二步：扩展主页状态语配置类型

修改：

* `src/homepage/configLoader.ts`
* `src/homepage/homepageSetting/config.ts`
* `src/homepage/homepageSetting/homepageSetting.svelte`

建议新增类型：

```ts
export type HomepageStatusTextMode = "custom" | "ai";
```

在主页配置中新增字段，命名可以按现有风格微调，但语义必须清楚：

```ts
statusTextMode?: HomepageStatusTextMode;
statusAiPrompt?: string;
statusAiMaxChars?: number;
statusAiProviderId?: string;
statusAiModelId?: string;
statusAiThinkingEnabled?: boolean;
```

默认值建议：

```ts
statusTextMode: "custom";
statusAiPrompt: "请生成一句简短、自然、有鼓励感的主页状态语。语气温和克制，不要夸张。";
statusAiMaxChars: 80;
statusAiProviderId: "";
statusAiModelId: "";
statusAiThinkingEnabled: false;
```

要求：

1. 旧配置没有这些字段时必须兼容。
2. `statsInfoText` 继续保留，作为自定义模式的模板内容和 AI 失败回退。
3. `statusAiMaxChars` 需要归一化，建议范围 20-200，默认 80。
4. `statusAiPrompt` 只接受 string，空值回退默认提示语。
5. `statusTextMode` 只允许 `"custom"` 或 `"ai"`。
6. `statusAiProviderId`、`statusAiModelId` 只保存字符串，trim。
7. `statusAiThinkingEnabled` 只接受 boolean。
8. 不要把这些字段放进 `KbSettings`，它们是主页状态语配置。
9. 不要改变 `statsInfoText` 变量模板已有行为。
10. 不要自动删除旧变量模板。

## 第三步：抽出可复用大模型文本生成封装

当前项目已有公开模型调用入口：

* `src/features/kb/services/qa/kb-model-call.ts`
* `callModelText()`

当前 `llm-client.ts` 明确是内部 adapter，不要直接调用。

请新增一个轻量通用封装，位置可以根据现有项目结构选择，推荐：

```text
src/services/ai/plain-text-generation.ts
```

或如果项目没有 `src/services` 目录，也可以使用：

```text
src/features/kb/services/qa/plain-text-generation.ts
```

但目标是让未来主页组件也能复用，不要把命名写成“状态语专用”或“知识库问答专用”。

建议导出：

```ts
import type { ChatModelSelection } from "@/features/kb/types/chat-model-selection";
import type { ThinkingMode } from "@/features/kb/types/session";

export interface GeneratePlainTextOptions {
  prompt: string;
  modelSelection?: ChatModelSelection | null;
  thinkingMode?: ThinkingMode;
  maxOutputTokens?: number;
  temperature?: number;
  abortSignal?: AbortSignal;
  purpose?: "homepage_status" | "generic";
}

export interface GeneratePlainTextResult {
  ok: true;
  text: string;
} | {
  ok: false;
  message: string;
  reason: "no_model" | "provider_error" | "aborted" | "unknown";
}

export async function generatePlainText(options: GeneratePlainTextOptions): Promise<GeneratePlainTextResult>
```

实现要求：

1. 内部只调用 `callModelText()`。
2. 不直接导入 `llm-client.ts`。
3. 不接入 Agent Workbench。
4. 不接入 ToolRegistry。
5. 不写 Prompt 领域策略。
6. `thinkingMode` 默认 `"off"`。
7. `purpose` 可传 `"generic"` 给 `callModelText()`，如果现有 `callModelText()` 类型不支持 `"homepage_status"`，不要强行扩展底层 purpose。
8. 捕获“未配置模型 / API Key 为空 / baseUrl 未配置”等错误，返回人类可读 message。
9. 不在这里做会员判断。
10. 不在这里做状态语 prompt 拼接。
11. 不新增动态 import / require。

如果你认为新增顶层 `src/services/ai` 会引入路径或架构问题，可以先建在 `src/features/kb/services/qa/plain-text-generation.ts`，但要在注释里说明它是通用文本生成封装，不是问答专用。

## 第四步：新增主页状态语 AI 生成服务

新增文件，推荐：

```text
src/homepage/header/status-ai-generator.ts
```

职责：

1. 收集主页状态语需要的具体统计数据；
2. 组装状态语生成 prompt；
3. 调用通用文本生成封装；
4. 清洗模型输出；
5. 返回生成结果或失败原因。

建议导出：

```ts
export interface HomepageStatusAiConfig {
  prompt: string;
  maxChars: number;
  providerId: string;
  modelId: string;
  thinkingEnabled: boolean;
}

export interface HomepageStatusFacts {
  nowDate: string;
  startDate: string;
  blocksCount: string;
  notebooksCount: string;
  docsCount: string;
  tasksCount?: string;
  doneTasksCount?: string;
  undoneTasksCount?: string;
  dailynotesCount?: string;
  tagsCount?: string;
}

export interface GenerateHomepageStatusTextResult {
  ok: true;
  text: string;
  cacheKey: string;
} | {
  ok: false;
  message: string;
  reason: "not_premium" | "no_model" | "model_error" | "empty_output" | "aborted";
}
```

建议函数：

```ts
export async function loadHomepageStatusFacts(plugin: any): Promise<HomepageStatusFacts>

export function buildHomepageStatusPrompt(
  facts: HomepageStatusFacts,
  userPrompt: string,
  maxChars: number,
): string

export async function generateHomepageStatusText(params: {
  plugin: any;
  config: HomepageStatusAiConfig;
  abortSignal?: AbortSignal;
}): Promise<GenerateHomepageStatusTextResult>
```

状态数据要求：

1. 复用 `loadStatsData()`。
2. 第一版至少传：

   * 当前日期；
   * 第一条笔记日期；
   * 笔记本数量；
   * 文档数量；
   * 内容块数量。
3. 可以顺手传：

   * 任务总数；
   * 已完成任务数；
   * 未完成任务数；
   * 日记数量；
   * 标签数量。
4. 传给 AI 的是具体值，不是变量名。
5. 不读取文档正文。
6. 不读取最近聊天内容。
7. 不读取用户隐私正文。
8. 不调用任何 Agent 工具。

Prompt 建议：

```text
你是一个思源笔记主页状态语生成器。请根据下面的真实数据生成一句中文主页状态语。

要求：
- 只输出状态语正文；
- 不要解释；
- 不要列项目符号；
- 不要输出 Markdown；
- 不要输出 HTML；
- 不要编造数据；
- 不超过 {maxChars} 个中文字符；
- 语气自然、简洁，适合显示在主页标题下方；
- 不要重复堆砌所有数据，只挑最适合的一两个数据点表达。

用户风格要求：
{userPrompt}

真实数据：
今天是：{nowDate}
第一条笔记日期：{startDate}
当前笔记本数量：{notebooksCount}
当前文档数量：{docsCount}
当前内容块数量：{blocksCount}
当前任务数量：{tasksCount}
已完成任务数量：{doneTasksCount}
未完成任务数量：{undoneTasksCount}
日记数量：{dailynotesCount}
标签数量：{tagsCount}
```

输出清洗要求：

1. `trim()`。
2. 去掉包裹用的引号。
3. 去掉明显的 Markdown 列表前缀，例如 `- `、`* `、`1. `。
4. 如果返回多行，保留最多 2 行。
5. 如果超过 `maxChars`，按 Unicode 字符截断到 `maxChars`，不要破坏 surrogate pair。
6. 空结果视为失败。
7. 不要使用 `{@html}` 显示 AI 输出。

字符限制说明：

* `maxChars` 是给 AI 的要求，也是最终显示兜底上限；
* 默认 80；
* 范围 20-200；
* 不是 token 数。

## 第五步：主页显示逻辑接入 AI 状态语

修改：

```text
src/homepage/homepage.svelte
```

当前状态语逻辑是：

* `statsInfoText` 保存模板；
* `updateFormattedStatsInfoText()` 替换变量；
* 页面显示 `{formattedStatsInfoText}`。

请改成支持两种模式：

1. 自定义模式：

   * 完全沿用当前变量替换逻辑；
   * 继续支持 `{{startDate}}`、`{{blocksCount}}` 等变量；
   * 继续支持 `$$...$$` 表达式；
   * 行为不退化。

2. AI 模式：

   * 如果 `plugin.ADVANCED` 不是 true，不调用模型，回退到自定义模板结果；
   * 如果没有可用模型，不调用模型，回退到自定义模板结果；
   * 如果生成失败，回退到自定义模板结果；
   * 如果生成成功，显示 AI 生成文本；
   * 同一配置和同一统计数据不要重复请求模型；
   * 保存设置后触发配置更新时可重新生成；
   * 组件销毁时中断未完成请求。

建议把原来的 `updateFormattedStatsInfoText()` 拆成：

```ts
async function formatCustomStatsInfoText(template: string): Promise<string>

async function updateDisplayedStatsInfoText(): Promise<void>
```

或类似命名。

缓存建议：

```ts
let statusAiCacheKey = "";
let statusAiCachedText = "";
let statusAiAbortController: AbortController | null = null;
```

AI 缓存 key 可以由以下内容组成：

* mode；
* prompt；
* maxChars；
* providerId；
* modelId；
* thinkingEnabled；
* status facts JSON。

要求：

1. 不要在每次 Svelte rerender 时调用模型。
2. 不要因为 `formattedStatsInfoText` 变化再次触发生成，避免循环。
3. 复用现有 `updateStatsVersion` 防止过期请求覆盖新结果。
4. 如果 AI 生成中，可以临时显示自定义模板结果或“正在生成状态语...”。优先建议显示自定义模板结果，避免首页闪烁。
5. 状态语区域仍然用普通文本插值 `{formattedStatsInfoText}`，不要用 `{@html}`。
6. 不要接入流式输出，状态语很短，不需要流式。
7. 不要影响快捷按钮、标题、横幅、组件布局加载。

## 第六步：标题设置页增加状态语模式、AI 提示语和字符上限

修改：

```text
src/homepage/homepageSetting/tabs/TitleSettingsTab.svelte
```

现有“状态语”区域保留，但需要扩展。

新增 props：

```ts
tempStatusTextMode: "custom" | "ai";
tempStatusAiPrompt: string;
tempStatusAiMaxChars: number;
statusAiAvailableModelCount?: number;
statusAiSelectedModelLabel?: string;
advancedEnabled?: boolean;
onTempStatusTextModeChange: (value: "custom" | "ai") => void;
onTempStatusAiPromptChange: (value: string) => void;
onTempStatusAiMaxCharsChange: (value: number) => void;
```

如果你认为 `statusAiAvailableModelCount` 不适合从父组件传入，可以在本组件内部不显示模型数量，只显示固定提示：“模型请到 AI 知识库标签中选择”。

UI 要求：

1. 增加“状态语来源”选择：

   * 自定义；
   * AI 智能生成（会员专属）。
2. 不要用表情符号当图标。
3. 如果需要图标，使用 `<SiyuanIcon name="vip" />` 或其他思源内置图标。
4. 自定义模式下：

   * 显示现有自定义状态语 textarea；
   * 显示变量帮助链接；
   * 行为和现在一致。
5. AI 模式下：

   * 显示“生成提示语” textarea；
   * 显示“返回字符上限” number input；
   * 显示说明：“AI 会使用当前统计数据生成状态语，不会读取正文内容。”
   * 显示说明：“使用的模型请在「AI 知识库」标签中选择。”
6. 如果 `advancedEnabled` 为 false：

   * AI 模式选项可以显示但禁用，或允许选中但给出会员提示；
   * 更建议禁用 AI 选项，显示“AI 智能生成是会员专属功能，请在会员服务中开通”。
7. 如果没有可用模型：

   * 在 AI 模式区域提示：“尚未配置可用大模型，请先到「AI 知识库设置 → 大模型配置」添加模型，再到主页设置的「AI 知识库」标签选择状态语模型。”
8. `返回字符上限` 范围 20-200，默认 80。
9. 用户输入超过范围时 UI 可以 clamp，但最终保存和生成服务也必须再次归一化。
10. 不要显示内部字段名，例如 `statusAiPrompt`、`providerId`、`modelId`。
11. 不要在 UI 文案里出现 Agent、Tool、Planner、schema、observation 等内部术语。

## 第七步：AI 知识库主页设置标签增加状态语模型选择

修改：

```text
src/homepage/homepageSetting/tabs/AiKnowledgeBaseSettingsTab.svelte
```

现有功能：

* 侧边栏对话入口；
* 标签页对话入口。

新增一个设置区域：

```text
主页 AI 状态语
```

或：

```text
状态语 AI 生成
```

新增 props：

```ts
statusAiProviderId: string;
statusAiModelId: string;
statusAiThinkingEnabled: boolean;
onStatusAiModelChange: (value: { providerId: string; modelId: string }) => void;
onStatusAiThinkingEnabledChange: (value: boolean) => void;
```

组件内部可在 `onMount` 中读取 KB 设置：

```ts
import { getKbSettings } from "@/features/kb/services/settings/kb-settings-service";
import { buildChatModelOptions, findDefaultChatModelOption } from "@/features/kb/services/settings/chat-model-options";
import { buildChatModelKey } from "@/features/kb/types/chat-model-selection";
```

要求：

1. 从已配置且启用的大模型中构建选项。
2. 使用单个 select 展示模型即可，label 使用 `providerName / modelName`。
3. 不要显示内部 providerId/modelId 作为主要 UI 文案。
4. 如果没有可用模型，显示提示：

   * “尚未配置可用大模型，请先打开「AI 知识库设置 → 大模型配置」添加提供商和模型。”
5. 如果有模型但当前状态语模型选择为空：

   * 可以默认选中 `findDefaultChatModelOption()` 的结果；
   * 但要通过 `onStatusAiModelChange()` 同步到父组件，保存后生效。
6. 如果当前状态语模型选择已失效：

   * 显示提示：“当前选择不可用，请重新选择。”
   * 可以自动回退到默认模型，但要保持逻辑简单，避免无限更新。
7. 增加“状态语思考模式”开关：

   * 开启后生成状态语时允许模型使用思考模式；
   * 关闭后生成状态语时请求关闭思考；
   * 默认关闭；
   * 只影响状态语生成；
   * 不影响聊天问答；
   * 不影响 Agent Planner 的 `controlPlaneThinkingEnabled`。
8. 如果需要图标，使用 `SiyuanIcon`，不要使用表情符号。
9. 现有 `开启侧边栏对话👑`、`开启标签页对话👑` 如果本轮触碰，可以改成：

   * 标题纯文字；
   * 旁边用 `SiyuanIcon name="vip"` 或小标签表示会员。
10. 不要在这里保存 KB 设置，只保存主页状态语配置到 homepage setting config。
11. 不要新增复杂模型配置 UI。模型提供商和模型增删改仍在现有 AI 知识库设置的大模型配置里完成。

## 第八步：主页设置主组件接线

修改：

```text
src/homepage/homepageSetting/homepageSetting.svelte
```

要求：

1. 新增临时状态：

   * `tempStatusTextMode`
   * `tempStatusAiPrompt`
   * `tempStatusAiMaxChars`
   * `tempStatusAiProviderId`
   * `tempStatusAiModelId`
   * `tempStatusAiThinkingEnabled`
2. 加载 `savedConfig` 时读取这些字段，缺失时回退默认值。
3. 保存配置时写入这些字段。
4. 将相关 props 传给：

   * `TitleSettingsTab`
   * `AiKnowledgeBaseSettingsTab`
5. `advancedEnabled` 已经在主页设置里存在，传给 `TitleSettingsTab` 或 `AiKnowledgeBaseSettingsTab` 供 UI gating。
6. 不要把这些设置写进 `KbSettings`。
7. 不要因为这些设置变化触发 AI 知识库入口重新注册。现有 `aiKbChanged` 只应继续关注 `aiKbDockEnabled / aiKbTabEnabled`。
8. 保存后仍派发 `homepage-settings-saved`，让主页刷新状态语。
9. 不要重构整个主页设置页。

## 第九步：配置加载接入

修改：

```text
src/homepage/configLoader.ts
```

要求：

1. `HomepageConfig` 增加状态语 AI 相关字段。
2. `DEFAULT_HOMEPAGE_CONFIG` 增加默认值。
3. `loadHomepageConfig()` 对新增字段做归一化。
4. `statusAiMaxChars` clamp 到 20-200。
5. `statusTextMode` 只接受 `"custom"` / `"ai"`。
6. `statusAiProviderId` / `statusAiModelId` trim。
7. `statusAiThinkingEnabled` 默认 false。
8. 不影响旧字段：

   * `statsInfoText`
   * `customTitle`
   * `TitleIconEmoji`
   * `banner...`
   * `buttonsList`
9. 不改变 widgetLayout 读取逻辑。

## 第十步：模型配置判断与用户提醒

必须做好没有配置大模型时的判断。

需要覆盖两个位置：

### 1. 状态语设置区域

当用户选择 AI 智能生成，但没有可用大模型时，提示：

```text
尚未配置可用大模型。请先到「AI 知识库设置 → 大模型配置」添加模型，再到「AI 知识库」标签选择状态语模型。
```

如果当前不是会员，提示：

```text
AI 智能生成状态语是会员专属功能，请在「会员服务」中开通后使用。
```

### 2. AI 知识库标签的状态语模型选择区域

没有可用模型时，提示：

```text
尚未配置可用大模型，请先打开「AI 知识库设置 → 大模型配置」添加提供商和模型。
```

注意：

1. 提示文案面向用户，不要出现内部代码名。
2. 不要显示 `providerId`、`modelId` 字段名。
3. 模型 ID 作为用户配置项可以显示在大模型配置页，但状态语模型选择下拉框优先显示名称。
4. 不要在普通设置文案里出现 Agent、Tool、Planner、schema、observation。

## 第十一步：会员专属 gating

AI 状态语是会员专属。

要求：

1. UI 上标明会员专属。
2. 未开会员时：

   * 禁止实际调用模型；
   * 主页显示回退到自定义状态语；
   * 设置页给出提示。
3. 会员判断使用项目现有方式，例如 `plugin.ADVANCED`。
4. 不要把会员判断写进通用大模型文本生成封装。
5. 不要让模型调用层知道会员概念。
6. 不要在 Agent Workbench 中加入会员判断。

## 第十二步：图标要求

凡是本轮新加 UI 图标：

1. 必须使用 `SiyuanIcon`。
2. 图标名使用项目已有 `SiyuanIconName` / `SIYUAN_ICON_MAP`。
3. 可以使用：

   * `vip`
   * `settings`
   * `refresh`
   * `records`
   * `overview`
4. 不要新增表情符号作为图标。
5. 不要在按钮、标题、标签里新增 `👑`、`🤖`、`✨`、`❤️` 等表情符号。
6. AI 生成的状态语本身不强制禁止用户提示中要求符号，但默认提示语不要要求输出表情符号。

## 第十三步：失败与回退策略

必须实现以下回退：

1. 自定义模式：

   * 完全走当前变量替换逻辑。
2. AI 模式 + 未开会员：

   * 不调用模型；
   * 显示自定义模板替换后的结果。
3. AI 模式 + 无可用模型：

   * 不调用模型；
   * 显示自定义模板替换后的结果。
4. AI 模式 + 模型调用失败：

   * 显示自定义模板替换后的结果；
   * console/debug 可记录简短错误；
   * 不要在主页状态语区域显示堆栈或内部错误。
5. AI 模式 + 空输出：

   * 显示自定义模板替换后的结果。
6. AI 模式 + 输出过长：

   * 截断到 `statusAiMaxChars`。
7. 组件销毁：

   * abort 未完成请求；
   * 不让过期请求覆盖新配置结果。

## 第十四步：不要做的事

本轮禁止：

* 不要改 AgentLoop。
* 不要改 ToolExecutor。
* 不要改 PlannerDecision 协议。
* 不要新增 Tool。
* 不要新增 Skill。
* 不要改全局 Prompt。
* 不要改 references / footerReferences。
* 不要把状态语生成接入 Agent Workbench。
* 不要让状态语生成调用知识库工具。
* 不要读取文档正文。
* 不要把变量名传给 AI。
* 不要把用户模型配置、API Key、baseUrl 传给 AI。
* 不要在状态语展示中使用 `{@html}`。
* 不要每次渲染都请求模型。
* 不要新增动态 import / require。
* 不要运行 npm install。
* 不要为了通过测试污染生产逻辑。
* 不要把会员判断写进通用大模型调用层。

## 第十五步：测试建议

可以新增或更新测试，但测试不能污染生产逻辑。

建议至少覆盖：

1. 配置归一化：

   * 旧配置没有新增字段时仍可加载；
   * `statusTextMode` 非法时回退 `"custom"`；
   * `statusAiMaxChars` clamp 到 20-200；
   * `statusAiThinkingEnabled` 默认 false。

2. 状态语 prompt 构造：

   * 传入的是具体统计数据；
   * prompt 中不包含 `{{docsCount}}` 这类变量名；
   * 包含字符上限要求；
   * 包含用户自定义风格提示。

3. 输出清洗：

   * 去掉包裹引号；
   * 去掉列表前缀；
   * 超长截断；
   * 空输出失败。

4. 模型选择：

   * 没有可用模型时 UI 显示提示；
   * 有可用模型时可选择；
   * 状态语模型选择不改变聊天问答当前模型。

5. 回退：

   * 非会员不调用模型；
   * 无模型不调用模型；
   * 失败时回退自定义状态语。

如果测试成本较高，本轮可先不补大量测试，但必须保证 `npx tsc --noEmit` 和 `npm run build` 通过。

## 第十六步：验证

修改后运行：

```bash
npx tsc --noEmit
npm run build
```

如果失败：

1. 判断是否由本次修改引入；
2. 能修就做最小修复；
3. 不能修就说明原因；
4. 不要通过放宽类型、删除校验或污染生产逻辑来通过构建。

## 输出格式

请严格按以下格式输出：

### 1. 静态审计结果

用表格列出：

* 文件
* 当前职责
* 与 AI 状态语相关的复用点
* 本轮是否修改
* 不修改原因或后续建议

### 2. 实现方案说明

必须说明：

1. 状态语现在支持哪些模式；
2. AI 状态语是否会员专属；
3. AI 状态语使用哪个模型选择；
4. 思考模式开关如何生效；
5. 字符上限如何生效；
6. 传给 AI 的数据有哪些；
7. 为什么不接入 Agent Workbench；
8. 为什么不新增 Tool / Skill。

### 3. 修改摘要

按文件列出具体修改。

### 4. 设置项说明

说明新增了哪些主页配置字段，默认值是什么，旧配置如何兼容。

### 5. 大模型调用说明

必须说明：

1. 是否抽出了可复用文本生成封装；
2. 是否只通过 `callModelText()` 调用；
3. 是否避免直接调用 `llm-client.ts`；
4. 是否和聊天问答模型选择分离；
5. 没有配置模型时如何提醒。

### 6. UI 展示说明

必须说明：

1. 状态语设置区域新增了哪些控件；
2. AI 知识库标签新增了哪些控件；
3. 是否使用思源内置图标；
4. 是否没有新增表情符号图标；
5. 非会员和无模型时分别如何提示。

### 7. 回退与缓存说明

必须说明：

1. 什么时候调用模型；
2. 什么时候不调用模型；
3. 如何避免重复生成；
4. 失败时如何回退；
5. 组件销毁时是否取消请求。

### 8. 第一铁律合规性说明

必须说明：

* Agent Workbench 没有被改成业务流程控制器；
* Planner 职责未变化；
* Tool 职责未变化；
* Skill 职责未变化；
* 状态语 AI 生成只是主页组件级文本生成能力；
* 没有新增 Agent 工具调用流程。

### 9. 官方接口确认

说明查阅或复核了哪些官方文档 / 项目既有写法：

* Svelte 5 props / state / event 绑定；
* AI SDK 调用封装的项目既有写法；
* 思源内置图标 `SiyuanIcon` 用法；
* 会员判断 `plugin.ADVANCED` 现有用法。

### 10. 动态 import / require 检查结果

说明是否新增 dynamic import / require。

### 11. 验证结果

贴出：

* `npx tsc --noEmit`
* `npm run build`

## 预期效果

实现完成后，用户应看到：

1. 主页标题下方状态语仍然正常显示。
2. 默认仍是“自定义状态语”，旧用户配置不受影响。
3. 自定义状态语仍支持原有变量模板。
4. 在主页设置的状态语区域，用户可以选择“自定义”或“AI 智能生成”。
5. 选择 AI 智能生成后，用户可以填写生成提示语，并设置返回字符上限。
6. 在主页设置的“AI 知识库”标签中，用户可以为状态语单独选择大模型，并决定是否开启思考模式。
7. 状态语模型选择不会改变聊天问答使用的大模型。
8. 没有配置可用大模型时，设置页会明确提示用户去哪里配置。
9. 非会员不会触发 AI 状态语生成，并会看到会员专属提示。
10. 会员且已配置模型时，打开主页会生成一句基于真实统计数据的状态语。
11. AI 生成状态语使用的是具体数据，不是变量名。
12. AI 生成失败时，主页自动回退到自定义状态语，不影响主页打开。
13. 新 UI 图标使用思源内置图标，不新增表情符号图标。
14. 整个功能不影响 AI 知识库问答、Agent 工具调用、references、真实流式回答等现有功能。
