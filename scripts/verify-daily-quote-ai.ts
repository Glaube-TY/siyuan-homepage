import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DAILY_QUOTE_AI_GENERATOR_VERSION,
  DAILY_QUOTE_AI_PROMPT_MAX_LENGTH,
  DEFAULT_DAILY_QUOTE_AI_PROMPT,
  normalizeDailyQuoteAiPrompt,
  normalizeDailyQuoteAiUseMemory,
} from "../src/components/utils/widgetBlock/widget/dailyQuote/dailyQuoteAiConfig";
import {
  buildDailyQuoteAiCachePath,
  loadDailyQuoteAiCache,
  saveDailyQuoteAiCache,
  DAILY_QUOTE_AI_CACHE_SCHEMA,
  DAILY_QUOTE_AI_CACHE_VERSION,
  type DailyQuoteAiCacheRecord,
} from "../src/components/utils/widgetBlock/widget/dailyQuote/dailyQuoteAiCache";
import {
  buildDailyQuoteAiConfigKey,
  buildDailyQuoteAiPrompt,
  cleanDailyQuoteAiText,
  generateDailyQuoteAi,
} from "../src/components/utils/widgetBlock/widget/dailyQuote/dailyQuoteAi";
import { formatLocalDate } from "../src/components/tools/date-utils";
import {
  denyHomepageEntitlement,
  grantHomepageEntitlement,
  resetHomepageEntitlement,
  subscribeHomepageEntitlement,
} from "../src/features/entitlement/homepage-entitlement";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const dailyQuoteSource = read("src/components/utils/widgetBlock/widget/dailyQuote/dailyQuote.svelte");
const desktopSettingsSource = read("src/components/utils/widgetBlock/widget/dailyQuote/dailyQuoteSet.svelte");
const contentSettingsSource = read("src/components/utils/widgetBlock/contentSetting.svelte");
const mobileSettingsSource = read("src/homepage/mobileHomepage/MobileWidgetContentForm.svelte");
const generatorSource = read("src/components/utils/widgetBlock/widget/dailyQuote/dailyQuoteAi.ts");
const cacheSource = read("src/components/utils/widgetBlock/widget/dailyQuote/dailyQuoteAiCache.ts");
const adapterSource = read("src/features/kb/services/agent-workbench/tools/homepage/homepage-agent-widget-adapters.ts");
const catalogSource = read("src/features/kb/services/agent-workbench/tools/homepage/homepage-agent-widget-catalog.ts");
const profileSource = read("src/features/agent-platform/agent-profile.ts");

const publicEntryStart = generatorSource.indexOf("export async function generateDailyQuoteAi");
const publicEntryEnd = generatorSource.indexOf("\n}", publicEntryStart);
assert.ok(publicEntryStart >= 0 && publicEntryEnd > publicEntryStart, "必须找到 generateDailyQuoteAi 公开入口");
const publicEntrySource = generatorSource.slice(publicEntryStart, publicEntryEnd);

assert.equal(normalizeDailyQuoteAiPrompt(""), DEFAULT_DAILY_QUOTE_AI_PROMPT);
assert.equal(normalizeDailyQuoteAiUseMemory(undefined), true);
assert.equal(normalizeDailyQuoteAiUseMemory(false), false);
assert.equal(normalizeDailyQuoteAiPrompt("x".repeat(DAILY_QUOTE_AI_PROMPT_MAX_LENGTH + 20)).length, DAILY_QUOTE_AI_PROMPT_MAX_LENGTH);

const verificationDate = new Date(2026, 7, 26, 12, 0, 0);
const prompt = buildDailyQuoteAiPrompt("温和、具体、适合开始工作", verificationDate);
assert.match(prompt, new RegExp(formatLocalDate(verificationDate)));
assert.match(prompt, /当前星期/);
assert.match(prompt, /只输出一句/);
assert.match(prompt, /不要 Markdown/);
assert.match(prompt, /不要声称来自真实人物/);
assert.equal(cleanDailyQuoteAiText(' - “每日一句：静心前行。”\n解释'), "静心前行。");
assert.equal(cleanDailyQuoteAiText("\n\n"), "");

const configKey = buildDailyQuoteAiConfigKey("简洁", true);
assert.notEqual(configKey, buildDailyQuoteAiConfigKey("简洁", false));
assert.match(configKey, new RegExp(`"generatorVersion":${DAILY_QUOTE_AI_GENERATOR_VERSION}`));

const cacheStore = new Map<string, unknown>();
const cachePlugin = {
  async loadData(path: string): Promise<unknown> {
    return cacheStore.get(path) ?? "";
  },
  async saveData(path: string, value: unknown): Promise<void> {
    cacheStore.set(path, value);
  },
};
const cacheRecord: DailyQuoteAiCacheRecord = {
  schema: DAILY_QUOTE_AI_CACHE_SCHEMA,
  version: DAILY_QUOTE_AI_CACHE_VERSION,
  instanceId: "daily-quote-verify",
  localDate: formatLocalDate(verificationDate),
  configKey,
  text: "先完成眼前的一步。",
  generatedAt: "2026-08-26T04:00:00.000Z",
};
assert.equal(buildDailyQuoteAiCachePath(cacheRecord.instanceId), "daily-quote/ai-cache/daily-quote-verify.json");
assert.equal(await saveDailyQuoteAiCache(cachePlugin, cacheRecord), true);
assert.deepEqual(
  await loadDailyQuoteAiCache(cachePlugin, cacheRecord),
  cacheRecord,
);
assert.equal(buildDailyQuoteAiCachePath("../unsafe"), null);

const entitlementPlugin = {
  ADVANCED: false,
  cacheReads: 0,
  async loadData(): Promise<unknown> {
    this.cacheReads += 1;
    return "";
  },
  async saveData(): Promise<void> {},
};
const entitlementEvents: boolean[] = [];
const unsubscribeEntitlement = subscribeHomepageEntitlement((snapshot) => {
  entitlementEvents.push(snapshot.advanced);
});
resetHomepageEntitlement(entitlementPlugin);
assert.equal(entitlementEvents[entitlementEvents.length - 1], false);
grantHomepageEntitlement(entitlementPlugin, {
  name: "Verifier",
  userId: "daily-quote-verifier",
  due: "2099-12-31",
  remainingDays: 999,
  isExpired: false,
  isLifetime: true,
});
assert.equal(entitlementEvents[entitlementEvents.length - 1], true);
denyHomepageEntitlement(entitlementPlugin, "verifier cleanup");
assert.equal(entitlementEvents[entitlementEvents.length - 1], false);
unsubscribeEntitlement();
assert.ok(entitlementEvents.includes(true), "entitlement runtime 必须覆盖 false -> true");
assert.ok(entitlementEvents.filter((value) => value === false).length >= 2, "entitlement runtime 必须覆盖 true -> false");

const deniedGeneration = await generateDailyQuoteAi({
  plugin: entitlementPlugin,
  instanceId: "daily-quote-entitlement-verify",
  prompt: "简洁",
  useMemory: false,
  forceRefresh: true,
});
assert.equal(deniedGeneration.ok, false);
if (!deniedGeneration.ok) assert.equal(deniedGeneration.reason, "not_premium");
assert.equal(entitlementPlugin.cacheReads, 0, "会员失效时不得读取旧 AI cache");

assert.match(profileSource, /HOMEPAGE_DAILY_QUOTE_AGENT_PROFILE_ID/);
assert.match(profileSource, /id: HOMEPAGE_DAILY_QUOTE_AGENT_PROFILE_ID[\s\S]*?capabilities: \["global-memory"\]/);
assert.match(profileSource, /id: HOMEPAGE_DAILY_QUOTE_AGENT_PROFILE_ID[\s\S]*?contextSources: \["global-memory"\]/);
assert.match(profileSource, /id: HOMEPAGE_DAILY_QUOTE_AGENT_PROFILE_ID[\s\S]*?defaultMaxToolCalls: 0/);

assert.match(generatorSource, /generatePlainText/);
assert.match(generatorSource, /HOMEPAGE_DAILY_QUOTE_AGENT_PROFILE_ID/);
assert.match(generatorSource, /contextSources: useMemory \? \["global-memory"\] : \[\]/);
assert.match(generatorSource, /thinkingMode: "off"/);
assert.match(generatorSource, /maxOutputTokens: 192/);
assert.match(generatorSource, /temperature: 0\.9/);
assert.match(generatorSource, /formatLocalDate/);
assert.doesNotMatch(generatorSource, /toISOString\(\)\.slice/);
assert.doesNotMatch(generatorSource, /modelSelection|callModelText|streamModelText/);
assert.doesNotMatch(generatorSource, /runAgentProfile|web_search|web_fetch/);
assert.match(generatorSource, /inFlightGenerations/);
assert.match(generatorSource, /forceRefresh/);
assert.match(generatorSource, /DAILY_QUOTE_AI_GENERATOR_VERSION/);
assert.match(generatorSource, /instanceId[\s\S]*localDate[\s\S]*configKey/);
assert.doesNotMatch(generatorSource, /fontSize|dailyQuoteBg|generatedText|generatedDate/);
const entitlementGateIndex = generatorSource.indexOf("if (!await ensureHomepageEntitlementGranted");
const cacheReadIndex = generatorSource.indexOf("const cached = await loadDailyQuoteAiCache");
const modelCallIndex = generatorSource.indexOf("const result = await generatePlainText");
assert.ok(entitlementGateIndex >= 0, "AI generator 必须有 authoritative entitlement gate");
assert.ok(cacheReadIndex >= 0, "AI generator 必须读取 runtime cache");
assert.ok(modelCallIndex >= 0, "AI generator 必须调用 generatePlainText");
assert.ok(entitlementGateIndex < cacheReadIndex && cacheReadIndex < modelCallIndex, "会员检查必须早于 cache read，且 cache read 必须早于模型调用");
assert.match(generatorSource, /DailyQuoteAiFailureReason = [^;]*not_premium/);
assert.match(generatorSource, /reason: "not_premium"/);

const publicEntitlementGateIndex = publicEntrySource.indexOf("if (!await ensureHomepageEntitlementGranted");
const publicInFlightLookupIndex = publicEntrySource.indexOf("inFlightGenerations.get(requestKey)");
assert.match(publicEntrySource, /export async function generateDailyQuoteAi/);
assert.ok(publicEntitlementGateIndex >= 0, "公开入口必须执行 authoritative entitlement gate");
assert.ok(publicInFlightLookupIndex >= 0, "公开入口必须检查 in-flight generation");
assert.ok(publicEntitlementGateIndex < publicInFlightLookupIndex, "公开入口必须在 in-flight lookup 前完成会员检查");
assert.doesNotMatch(publicEntrySource, /if \(existing\) return existing/);
const existingAwaitIndex = publicEntrySource.indexOf("const result = await existing");
const existingEntitlementCheckIndex = publicEntrySource.indexOf("isHomepageEntitlementGranted()", existingAwaitIndex);
assert.ok(existingAwaitIndex >= 0 && existingAwaitIndex < existingEntitlementCheckIndex, "复用 in-flight Promise 后必须再次检查当前会员状态");
const generationAwaitIndex = publicEntrySource.indexOf("const result = await generation");
const generationEntitlementCheckIndex = publicEntrySource.indexOf("isHomepageEntitlementGranted()", generationAwaitIndex);
assert.ok(generationAwaitIndex >= 0 && generationAwaitIndex < generationEntitlementCheckIndex, "新 generation 交付前必须再次检查当前会员状态");
const cacheHitIndex = generatorSource.indexOf("if (cached)");
const cacheHitEntitlementCheckIndex = generatorSource.indexOf("if (!isHomepageEntitlementGranted()", cacheHitIndex);
const cacheHitReturnIndex = generatorSource.indexOf("return { ok: true, text: cached.text", cacheHitIndex);
assert.ok(cacheHitIndex >= 0 && cacheHitEntitlementCheckIndex > cacheHitIndex && cacheHitEntitlementCheckIndex < cacheHitReturnIndex, "cache hit 返回前必须再次检查当前会员状态");
const modelCompletionEntitlementCheckIndex = generatorSource.indexOf("if (!isHomepageEntitlementGranted()", modelCallIndex);
const cacheSaveIndex = generatorSource.indexOf("await saveDailyQuoteAiCache", modelCallIndex);
assert.ok(modelCompletionEntitlementCheckIndex > modelCallIndex && modelCompletionEntitlementCheckIndex < cacheSaveIndex, "模型完成后、cache save 前必须再次检查当前会员状态");

assert.match(cacheSource, /daily-quote\/ai-cache/);
assert.match(cacheSource, /可重建的 AI runtime cache，不是用户业务数据/);
for (const field of ["schema", "version", "instanceId", "localDate", "configKey", "text", "generatedAt"]) {
  assert.match(cacheSource, new RegExp(field), `runtime cache 缺少字段：${field}`);
}
assert.match(cacheSource, /saveData[\s\S]*loadData/);
assert.match(cacheSource, /schema 或内容无效/);

assert.match(dailyQuoteSource, /dailyQuoteMode === "ai"/);
assert.match(dailyQuoteSource, /正在生成今日一句…/);
assert.match(dailyQuoteSource, /RefreshCw/);
assert.match(dailyQuoteSource, /title="重新生成每日一句"/);
assert.match(dailyQuoteSource, /aria-label="重新生成每日一句"/);
assert.match(dailyQuoteSource, /forceRefresh/);
assert.match(dailyQuoteSource, /onDestroy\(\(\) => \{[\s\S]*quoteAbortController\?\.abort\(\)/);
assert.match(dailyQuoteSource, /fetch\(url, \{ signal: controller\.signal \}\)/);
assert.match(dailyQuoteSource, /void loadQuote\(\);\s*void loadBackground\(\);/);
assert.match(dailyQuoteSource, /请先在 AI 中心配置可用模型/);
assert.match(dailyQuoteSource, /quoteError && dailyQuote/);
assert.match(dailyQuoteSource, /getHomepageEntitlementSnapshot\(\)\.advanced/);
assert.match(dailyQuoteSource, /subscribeHomepageEntitlement/);
assert.doesNotMatch(dailyQuoteSource, /advancedEnabled = Boolean\(plugin\?\.ADVANCED\)/);
assert.match(dailyQuoteSource, /wasAdvanced && !snapshot\.advanced[\s\S]*quoteAbortController\?\.abort\(\)[\s\S]*quoteRequestVersion \+= 1[\s\S]*quoteLoading = false[\s\S]*quoteAbortController = null/);
assert.match(dailyQuoteSource, /!wasAdvanced && snapshot\.advanced[\s\S]*void loadQuote\(\)/);
assert.match(dailyQuoteSource, /onDestroy\(\(\) => \{[\s\S]*unsubscribeEntitlement\?\.\(\)/);
assert.match(dailyQuoteSource, /result\.reason === "not_premium"[\s\S]*advancedEnabled = false/);
assert.match(dailyQuoteSource, /\{#if advancedEnabled \|\| dailyQuoteMode === "custom"\}/);

assert.match(desktopSettingsSource, /<option value="custom">自定义文字<\/option>/);
assert.match(desktopSettingsSource, /<option value="ai" disabled=\{!advancedEnabled\}>AI 生成（会员）<\/option>/);
assert.match(desktopSettingsSource, /<option value="remote" disabled=\{!advancedEnabled\}>远程接口（会员）<\/option>/);
assert.doesNotMatch(desktopSettingsSource, /👑/);
assert.match(desktopSettingsSource, /dailyQuoteAiPrompt/);
assert.match(desktopSettingsSource, /dailyQuoteAiUseMemory/);
assert.match(desktopSettingsSource, /模型跟随 AI 中心默认模型/);
assert.match(contentSettingsSource, /dailyQuoteAiPrompt/);
assert.match(contentSettingsSource, /dailyQuoteAiUseMemory/);

assert.match(mobileSettingsSource, /disabled\?: boolean/);
assert.match(mobileSettingsSource, /<option value=\{item\.value\} disabled=\{item\.disabled === true\}>/);
assert.match(mobileSettingsSource, /option\("ai", "AI 生成（会员）", !mobileAdvancedEnabled\)/);
assert.match(mobileSettingsSource, /option\("remote", "远程语录（会员）", !mobileAdvancedEnabled\)/);
assert.match(mobileSettingsSource, /key: "dailyQuoteAiPrompt"[\s\S]*type: "textarea"/);
assert.match(mobileSettingsSource, /key: "dailyQuoteAiUseMemory"[\s\S]*type: "switch"/);
assert.match(mobileSettingsSource, /key: "dailyQuoteAiInfo"[\s\S]*type: "info"/);
assert.match(mobileSettingsSource, /DAILY_QUOTE_AI_PROMPT_MAX_LENGTH/);
assert.match(mobileSettingsSource, /key: "dailyQuoteAiPrompt"[\s\S]*vipOnly: true/);
assert.match(mobileSettingsSource, /key: "dailyQuoteAiUseMemory"[\s\S]*vipOnly: true/);
assert.match(mobileSettingsSource, /<select[\s\S]*disabled=\{isVipField && !mobileAdvancedEnabled\}/);
assert.match(mobileSettingsSource, /field\.type === "textarea"[\s\S]*disabled=\{isVipField && !mobileAdvancedEnabled\}/);
assert.match(mobileSettingsSource, /field\.type === "number"[\s\S]*disabled=\{isVipField && !mobileAdvancedEnabled\}/);
assert.match(mobileSettingsSource, /field\.type === "color"[\s\S]*disabled=\{isVipField && !mobileAdvancedEnabled\}/);
assert.match(mobileSettingsSource, /type="text"[\s\S]*disabled=\{isVipField && !mobileAdvancedEnabled\}/);
assert.match(mobileSettingsSource, /mobileAdvancedEnabled = snapshot\.advanced/);

assert.match(adapterSource, /dailyQuoteAiPrompt/);
assert.match(adapterSource, /dailyQuoteAiUseMemory/);
assert.match(adapterSource, /dailyQuoteMode: \["custom", "ai", "remote"\]/);
assert.match(adapterSource, /patch\.dailyQuoteMode === "ai"/);
assert.match(adapterSource, /"dailyQuoteAiPrompt" in patch/);
assert.match(adapterSource, /"dailyQuoteAiUseMemory" in patch/);
assert.match(adapterSource, /DAILY_QUOTE_AI_PROMPT_MAX_LENGTH/);
assert.match(catalogSource, /dailyQuote: \[[\s\S]*dailyQuoteAiPrompt[\s\S]*dailyQuoteAiUseMemory/);

for (const source of [dailyQuoteSource, desktopSettingsSource, contentSettingsSource, mobileSettingsSource, adapterSource, catalogSource]) {
  assert.doesNotMatch(source, /dailyQuoteAiProviderId|dailyQuoteAiModelId|dailyQuoteAiGenerated|generatedText|generatedDate/);
}

console.log("daily quote AI contracts verified");
