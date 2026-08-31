import assert from "node:assert/strict";
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function stubPlugin(name, modules) {
    const entries = new Map(Object.entries(modules));
    const namespace = `${name}-stub`;
    return {
        name,
        setup(buildContext) {
            buildContext.onResolve({ filter: /.*/ }, (args) => {
                const module = entries.get(args.path);
                if (module === undefined) return undefined;
                if (typeof module === "object" && module.path) return { path: module.path };
                return { path: args.path, namespace };
            });
            buildContext.onLoad({ filter: /.*/, namespace }, (args) => ({
                contents: entries.get(args.path),
                loader: "js",
            }));
        },
    };
}

async function loadModule(entry, modules = {}, pluginName = "v4101-compatibility-stubs") {
    const bundled = await build({
        entryPoints: [resolve(root, entry)],
        bundle: true,
        format: "esm",
        platform: "node",
        target: "node24",
        write: false,
        plugins: [stubPlugin(pluginName, modules)],
    });
    const bundleText = new TextDecoder().decode(bundled.outputFiles[0].contents);
    return import(`data:text/javascript,${encodeURIComponent(bundleText)}`);
}

async function verifySelectionAi() {
    const selectionAi = await loadModule("src/features/kb/services/selection-ai/selection-ai-defaults.ts");

    // v4.10.1: enabledActions + global model/generation fields, with no skills.
    const migrated = selectionAi.normalizeSelectionAiToolbarSettings({
        enabledActions: ["ask", "unknown", "ask"],
        providerId: "legacy-provider",
        modelId: "legacy-model",
        temperature: 0.7,
        maxOutputChars: 4200,
        maxSelectedTextChars: 5200,
        stream: false,
        skills: [],
    });
    const ask = migrated.skills.find((skill) => skill.id === "builtin:ask");
    const explain = migrated.skills.find((skill) => skill.id === "builtin:explain");
    assert.equal(ask?.enabled, true);
    assert.equal(ask?.modelProviderId, "legacy-provider");
    assert.equal(ask?.modelId, "legacy-model");
    assert.equal(ask?.temperature, 0.7);
    assert.equal(ask?.maxOutputChars, 4200);
    assert.equal(ask?.maxSelectedTextChars, 5200);
    assert.equal(ask?.stream, false);
    assert.equal(explain?.enabled, false);

    // Explicit current skill fields win over the old global fields; deprecated IDs disappear.
    const explicit = selectionAi.normalizeSelectionAiToolbarSettings({
        enabledActions: ["ask"],
        providerId: "legacy-provider",
        modelId: "legacy-model",
        temperature: 0.7,
        skills: [
            {
                id: "builtin:ask",
                builtin: true,
                modelProviderId: "current-provider",
                modelId: "current-model",
                temperature: 1.1,
                enabled: true,
            },
            { id: "builtin:grammar", builtin: true, enabled: true },
        ],
    });
    const explicitAsk = explicit.skills.find((skill) => skill.id === "builtin:ask");
    assert.equal(explicitAsk?.modelProviderId, "current-provider");
    assert.equal(explicitAsk?.modelId, "current-model");
    assert.equal(explicitAsk?.temperature, 1.1);
    assert.equal(explicit.skills.some((skill) => skill.id === "builtin:grammar"), false);

    // v4.10.1 explicit non-array enabledActions means all built-ins disabled.
    const malformedActions = selectionAi.normalizeSelectionAiToolbarSettings({ enabledActions: "ask" });
    assert.equal(malformedActions.skills.every((skill) => skill.enabled === false), true);
}

const notificationTargetStub = `
export function normalizeNotificationDeliveryTargets(value) {
    if (!Array.isArray(value)) return [];
    const result = [];
    const seen = new Set();
    for (const raw of value) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
        let target;
        if (raw.kind === "desktop") target = { kind: "desktop" };
        else if (raw.kind === "mobile") target = { kind: "mobile" };
        else if (raw.kind === "external-default") target = { kind: "external-default" };
        else if (raw.kind === "external" && typeof raw.channelId === "string" && raw.channelId.trim()) {
            target = { kind: "external", channelId: raw.channelId.trim() };
        }
        if (!target) continue;
        const key = target.kind === "external" ? "external:" + target.channelId : target.kind;
        if (!seen.has(key)) {
            seen.add(key);
            result.push(target);
        }
    }
    return result;
}
`;

const notificationStubs = {
    "@/features/notification-center/notification-center-target-resolver": notificationTargetStub,
    "@/features/notification-center/notification-center-events": "export function broadcastNotificationCenterEvent() {}",
    "@/features/notification-center/notification-center-plugin": "export function assertNotificationCenterFeatureAvailable() {}",
    "@/features/notification-center/notification-center-mobile-plan-manager": "export function requestMobilePlanRefresh() {}",
    "@/features/notification-center/notification-center-locks": `
        export function notificationLockName(value) { return value; }
        export async function withNotificationLock(_name, callback) { return callback(); }
    `,
    "@/features/notification-center/notification-center-storage": `
        export async function readJSON(_key, schema) {
            const value = globalThis.__v4101NotificationData ?? null;
            if (value === null) return null;
            return schema && typeof schema.parse === "function" ? schema.parse(value) : value;
        }
        export async function writeJSON() {}
    `,
    "@/components/utils/widgetBlock/widget/countdown/countdownTypes":
        "export const COUNTDOWN_EVENT_KINDS = ['birthday', 'anniversary', 'custom'];",
};

async function verifyNotifications() {
    const task = await loadModule(
        "src/features/task-notify/task-notify-settings-store.ts",
        notificationStubs,
        "v4101-task-notification-stubs",
    );
    const countdown = await loadModule(
        "src/features/countdown-notify/countdown-notify-settings-store.ts",
        notificationStubs,
        "v4101-countdown-notification-stubs",
    );
    const enhanced = await loadModule(
        "src/features/enhanced-diary-notify/enhanced-diary-notify-settings-store.ts",
        notificationStubs,
        "v4101-enhanced-notification-stubs",
    );
    const review = await loadModule(
        "src/features/review-notify/review-notify-settings-store.ts",
        notificationStubs,
        "v4101-review-notification-stubs",
    );

    const taskLegacy = task.normalizeTaskNotifySettings({
        rules: [{ id: "legacy-task", type: "task_reminder", channelIds: [" old-a ", "old-a", 12, "old-b"] }],
    });
    assert.deepEqual(taskLegacy.rules[0].deliveryTargets, [
        { kind: "external", channelId: "old-a" },
        { kind: "external", channelId: "old-b" },
    ]);
    const taskCurrentWins = task.normalizeTaskNotifySettings({
        rules: [{
            id: "current-task",
            type: "task_reminder",
            deliveryTargets: [{ kind: "desktop" }],
            channelIds: ["must-not-win"],
        }],
    });
    assert.deepEqual(taskCurrentWins.rules[0].deliveryTargets, [{ kind: "desktop" }]);
    assert.deepEqual(
        task.normalizeTaskNotifySettings({ rules: [{ id: "empty", type: "task_reminder", channelIds: [] }] }).rules[0].deliveryTargets,
        [{ kind: "external-default" }],
    );

    const countdownLegacy = countdown.normalizeCountdownNotifySettings({
        rules: [{ id: "legacy-countdown", type: "today_events", channelIds: ["countdown-channel"] }],
        eventOverrides: [{ eventId: "event-1", mode: "custom", channelIds: ["must-not-migrate"] }],
    });
    assert.deepEqual(countdownLegacy.rules[0].deliveryTargets, [
        { kind: "external", channelId: "countdown-channel" },
    ]);
    assert.deepEqual(countdownLegacy.eventOverrides[0].deliveryTargets, [{ kind: "external-default" }]);

    const enhancedLegacy = enhanced.normalizeEnhancedDiaryNotifySettings({
        rules: [{ id: "legacy-diary", type: "today_diary_missing", channelIds: ["diary-channel"] }],
    });
    assert.deepEqual(enhancedLegacy.rules[0].deliveryTargets, [
        { kind: "external", channelId: "diary-channel" },
    ]);

    // v4.10.1 review data already used deliveryTargets; channelIds stays ignored.
    globalThis.__v4101NotificationData = {
        version: 1,
        enabled: true,
        scanIntervalMs: 60000,
        catchUpWindowMinutes: 30,
        maxItemsPerMessage: 20,
        includePath: true,
        includeNote: true,
        includeSiyuanLink: true,
        rules: [{
            id: "review-current",
            type: "today_digest",
            enabled: true,
            title: "复习",
            time: "08:00",
            deliveryTargets: [{ kind: "external", channelId: "review-channel" }],
            channelIds: ["must-not-migrate"],
        }],
    };
    review.setReviewNotifyPlugin({});
    const reviewLoaded = await review.loadReviewNotifySettings();
    assert.deepEqual(reviewLoaded.rules[0].deliveryTargets, [
        { kind: "external", channelId: "review-channel" },
    ]);
    assert.equal("channelIds" in reviewLoaded.rules[0], false);
}

async function verifyKbSettings() {
    const kb = await loadModule(
        "src/features/kb/services/settings/kb-settings-service.ts",
        {
            "@/features/kb/services/settings/chat-provider-config": `
                export function sanitizeChatProviders() { return []; }
                export function resolveSelectedChatConfig() {
                    return { provider: undefined, model: undefined, selectedProviderId: "", selectedModelId: "" };
                }
            `,
            "./kb-sensitive-secret-crypto": `
                export function createEmptySecretDecryptDiagnostics() {
                    return {
                        hasDecryptFailure: false,
                        failedChatProviderIds: [],
                        failedLocations: [],
                        encryptedSecretCount: 0,
                        plaintextSecretCount: 0,
                        secretStoragePresent: false,
                        secretStorageValidLength: 0,
                    };
                }
                export function setKbSensitiveSecretCryptoPlugin() {}
                export function isEncryptedSecret() { return false; }
                export function normalizeSensitiveSecretsFromRuntime(value) { return value; }
                export function encryptSensitiveSecretsForStorage(value) { return value; }
                export async function decryptSensitiveSecretsFromStorage(value) {
                    return { settings: value, diagnostics: createEmptySecretDecryptDiagnostics() };
                }
            `,
            "../agent-workbench/debug/workbench-debug": "export function pushAgentDebugEvent() {}",
        },
        "v4101-kb-settings-stubs",
    );

    // Formal v4.10.1 builtin skill names migrate only when current tool fields are absent.
    const skillMigrated = kb.mergeKbSettings({
        skillSettings: {
            disabledBuiltinSkillNames: ["builtin_doc_content_editing", "builtin_knowledge_base_qa", "unknown_skill"],
        },
    });
    assert.equal(skillMigrated.toolSettings.disabledGlobalToolNames.includes("siyuan_doc_edit"), true);
    assert.equal(skillMigrated.toolSettings.disabledGlobalToolNames.includes("siyuan_kb"), true);
    assert.equal(skillMigrated.toolSettings.disabledGlobalToolNames.includes("unknown_skill"), false);

    const mixedLegacy = kb.mergeKbSettings({
        toolSettings: { disabledGlobalToolNames: ["search_scope"] },
        skillSettings: { disabledBuiltinSkillNames: ["builtin_doc_content_editing"] },
    });
    assert.equal(mixedLegacy.toolSettings.disabledGlobalToolNames.includes("siyuan_kb"), true);
    assert.equal(mixedLegacy.toolSettings.disabledGlobalToolNames.includes("siyuan_doc_edit"), true);

    const currentWins = kb.mergeKbSettings({
        toolSettings: { schemaVersion: 1, disabledGlobalToolNames: ["siyuan_kb"] },
        skillSettings: { disabledBuiltinSkillNames: ["builtin_doc_content_editing"] },
    });
    assert.deepEqual(currentWins.toolSettings.disabledGlobalToolNames, ["siyuan_kb"]);

    // Formal old tool maps: old names are normalized, obsolete homepage target is discarded,
    // and old dangerous/tool-level confirmations become current action overrides.
    const oldSettings = kb.mergeKbSettings({
        toolSettings: {
            disabledGlobalToolNames: ["search_scope", "homepage_countdown", "homepage_manage", "unknown_tool"],
            disabledWriteToolConfirmationNames: ["siyuan_doc_edit", "unknown_tool"],
            disabledDangerousSkillToolConfirmationNames: ["create_doc", "unknown_tool"],
            toolActionConfirmOverrides: {
                siyuan_doc_edit: { create_doc: true, update_block: "invalid" },
                unknown_tool: { anything: false },
            },
        },
    });
    assert.equal(oldSettings.toolSettings.disabledGlobalToolNames.includes("siyuan_kb"), true);
    assert.equal(oldSettings.toolSettings.disabledGlobalToolNames.includes("homepage_manage"), true);
    assert.equal(oldSettings.toolSettings.disabledGlobalToolNames.includes("homepage_anniversary"), false);
    assert.equal(oldSettings.toolSettings.disabledGlobalToolNames.includes("homepage_countdown"), false);
    assert.equal(oldSettings.toolSettings.disabledSubtools?.homepage_components.includes("anniversary"), true);
    assert.equal(oldSettings.toolSettings.toolActionConfirmOverrides?.siyuan_doc_edit.create_doc, true);
    assert.equal(oldSettings.toolSettings.toolActionConfirmOverrides?.siyuan_doc_edit.update_block, false);
    assert.equal("disabledDangerousSkillToolConfirmationNames" in oldSettings.toolSettings, false);
    assert.equal("unknown_tool" in (oldSettings.toolSettings.toolActionConfirmOverrides ?? {}), false);

    const unsafeLegacy = kb.mergeKbSettings({
        toolSettings: {
            disabledDangerousSkillToolConfirmationNames: ["create_doc", "mcp_save_server", "unknown_tool"],
        },
    });
    assert.equal(unsafeLegacy.toolSettings.toolActionConfirmOverrides?.siyuan_doc_edit.create_doc, false);
    assert.equal(unsafeLegacy.toolSettings.toolActionConfirmOverrides?.mcp_manage?.save_server, undefined);
    assert.equal("unknown_tool" in (unsafeLegacy.toolSettings.toolActionConfirmOverrides ?? {}), false);
    assert.deepEqual(Object.keys(unsafeLegacy.toolSettings.toolActionConfirmOverrides ?? {}), ["siyuan_doc_edit"]);

    const dangerousCurrentWins = kb.mergeKbSettings({
        toolSettings: {
            toolActionConfirmOverrides: { siyuan_doc_edit: { create_doc: true } },
            disabledDangerousSkillToolConfirmationNames: ["create_doc"],
        },
    });
    assert.equal(dangerousCurrentWins.toolSettings.toolActionConfirmOverrides?.siyuan_doc_edit.create_doc, true);

    let storedValue = "";
    let loadError = null;
    let saveCalls = 0;
    const plugin = {
        async loadData(key) {
            assert.equal(key, "kb-settings");
            if (loadError) throw loadError;
            return storedValue;
        },
        async saveData(key, value) {
            assert.equal(key, "kb-settings");
            saveCalls += 1;
            storedValue = value;
        },
    };
    kb.setKbSettingsPlugin(plugin);

    // Storage root: only null, undefined, and exact empty string are missing.
    for (const missing of [null, undefined, ""]) {
        storedValue = missing;
        saveCalls = 0;
        assert.equal(typeof (await kb.getKbSettings()), "object");
        assert.equal(saveCalls, 0);
    }
    for (const invalid of [" ", "\n", "{}", "abc", "null", [], 0, 123, true, false]) {
        storedValue = invalid;
        await assert.rejects(
            () => kb.getKbSettings(),
            (error) => error instanceof Error && error.message === "KB settings storage format invalid",
        );
    }
    storedValue = { enabled: true };
    assert.equal(typeof (await kb.getKbSettings()), "object");
    loadError = new Error("I/O failure");
    await assert.rejects(() => kb.getKbSettings(), { message: "I/O failure" });
    loadError = null;

    // Missing storage remains read-only, while the first real save creates current data.
    storedValue = "";
    saveCalls = 0;
    const saved = await kb.saveKbSettings({ agentThinkingEnabled: false });
    assert.equal(saveCalls, 1);
    assert.equal(typeof storedValue, "object");
    assert.equal(saved.agentThinkingEnabled, false);
    assert.equal((await kb.getKbSettings()).agentThinkingEnabled, false);
}

async function verifyProviderPreset() {
    const providerConfig = await loadModule(
        "src/features/kb/services/settings/chat-provider-config.ts",
        { "../qa/model-list-discovery": "export function isKimiProviderType() { return false; }" },
        "v4101-provider-stubs",
    );
    const providers = providerConfig.sanitizeChatProviders([
        {
            id: "siliconflow",
            name: "SiliconFlow",
            baseUrl: "https://api.siliconflow.cn/v1",
            models: [{ id: "deepseek-chat" }],
        },
    ], 0.3);
    assert.equal(providers[0].type, "openai-compatible");
}

async function verifyLayoutTemplateCompatibility() {
    const layout = await loadModule(
        "src/homepage/templates/userLayoutTemplates.ts",
        {
            "@/homepage/utils/deviceProfile": `
                export function isDesktopDeviceProfileEnabled() { return true; }
            `,
            "@/api": "export async function getFileOrNullChecked() { return null; }",
            "@/libs/runtime-id": "export function createRuntimeUuid() { return 'runtime'; }",
            "./templateLayoutReferences": "export function collectLayoutReferencedIdsForCleanup() { return new Set(); }",
            "@/components/utils/widgetBlock/utils/layout-shared": `
                export function getActiveSectionIdFromLayout(layout, deviceId) {
                    return layout?.profiles?.[deviceId]?.activeSectionId ?? null;
                }
                export async function loadLayoutSnapshotForContext() {
                    return globalThis.__v4101LayoutSnapshot;
                }
                export function normalizeLayoutItems(items) { return items; }
                export function resolveEffectiveWidgetLayoutSettings() {
                    return { widgetLayoutNumber: 2, widgetGap: 8 };
                }
                export async function runInSurfaceTransaction(_key, callback) { return callback(); }
                export async function saveLayoutDataForContext() {}
                export function validateFullProfileSectionsReadOnly() { return true; }
            `,
            "@/components/utils/widgetBlock/utils/layout-section-ops": `
                export function assertSectionLayoutInvariants() {}
                export function reindexLayoutItems(items) { return items; }
            `,
            "@/homepage/deviceView/deviceViewContext": `
                export function getCurrentDeviceViewContext() { return globalThis.__v4101LayoutContext; }
            `,
            "@/homepage/deviceView/deviceViewPaths": "export function getPluginStorageRoot() { return 'root'; }",
            "@/homepage/deviceView/widgetInstanceRepository": `
                export function createWidgetInstanceConfig(_context, _widgetId, config) { return config; }
                export function createWidgetInstanceId() { return 'created-widget'; }
                export async function deleteWidgetInstance() {}
                export async function readWidgetInstanceDocument(_context, widgetId) {
                    return globalThis.__v4101LayoutDocs?.[widgetId] ?? null;
                }
            `,
            "@/homepage/deviceView/jsonSafe": {
                path: resolve(root, "src/homepage/deviceView/jsonSafe.ts"),
            },
        },
        "v4101-layout-stubs",
    );

    const legacy = {
        id: "legacy-published-layout",
        name: "旧公开布局",
        createdAt: 1,
        updatedAt: 2,
        deviceId: "old-device-id",
        columns: 2,
        gap: 8,
        layoutItems: [
            { widgetId: "keep-widget", order: 0, style: "background: #fff" },
            { widgetId: "missing-widget", order: 1, style: null },
        ],
    };
    const withoutLegacyDeviceId = Object.fromEntries(
        Object.entries(legacy).filter(([key]) => key !== "deviceId"),
    );
    const current = {
        ...withoutLegacyDeviceId,
        layoutItems: [{ widgetId: "keep-widget", order: 0, style: null }],
        widgetConfigs: { "keep-widget": { type: "quick_note" } },
    };
    assert.equal(layout.classifyTemplateStructure(legacy), "published-legacy");
    assert.equal(layout.isLegacyUserLayoutTemplate(legacy), true);
    assert.equal(layout.classifyTemplateStructure(current), "current");
    assert.equal(layout.classifyTemplateStructure({ ...withoutLegacyDeviceId, widgetConfigs: null }), "invalid");
    assert.equal(layout.classifyTemplateStructure({ ...withoutLegacyDeviceId, widgetConfigs: undefined }), "invalid");

    const deviceId = "current-device-id";
    globalThis.__v4101LayoutContext = { scopeId: deviceId, surface: "desktop-homepage" };
    globalThis.__v4101LayoutSnapshot = {
        deviceId,
        surface: "desktop-homepage",
        revision: 7,
        layout: {
            profiles: {
                [deviceId]: {
                    componentSectionsModeEnabled: false,
                    order: [
                        { id: "keep-widget", style: null },
                        { id: "other-widget", style: null },
                    ],
                },
            },
        },
    };
    globalThis.__v4101LayoutDocs = {
        "keep-widget": {
            deviceId,
            surface: "desktop-homepage",
            instanceId: "keep-widget",
            revision: 3,
            config: { type: "quick_note", title: "保留" },
        },
    };
    const availability = await layout.getUserLayoutTemplateAvailability({}, legacy);
    assert.equal(availability.isLegacy, true);
    assert.equal(availability.available, true);
    assert.equal(availability.recoverableCount, 1);
    assert.equal(availability.skippedCount, 1);
}

await verifySelectionAi();
await verifyNotifications();
await verifyKbSettings();
await verifyProviderPreset();
await verifyLayoutTemplateCompatibility();
console.log("v4.10.1 compatibility verification passed");
