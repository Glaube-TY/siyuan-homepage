<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import { confirmDialogBoolean, safeConfirmContent } from "@/libs/dialog";
    import {
        createNotifyBridgeChannelId,
        loadNotifyBridgeSettings,
        notifyBridge,
        redactHeaders,
        redactSecret,
        redactUrl,
        saveNotifyBridgeSettings,
        type NotifyBridgeChannel,
        type NotifyBridgeChannelType,
        type NotifyBridgeFeishuChannel,
        type NotifyBridgeSettings,
        type NotifyBridgeWebhookChannel,
    } from "@/features/notify-bridge";
    import { DEFAULT_NOTIFY_BRIDGE_SETTINGS } from "@/features/notify-bridge/constants";
    import {
        DEFAULT_TASK_NOTIFY_SETTINGS,
        loadTaskNotifySettings,
        saveTaskNotifySettings,
        createTaskNotifyRule,
        type TaskNotifyRule,
        type TaskNotifyRuleType,
        type TaskNotifySettings,
    } from "@/features/task-notify";
    import {
        DEFAULT_COUNTDOWN_NOTIFY_SETTINGS,
        loadCountdownNotifySettings,
        saveCountdownNotifySettings,
        createCountdownNotifyRule,
        type CountdownNotifyRule,
        type CountdownNotifyRuleType,
        type CountdownNotifySettings,
    } from "@/features/countdown-notify";
    import { loadCountdownEvents } from "@/components/utils/widgetBlock/widget/countdown/countdownData";
    import {
        DEFAULT_ENHANCED_DIARY_NOTIFY_SETTINGS,
        loadEnhancedDiaryNotifySettings,
        saveEnhancedDiaryNotifySettings,
        createEnhancedDiaryNotifyRule,
        type EnhancedDiaryNotifyRule,
        type EnhancedDiaryNotifyRuleType,
        type EnhancedDiaryNotifySettings,
    } from "@/features/enhanced-diary-notify";

    interface Props {
        advancedEnabled?: boolean;
        plugin?: any;
    }

    let { advancedEnabled = false, plugin = null }: Props = $props();

    type EditorState = {
        mode: "create" | "edit";
        type: NotifyBridgeChannelType;
        id: string;
        title: string;
        enabled: boolean;
        url: string;
        webhookUrl: string;
        secret: string;
        clearSecret: boolean;
        headersText: string;
        bodyTemplateMode: "default" | "customJson";
        customJsonTemplate: string;
        messageFormat: "text" | "post";
        timeoutMs: number;
    };

    let settings = $state<NotifyBridgeSettings>({ ...DEFAULT_NOTIFY_BRIDGE_SETTINGS, channels: [], defaultChannelIds: [] });
    const bridgeEditable = $derived(advancedEnabled && settings.enabled);
    let taskSettings = $state<TaskNotifySettings>({ ...DEFAULT_TASK_NOTIFY_SETTINGS, rules: [] });
    let loading = $state(true);
    let saving = $state(false);
    let testingChannelId = $state("");
    let errorMessage = $state("");
    let recentResult = $state("");
    let showEditor = $state(false);
    let editorError = $state("");
    let editor = $state<EditorState>(createEditor("webhook"));
    let selectedTaskRuleType = $state<TaskNotifyRuleType>("today_digest");
    let expandedTaskRuleIds = $state<Set<string>>(new Set());

    // Keep selectedTaskRuleType in sync with available types
    $effect(() => {
        const available = getAvailableTaskRuleTypes();
        if (available.length > 0 && !available.includes(selectedTaskRuleType)) {
            selectedTaskRuleType = available[0];
        }
    });

    let countdownSettings = $state<CountdownNotifySettings>({ ...DEFAULT_COUNTDOWN_NOTIFY_SETTINGS, rules: [] });
    let selectedCountdownRuleType = $state<CountdownNotifyRuleType>("today_events");
    let expandedCountdownRuleIds = $state<Set<string>>(new Set());
    let countdownLocalEventCount = $state<number | null>(null);
    let countdownLocalStorageMessage = $state("正在读取本地纪念日数据...");

    // Keep selectedCountdownRuleType in sync with available types
    $effect(() => {
        const available = getAvailableCountdownRuleTypes();
        if (available.length > 0 && !available.includes(selectedCountdownRuleType)) {
            selectedCountdownRuleType = available[0];
        }
    });

    let enhancedDiarySettings = $state<EnhancedDiaryNotifySettings>({ ...DEFAULT_ENHANCED_DIARY_NOTIFY_SETTINGS, rules: [] });
    let selectedEnhancedDiaryRuleType = $state<EnhancedDiaryNotifyRuleType>("today_diary_missing");
    let expandedEnhancedDiaryRuleIds = $state<Set<string>>(new Set());

    // Keep selectedEnhancedDiaryRuleType in sync with available types
    $effect(() => {
        const available = getAvailableEnhancedDiaryRuleTypes();
        if (available.length > 0 && !available.includes(selectedEnhancedDiaryRuleType)) {
            selectedEnhancedDiaryRuleType = available[0];
        }
    });

    onMount(async () => {
        await refreshSettings();
    });

    async function refreshSettings(): Promise<void> {
        loading = true;
        errorMessage = "";
        try {
            const [notifySettings, loadedTaskSettings, loadedCountdownSettings, loadedEnhancedDiarySettings] = await Promise.all([
                loadNotifyBridgeSettings(),
                loadTaskNotifySettings(),
                loadCountdownNotifySettings(),
                loadEnhancedDiaryNotifySettings(),
            ]);
            settings = notifySettings;
            taskSettings = loadedTaskSettings;
            countdownSettings = loadedCountdownSettings;
            enhancedDiarySettings = loadedEnhancedDiarySettings;
            void refreshCountdownLocalDataStatus();
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : "读取外联通知设置失败。";
        } finally {
            loading = false;
        }
    }

    function createEditor(type: NotifyBridgeChannelType): EditorState {
        return {
            mode: "create",
            type,
            id: createNotifyBridgeChannelId(type),
            title: type === "feishu" ? "飞书机器人" : "通用 Webhook",
            enabled: true,
            url: "",
            webhookUrl: "",
            secret: "",
            clearSecret: false,
            headersText: "",
            bodyTemplateMode: "default",
            customJsonTemplate: '{\n  "msg": "{{title}}\\n{{content}}",\n  "source": "{{source}}",\n  "level": "{{level}}",\n  "url": "{{url}}"\n}',
            messageFormat: "text",
            timeoutMs: 10000,
        };
    }

    async function persist(next: NotifyBridgeSettings, successMessage = "设置已保存。"): Promise<void> {
        if (!advancedEnabled) {
            showMessage("外联通知为高级会员专属功能，请在会员服务中开通后使用。", 3500);
            return;
        }
        if (next.enabled !== settings.enabled) {
            // Allow toggling the master switch
        } else if (!bridgeEditable) {
            showMessage("外联通知桥已关闭，请先开启后再编辑。", 3500);
            return;
        }
        saving = true;
        errorMessage = "";
        try {
            settings = await saveNotifyBridgeSettings(next);
            showMessage(successMessage, 2500);
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : "保存外联通知设置失败。";
            showMessage(errorMessage, 4000);
        } finally {
            saving = false;
        }
    }

    function patchSettings(patch: Partial<NotifyBridgeSettings>): void {
        void persist({ ...settings, ...patch });
    }

    async function persistTaskSettings(next: TaskNotifySettings, successMessage = "任务通知设置已保存。"): Promise<void> {
        if (!advancedEnabled) {
            showMessage("外联通知为高级会员专属功能，请在会员服务中开通后使用。", 3500);
            return;
        }
        if (!bridgeEditable) {
            showMessage("外联通知桥已关闭，请先开启后再编辑。", 3500);
            return;
        }
        saving = true;
        errorMessage = "";
        try {
            taskSettings = await saveTaskNotifySettings(next);
            showMessage(successMessage, 2500);
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : "保存任务通知设置失败。";
            showMessage(errorMessage, 4000);
        } finally {
            saving = false;
        }
    }

    function patchTaskSettings(patch: Partial<TaskNotifySettings>): void {
        void persistTaskSettings({ ...taskSettings, ...patch });
    }

    function openNewEditor(type: NotifyBridgeChannelType): void {
        if (!advancedEnabled || !bridgeEditable) return;
        editor = createEditor(type);
        editorError = "";
        showEditor = true;
    }

    function headersToEditorText(headers: Record<string, string> | undefined): string {
        return Object.keys(headers ?? {}).map((key) => `${key}=`).join("\n");
    }

    function openEditEditor(channel: NotifyBridgeChannel): void {
        if (!advancedEnabled || !bridgeEditable) return;
        editor = {
            ...createEditor(channel.type),
            mode: "edit",
            id: channel.id,
            type: channel.type,
            title: channel.title,
            enabled: channel.enabled,
            timeoutMs: channel.timeoutMs ?? 10000,
            ...(channel.type === "webhook" ? {
                url: "",
                headersText: headersToEditorText(channel.headers),
                bodyTemplateMode: channel.bodyTemplateMode ?? "default",
                customJsonTemplate: channel.customJsonTemplate ?? "",
            } : {
                webhookUrl: "",
                secret: "",
                clearSecret: false,
                messageFormat: channel.messageFormat ?? "text",
            }),
        };
        editorError = "";
        showEditor = true;
    }

    function parseHeadersText(text: string, oldHeaders: Record<string, string> | undefined): Record<string, string> | undefined {
        const result: Record<string, string> = {};
        const old = oldHeaders ?? {};
        for (const line of text.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const index = trimmed.indexOf("=");
            if (index <= 0) continue;
            const key = trimmed.slice(0, index).trim();
            const value = trimmed.slice(index + 1);
            if (!key || key.includes("\r") || key.includes("\n")) continue;
            if (value === "" && old[key]) {
                result[key] = old[key];
            } else if (value !== "") {
                result[key] = value;
            }
        }
        return Object.keys(result).length > 0 ? result : undefined;
    }

    function normalizeTimeout(value: number): number {
        return Math.max(1000, Math.min(60000, Math.round(Number(value) || 10000)));
    }

    async function saveEditor(): Promise<void> {
        if (!bridgeEditable) {
            showMessage("外联通知桥已关闭，请先开启后再编辑。", 3500);
            return;
        }
        editorError = "";
        const title = editor.title.trim();
        if (!title) {
            editorError = "请填写渠道名称。";
            return;
        }

        const now = new Date().toISOString();
        const oldChannel = settings.channels.find((channel) => channel.id === editor.id);
        let nextChannel: NotifyBridgeChannel;

        if (editor.type === "webhook") {
            const oldWebhook = oldChannel?.type === "webhook" ? oldChannel : undefined;
            const url = editor.url.trim() || oldWebhook?.url || "";
            if (!url) {
                editorError = "请填写 Webhook URL。";
                return;
            }
            nextChannel = {
                id: editor.id,
                type: "webhook",
                title,
                enabled: editor.enabled,
                createdAt: oldChannel?.createdAt ?? now,
                updatedAt: now,
                timeoutMs: normalizeTimeout(editor.timeoutMs),
                method: "POST",
                url,
                headers: parseHeadersText(editor.headersText, oldWebhook?.headers),
                bodyTemplateMode: editor.bodyTemplateMode,
                customJsonTemplate: editor.bodyTemplateMode === "customJson" ? editor.customJsonTemplate : undefined,
            } satisfies NotifyBridgeWebhookChannel;
        } else {
            const oldFeishu = oldChannel?.type === "feishu" ? oldChannel : undefined;
            const webhookUrl = editor.webhookUrl.trim() || oldFeishu?.webhookUrl || "";
            if (!webhookUrl) {
                editorError = "请填写飞书 Webhook 地址。";
                return;
            }
            nextChannel = {
                id: editor.id,
                type: "feishu",
                title,
                enabled: editor.enabled,
                createdAt: oldChannel?.createdAt ?? now,
                updatedAt: now,
                timeoutMs: normalizeTimeout(editor.timeoutMs),
                webhookUrl,
                secret: editor.clearSecret ? undefined : (editor.secret.trim() || oldFeishu?.secret),
                messageFormat: editor.messageFormat,
            } satisfies NotifyBridgeFeishuChannel;
        }

        const channels = [
            ...settings.channels.filter((channel) => channel.id !== editor.id),
            nextChannel,
        ];
        await persist({
            ...settings,
            channels,
            defaultChannelIds: settings.defaultChannelIds.filter((id) => channels.some((channel) => channel.id === id)),
        }, "通知渠道已保存。");
        showEditor = false;
    }

    async function deleteChannel(channel: NotifyBridgeChannel): Promise<void> {
        if (!advancedEnabled || !bridgeEditable) return;
        const confirmed = await confirmDialogBoolean({
            title: "删除通知渠道",
            content: safeConfirmContent("确定删除通知渠道「", channel.title, "」吗？"),
        });
        if (!confirmed) return;
        const channels = settings.channels.filter((item) => item.id !== channel.id);
        await persist({
            ...settings,
            channels,
            defaultChannelIds: settings.defaultChannelIds.filter((id) => id !== channel.id),
        }, "通知渠道已删除。");
    }

    async function toggleChannelEnabled(channel: NotifyBridgeChannel): Promise<void> {
        if (!advancedEnabled || !bridgeEditable) return;
        await persist({
            ...settings,
            channels: settings.channels.map((item) =>
                item.id === channel.id ? { ...item, enabled: !item.enabled, updatedAt: new Date().toISOString() } : item
            ),
        }, "渠道状态已更新。");
    }

    function isDefaultChannel(channelId: string): boolean {
        return settings.defaultChannelIds.includes(channelId);
    }

    async function toggleDefaultChannel(channelId: string): Promise<void> {
        if (!advancedEnabled || !bridgeEditable) return;
        const defaultSet = new Set(settings.defaultChannelIds);
        if (defaultSet.has(channelId)) defaultSet.delete(channelId);
        else defaultSet.add(channelId);
        await persist({ ...settings, defaultChannelIds: [...defaultSet] }, "默认渠道已更新。");
    }

    async function testChannel(channel: NotifyBridgeChannel): Promise<void> {
        if (!advancedEnabled || !bridgeEditable) return;
        testingChannelId = channel.id;
        recentResult = "";
        try {
            const result = await notifyBridge.test(channel.id);
            const first = result.delivered.find((item) => item.channelId === channel.id);
            if (result.ok && first?.ok) {
                recentResult = `测试成功：${channel.title}，用时 ${first.durationMs ?? 0}ms`;
                showMessage(recentResult, 3000);
            } else {
                const error = result.errors.find((item) => item.channelId === channel.id) ?? result.errors[0];
                recentResult = `测试失败：${error?.message ?? result.message ?? "未知错误"}`;
                showMessage(recentResult, 5000);
            }
        } catch (error) {
            recentResult = `测试失败：${error instanceof Error ? error.message : "未知错误"}`;
            showMessage(recentResult, 5000);
        } finally {
            testingChannelId = "";
        }
    }

    function channelTypeLabel(type: NotifyBridgeChannelType): string {
        return type === "feishu" ? "飞书机器人" : "Webhook";
    }

    function taskRuleLabel(rule: TaskNotifyRule): string {
        switch (rule.type) {
            case "task_reminder": return "到点任务提醒";
            case "today_digest": return "今日任务摘要";
            case "tomorrow_digest": return "明日任务摘要";
            case "overdue_digest": return "逾期任务摘要";
            case "priority_digest": return "高优先级任务摘要";
            case "custom_filter_digest": return "自定义筛选任务摘要";
        }
    }

    function patchTaskRule(ruleId: string, patch: Partial<TaskNotifyRule>): void {
        const rules = taskSettings.rules.map((rule) =>
            rule.id === ruleId ? { ...rule, ...patch } : rule
        );
        void persistTaskSettings({ ...taskSettings, rules }, "任务通知规则已保存。");
    }

    function singleChannelIds(value: string): string[] | undefined {
        return value ? [value] : undefined;
    }

    function firstChannelId(rule: TaskNotifyRule): string {
        return rule.channelIds?.[0] ?? "";
    }

    function isSingletonTaskRuleType(type: TaskNotifyRuleType): boolean {
        return type !== "custom_filter_digest";
    }

    function getAvailableTaskRuleTypes(): TaskNotifyRuleType[] {
        const existingTypes = new Set(taskSettings.rules.map((r) => r.type));
        const allTypes: TaskNotifyRuleType[] = [
            "task_reminder", "today_digest", "tomorrow_digest",
            "overdue_digest", "priority_digest", "custom_filter_digest",
        ];
        return allTypes.filter((t) => !isSingletonTaskRuleType(t) || !existingTypes.has(t));
    }

    function addTaskRule(): void {
        if (!bridgeEditable) return;
        const available = getAvailableTaskRuleTypes();
        const type = available.includes(selectedTaskRuleType) ? selectedTaskRuleType : available[0];
        if (!type) return;
        const rule = createTaskNotifyRule(type);
        const rules = [...taskSettings.rules, rule];
        void persistTaskSettings({ ...taskSettings, rules }, "任务通知规则已添加。");
        expandedTaskRuleIds = new Set([...expandedTaskRuleIds, rule.id]);
        // Auto-switch to next available type after adding a singleton
        if (isSingletonTaskRuleType(type)) {
            const nextAvailable = getAvailableTaskRuleTypes();
            selectedTaskRuleType = nextAvailable[0] ?? type;
        }
    }

    function deleteTaskRule(ruleId: string): void {
        if (!bridgeEditable) return;
        const rules = taskSettings.rules.filter((r) => r.id !== ruleId);
        void persistTaskSettings({ ...taskSettings, rules }, "任务通知规则已删除。");
    }

    function toggleTaskRuleExpanded(ruleId: string): void {
        const next = new Set(expandedTaskRuleIds);
        if (next.has(ruleId)) next.delete(ruleId);
        else next.add(ruleId);
        expandedTaskRuleIds = next;
    }

    function taskRuleSummary(rule: TaskNotifyRule): string {
        const parts: string[] = [];
        if (rule.time) parts.push(`${rule.time}`);
        if (rule.channelIds && rule.channelIds.length > 0) {
            const name = settings.channels.find((c) => c.id === rule.channelIds![0])?.title ?? rule.channelIds[0];
            parts.push(`${name}`);
        }
        if (rule.type === "priority_digest" && rule.priorityMin) {
            parts.push("❗".repeat(rule.priorityMin));
        }
        if (rule.customFilter) parts.push("自定义筛选");
        return parts.join(" · ") || "默认配置";
    }

    // --- Countdown Notify helpers ---

    function isSingletonCountdownRuleType(type: CountdownNotifyRuleType): boolean {
        return type === "today_events";
    }

    function getAvailableCountdownRuleTypes(): CountdownNotifyRuleType[] {
        const existing = new Set(countdownSettings.rules.map((r) => r.type));
        const all: CountdownNotifyRuleType[] = ["today_events", "advance_events", "upcoming_digest"];
        return all.filter((t) => !isSingletonCountdownRuleType(t) || !existing.has(t));
    }

    function countdownRuleLabel(rule: CountdownNotifyRule | { type: CountdownNotifyRuleType }): string {
        switch (rule.type) {
            case "today_events": return "今日事件提醒";
            case "advance_events": return "提前 N 天提醒";
            case "upcoming_digest": return "未来 N 天摘要";
        }
    }

    function countdownRuleSummary(rule: CountdownNotifyRule): string {
        const parts: string[] = [];
        if (rule.time) parts.push(`${rule.time}`);
        if (rule.type === "advance_events" && rule.advanceDays?.length) {
            parts.push(`提前 ${rule.advanceDays.join("、")} 天`);
        }
        if (rule.type === "upcoming_digest" && rule.upcomingDays) {
            parts.push(`未来 ${rule.upcomingDays} 天`);
        }
        if (rule.channelIds?.length) {
            const name = settings.channels.find((c) => c.id === rule.channelIds![0])?.title ?? rule.channelIds[0];
            parts.push(name);
        }
        return parts.join(" · ") || "默认配置";
    }

    async function persistCountdownSettings(next: CountdownNotifySettings, successMessage?: string): Promise<void> {
        if (!advancedEnabled) {
            showMessage("外联通知为高级会员专属功能，请在会员服务中开通后使用。", 3500);
            return;
        }
        if (!bridgeEditable) {
            showMessage("外联通知桥已关闭，请先开启后再编辑。", 3500);
            return;
        }
        saving = true;
        errorMessage = "";
        try {
            countdownSettings = await saveCountdownNotifySettings(next);
            showMessage(successMessage ?? "倒数日通知设置已保存。", 2500);
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : "保存倒数日通知设置失败。";
            showMessage(errorMessage, 4000);
        } finally {
            saving = false;
        }
    }

    function patchCountdownSettings(patch: Partial<CountdownNotifySettings>): void {
        void persistCountdownSettings({ ...countdownSettings, ...patch });
    }

    function addCountdownRule(): void {
        if (!bridgeEditable) return;
        const available = getAvailableCountdownRuleTypes();
        const type = available.includes(selectedCountdownRuleType) ? selectedCountdownRuleType : available[0];
        if (!type) return;
        const rule = createCountdownNotifyRule(type);
        const rules = [...countdownSettings.rules, rule];
        void persistCountdownSettings({ ...countdownSettings, rules }, "倒数日通知规则已添加。");
        expandedCountdownRuleIds = new Set([...expandedCountdownRuleIds, rule.id]);
        if (isSingletonCountdownRuleType(type)) {
            const next = getAvailableCountdownRuleTypes();
            selectedCountdownRuleType = next[0] ?? type;
        }
    }

    function deleteCountdownRule(ruleId: string): void {
        if (!bridgeEditable) return;
        const rules = countdownSettings.rules.filter((r) => r.id !== ruleId);
        void persistCountdownSettings({ ...countdownSettings, rules }, "倒数日通知规则已删除。");
    }

    function toggleCountdownRuleExpanded(ruleId: string): void {
        const next = new Set(expandedCountdownRuleIds);
        if (next.has(ruleId)) next.delete(ruleId);
        else next.add(ruleId);
        expandedCountdownRuleIds = next;
    }

    function patchCountdownRule(ruleId: string, patch: Partial<CountdownNotifyRule>): void {
        const rules = countdownSettings.rules.map((r) =>
            r.id === ruleId ? { ...r, ...patch } : r
        );
        void persistCountdownSettings({ ...countdownSettings, rules }, "倒数日通知规则已保存。");
    }

    function firstCountdownChannelId(rule: CountdownNotifyRule): string {
        return rule.channelIds?.[0] ?? "";
    }

    function singleCountdownChannelIds(value: string): string[] | undefined {
        return value ? [value] : undefined;
    }

    async function refreshCountdownLocalDataStatus(): Promise<void> {
        try {
            const result = await loadCountdownEvents();
            countdownLocalEventCount = result.events.length;
            countdownLocalStorageMessage = `本地共享纪念日 ${result.events.length} 条`;
        } catch (error) {
            countdownLocalEventCount = null;
            countdownLocalStorageMessage = "本地纪念日数据读取失败，请先备份插件数据后重试。";
            console.warn("[NotifyBridgeSettings] 读取本地纪念日数据失败", error);
        }
    }

    // --- Enhanced Diary Notify helpers ---

    function isSingletonEnhancedDiaryRuleType(type: EnhancedDiaryNotifyRuleType): boolean {
        return type === "today_diary_missing" || type === "yesterday_review_missing";
    }

    function getAvailableEnhancedDiaryRuleTypes(): EnhancedDiaryNotifyRuleType[] {
        return getAvailableEnhancedDiaryRuleTypesForRules(enhancedDiarySettings.rules);
    }

    function getAvailableEnhancedDiaryRuleTypesForRules(rules: EnhancedDiaryNotifyRule[]): EnhancedDiaryNotifyRuleType[] {
        const existing = new Set(rules.map((r) => r.type));
        const all: EnhancedDiaryNotifyRuleType[] = [
            "today_diary_missing", "yesterday_review_missing",
            "unmigrated_tasks_digest", "weekly_review_reminder",
        ];
        return all.filter((t) => !isSingletonEnhancedDiaryRuleType(t) || !existing.has(t));
    }

    function enhancedDiaryRuleLabel(rule: EnhancedDiaryNotifyRule | { type: EnhancedDiaryNotifyRuleType }): string {
        switch (rule.type) {
            case "today_diary_missing": return "今日未写日记提醒";
            case "yesterday_review_missing": return "昨日未复盘提醒";
            case "unmigrated_tasks_digest": return "未迁移任务摘要";
            case "weekly_review_reminder": return "每周复盘提醒";
        }
    }

    function enhancedDiaryRuleSummary(rule: EnhancedDiaryNotifyRule): string {
        const parts: string[] = [];
        if (rule.time) parts.push(`${rule.time}`);
        if (rule.type === "weekly_review_reminder" && rule.weekday) {
            const dayNames = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
            parts.push(dayNames[rule.weekday] || `星期${rule.weekday}`);
        }
        if (rule.channelIds?.length) {
            const name = settings.channels.find((c) => c.id === rule.channelIds![0])?.title ?? rule.channelIds[0];
            parts.push(name);
        }
        return parts.join(" · ") || "默认配置";
    }

    async function persistEnhancedDiarySettings(next: EnhancedDiaryNotifySettings, successMessage?: string): Promise<void> {
        if (!advancedEnabled) {
            showMessage("外联通知为高级会员专属功能，请在会员服务中开通后使用。", 3500);
            return;
        }
        if (!bridgeEditable) {
            showMessage("外联通知桥已关闭，请先开启后再编辑。", 3500);
            return;
        }
        saving = true;
        errorMessage = "";
        try {
            enhancedDiarySettings = await saveEnhancedDiaryNotifySettings(next);
            showMessage(successMessage ?? "强化日记通知设置已保存。", 2500);
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : "保存强化日记通知设置失败。";
            showMessage(errorMessage, 4000);
        } finally {
            saving = false;
        }
    }

    function patchEnhancedDiarySettings(patch: Partial<EnhancedDiaryNotifySettings>): void {
        void persistEnhancedDiarySettings({ ...enhancedDiarySettings, ...patch });
    }

    function addEnhancedDiaryRule(): void {
        if (!bridgeEditable) return;
        const available = getAvailableEnhancedDiaryRuleTypes();
        const type = available.includes(selectedEnhancedDiaryRuleType) ? selectedEnhancedDiaryRuleType : available[0];
        if (!type) return;
        const rule = createEnhancedDiaryNotifyRule(type);
        const rules = [...enhancedDiarySettings.rules, rule];
        void persistEnhancedDiarySettings({ ...enhancedDiarySettings, rules }, "强化日记通知规则已添加。");
        expandedEnhancedDiaryRuleIds = new Set([...expandedEnhancedDiaryRuleIds, rule.id]);
        if (isSingletonEnhancedDiaryRuleType(type)) {
            const next = getAvailableEnhancedDiaryRuleTypesForRules(rules);
            selectedEnhancedDiaryRuleType = next[0] ?? type;
        }
    }

    function deleteEnhancedDiaryRule(ruleId: string): void {
        if (!bridgeEditable) return;
        const rules = enhancedDiarySettings.rules.filter((r) => r.id !== ruleId);
        void persistEnhancedDiarySettings({ ...enhancedDiarySettings, rules }, "强化日记通知规则已删除。");
    }

    function toggleEnhancedDiaryRuleExpanded(ruleId: string): void {
        const next = new Set(expandedEnhancedDiaryRuleIds);
        if (next.has(ruleId)) next.delete(ruleId);
        else next.add(ruleId);
        expandedEnhancedDiaryRuleIds = next;
    }

    function patchEnhancedDiaryRule(ruleId: string, patch: Partial<EnhancedDiaryNotifyRule>): void {
        const rules = enhancedDiarySettings.rules.map((r) =>
            r.id === ruleId ? { ...r, ...patch } : r
        );
        void persistEnhancedDiarySettings({ ...enhancedDiarySettings, rules }, "强化日记通知规则已保存。");
    }

    function firstEnhancedDiaryChannelId(rule: EnhancedDiaryNotifyRule): string {
        return rule.channelIds?.[0] ?? "";
    }

    function singleEnhancedDiaryChannelIds(value: string): string[] | undefined {
        return value ? [value] : undefined;
    }
</script>

<div class="notify-bridge-settings">
    {#if loading}
        <div class="notify-loading">正在加载外联通知设置...</div>
    {:else}
        {#if !advancedEnabled}
            <section class="notify-section premium-lock">
                <div>
                    <h2>外联通知为高级会员专属功能</h2>
                    <p>请在会员服务中开通后使用。已有配置会保留，但非会员状态下不会发送通知，也不能编辑、测试或启动任务通知。</p>
                </div>
            </section>
        {/if}

        <section class="notify-section notify-hero">
            <div>
                <h2>外联通知桥</h2>
                <p>将插件内的任务提醒、纪念日提醒、AI 自动任务结果等统一发送到外部通知渠道。第一版支持通用 Webhook 和飞书机器人。</p>
            </div>
            <label class="switch-row">
                <input
                    class="b3-switch"
                    type="checkbox"
                    checked={settings.enabled}
                    disabled={saving || !advancedEnabled}
                    onchange={(event) => patchSettings({ enabled: event.currentTarget.checked })}
                />
                <span>启用外联通知桥</span>
            </label>
        </section>

        {#if advancedEnabled && !settings.enabled}
            <section class="notify-section" style="border-left: 3px solid var(--b3-theme-warning); background: color-mix(in srgb, var(--b3-theme-warning) 6%, var(--b3-theme-surface));">
                <p>外联通知桥已关闭。开启后才能编辑渠道、测试发送和启用任务通知；已保存配置会保留。</p>
            </section>
        {/if}

        {#if errorMessage}
            <p class="notify-error">{errorMessage}</p>
        {/if}

        <section class="notify-section">
            <div class="section-header">
                <div>
                    <h3>通知渠道</h3>
                    <p>Webhook URL、Header value 和飞书签名密钥会加密保存；编辑时留空表示保留旧值。</p>
                </div>
                <div class="header-actions">
                    <button type="button" class="secondary-btn" disabled={!bridgeEditable} onclick={() => openNewEditor("webhook")}>添加 Webhook</button>
                    <button type="button" class="primary-btn" disabled={!bridgeEditable} onclick={() => openNewEditor("feishu")}>添加飞书</button>
                </div>
            </div>

            {#if settings.channels.length === 0}
                <div class="empty-state">暂无通知渠道。默认关闭，不会自动发送任何外部通知。</div>
            {:else}
                <div class="channel-list">
                    {#each settings.channels as channel (channel.id)}
                        <article class="channel-card">
                            <div class="channel-main">
                                <div class="channel-title-row">
                                    <strong>{channel.title}</strong>
                                    <span class="badge">{channelTypeLabel(channel.type)}</span>
                                    <span class:enabled={channel.enabled} class="status-badge">{channel.enabled ? "启用" : "禁用"}</span>
                                    {#if isDefaultChannel(channel.id)}
                                        <span class="badge primary">默认</span>
                                    {/if}
                                </div>
                                <div class="channel-meta">
                                    {#if channel.type === "webhook"}
                                        <span>URL：{redactUrl(channel.url)}</span>
                                        {#if channel.headers && Object.keys(channel.headers).length > 0}
                                            <span>Headers：{Object.entries(redactHeaders(channel.headers)).map(([k, v]) => `${k}: ${v}`).join("；")}</span>
                                        {/if}
                                    {:else}
                                        <span>Webhook：{redactUrl(channel.webhookUrl)}</span>
                                        <span>签名：{redactSecret(channel.secret)}</span>
                                        <span>格式：{channel.messageFormat === "post" ? "富文本" : "文本"}</span>
                                    {/if}
                                </div>
                            </div>
                            <div class="channel-actions">
                                <label class="mini-check">
                                    <input type="checkbox" checked={isDefaultChannel(channel.id)} disabled={!bridgeEditable} onchange={() => toggleDefaultChannel(channel.id)} />
                                    默认
                                </label>
                                <button type="button" class="secondary-btn" disabled={!bridgeEditable || testingChannelId === channel.id} onclick={() => testChannel(channel)}>
                                    {testingChannelId === channel.id ? "测试中..." : "测试发送"}
                                </button>
                                <button type="button" class="secondary-btn" disabled={!bridgeEditable} onclick={() => openEditEditor(channel)}>编辑</button>
                                <button type="button" class="secondary-btn" disabled={!bridgeEditable} onclick={() => toggleChannelEnabled(channel)}>
                                    {channel.enabled ? "禁用" : "启用"}
                                </button>
                                <button type="button" class="danger-btn" disabled={!bridgeEditable} onclick={() => deleteChannel(channel)}>删除</button>
                            </div>
                        </article>
                    {/each}
                </div>
            {/if}
        </section>

        <section class="notify-section two-column">
            <div>
                <h3>发送规则</h3>
                <label class="field-row inline">
                    <span>去重窗口（毫秒）</span>
                    <input
                        type="number"
                        min="1000"
                        max="3600000"
                        value={settings.dedupe?.windowMs ?? 60000}
                        disabled={!bridgeEditable}
                        onchange={(event) => patchSettings({ dedupe: { enabled: settings.dedupe?.enabled ?? true, windowMs: Number(event.currentTarget.value) || 60000 } })}
                    />
                </label>
                <label class="mini-check">
                    <input
                        type="checkbox"
                        checked={settings.dedupe?.enabled ?? true}
                        disabled={!bridgeEditable}
                        onchange={(event) => patchSettings({ dedupe: { enabled: event.currentTarget.checked, windowMs: settings.dedupe?.windowMs ?? 60000 } })}
                    />
                    启用简单去重
                </label>
                <label class="mini-check">
                    <input
                        type="checkbox"
                        checked={settings.rateLimit?.enabled ?? true}
                        disabled={!bridgeEditable}
                        onchange={(event) => patchSettings({ rateLimit: { enabled: event.currentTarget.checked, minIntervalMs: settings.rateLimit?.minIntervalMs ?? 1000 } })}
                    />
                    启用发送间隔限制
                </label>
            </div>
            <div>
                <h3>最近结果</h3>
                <p class="recent-result">{recentResult || "暂无测试结果。"}</p>
            </div>
        </section>

        <section class="notify-section task-notify-section">
            <div class="section-header">
                <div>
                    <h3>任务通知</h3>
                    <p>扫描任务管理 Plus 的未完成任务，通过外联通知桥发送到点提醒和每日摘要。</p>
                </div>
                <label class="switch-row">
                    <input
                        class="b3-switch"
                        type="checkbox"
                        checked={taskSettings.enabled}
                        disabled={!bridgeEditable}
                        onchange={(event) => patchTaskSettings({ enabled: event.currentTarget.checked })}
                    />
                    <span>启用任务外联通知</span>
                </label>
            </div>

            <div class="form-grid">
                <label class="field-row">
                    <span>扫描间隔（毫秒）</span>
                    <input type="number" min="10000" max="3600000" step="10000" value={taskSettings.scanIntervalMs} disabled={!bridgeEditable} onchange={(event) => patchTaskSettings({ scanIntervalMs: Number(event.currentTarget.value) || 60000 })} />
                </label>
                <label class="field-row">
                    <span>漏提醒回补窗口（分钟）</span>
                    <input type="number" min="1" max="1440" value={taskSettings.catchUpWindowMinutes} disabled={!bridgeEditable} onchange={(event) => patchTaskSettings({ catchUpWindowMinutes: Number(event.currentTarget.value) || 30 })} />
                </label>
                <label class="field-row">
                    <span>每条摘要最多任务数</span>
                    <input type="number" min="1" max="100" value={taskSettings.maxTasksPerMessage} disabled={!bridgeEditable} onchange={(event) => patchTaskSettings({ maxTasksPerMessage: Number(event.currentTarget.value) || 20 })} />
                </label>
            </div>

            <div class="task-option-row">
                <label class="mini-check">
                    <input type="checkbox" checked={taskSettings.includeSourcePath} disabled={!bridgeEditable} onchange={(event) => patchTaskSettings({ includeSourcePath: event.currentTarget.checked })} />
                    包含来源路径
                </label>
                <label class="mini-check">
                    <input type="checkbox" checked={taskSettings.includeSiyuanLink} disabled={!bridgeEditable} onchange={(event) => patchTaskSettings({ includeSiyuanLink: event.currentTarget.checked })} />
                    包含思源链接
                </label>
            </div>

            <div class="add-rule-row">
                <div class="select-wrap add-rule-select">
                    <select bind:value={selectedTaskRuleType} disabled={!bridgeEditable}>
                        {#each getAvailableTaskRuleTypes() as t (t)}
                            <option value={t}>{taskRuleLabel({ type: t } as TaskNotifyRule)}</option>
                        {/each}
                    </select>
                </div>
                <button type="button" class="primary-btn" disabled={!bridgeEditable || getAvailableTaskRuleTypes().length === 0} onclick={addTaskRule}>
                    添加规则
                </button>
            </div>

            <div class="rule-list">
                {#each taskSettings.rules as rule (rule.id)}
                    <article class="rule-card">
                        <div class="rule-header">
                            <div class="rule-header-main">
                                <label class="mini-check">
                                    <input type="checkbox" checked={rule.enabled} disabled={!bridgeEditable} onchange={(event) => patchTaskRule(rule.id, { enabled: event.currentTarget.checked })} />
                                </label>
                                <strong>{rule.title || taskRuleLabel(rule)}</strong>
                                <span class="badge">{taskRuleLabel(rule)}</span>
                                <span class:enabled={rule.enabled} class="status-badge">{rule.enabled ? "启用" : "禁用"}</span>
                                <span class="rule-summary">{taskRuleSummary(rule)}</span>
                            </div>
                            <div class="rule-header-actions">
                                <button type="button" class="secondary-btn compact" onclick={() => toggleTaskRuleExpanded(rule.id)}>
                                    {expandedTaskRuleIds.has(rule.id) ? "收起" : "展开"}
                                </button>
                                <button type="button" class="danger-btn compact" disabled={!bridgeEditable} onclick={() => deleteTaskRule(rule.id)}>删除</button>
                            </div>
                        </div>
                        {#if expandedTaskRuleIds.has(rule.id)}
                            <div class="rule-controls">
                                <label class="field-row compact">
                                    <span>标题</span>
                                    <input type="text" value={rule.title} disabled={!bridgeEditable} onchange={(event) => patchTaskRule(rule.id, { title: event.currentTarget.value })} />
                                </label>
                                {#if rule.type !== "task_reminder"}
                                    <label class="field-row compact">
                                        <span>发送时间</span>
                                        <input type="time" value={rule.time ?? "09:00"} disabled={!bridgeEditable} onchange={(event) => patchTaskRule(rule.id, { time: event.currentTarget.value })} />
                                    </label>
                                {/if}
                                {#if rule.type === "priority_digest"}
                                    <label class="field-row compact">
                                        <span>最低优先级</span>
                                        <div class="select-wrap">
                                            <select value={String(rule.priorityMin ?? 4)} disabled={!bridgeEditable} onchange={(event) => patchTaskRule(rule.id, { priorityMin: Number(event.currentTarget.value) })}>
                                                <option value="1">❗</option>
                                                <option value="2">❗❗</option>
                                                <option value="3">❗❗❗</option>
                                                <option value="4">❗❗❗❗</option>
                                            </select>
                                        </div>
                                    </label>
                                {/if}
                                <label class="field-row compact">
                                    <span>发送渠道</span>
                                    <div class="select-wrap">
                                        <select value={firstChannelId(rule)} disabled={!bridgeEditable} onchange={(event) => patchTaskRule(rule.id, { channelIds: singleChannelIds(event.currentTarget.value) })}>
                                            <option value="">使用默认渠道</option>
                                            {#each settings.channels as channel (channel.id)}
                                                <option value={channel.id}>{channel.title}</option>
                                            {/each}
                                        </select>
                                    </div>
                                </label>
                            </div>
                            {#if rule.type === "custom_filter_digest"}
                                <label class="field-row" style="margin-top: 8px;">
                                    <span>自定义筛选语法（每行一个条件）</span>
                                    <textarea rows="3" value={rule.customFilter ?? ""} disabled={!bridgeEditable} spellcheck="false" onchange={(event) => patchTaskRule(rule.id, { customFilter: event.currentTarget.value })}></textarea>
                                </label>
                            {/if}
                        {/if}
                    </article>
                {/each}
            </div>
        </section>

        <section class="notify-section countdown-notify-section">
            <div class="section-header">
                <div>
                    <h3>倒数日 / 纪念日通知</h3>
                    <p>从倒数日数据库读取事件，通过外联通知桥发送今日事件、提前提醒和未来摘要。</p>
                </div>
                <label class="switch-row">
                    <input
                        class="b3-switch"
                        type="checkbox"
                        checked={countdownSettings.enabled}
                        disabled={!bridgeEditable}
                        onchange={(event) => patchCountdownSettings({ enabled: event.currentTarget.checked })}
                    />
                    <span>启用倒数日外联通知</span>
                </label>
            </div>

            <div class="field-row">
                <span>数据来源</span>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <p class="field-hint">纪念日通知直接读取插件本地共享纪念日数据，并与所有纪念日组件自动同步。</p>
                    <p class="field-hint" style:color={countdownLocalEventCount === null ? "var(--b3-theme-warning)" : "var(--b3-theme-primary)"}>
                        {countdownLocalStorageMessage}
                    </p>
                    <button type="button" class="secondary-btn compact" disabled={!bridgeEditable} onclick={refreshCountdownLocalDataStatus}>刷新本地数据状态</button>
                </div>
            </div>

            <div class="form-grid">
                <label class="field-row">
                    <span>扫描间隔（毫秒）</span>
                    <input type="number" min="10000" max="3600000" step="10000" value={countdownSettings.scanIntervalMs} disabled={!bridgeEditable} onchange={(event) => patchCountdownSettings({ scanIntervalMs: Number((event.currentTarget as HTMLInputElement).value) || 60000 })} />
                </label>
                <label class="field-row">
                    <span>漏提醒回补窗口（分钟）</span>
                    <input type="number" min="1" max="1440" value={countdownSettings.catchUpWindowMinutes} disabled={!bridgeEditable} onchange={(event) => patchCountdownSettings({ catchUpWindowMinutes: Number((event.currentTarget as HTMLInputElement).value) || 30 })} />
                </label>
                <label class="field-row">
                    <span>每条摘要最多事件数</span>
                    <input type="number" min="1" max="100" value={countdownSettings.maxEventsPerMessage} disabled={!bridgeEditable} onchange={(event) => patchCountdownSettings({ maxEventsPerMessage: Number((event.currentTarget as HTMLInputElement).value) || 20 })} />
                </label>
            </div>

            <div class="add-rule-row">
                <div class="select-wrap add-rule-select">
                    <select bind:value={selectedCountdownRuleType} disabled={!bridgeEditable}>
                        {#each getAvailableCountdownRuleTypes() as t (t)}
                            <option value={t}>{countdownRuleLabel({ type: t } as CountdownNotifyRule)}</option>
                        {/each}
                    </select>
                </div>
                <button type="button" class="primary-btn" disabled={!bridgeEditable || getAvailableCountdownRuleTypes().length === 0} onclick={addCountdownRule}>
                    添加规则
                </button>
            </div>

            <div class="rule-list">
                {#each countdownSettings.rules as rule (rule.id)}
                    <article class="rule-card">
                        <div class="rule-header">
                            <div class="rule-header-main">
                                <label class="mini-check">
                                    <input type="checkbox" checked={rule.enabled} disabled={!bridgeEditable} onchange={(event) => patchCountdownRule(rule.id, { enabled: (event.currentTarget as HTMLInputElement).checked })} />
                                </label>
                                <strong>{rule.title || countdownRuleLabel(rule)}</strong>
                                <span class="badge">{countdownRuleLabel(rule)}</span>
                                <span class:enabled={rule.enabled} class="status-badge">{rule.enabled ? "启用" : "禁用"}</span>
                                <span class="rule-summary">{countdownRuleSummary(rule)}</span>
                            </div>
                            <div class="rule-header-actions">
                                <button type="button" class="secondary-btn compact" onclick={() => toggleCountdownRuleExpanded(rule.id)}>
                                    {expandedCountdownRuleIds.has(rule.id) ? "收起" : "展开"}
                                </button>
                                <button type="button" class="danger-btn compact" disabled={!bridgeEditable} onclick={() => deleteCountdownRule(rule.id)}>删除</button>
                            </div>
                        </div>
                        {#if expandedCountdownRuleIds.has(rule.id)}
                            <div class="rule-controls">
                                <label class="field-row compact">
                                    <span>标题</span>
                                    <input type="text" value={rule.title} disabled={!bridgeEditable} onchange={(event) => patchCountdownRule(rule.id, { title: (event.currentTarget as HTMLInputElement).value })} />
                                </label>
                                <label class="field-row compact">
                                    <span>发送时间</span>
                                    <input type="time" value={rule.time ?? "08:00"} disabled={!bridgeEditable} onchange={(event) => patchCountdownRule(rule.id, { time: (event.currentTarget as HTMLInputElement).value })} />
                                </label>
                                {#if rule.type === "advance_events"}
                                    <label class="field-row compact">
                                        <span>提前天数（逗号分隔）</span>
                                        <input type="text" value={rule.advanceDays?.join(", ") ?? "1, 3, 7"} disabled={!bridgeEditable} placeholder="1, 3, 7" onchange={(event) => {{
                                            const nums = (event.currentTarget as HTMLInputElement).value.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
                                            patchCountdownRule(rule.id, { advanceDays: nums.length > 0 ? nums : [1] });
                                        }}} />
                                    </label>
                                {/if}
                                {#if rule.type === "upcoming_digest"}
                                    <label class="field-row compact">
                                        <span>未来天数</span>
                                        <input type="number" min="1" max="365" value={rule.upcomingDays ?? 7} disabled={!bridgeEditable} onchange={(event) => patchCountdownRule(rule.id, { upcomingDays: Number((event.currentTarget as HTMLInputElement).value) || 7 })} />
                                    </label>
                                {/if}
                                <label class="field-row compact">
                                    <span>发送渠道</span>
                                    <div class="select-wrap">
                                        <select value={firstCountdownChannelId(rule)} disabled={!bridgeEditable} onchange={(event) => patchCountdownRule(rule.id, { channelIds: singleCountdownChannelIds((event.currentTarget as HTMLSelectElement).value) })}>
                                            <option value="">使用默认渠道</option>
                                            {#each settings.channels as channel (channel.id)}
                                                <option value={channel.id}>{channel.title}</option>
                                            {/each}
                                        </select>
                                    </div>
                                </label>
                            </div>
                        {/if}
                    </article>
                {/each}
            </div>
        </section>

        <section class="notify-section enhanced-diary-notify-section">
            <div class="section-header">
                <div>
                    <h3>强化日记通知</h3>
                    <p>基于强化日记工作台，通过外联通知桥发送日记提醒、复盘提醒和未迁移任务摘要。</p>
                </div>
                <label class="switch-row">
                    <input
                        class="b3-switch"
                        type="checkbox"
                        checked={enhancedDiarySettings.enabled}
                        disabled={!bridgeEditable}
                        onchange={(event) => patchEnhancedDiarySettings({ enabled: (event.currentTarget as HTMLInputElement).checked })}
                    />
                    <span>启用强化日记外联通知</span>
                </label>
            </div>

            <div class="form-grid">
                <label class="field-row">
                    <span>扫描间隔（毫秒）</span>
                    <input type="number" min="10000" max="3600000" step="10000" value={enhancedDiarySettings.scanIntervalMs} disabled={!bridgeEditable} onchange={(event) => patchEnhancedDiarySettings({ scanIntervalMs: Number((event.currentTarget as HTMLInputElement).value) || 60000 })} />
                </label>
                <label class="field-row">
                    <span>漏提醒回补窗口（分钟）</span>
                    <input type="number" min="1" max="1440" value={enhancedDiarySettings.catchUpWindowMinutes} disabled={!bridgeEditable} onchange={(event) => patchEnhancedDiarySettings({ catchUpWindowMinutes: Number((event.currentTarget as HTMLInputElement).value) || 30 })} />
                </label>
                <label class="field-row">
                    <span>每条摘要最多项目数</span>
                    <input type="number" min="1" max="100" value={enhancedDiarySettings.maxItemsPerMessage} disabled={!bridgeEditable} onchange={(event) => patchEnhancedDiarySettings({ maxItemsPerMessage: Number((event.currentTarget as HTMLInputElement).value) || 20 })} />
                </label>
            </div>

            <div class="task-option-row">
                <label class="mini-check">
                    <input type="checkbox" checked={enhancedDiarySettings.includeSiyuanLink} disabled={!bridgeEditable} onchange={(event) => patchEnhancedDiarySettings({ includeSiyuanLink: (event.currentTarget as HTMLInputElement).checked })} />
                    包含思源链接
                </label>
            </div>

            <div class="add-rule-row">
                <div class="select-wrap add-rule-select">
                    <select bind:value={selectedEnhancedDiaryRuleType} disabled={!bridgeEditable}>
                        {#each getAvailableEnhancedDiaryRuleTypes() as t (t)}
                            <option value={t}>{enhancedDiaryRuleLabel({ type: t } as EnhancedDiaryNotifyRule)}</option>
                        {/each}
                    </select>
                </div>
                <button type="button" class="primary-btn" disabled={!bridgeEditable || getAvailableEnhancedDiaryRuleTypes().length === 0} onclick={addEnhancedDiaryRule}>
                    添加规则
                </button>
            </div>

            <div class="rule-list">
                {#each enhancedDiarySettings.rules as rule (rule.id)}
                    <article class="rule-card">
                        <div class="rule-header">
                            <div class="rule-header-main">
                                <label class="mini-check">
                                    <input type="checkbox" checked={rule.enabled} disabled={!bridgeEditable} onchange={(event) => patchEnhancedDiaryRule(rule.id, { enabled: (event.currentTarget as HTMLInputElement).checked })} />
                                </label>
                                <strong>{rule.title || enhancedDiaryRuleLabel(rule)}</strong>
                                <span class="badge">{enhancedDiaryRuleLabel(rule)}</span>
                                <span class:enabled={rule.enabled} class="status-badge">{rule.enabled ? "启用" : "禁用"}</span>
                                <span class="rule-summary">{enhancedDiaryRuleSummary(rule)}</span>
                            </div>
                            <div class="rule-header-actions">
                                <button type="button" class="secondary-btn compact" onclick={() => toggleEnhancedDiaryRuleExpanded(rule.id)}>
                                    {expandedEnhancedDiaryRuleIds.has(rule.id) ? "收起" : "展开"}
                                </button>
                                <button type="button" class="danger-btn compact" disabled={!bridgeEditable} onclick={() => deleteEnhancedDiaryRule(rule.id)}>删除</button>
                            </div>
                        </div>
                        {#if expandedEnhancedDiaryRuleIds.has(rule.id)}
                            <div class="rule-controls">
                                <label class="field-row compact">
                                    <span>标题</span>
                                    <input type="text" value={rule.title} disabled={!bridgeEditable} onchange={(event) => patchEnhancedDiaryRule(rule.id, { title: (event.currentTarget as HTMLInputElement).value })} />
                                </label>
                                <label class="field-row compact">
                                    <span>发送时间</span>
                                    <input type="time" value={rule.time ?? "09:00"} disabled={!bridgeEditable} onchange={(event) => patchEnhancedDiaryRule(rule.id, { time: (event.currentTarget as HTMLInputElement).value })} />
                                </label>
                                {#if rule.type === "weekly_review_reminder"}
                                    <label class="field-row compact">
                                        <span>星期几</span>
                                        <div class="select-wrap">
                                            <select value={String(rule.weekday ?? 5)} disabled={!bridgeEditable} onchange={(event) => patchEnhancedDiaryRule(rule.id, { weekday: Number((event.currentTarget as HTMLSelectElement).value) })}>
                                                <option value="1">周一</option>
                                                <option value="2">周二</option>
                                                <option value="3">周三</option>
                                                <option value="4">周四</option>
                                                <option value="5">周五</option>
                                                <option value="6">周六</option>
                                                <option value="7">周日</option>
                                            </select>
                                        </div>
                                    </label>
                                {/if}
                                <label class="field-row compact">
                                    <span>发送渠道</span>
                                    <div class="select-wrap">
                                        <select value={firstEnhancedDiaryChannelId(rule)} disabled={!bridgeEditable} onchange={(event) => patchEnhancedDiaryRule(rule.id, { channelIds: singleEnhancedDiaryChannelIds((event.currentTarget as HTMLSelectElement).value) })}>
                                            <option value="">使用默认渠道</option>
                                            {#each settings.channels as channel (channel.id)}
                                                <option value={channel.id}>{channel.title}</option>
                                            {/each}
                                        </select>
                                    </div>
                                </label>
                            </div>
                        {/if}
                    </article>
                {/each}
            </div>
        </section>

        <section class="notify-section help-section">
            <h3>配置说明</h3>
            <div class="help-grid">
                <div>
                    <h4>飞书机器人</h4>
                    <ol>
                        <li>打开飞书目标群聊，进入群设置。</li>
                        <li>添加自定义机器人并复制 Webhook 地址。</li>
                        <li>如开启签名校验，请复制签名密钥。</li>
                        <li>回到这里新增飞书渠道并点击测试发送。</li>
                    </ol>
                </div>
                <div>
                    <h4>Webhook 模板变量</h4>
                    <p>自定义 JSON 模板支持：<code>&#123;&#123;title&#125;&#125;</code>、<code>&#123;&#123;content&#125;&#125;</code>、<code>&#123;&#123;level&#125;&#125;</code>、<code>&#123;&#123;source&#125;&#125;</code>、<code>&#123;&#123;sourceId&#125;&#125;</code>、<code>&#123;&#123;url&#125;&#125;</code>、<code>&#123;&#123;time&#125;&#125;</code>、<code>&#123;&#123;date&#125;&#125;</code>、<code>&#123;&#123;extra.xxx&#125;&#125;</code>。</p>
                </div>
            </div>
        </section>
    {/if}
</div>

{#if showEditor}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="notify-editor-overlay" role="presentation" onclick={(event) => event.target === event.currentTarget && (showEditor = false)}>
        <div class="notify-editor-panel">
            <div class="editor-header">
                <h3>{editor.mode === "edit" ? "编辑通知渠道" : "添加通知渠道"}</h3>
            </div>
            <div class="editor-body">
                <div class="form-grid">
                    <label class="field-row">
                        <span>渠道类型</span>
                        <div class="select-wrap">
                            <select bind:value={editor.type} disabled={editor.mode === "edit"} onchange={(event) => editor = { ...createEditor(event.currentTarget.value as NotifyBridgeChannelType), type: event.currentTarget.value as NotifyBridgeChannelType }}>
                                <option value="webhook">通用 Webhook</option>
                                <option value="feishu">飞书机器人</option>
                            </select>
                        </div>
                    </label>
                    <label class="field-row">
                        <span>渠道名称</span>
                        <input type="text" bind:value={editor.title} />
                    </label>
                    <label class="field-row">
                        <span>超时（毫秒）</span>
                        <input type="number" min="1000" max="60000" step="1000" bind:value={editor.timeoutMs} />
                    </label>
                </div>

                <label class="mini-check">
                    <input type="checkbox" bind:checked={editor.enabled} />
                    启用该渠道
                </label>

                {#if editor.type === "webhook"}
                    <label class="field-row">
                        <span>Webhook URL</span>
                        <input type="password" bind:value={editor.url} placeholder={editor.mode === "edit" ? "已保存，留空表示不修改" : "https://example.com/webhook"} />
                    </label>
                    <label class="field-row">
                        <span>Headers（KEY=value，每行一个；编辑时空值保留旧值，删除整行表示移除）</span>
                        <textarea rows="4" bind:value={editor.headersText} spellcheck="false" placeholder="Authorization=Bearer xxx&#10;X-API-Key=xxx"></textarea>
                    </label>
                    <label class="field-row">
                        <span>Body 模板模式</span>
                        <div class="select-wrap">
                            <select bind:value={editor.bodyTemplateMode}>
                                <option value="default">默认 JSON</option>
                                <option value="customJson">自定义 JSON</option>
                            </select>
                        </div>
                    </label>
                    {#if editor.bodyTemplateMode === "customJson"}
                        <label class="field-row">
                            <span>自定义 JSON 模板</span>
                            <textarea rows="7" bind:value={editor.customJsonTemplate} spellcheck="false"></textarea>
                        </label>
                    {/if}
                {:else}
                    <label class="field-row">
                        <span>飞书 Webhook 地址</span>
                        <input type="password" bind:value={editor.webhookUrl} placeholder={editor.mode === "edit" ? "已保存，留空表示不修改" : "https://open.feishu.cn/open-apis/bot/v2/hook/..."} />
                    </label>
                    <label class="field-row">
                        <span>签名密钥</span>
                        <input type="password" bind:value={editor.secret} placeholder={editor.mode === "edit" ? "已保存，留空表示不修改" : "可选"} />
                    </label>
                    {#if editor.mode === "edit"}
                        <label class="mini-check">
                            <input type="checkbox" bind:checked={editor.clearSecret} />
                            清除签名密钥
                        </label>
                    {/if}
                    <label class="field-row">
                        <span>消息格式</span>
                        <div class="select-wrap">
                            <select bind:value={editor.messageFormat}>
                                <option value="text">文本</option>
                                <option value="post">富文本</option>
                            </select>
                        </div>
                    </label>
                {/if}

                {#if editorError}
                    <p class="notify-error">{editorError}</p>
                {/if}
            </div>
            <div class="editor-footer">
                <button type="button" class="secondary-btn" onclick={() => showEditor = false}>取消</button>
                <button type="button" class="primary-btn" onclick={saveEditor}>保存</button>
            </div>
        </div>
    </div>
{/if}

<style>
    .notify-bridge-settings {
        display: flex;
        flex-direction: column;
        gap: 14px;
        color: var(--b3-theme-on-surface);
    }

    .notify-loading,
    .empty-state {
        padding: 18px;
        color: var(--b3-theme-on-surface-light);
        border: 1px dashed var(--b3-border-color);
        border-radius: 8px;
    }

    .notify-section {
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
        padding: 14px;
    }

    .premium-lock {
        border-left: 3px solid var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 6%, var(--b3-theme-surface));
    }

    .notify-hero {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
        border-left: 3px solid var(--b3-theme-primary);
    }

    h2,
    h3,
    h4,
    p {
        margin: 0;
    }

    h2 {
        font-size: 18px;
        margin-bottom: 6px;
    }

    h3 {
        font-size: 14px;
        margin-bottom: 6px;
    }

    h4 {
        font-size: 13px;
        margin-bottom: 6px;
    }

    p,
    li,
    .channel-meta,
    .recent-result {
        font-size: 13px;
        line-height: 1.55;
        color: var(--b3-theme-on-surface-light);
    }

    .section-header,
    .channel-card,
    .channel-title-row,
    .channel-actions,
    .header-actions,
    .switch-row,
    .mini-check {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .section-header,
    .channel-card {
        justify-content: space-between;
        align-items: flex-start;
    }

    .channel-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-top: 10px;
    }

    .channel-card {
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        padding: 12px;
        background: var(--b3-theme-background);
    }

    .channel-main {
        min-width: 0;
        flex: 1;
    }

    .channel-title-row,
    .channel-actions,
    .header-actions {
        flex-wrap: wrap;
    }

    .channel-meta {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-top: 5px;
        overflow-wrap: anywhere;
    }

    .badge,
    .status-badge {
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--b3-theme-background-light);
        color: var(--b3-theme-on-surface-light);
        font-size: 11px;
        line-height: 1.3;
    }

    .badge.primary,
    .status-badge.enabled {
        color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, var(--b3-theme-background));
    }

    .primary-btn,
    .secondary-btn,
    .danger-btn {
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        line-height: 1.4;
        padding: 6px 10px;
        font-family: inherit;
    }

    .primary-btn {
        border: 1px solid var(--b3-theme-primary);
        background: var(--b3-theme-primary);
        color: #fff;
    }

    .secondary-btn {
        border: 1px solid var(--b3-border-color);
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-surface);
    }

    .danger-btn {
        border: 1px solid var(--b3-theme-error);
        background: var(--b3-theme-background);
        color: var(--b3-theme-error);
    }

    button:disabled {
        opacity: 0.55;
        cursor: not-allowed;
    }

    .two-column,
    .help-grid,
    .form-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 12px;
    }

    .field-row {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
    }

    .task-notify-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .countdown-notify-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .task-option-row,
    .rule-list,
    .rule-card {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .task-option-row {
        flex-direction: row;
        flex-wrap: wrap;
    }

    .add-rule-row {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
    }

    .add-rule-select {
        width: min(360px, 100%);
        flex: 0 1 360px;
    }

    .rule-card {
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        padding: 12px;
        background: var(--b3-theme-background);
    }

    .rule-controls {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items: flex-end;
    }

    .field-row.compact {
        min-width: 160px;
        max-width: 220px;
    }

    .field-row.inline {
        margin: 8px 0;
    }

    .field-hint {
        margin: 0;
        font-size: 12px;
        line-height: 1.5;
        color: var(--b3-theme-on-surface-light);
    }

    .field-row input,
    .field-row select,
    .field-row textarea {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        padding: 7px 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-surface);
        font-size: 13px;
        font-family: inherit;
    }

    .field-row textarea {
        resize: vertical;
        font-family: var(--b3-font-family-code);
    }

    .mini-check {
        font-size: 13px;
        color: var(--b3-theme-on-surface);
    }

    .notify-error {
        color: var(--b3-theme-error);
        font-size: 13px;
        line-height: 1.5;
    }

    .help-section ol {
        margin: 0;
        padding-left: 18px;
    }

    code {
        font-family: var(--b3-font-family-code);
        font-size: 12px;
    }

    .notify-editor-overlay {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(0, 0, 0, 0.35);
    }

    .notify-editor-panel {
        width: min(760px, 100%);
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-background);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    }

    .editor-header,
    .editor-footer {
        padding: 14px 18px;
    }

    .editor-header {
        border-bottom: 1px solid var(--b3-border-color);
    }

    .editor-body {
        padding: 16px 18px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .editor-footer {
        border-top: 1px solid var(--b3-border-color);
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }

    /* Dropdown arrow wrapper */
    .select-wrap {
        position: relative;
        display: inline-block;
        width: 100%;
    }

    .select-wrap select {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        padding: 7px 30px 7px 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-surface);
        font-size: 13px;
        font-family: inherit;
        appearance: none;
        cursor: pointer;
    }

    .select-wrap select:disabled {
        cursor: not-allowed;
    }

    .select-wrap::after {
        content: "\25BE";
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        pointer-events: none;
        line-height: 1;
    }

    .select-wrap:has(select:disabled)::after {
        opacity: 0.35;
    }

    /* Rule card header with collapsible */
    .rule-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
    }

    .rule-header-main {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        min-width: 0;
    }

    .rule-header-actions {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .rule-summary {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
    }

    .compact {
        padding: 4px 8px !important;
        font-size: 12px !important;
    }

    @media (max-width: 720px) {
        .notify-hero,
        .section-header,
        .channel-card {
            flex-direction: column;
        }

        .channel-actions {
            width: 100%;
        }
    }
</style>
