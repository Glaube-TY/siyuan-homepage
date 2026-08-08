import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_TOOL_SETTINGS } from "../../../../constants/default-settings";
import { findAggregateToolMeta } from "../aggregate/aggregate-tool-metadata";
import {
  assertHomepagePatchContainsNoSensitiveFields,
  sanitizeWidgetConfigForAgent,
} from "./homepage-agent-widget-sanitizer";
import { buildToolPermissionPreview } from "../../../agent-core/permissions/write-preview-builder";
import { getHomepageBusinessCapability } from "./homepage-agent-business-capabilities";

test("homepage_manage 元数据包含完整 action，并默认关闭", () => {
  const meta = findAggregateToolMeta("homepage_manage");
  assert.ok(meta);
  assert.equal(meta.readOnly, false);
  assert.equal(meta.requiresConfirmation, true);
  assert.deepEqual(
    meta.actions.map((action) => action.name),
    [
      "overview", "list_widgets", "get_widget", "list_widget_types", "get_layout", "list_sections",
      "add_widget", "update_widget", "move_widget", "remove_widget", "update_layout",
      "create_section", "rename_section", "reorder_sections", "remove_section", "set_section_mode", "set_active_section",
    ],
  );
  assert.equal(meta.actions.find((action) => action.name === "overview")?.readOnly, true);
  assert.equal(meta.actions.find((action) => action.name === "remove_widget")?.readOnly, false);
  assert.ok(DEFAULT_TOOL_SETTINGS.disabledGlobalToolNames.includes("homepage_manage"));
});

test("主页组件配置会递归脱敏 URL、密钥和绝对路径", () => {
  const result = sanitizeWidgetConfigForAgent({
    token: "secret-token",
    nested: { encryptedPassword: "cipher", ordinary: "ok" },
    url: "https://example.com/path?token=abc&view=1",
    musicFolderPath: "C:\\Users\\alice\\Music",
    headers: { Authorization: "Bearer abc" },
  }) as Record<string, unknown>;
  assert.equal(result.token, "[REDACTED]");
  assert.deepEqual(result.nested, { encryptedPassword: "[REDACTED]", ordinary: "ok" });
  assert.match(String(result.url), /token=\[REDACTED\]/);
  assert.deepEqual(result.musicFolderPath, { configured: true, basename: "Music", pathKind: "local" });
  assert.equal(result.headers, "[REDACTED]");
});

test("主页配置 patch 拒绝任意层级敏感字段", () => {
  assert.throws(
    () => assertHomepagePatchContainsNoSensitiveFields({ data: { accessToken: "x" } }),
    /敏感配置/,
  );
  assert.doesNotThrow(() => assertHomepagePatchContainsNoSensitiveFields({ data: { cityName: "西安" } }));
});

test("主页删除与更新预览使用正确风险并脱敏", () => {
  const tool = { name: "homepage_manage", title: "主页管理", readOnly: false } as never;
  const remove = buildToolPermissionPreview(tool, { action: "remove_widget", args: { surface: "desktop-homepage", widgetId: "block-1", expectedType: "accounting", expectedLabel: "记账" } });
  assert.equal(remove.risk, "high");
  assert.match(remove.targetSummary ?? "", /记账/);
  assert.match(remove.warnings?.join("\n") ?? "", /不会删除对应业务数据/);
  const update = buildToolPermissionPreview(tool, { action: "update_widget", args: { widgetId: "block-2", expectedType: "weather", expectedValues: { cityName: "北京", token: "old-secret" }, patch: { token: "secret", cityName: "西安" } } });
  assert.equal(update.risk, "medium");
  assert.doesNotMatch(JSON.stringify(update), /secret/);
  assert.match(JSON.stringify(update), /\[REDACTED\]/);
  assert.match(JSON.stringify(update), /当前值/);
  assert.match(JSON.stringify(update), /新值/);
  const move = buildToolPermissionPreview(tool, { action: "move_widget", args: { widgetId: "block-3", expectedType: "weather", expectedIndex: 3, expectedSectionId: "work", targetIndex: 0, targetSectionId: "life" } });
  assert.match(JSON.stringify(move), /当前位置/);
  assert.match(JSON.stringify(move), /当前分栏/);
  assert.match(JSON.stringify(move), /目标分栏/);
  const removeSection = buildToolPermissionPreview(tool, { action: "remove_section", args: { sectionId: "work", expectedWidgetCount: 4, expectedReceivingSectionId: "life" } });
  assert.equal(removeSection.risk, "high");
  assert.match(JSON.stringify(removeSection), /分栏组件数/);
  assert.match(JSON.stringify(removeSection), /接收分栏/);
  const updateLayout = buildToolPermissionPreview(tool, { action: "update_layout", args: { expectedWidgetLayoutNumber: 4, expectedWidgetGap: 12, widgetLayoutNumber: 5, widgetGap: 16 } });
  assert.match(JSON.stringify(updateLayout), /当前列数/);
  assert.match(JSON.stringify(updateLayout), /新列数/);
  assert.match(JSON.stringify(updateLayout), /当前间距/);
  assert.match(JSON.stringify(updateLayout), /新间距/);
});

test("首页组件业务工具默认关闭且 action 元数据完整", () => {
  const expected: Record<string, string[]> = {
    homepage_quick_note: ["status", "write"],
    homepage_focus: ["stats", "record_session"],
    homepage_accounting: ["overview", "query_records", "summary", "add_record", "update_record", "archive_record", "list_accounts", "add_account", "update_account", "archive_account", "category_report"],
    homepage_fixed_assets: ["list", "get", "add", "update", "archive", "cost_summary"],
    homepage_countdown: ["list", "get", "add", "update", "archive", "restore", "delete_permanently", "list_categories", "create_category", "update_category", "archive_category", "delete_category"],
    homepage_favorites: ["list", "add", "remove", "move_to_group", "list_groups", "create_group", "rename_group", "delete_group", "reorder"],
    homepage_review: ["list", "summary", "schedule", "update_plan", "complete", "postpone", "finish", "remove"],
    homepage_music: ["status", "search", "list_playlists", "create_playlist", "rename_playlist", "delete_playlist", "add_to_playlist", "remove_from_playlist", "favorite", "unfavorite", "play", "pause", "resume", "next", "previous", "seek", "set_volume"],
  };
  for (const [name, actions] of Object.entries(expected)) {
    const meta = findAggregateToolMeta(name);
    assert.ok(meta, `${name} metadata missing`);
    assert.deepEqual(meta.actions.map((action) => action.name), actions);
    assert.ok(DEFAULT_TOOL_SETTINGS.disabledGlobalToolNames.includes(name as never));
  }
});

test("所有主页 Agent action 都向 agent_tool_help 提供严格参数 schema", () => {
  const names = [
    "homepage_manage", "homepage_quick_note", "homepage_focus", "homepage_accounting",
    "homepage_fixed_assets", "homepage_countdown", "homepage_favorites", "homepage_review", "homepage_music",
  ] as const;
  for (const name of names) {
    const meta = findAggregateToolMeta(name);
    assert.ok(meta);
    for (const action of meta.actions) {
      const schema = action.argsSchema as { type?: string; additionalProperties?: boolean } | undefined;
      assert.equal(schema?.type, "object", `${name}.${action.name} 缺少 object schema`);
      assert.equal(schema?.additionalProperties, false, `${name}.${action.name} 必须拒绝未知参数`);
    }
  }
});

test("最新产品路由不再注册主页任务和赛博木鱼工具", () => {
  assert.deepEqual(getHomepageBusinessCapability("TaskMan"), {
    businessTool: "diary_task", supported: true, reusedExistingTool: true,
  });
  assert.deepEqual(getHomepageBusinessCapability("TaskManPlus"), {
    businessTool: "diary_task", supported: true, reusedExistingTool: true,
  });
  assert.deepEqual(getHomepageBusinessCapability("CYBMOK"), {
    businessTool: null, supported: false, reason: "no_dedicated_business_tool",
  });
  assert.equal(findAggregateToolMeta("homepage_tasks" as never), undefined);
  assert.equal(findAggregateToolMeta("homepage_cybmok" as never), undefined);
});

test("homepage_manage schema 只接受桌面/移动主页且不允许指定设备", () => {
  const meta = findAggregateToolMeta("homepage_manage");
  assert.ok(meta);
  for (const action of meta.actions) {
    const schema = action.argsSchema as { properties?: Record<string, { enum?: string[] }> };
    assert.equal("deviceId" in (schema.properties ?? {}), false, `${action.name} 不得暴露 deviceId`);
    const surface = schema.properties?.surface;
    if (surface?.enum) assert.deepEqual(surface.enum, ["desktop-homepage", "mobile-homepage"]);
  }
  assert.equal(meta.actions.find((action) => action.name === "remove_widget")?.boundary, undefined);
  assert.match(meta.actions.find((action) => action.name === "remove_section")?.boundary ?? "", /高风险/);
  assert.deepEqual(meta.actions.find((action) => action.name === "add_widget")?.required, ["widgetType", "expectedLabel", "expectedLayoutRevision"]);
  assert.ok(meta.actions.find((action) => action.name === "remove_widget")?.required?.includes("expectedLabel"));
  assert.ok(meta.actions.find((action) => action.name === "update_layout")?.required?.includes("expectedWidgetLayoutNumber"));
  assert.ok(meta.actions.find((action) => action.name === "update_layout")?.required?.includes("expectedWidgetGap"));
});

test("组件业务写入预览显示领域字段", () => {
  const focusTool = { name: "homepage_focus", title: "主页专注记录", readOnly: false } as never;
  const focus = buildToolPermissionPreview(focusTool, { action: "record_session", args: { startedAt: "2026-08-08T08:00:00+08:00", endedAt: "2026-08-08T08:50:00+08:00", plannedSeconds: 3000, actualFocusSeconds: 3000, status: "completed" } });
  assert.match(focus.summary ?? "", /3000 秒/);
  const assetTool = { name: "homepage_fixed_assets", title: "主页固定资产", readOnly: false } as never;
  const asset = buildToolPermissionPreview(assetTool, { action: "add", args: { name: "显示器", purchasePrice: 2399, purchaseDate: "2026-08-08", category: "电子设备" } });
  assert.equal(asset.risk, "medium");
  assert.match(JSON.stringify(asset), /2399/);
  const archive = buildToolPermissionPreview(assetTool, { action: "archive", args: { assetId: "fixed-asset-1", expectedUpdatedAt: "2026-08-08T00:00:00.000Z" } });
  assert.equal(archive.risk, "high");
  assert.match(archive.warnings?.join("\n") ?? "", /不是永久删除/);
  const countdownTool = { name: "homepage_countdown", title: "主页纪念日", readOnly: false } as never;
  const permanent = buildToolPermissionPreview(countdownTool, { action: "delete_permanently", args: { eventId: "countdown-1", expectedUpdatedAt: "x", expectedRevision: 3 } });
  assert.equal(permanent.risk, "high");
  assert.match(permanent.warnings?.join("\n") ?? "", /永久删除，不是归档/);
  const deleteCategory = buildToolPermissionPreview(countdownTool, { action: "delete_category", args: { categoryId: "category-1", expectedRevision: 3, expectedEventCount: 4, moveToCategoryId: null } });
  assert.match(JSON.stringify(deleteCategory), /4 个事件/);
  const reviewTool = { name: "homepage_review", title: "主页复习计划", readOnly: false } as never;
  const removeReview = buildToolPermissionPreview(reviewTool, { action: "remove", args: { targetId: "20260808000000-abcdefg", targetType: "doc", expectedUpdatedAt: "x" } });
  assert.equal(removeReview.risk, "high");
  assert.match(removeReview.warnings?.join("\n") ?? "", /不会删除思源文档/);
  const favoritesTool = { name: "homepage_favorites", title: "主页收藏", readOnly: false } as never;
  const deleteFavoritesGroup = buildToolPermissionPreview(favoritesTool, { action: "delete_group", args: { groupId: "g1", expectedUpdatedAt: "root", expectedGroupUpdatedAt: "group", expectedItemCount: 3 } });
  assert.equal(deleteFavoritesGroup.risk, "high");
  assert.match(JSON.stringify(deleteFavoritesGroup), /3 个收藏/);
  const musicTool = { name: "homepage_music", title: "主页音乐", readOnly: false } as never;
  const playback = buildToolPermissionPreview(musicTool, { action: "set_volume", args: { volume: 0.4, encryptedPassword: "secret" } });
  assert.equal(playback.risk, "low");
  assert.doesNotMatch(JSON.stringify(playback), /secret/);
});
