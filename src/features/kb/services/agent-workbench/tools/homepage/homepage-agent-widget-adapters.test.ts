import assert from "node:assert/strict";
import test from "node:test";
import {
  applyHomepageWidgetPatch,
  createHomepageWidgetConfig,
  validateAndNormalizeHomepageWidgetPatch,
} from "./homepage-agent-widget-adapters";
import { getHomepageAgentWidgetDescriptor } from "./homepage-agent-widget-catalog";

test("组件 adapter 严格拒绝未知字段、错误类型和非法枚举", () => {
  assert.throws(() => validateAndNormalizeHomepageWidgetPatch("weather", { unknown: true }), /白名单/);
  assert.throws(() => validateAndNormalizeHomepageWidgetPatch("latest-docs", { limit: "10" }), /number 类型/);
  assert.throws(() => validateAndNormalizeHomepageWidgetPatch("weather", { weatherStyle: "evil" }), /允许范围/);
  assert.throws(() => validateAndNormalizeHomepageWidgetPatch("HOT", { source: "unknown-source" }), /允许范围/);
  assert.deepEqual(validateAndNormalizeHomepageWidgetPatch("weather", { cityName: "西安", weatherStyle: "simple1" }), { cityName: "西安", weatherStyle: "simple1" });
});

test("custom-web 只接受无凭据的 http/https URL，且所有字段拒绝绝对路径", () => {
  assert.throws(() => validateAndNormalizeHomepageWidgetPatch("custom-web", { url: "javascript:alert(1)" }), /http\/https|URL/);
  assert.throws(() => validateAndNormalizeHomepageWidgetPatch("custom-web", { url: "https://user:secret@example.com" }), /不含凭据/);
  assert.throws(() => validateAndNormalizeHomepageWidgetPatch("focus", { focusBgImage: "C:\\Users\\alice\\secret.png" }), /绝对路径/);
  assert.deepEqual(validateAndNormalizeHomepageWidgetPatch("custom-web", { url: "https://example.com/page" }), { url: "https://example.com/page" });
});

test("高级能力不能通过 widget patch 绕过会员判断", () => {
  assert.throws(() => validateAndNormalizeHomepageWidgetPatch("favorites", { favoritesGroupingEnabled: true }), /高级功能/);
  assert.throws(() => validateAndNormalizeHomepageWidgetPatch("dailyQuote", { dailyQuoteMode: "remote" }), /高级功能/);
  assert.throws(() => validateAndNormalizeHomepageWidgetPatch("timedate", { timeType: "dial9" }), /高级功能/);
  assert.deepEqual(validateAndNormalizeHomepageWidgetPatch("favorites", { favoritesGroupingEnabled: true }, { advancedEnabled: true }), { favoritesGroupingEnabled: true });
});

test("创建和更新组件保持真实 data 形状并固定 type/instanceId", () => {
  const created = createHomepageWidgetConfig("latest-docs", "widget-1", { limit: 10 });
  assert.equal(created.type, "latest-docs");
  assert.equal(created.instanceId, "widget-1");
  assert.ok(Array.isArray(created.data));
  assert.equal((created.data as Array<Record<string, unknown>>)[0].limit, 10);
  const updated = applyHomepageWidgetPatch(created, "latest-docs", { latestDocsTitle: "近期" });
  assert.equal(updated.type, "latest-docs");
  assert.equal(updated.instanceId, "widget-1");
  assert.equal((updated.data as Array<Record<string, unknown>>)[0].latestDocsTitle, "近期");
});

test("高级组件目录与单实例约束覆盖真实锁定组件", () => {
  for (const type of ["accounting", "countdown", "fixedAssets", "musicPlayer", "CYBMOK", "News", "PicCaro", "reviewDocs"]) {
    assert.equal(getHomepageAgentWidgetDescriptor(type)?.advancedRequired, true, `${type} 应标记为高级能力`);
  }
  assert.equal(getHomepageAgentWidgetDescriptor("musicPlayer")?.singleton, true);
  assert.equal(getHomepageAgentWidgetDescriptor("weather")?.advancedRequired, false);
});
