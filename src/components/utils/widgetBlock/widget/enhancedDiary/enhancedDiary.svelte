<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { showMessage } from "siyuan";
    import { simpleDialog } from "@/libs/dialog";
    import {
        ENHANCED_DIARY_PERIODS,
        type EnhancedDiaryConfig,
        type EnhancedDiaryPeriod,
        type EnhancedDiaryStatus,
        type EnhancedDiaryPeriodContext,
    } from "./enhancedDiaryTypes";
    import { loadEnhancedDiaryConfig } from "./enhancedDiaryConfig";
    import type { QuickRecordDialogSubmitInput } from "./workspace/enhancedDiaryWorkspaceRecordService";
    import { initializeEnhancedDiaryIndex } from "./enhancedDiaryIndex";
    import {
        formatDiaryDate,
        getPeriodContext,
        getPreviousPeriodContext,
        getEnhancedDiaryStatus,
    } from "./enhancedDiaryUtils";
    import {
        getDiaryDocumentForDate,
        setEnhancedDiaryIndexNotebook,
        openDiaryDocument,
        openOrCreateDiaryForDate,
        appendTemplateToDiary,
        toggleCompletionMarker,
        skipPeriod,
        restoreSkippedPeriod,
        validateEnhancedDiaryWriteTarget,
        formatDiaryAttrDate,
    } from "./enhancedDiaryDoc";
    import type { EnhancedDiaryTemplateContext } from "./enhancedDiaryTypes";
    import {
        addNewTaskToDiary,
        addQuickRecordToDiary,
        getOrCreateTodayDiaryDocument,
    } from "./enhancedDiaryActions";
    import {
        openTaskEditorSvelteDialog,
        openQuickRecordSvelteDialog,
    } from "./workspace/enhancedDiaryWorkspaceDialogs";
    import type { GenerateTasksPlusTaskInput } from "@/features/task-data/task-parser";
    import {
        loadEnhancedDiaryHomepageSnapshot,
        type EnhancedDiaryHomepageSnapshot,
    } from "./enhancedDiaryHomepageSnapshot";
    import {
        toggleWorkspaceTaskComplete,
        type EnhancedDiaryWorkspaceTask,
    } from "./workspace/enhancedDiaryWorkspaceTaskService";
    import { TASK_DATA_UPDATED_EVENT } from "@/features/task-data/task-data-runtime";
    import { isEnhancedDiaryTaskManagementEnabled } from "./enhancedDiaryTemplateFieldMapping";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
    import WidgetSemanticTitle from "@/homepage/theme/widgetPresentation/components/WidgetSemanticTitle.svelte";
    import WorkspaceOverviewIcon, {
        type WorkspaceOverviewIconName,
    } from "./workspace/components/WorkspaceOverviewIcon.svelte";

    function cloneDate(date: Date): Date {
        return new Date(date.getTime());
    }

    interface Props {
        plugin: any;
        contentTypeJson?: string;
        placement?: string;
    }

    let { plugin, placement = "homepage" }: Props = $props();
    const isMobilePlacement = $derived(placement === "mobile");

    interface CardInfo {
        period: EnhancedDiaryPeriod;
        title: string;
        dateOrRange: string;
        status: EnhancedDiaryStatus;
        statusLabel: string;
        nextAction: string;
        countdown: string;
        docId?: string;
        targetDate: Date;
        templateContext: EnhancedDiaryTemplateContext;
    }

    let config = $state.raw<EnhancedDiaryConfig | null>(null);
    let cards = $state.raw<CardInfo[]>([]);
    let menuCard = $state.raw<CardInfo | null>(null);
    let bodyMenuEl: HTMLDivElement | null = null;
    let bodyMenuKeydownHandler: ((ev: KeyboardEvent) => void) | null = null;
    let actionBusy = $state(false);
    let advancedEnabled = $state(false);

    const taskManagementEnabled = $derived(config ? isEnhancedDiaryTaskManagementEnabled(config) : true);

    const PERIOD_LABELS: Record<EnhancedDiaryPeriod, string> = {
        day: "今日记录",
        week: "本周复盘",
        month: "本月总结",
        year: "年度总结",
    };

    const STATUS_LABELS: Record<EnhancedDiaryStatus, string> = {
        not_due: "未到期",
        not_created: "未创建",
        missing_template: "缺少模板",
        pending: "待完成",
        completed: "已完成",
        overdue: "已逾期",
        skipped: "已跳过",
    };

    const NEXT_ACTIONS: Record<EnhancedDiaryStatus, string> = {
        not_due: "到期后可操作",
        not_created: "点击创建日记",
        missing_template: "点击补充模板",
        pending: "点击标记完成",
        completed: "点击取消完成",
        overdue: "点击标记完成或跳过",
        skipped: "点击取消跳过",
    };

    const MENU_ACTIONS: Record<
        EnhancedDiaryStatus,
        { label: string; action: string }[]
    > = {
        not_due: [{ label: "打开文档", action: "open" }],
        not_created: [{ label: "创建并打开日记", action: "create_and_open" }],
        missing_template: [
            { label: "打开文档", action: "open" },
            { label: "补充模板", action: "append_template" },
        ],
        pending: [
            { label: "打开文档", action: "open" },
            { label: "标记完成", action: "complete" },
        ],
        completed: [
            { label: "打开文档", action: "open" },
            { label: "取消完成", action: "uncomplete" },
        ],
        overdue: [
            { label: "打开文档", action: "open" },
            { label: "标记完成", action: "complete" },
            { label: "跳过本周期", action: "skip" },
        ],
        skipped: [
            { label: "打开文档", action: "open" },
            { label: "取消跳过", action: "restore_skip" },
        ],
    };

    function parseLocalDate(dateStr: string): Date {
        const [y, m, d] = dateStr.split("-").map(Number);
        return new Date(y, m - 1, d);
    }

    function isTargetDateDue(now: Date, targetDate: Date): boolean {
        return formatDiaryDate(now) >= formatDiaryDate(targetDate);
    }

    async function buildCardForContext(
        period: EnhancedDiaryPeriod,
        ctx: EnhancedDiaryPeriodContext,
        now: Date,
        diaryConfig: EnhancedDiaryConfig,
    ): Promise<CardInfo> {
        const doc = await getDiaryDocumentForDate(ctx.targetDate);
        const docExists = !!doc;
        const content = doc?.content || "";
        const status = getEnhancedDiaryStatus({
            docExists,
            content,
            period,
            baseDate: now,
            targetDate: ctx.targetDate,
            config: diaryConfig,
        });

        let dateOrRange = "";
        if (period === "day") {
            dateOrRange = formatDiaryDate(ctx.targetDate);
        } else {
            dateOrRange = `${ctx.range.start} 至 ${ctx.range.end}`;
        }

        let countdown = "";
        if (status === "not_due") {
            const diffMs = ctx.targetDate.getTime() - now.getTime();
            if (diffMs > 0) {
                const totalSeconds = Math.floor(diffMs / 1000);
                const days = Math.floor(totalSeconds / 86400);
                const hours = Math.floor((totalSeconds % 86400) / 3600);
                const minutes = Math.floor((totalSeconds % 3600) / 60);
                const parts: string[] = [];
                if (days > 0) parts.push(`${days}天`);
                if (hours > 0) parts.push(`${hours}小时`);
                parts.push(`${minutes}分钟`);
                countdown = parts.join("");
            }
        }

        return {
            period,
            title: PERIOD_LABELS[period],
            dateOrRange,
            status,
            statusLabel: STATUS_LABELS[status],
            nextAction: NEXT_ACTIONS[status],
            countdown,
            docId: doc?.id,
            targetDate: ctx.targetDate,
            templateContext: ctx.templateContext,
        };
    }

    async function resolveDisplayCardForPeriod(
        period: EnhancedDiaryPeriod,
        now: Date,
        diaryConfig: EnhancedDiaryConfig,
    ): Promise<CardInfo> {
        if (period === "day") {
            const ctx = getPeriodContext(period, now, diaryConfig);
            return buildCardForContext(period, ctx, now, diaryConfig);
        }

        const currentCtx = getPeriodContext(period, now, diaryConfig);
        const currentCard = await buildCardForContext(period, currentCtx, now, diaryConfig);

        const currentDue = isTargetDateDue(now, currentCtx.targetDate);
        if (currentDue) {
            return currentCard;
        }

        const BACKTRACK_LIMITS: Record<EnhancedDiaryPeriod, number> = {
            day: 0,
            week: 12,
            month: 12,
            year: 5,
        };

        const UNHANDLED_STATUSES: EnhancedDiaryStatus[] = [
            "overdue",
            "pending",
            "missing_template",
            "not_created",
        ];

        const TERMINAL_STATUSES: EnhancedDiaryStatus[] = [
            "completed",
            "skipped",
        ];

        const limit = BACKTRACK_LIMITS[period];
        let cursorBaseDate = cloneDate(now);

        for (let i = 0; i < limit; i++) {
            const prevCtx = getPreviousPeriodContext(period, cursorBaseDate, diaryConfig);
            const prevCard = await buildCardForContext(period, prevCtx, now, diaryConfig);

            if (UNHANDLED_STATUSES.includes(prevCard.status)) {
                return prevCard;
            }

            if (TERMINAL_STATUSES.includes(prevCard.status)) {
                break;
            }

            cursorBaseDate = parseLocalDate(prevCtx.range.start);
        }

        return currentCard;
    }

    async function buildCards(diaryConfig: EnhancedDiaryConfig): Promise<CardInfo[]> {
        const now = new Date();
        return await Promise.all(
            ENHANCED_DIARY_PERIODS.map((period) => resolveDisplayCardForPeriod(period, now, diaryConfig)),
        );
    }

    let loadGeneration = 0;
    let snapshotLoadGeneration = 0;
    let snapshotLoading = $state(false);
    let snapshotLoadError = $state<string | null>(null);
    let homepageSnapshot = $state.raw<EnhancedDiaryHomepageSnapshot | null>(null);
    let focusTaskBusyId = $state("");
    let snapshotRefreshFrame: number | null = null;

    async function loadAndBuildCards(): Promise<void> {
        const generation = ++loadGeneration;
        snapshotLoading = true;
        snapshotLoadError = null;
        const loaded = await loadEnhancedDiaryConfig(plugin);
        if (generation !== loadGeneration) return;
        config = loaded;
        setEnhancedDiaryIndexNotebook(loaded.dailyNotebookId);
        if (loaded.dailyNotebookId) await initializeEnhancedDiaryIndex(loaded.dailyNotebookId);
        if (generation !== loadGeneration) return;
        const [nextCards] = await Promise.all([
            buildCards(loaded),
            loadHomepageSnapshot(generation),
        ]);
        if (generation === loadGeneration) {
            cards = nextCards;
        }
    }

    async function loadHomepageSnapshot(
        expectedLoadGeneration = loadGeneration,
    ): Promise<void> {
        const snapshotConfig = config;
        if (!snapshotConfig) return;
        const generation = ++snapshotLoadGeneration;
        snapshotLoading = true;
        snapshotLoadError = null;
        try {
            const nextSnapshot = await loadEnhancedDiaryHomepageSnapshot(snapshotConfig);
            if (
                generation === snapshotLoadGeneration
                && expectedLoadGeneration === loadGeneration
            ) {
                homepageSnapshot = nextSnapshot;
                snapshotLoadError = null;
            }
        } catch (error) {
            console.warn("[enhancedDiary] homepage snapshot load failed", error);
            if (
                generation === snapshotLoadGeneration
                && expectedLoadGeneration === loadGeneration
            ) {
                snapshotLoadError = "今日状态暂时无法读取";
            }
        } finally {
            if (generation === snapshotLoadGeneration) snapshotLoading = false;
        }
    }

    const PERIOD_SHORT_LABELS: Record<EnhancedDiaryPeriod, string> = {
        day: "日",
        week: "周",
        month: "月",
        year: "年",
    };

    interface HomepageAttentionItem {
        key: string;
        label: string;
        action: "tasks" | "review" | "overview" | "today" | "projects";
    }

    function formatTodayLabel(): string {
        const date = new Date();
        const dateLabel = new Intl.DateTimeFormat("zh-CN", {
            month: "long",
            day: "numeric",
        }).format(date);
        const weekdayLabel = new Intl.DateTimeFormat("zh-CN", {
            weekday: "short",
        }).format(date);
        return `${dateLabel} · ${weekdayLabel}`;
    }

    function periodIconName(status: EnhancedDiaryStatus): WorkspaceOverviewIconName {
        if (status === "completed") return "check";
        if (status === "overdue") return "clock";
        if (status === "missing_template") return "attention";
        if (status === "pending") return "clock";
        if (status === "not_created") return "today";
        if (status === "skipped") return "refresh";
        return "calendar";
    }

    function focusTaskHint(task: EnhancedDiaryWorkspaceTask): string {
        if (task.isOverdue) return "逾期";
        if (task.isTodayTask) return "今日";
        return "";
    }

    function getHomepageAttentionItems(): HomepageAttentionItem[] {
        const snapshot = homepageSnapshot;
        if (!snapshot) return [];
        const items: HomepageAttentionItem[] = [];
        if (taskManagementEnabled && (snapshot.overdueTaskCount || 0) > 0) {
            items.push({
                key: "overdue-tasks",
                label: `${snapshot.overdueTaskCount} 个逾期任务`,
                action: "tasks",
            });
        }
        if (snapshot.todayDiaryStatus === "exists" && !snapshot.templateValid) {
            items.push({
                key: "template",
                label: `模板缺少 ${snapshot.missingSections.length} 个区块`,
                action: "today",
            });
        }
        const reviewCount = cards.filter((card) =>
            card.period !== "day"
            && ["overdue", "pending", "missing_template", "not_created"].includes(card.status),
        ).length;
        if (reviewCount > 0) {
            items.push({
                key: "reviews",
                label: `${reviewCount} 个复盘待处理`,
                action: "review",
            });
        }
        if (taskManagementEnabled && !snapshot.taskIndexAvailable) {
            items.push({
                key: "task-index",
                label: "任务索引尚未建立",
                action: "tasks",
            });
        }
        if (snapshot.projectStorageConfigured && !snapshot.projectIndexComplete) {
            items.push({
                key: "project-index",
                label: "项目索引需检查",
                action: "projects",
            });
        }
        return items.slice(0, 3);
    }

    const homepageAttentionItems = $derived.by(() => getHomepageAttentionItems());

    function handleAttentionClick(item: HomepageAttentionItem): void {
        if (item.action === "today") {
            void openTodayDiary();
            return;
        }
        openWorkspace(item.action);
    }

    async function handleToggleFocusTask(task: EnhancedDiaryWorkspaceTask): Promise<void> {
        if (focusTaskBusyId || task.completed) return;
        focusTaskBusyId = task.blockId;
        try {
            const result = await toggleWorkspaceTaskComplete(task, true);
            if (!result.ok) {
                showMessage(result.message || "任务完成状态更新失败，请稍后重试", 4000);
                return;
            }
            if (result.partial) {
                showMessage(result.message || "任务已完成，但部分索引关系同步失败", 4500);
            }
            await loadHomepageSnapshot();
        } catch (error) {
            console.warn("[enhancedDiary] toggle focus task failed", error);
            showMessage("任务完成状态更新失败，请稍后重试", 4000);
        } finally {
            focusTaskBusyId = "";
        }
    }

    function scheduleHomepageSnapshotRefresh(): void {
        if (!advancedEnabled || !config || snapshotRefreshFrame !== null) return;
        snapshotRefreshFrame = window.requestAnimationFrame(() => {
            snapshotRefreshFrame = null;
            void loadHomepageSnapshot();
        });
    }

    function handleTaskDataUpdated(): void {
        scheduleHomepageSnapshotRefresh();
    }

    function clearHomepageSnapshotRefresh(): void {
        if (snapshotRefreshFrame !== null) {
            window.cancelAnimationFrame(snapshotRefreshFrame);
            snapshotRefreshFrame = null;
        }
    }

    function handleCardClick(card: CardInfo, e: MouseEvent): void {
        e.stopPropagation();
        openCardMenu(card, e.clientX, e.clientY);
    }

    function handleCardKeydown(card: CardInfo, e: KeyboardEvent): void {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            const rect = (
                e.currentTarget as HTMLElement
            ).getBoundingClientRect();
            openCardMenu(
                card,
                rect.left + rect.width / 2,
                rect.top + rect.height / 2,
            );
        }
    }

    function openCardMenu(card: CardInfo, x: number, y: number): void {
        renderBodyMenu(card, x, y);
    }

    function removeBodyMenu(): void {
        if (bodyMenuKeydownHandler) {
            document.removeEventListener("keydown", bodyMenuKeydownHandler);
            bodyMenuKeydownHandler = null;
        }
        if (bodyMenuEl) {
            bodyMenuEl.remove();
            bodyMenuEl = null;
        }
        menuCard = null;
    }

    function renderBodyMenu(card: CardInfo | null, x: number, y: number): void {
        removeBodyMenu();
        if (!card) return;

        menuCard = card;

        const overlay = document.createElement("div");
        overlay.className = "enhanced-diary-body-menu-overlay";
        overlay.setAttribute("role", "button");
        overlay.setAttribute("tabindex", "0");

        const popup = document.createElement("div");
        popup.className = "enhanced-diary-body-menu-popup";
        popup.setAttribute("role", "dialog");
        popup.setAttribute("tabindex", "-1");

        const clampedX = Math.max(8, Math.min(x, window.innerWidth - 220));
        const clampedY = Math.max(8, Math.min(y, window.innerHeight - 220));
        popup.style.left = `${clampedX}px`;
        popup.style.top = `${clampedY}px`;

        const title = document.createElement("div");
        title.className = "enhanced-diary-body-menu-title";
        title.textContent = `${PERIOD_LABELS[card.period]} - ${STATUS_LABELS[card.status]}`;
        popup.appendChild(title);

        const actions = MENU_ACTIONS[card.status] || [];
        for (const item of actions) {
            const menuItem = document.createElement("div");
            menuItem.className = "enhanced-diary-body-menu-item";
            menuItem.setAttribute("role", "button");
            menuItem.setAttribute("tabindex", "0");
            menuItem.textContent = item.label;
            menuItem.addEventListener("click", async (ev) => {
                ev.stopPropagation();
                await handleMenuAction(item.action);
            });
            menuItem.addEventListener("keydown", async (ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    await handleMenuAction(item.action);
                }
            });
            popup.appendChild(menuItem);
        }

        overlay.appendChild(popup);
        document.body.appendChild(overlay);
        bodyMenuEl = overlay;

        overlay.addEventListener("click", () => {
            removeBodyMenu();
        });
        popup.addEventListener("click", (ev) => {
            ev.stopPropagation();
        });

        bodyMenuKeydownHandler = (ev) => {
            if (ev.key === "Escape") {
                removeBodyMenu();
            }
        };
        document.addEventListener("keydown", bodyMenuKeydownHandler);
    }

    function selectRestoreSkipMode(): Promise<"pending" | "completed" | null> {
        return new Promise((resolve) => {
            let settled = false;
            function finish(value: "pending" | "completed" | null) {
                if (settled) return;
                settled = true;
                resolve(value);
            }
            const content = document.createElement("div");
            content.innerHTML = `<div style="padding:12px 0;">请选择取消跳过后的状态。</div>
                    <div style="display:flex;gap:8px;justify-content:flex-end;">
                        <button class="b3-button b3-button--outline" data-mode="pending">恢复为未完成</button>
                        <button class="b3-button b3-button--outline" data-mode="completed">直接标记完成</button>
                        <button class="b3-button b3-button--outline" data-mode="cancel">取消</button>
                    </div>`;
            const { dialog } = simpleDialog({
                title: "取消跳过",
                ele: content,
                width: "400px",
                callback: () => finish(null),
                mobilePresentation: "prompt",
            });
            content.querySelectorAll("button[data-mode]").forEach((btn) => {
                btn.addEventListener("click", () => {
                    const mode = (btn as HTMLButtonElement).getAttribute("data-mode");
                    if (mode === "pending") finish("pending");
                    else if (mode === "completed") finish("completed");
                    else finish(null);
                    dialog.destroy();
                });
            });
        });
    }

    async function getTodayDocIdForAction(): Promise<string | null> {
        if (!config) {
            showMessage("强化日记配置未加载，请稍后重试", 3000);
            return null;
        }

        const result = await getOrCreateTodayDiaryDocument(plugin, config);
        if (result.ok && result.docId) {
            return result.docId;
        }

        if (result.reason === "missing_notebook") {
            showMessage("请先在强化日记设置中选择日记笔记本", 4000);
        } else if (result.reason === "create_failed") {
            showMessage("创建今日日记失败，请检查日记笔记本后重试", 4000);
        } else {
            showMessage("未能读取今日日记，请稍后重试", 4000);
        }

        return null;
    }

    function openNewTaskDialog(): void {
        if (!advancedEnabled) {
            showMessage("强化日记为高级会员专属功能，请在「主页设置」→「会员服务」中开通后使用", 3000);
            return;
        }
        if (!taskManagementEnabled) {
            showMessage("任务管理已关闭", 3000);
            return;
        }
        if (actionBusy) return;
        openTaskEditorSvelteDialog({
            mode: "create",
            projectStorage: config?.projectStorage,
            onSubmit: async (input) => {
                return await submitNewTask(input);
            },
        });
    }

    function openQuickRecordDialog(): void {
        if (!advancedEnabled) {
            showMessage("强化日记为高级会员专属功能，请在「主页设置」→「会员服务」中开通后使用", 3000);
            return;
        }
        if (actionBusy) return;
        openQuickRecordSvelteDialog({
            mode: "create",
            suggestedCategories: config?.recordCategorySuggestions || ["未分类", "想法", "问题", "决策", "日志"],
            projectStorage: config?.projectStorage,
            onSubmit: async (input) => {
                return await submitNewRecord(input);
            },
        });
    }

    async function submitNewTask(input: GenerateTasksPlusTaskInput): Promise<boolean> {
        if (!config || actionBusy) return false;
        if (!taskManagementEnabled) {
            showMessage("任务管理已关闭", 3000);
            return false;
        }
        actionBusy = true;
        try {
            const docId = await getTodayDocIdForAction();
            if (!docId) {
                showMessage("未能获取今日日记 docId，任务未写入", 4000);
                return false;
            }

            const result = await addNewTaskToDiary({
                docId,
                task: input,
                dailyNotebookId: config!.dailyNotebookId!,
                expectedDate: formatDiaryAttrDate(new Date()),
                headingStructure: config?.headingStructure,
                mapping: config?.templateFieldMapping,
                projectStorage: config.projectStorage,
            });

            if (result.ok) {
                showMessage(result.message || "已写入今日日记的「新建任务」区块", result.message ? 4500 : 3000);
                await loadHomepageSnapshot();
                return true;
            } else {
                showMessage(result.message || "新增任务失败", 4000);
                return false;
            }
        } finally {
            actionBusy = false;
        }
    }

    async function submitNewRecord(input: QuickRecordDialogSubmitInput): Promise<boolean> {
        if (!config || actionBusy) return false;
        actionBusy = true;
        try {
            const docId = await getTodayDocIdForAction();
            if (!docId) return false;

            const result = await addQuickRecordToDiary({
                docId,
                categoryTitle: input.categoryTitle,
                content: input.content,
                dailyNotebookId: config!.dailyNotebookId!,
                expectedDate: formatDiaryAttrDate(new Date()),
                headingStructure: config?.headingStructure,
                mapping: config?.templateFieldMapping,
                tags: input.tags,
                projectTargetId: input.projectTargetId,
                projectTitle: input.projectTitle,
                rootProjectId: input.rootProjectId,
                projectPath: input.projectPath,
                projectAncestorTargetIds: input.projectAncestorTargetIds,
                isKeyRecord: input.isKeyRecord,
                projectStorage: config.projectStorage,
            });

            if (result.ok) {
                showMessage(result.message || "已写入今日日记的「快速记录」区块", result.message ? 4500 : 3000);
                await loadHomepageSnapshot();
                return true;
            } else {
                showMessage(result.message || "新增记录失败", 4000);
                return false;
            }
        } finally {
            actionBusy = false;
        }
    }

    async function openTodayDiary(): Promise<void> {
        if (!advancedEnabled) {
            showMessage("强化日记为高级会员专属功能，请在「主页设置」→「会员服务」中开通后使用", 3000);
            return;
        }
        if (!config || actionBusy) return;
        actionBusy = true;
        try {
            const result = await openOrCreateDiaryForDate(
                plugin,
                new Date(),
                config.dailyNotebookId,
            );
            if (result.id) {
                await loadAndBuildCards();
            } else if (result.reason === "missing_notebook") {
                showMessage("请先在强化日记设置中选择日记笔记本", 4000);
            } else if (result.reason === "create_failed") {
                showMessage("创建今日日记失败，请稍后重试", 4000);
            } else if (result.reason === "existing_doc_unreadable") {
                showMessage("日记已存在，但正文暂时无法读取，请稍后重试。", 4000);
            } else {
                showMessage("打开今日日记失败，请稍后重试", 4000);
            }
        } finally {
            actionBusy = false;
        }
    }

    function openWorkspace(initialTab = "overview"): void {
        if (!advancedEnabled) {
            showMessage("强化日记工作台为高级会员专属功能，请在「主页设置」→「会员服务」中开通后使用", 3000);
            return;
        }
        if (typeof plugin?.openEnhancedDiaryWorkspace === "function") {
            plugin.openEnhancedDiaryWorkspace(initialTab);
        } else {
            showMessage("打开强化日记工作台失败", 3000);
        }
    }

    async function handleMenuAction(action: string): Promise<void> {
        if (action === "open") {
            if (menuCard?.docId) {
                openDiaryDocument(plugin, menuCard.docId);
            } else {
                showMessage("未找到对应日记", 3000);
            }
        } else if (action === "create_and_open") {
            if (!menuCard) {
                showMessage("未找到当前日记卡片，请刷新后重试", 3000);
                removeBodyMenu();
                return;
            }
            const result = await openOrCreateDiaryForDate(
                plugin,
                menuCard.targetDate,
                config?.dailyNotebookId,
            );
            if (result.id) {
                await loadAndBuildCards();
            } else if (result.reason === "only_today_create_supported") {
                showMessage(
                    "暂不自动创建非今日日记，请先在思源中创建对应日期日记",
                    4000,
                );
            } else if (result.reason === "missing_notebook") {
                showMessage("请先在强化日记设置中选择日记笔记本", 4000);
            } else if (result.reason === "create_failed") {
                showMessage(
                    "创建日记失败，请检查当前组件所在笔记本或稍后重试",
                    4000,
                );
            } else if (result.reason === "existing_doc_unreadable") {
                showMessage("日记已存在，但正文暂时无法读取，请稍后重试。", 4000);
            }
        } else if (action === "append_template") {
            if (!menuCard || !menuCard.docId) {
                showMessage("未找到对应日记", 3000);
            } else if (!config) {
                showMessage("强化日记配置未加载", 3000);
            } else {
                const writeCheck = await validateEnhancedDiaryWriteTarget(
                    menuCard.docId,
                    config.dailyNotebookId!,
                    formatDiaryAttrDate(menuCard.targetDate)
                );
                if (writeCheck.status !== "valid") {
                    showMessage("日记位置或日期已经变化，请刷新组件后重试", 4000);
                    await loadAndBuildCards();
                    return;
                }
                const template = config.templates[menuCard.period];
                const result = await appendTemplateToDiary({
                    docId: menuCard.docId,
                    period: menuCard.period,
                    template,
                    context: menuCard.templateContext,
                    headingStructure: config.headingStructure,
                    mapping: config.templateFieldMapping,
                    taskManagementEnabled,
                });
                if (result.ok && result.skipped) {
                    if (result.reason === "marker_exists") {
                        showMessage("检测到周期标题已存在，已跳过重复补充", 3000);
                    } else if (result.reason === "heading_exists") {
                        showMessage(
                            "检测到模板标题已存在，已跳过重复补充",
                            3000,
                        );
                    } else {
                        showMessage("模板已存在，已跳过重复补充", 3000);
                    }
                } else if (result.ok) {
                    showMessage("强化日记模板已补充", 3000);
                } else if (result.reason === "read_failed") {
                    showMessage("日记正文暂时无法读取，为避免重复写入，本次未补充模板。", 4000);
                    await loadAndBuildCards();
                } else {
                    if (result.reason === "empty_template") {
                        showMessage("模板为空，无法补充", 3000);
                    } else if (result.reason === "append_failed") {
                        showMessage("补充模板失败，请稍后重试", 3000);
                    } else if (result.reason && result.reason.startsWith("template_incomplete:")) {
                        const missingList = result.reason.slice("template_incomplete:".length).trim();
                        showMessage(`根标题已存在，但以下子区块缺失且无法自动定位补全：${missingList}。请在文档中手动添加。`, 5000);
                    } else {
                        showMessage("补充模板失败", 3000);
                    }
                }
                await loadAndBuildCards();
            }
        } else if (action === "complete") {
            if (!menuCard || !menuCard.docId) {
                showMessage("未找到对应日记", 3000);
            } else {
                const writeCheck = await validateEnhancedDiaryWriteTarget(
                    menuCard.docId,
                    config!.dailyNotebookId!,
                    formatDiaryAttrDate(menuCard.targetDate)
                );
                if (writeCheck.status !== "valid") {
                    showMessage("日记位置或日期已经变化，请刷新组件后重试", 4000);
                    await loadAndBuildCards();
                    return;
                }
                const result = await toggleCompletionMarker({
                    docId: menuCard.docId,
                    period: menuCard.period,
                    completed: true,
                    mapping: config?.templateFieldMapping,
                });
                if (result.ok && result.skipped) {
                    showMessage("当前周期已是完成状态", 3000);
                } else if (result.ok) {
                    showMessage("已标记完成", 3000);
                } else if (result.reason === "marker_not_found") {
                    showMessage("当前日记缺少周期顶级标题，请先补充模板", 4000);
                } else {
                    showMessage("标记完成失败，请稍后重试", 4000);
                }
                await loadAndBuildCards();
            }
        } else if (action === "uncomplete") {
            if (!menuCard || !menuCard.docId) {
                showMessage("未找到对应日记", 3000);
            } else {
                const writeCheck = await validateEnhancedDiaryWriteTarget(
                    menuCard.docId,
                    config!.dailyNotebookId!,
                    formatDiaryAttrDate(menuCard.targetDate)
                );
                if (writeCheck.status !== "valid") {
                    showMessage("日记位置或日期已经变化，请刷新组件后重试", 4000);
                    await loadAndBuildCards();
                    return;
                }
                const result = await toggleCompletionMarker({
                    docId: menuCard.docId,
                    period: menuCard.period,
                    completed: false,
                    mapping: config?.templateFieldMapping,
                });
                if (result.ok && result.skipped) {
                    showMessage("当前周期已是未完成状态", 3000);
                } else if (result.ok) {
                    showMessage("已取消完成", 3000);
                } else if (result.reason === "marker_not_found") {
                    showMessage("当前日记缺少周期顶级标题，请先补充模板", 4000);
                } else {
                    showMessage("取消完成失败，请稍后重试", 4000);
                }
                await loadAndBuildCards();
            }
        } else if (action === "skip") {
            if (!menuCard || !menuCard.docId) {
                showMessage("未找到对应日记", 3000);
            } else {
                const writeCheck = await validateEnhancedDiaryWriteTarget(
                    menuCard.docId,
                    config!.dailyNotebookId!,
                    formatDiaryAttrDate(menuCard.targetDate)
                );
                if (writeCheck.status !== "valid") {
                    showMessage("日记位置或日期已经变化，请刷新组件后重试", 4000);
                    await loadAndBuildCards();
                    return;
                }
                const result = await skipPeriod({
                    docId: menuCard.docId,
                    period: menuCard.period,
                    mapping: config?.templateFieldMapping,
                });
                if (result.ok && result.skipped) {
                    showMessage("当前周期已跳过", 3000);
                } else if (result.ok) {
                    showMessage("已跳过本周期", 3000);
                } else if (result.reason === "marker_not_found") {
                    showMessage("当前日记缺少周期顶级标题，请先补充模板", 4000);
                } else if (result.reason === "read_failed") {
                    showMessage("日记正文暂时无法读取，请稍后重试。", 4000);
                } else if (result.reason === "update_failed") {
                    showMessage("跳过本周期失败，请稍后重试", 4000);
                } else {
                    showMessage("跳过本周期失败", 4000);
                }
                await loadAndBuildCards();
            }
        } else if (action === "restore_skip") {
            const currentCard = menuCard;
            if (!currentCard || !currentCard.docId) {
                showMessage("未找到对应日记", 3000);
                removeBodyMenu();
                return;
            }
            removeBodyMenu();
            const mode = await selectRestoreSkipMode();
            if (!mode) return;
            const writeCheck = await validateEnhancedDiaryWriteTarget(
                currentCard.docId,
                config!.dailyNotebookId!,
                formatDiaryAttrDate(currentCard.targetDate)
            );
            if (writeCheck.status !== "valid") {
                showMessage("日记位置或日期已经变化，请刷新组件后重试", 4000);
                await loadAndBuildCards();
                return;
            }
            const result = await restoreSkippedPeriod({
                docId: currentCard.docId,
                period: currentCard.period,
                mode,
                mapping: config?.templateFieldMapping,
            });
            if (result.ok) {
                if (mode === "pending") {
                    showMessage("已恢复为未完成", 3000);
                } else {
                    showMessage("已恢复为完成", 3000);
                }
            } else if (result.reason === "skip_marker_not_found") {
                showMessage("当前日记缺少跳过标记，请刷新后重试", 4000);
            } else if (result.reason === "update_failed") {
                showMessage("取消跳过失败，请稍后重试", 4000);
            } else {
                showMessage("取消跳过失败", 4000);
            }
            await loadAndBuildCards();
        } else {
            showMessage("暂不支持的操作，请刷新后重试", 3000);
        }
        removeBodyMenu();
    }

    onMount(() => {
        advancedEnabled = Boolean(plugin?.ADVANCED);
        if (advancedEnabled) {
            void loadAndBuildCards();
        }

        const onReady = () => {
            advancedEnabled = true;
            void loadAndBuildCards();
        };
        const onUnavailable = () => {
            advancedEnabled = false;
            loadGeneration += 1;
            snapshotLoadGeneration += 1;
            cards = [];
            homepageSnapshot = null;
            snapshotLoading = false;
            snapshotLoadError = null;
            focusTaskBusyId = "";
            clearHomepageSnapshotRefresh();
            removeBodyMenu();
        };
        window.addEventListener("homepage-advanced-ready", onReady);
        window.addEventListener("homepage-advanced-unavailable", onUnavailable);
        window.addEventListener(TASK_DATA_UPDATED_EVENT, handleTaskDataUpdated);
        return () => {
            window.removeEventListener("homepage-advanced-ready", onReady);
            window.removeEventListener("homepage-advanced-unavailable", onUnavailable);
            window.removeEventListener(TASK_DATA_UPDATED_EVENT, handleTaskDataUpdated);
            clearHomepageSnapshotRefresh();
        };
    });

    onDestroy(() => {
        loadGeneration += 1;
        snapshotLoadGeneration += 1;
        clearHomepageSnapshotRefresh();
        removeBodyMenu();
    });
</script>

{#if advancedEnabled}
<div class="enhanced-diary-container" data-widget-part="root" class:is-mobile-placement={isMobilePlacement}>
    <div class="enhanced-diary-topbar">
        <WidgetSemanticTitle
            widgetType="enhancedDiary"
            configuredTitle="强化日记"
            semanticLabel="强化日记"
            fallbackIcon="iconCalendar"
            compact={isMobilePlacement}
            summary={isMobilePlacement
                ? (homepageSnapshot?.pendingTaskCount == null
                    ? (snapshotLoading ? "加载中" : "任务 —")
                    : `${homepageSnapshot.pendingTaskCount} 待办`)
                : undefined}
        />
    </div>

    <div class="enhanced-diary-body" data-widget-part="body">
        {#if homepageSnapshot}
            <button
                class="enhanced-diary-today"
                class:enhanced-diary-today--missing={homepageSnapshot.todayDiaryStatus === "missing"}
                class:enhanced-diary-today--attention={homepageSnapshot.todayDiaryStatus === "unreadable" || (homepageSnapshot.todayDiaryStatus === "exists" && !homepageSnapshot.templateValid)}
                type="button"
                onclick={openTodayDiary}
                disabled={actionBusy}
            >
                <span class="enhanced-diary-today-icon" aria-hidden="true">
                    <WorkspaceOverviewIcon
                        name={homepageSnapshot.todayDiaryStatus === "exists"
                            ? (homepageSnapshot.templateValid ? "check" : "attention")
                            : homepageSnapshot.todayDiaryStatus === "missing" ? "today" : "attention"}
                        size={20}
                    />
                </span>
                <span class="enhanced-diary-today-copy">
                    <span class="enhanced-diary-today-date">{formatTodayLabel()}</span>
                    {#if homepageSnapshot.todayDiaryStatus === "missing"}
                        <strong>今日尚未开始</strong>
                        <span>创建今日日记后即可开始记录</span>
                    {:else if homepageSnapshot.todayDiaryStatus === "unreadable"}
                        <strong>今日日记暂时无法读取</strong>
                        <span>请稍后重试，不会自动创建新日记</span>
                    {:else if homepageSnapshot.templateValid}
                        <strong>今日日记已创建</strong>
                        <span>模板完整</span>
                    {:else}
                        <strong>今日日记已创建</strong>
                        <span>模板缺少 {homepageSnapshot.missingSections.length} 个区块</span>
                    {/if}
                </span>
                <span class="enhanced-diary-today-action" aria-hidden="true">
                    <WorkspaceOverviewIcon name="arrow" size={16} />
                </span>
            </button>
        {:else if snapshotLoading}
            <div class="enhanced-diary-loading" aria-live="polite">正在读取今日状态…</div>
        {:else}
            <div class="enhanced-diary-unavailable" role="status" aria-live="polite">
                <WorkspaceOverviewIcon name="attention" size={15} />
                <span>{snapshotLoadError || "今日状态暂时无法读取"}</span>
                <button
                    class="enhanced-diary-retry"
                    type="button"
                    title="重新读取今日状态"
                    aria-label="重新读取今日状态"
                    onclick={() => void loadHomepageSnapshot()}
                >
                    <WorkspaceOverviewIcon name="refresh" size={14} />
                    <span>重新加载</span>
                </button>
            </div>
        {/if}

        <div class="enhanced-diary-quick-dock" aria-label="强化日记辅助操作">
            <button
                class="enhanced-diary-quick-action"
                type="button"
                title="打开强化日记工作台"
                aria-label="打开强化日记工作台"
                onclick={() => openWorkspace("overview")}
            >
                <WorkspaceOverviewIcon name="dashboard" size={16} />
            </button>
            {#if taskManagementEnabled}
                <button
                    class="enhanced-diary-quick-action"
                    type="button"
                    title="新建任务"
                    aria-label="新建任务"
                    onclick={openNewTaskDialog}
                    disabled={actionBusy}
                >
                    <WorkspaceOverviewIcon name="taskAdd" size={16} />
                </button>
            {/if}
            <button
                class="enhanced-diary-quick-action"
                type="button"
                title="快速记录"
                aria-label="快速记录"
                onclick={openQuickRecordDialog}
                disabled={actionBusy}
            >
                <WorkspaceOverviewIcon name="recordAdd" size={16} />
            </button>
        </div>

        {#if homepageSnapshot}
            <div class="enhanced-diary-metrics" aria-label="今日摘要">
                {#if taskManagementEnabled}
                    <button class="enhanced-diary-metric" type="button" onclick={() => openWorkspace("tasks")}>
                        <WorkspaceOverviewIcon name="tasks" size={15} />
                        <span><span>任务</span><strong>{homepageSnapshot.taskIndexAvailable ? homepageSnapshot.todayTaskCount : "—"}</strong></span>
                    </button>
                {/if}
                <button class="enhanced-diary-metric" type="button" onclick={() => openWorkspace("records")}>
                    <WorkspaceOverviewIcon name="record" size={15} />
                    <span><span>记录</span><strong>{homepageSnapshot.todayDiaryStatus === "unreadable" ? "—" : homepageSnapshot.quickRecordCount}</strong></span>
                </button>
                <button class="enhanced-diary-metric" type="button" onclick={() => openWorkspace("projects")}>
                    <WorkspaceOverviewIcon name="projects" size={15} />
                    <span><span>项目</span><strong>{homepageSnapshot.projectStorageConfigured && homepageSnapshot.projectIndexComplete ? homepageSnapshot.activeProjectCount : "—"}</strong></span>
                </button>
                <button class="enhanced-diary-metric" type="button" onclick={() => openWorkspace("overview")}>
                    <WorkspaceOverviewIcon
                        name={homepageSnapshot.todayDiaryStatus === "missing"
                            ? "today"
                            : homepageSnapshot.todayDiaryStatus === "exists" && homepageSnapshot.templateValid ? "check" : "attention"}
                        size={15}
                    />
                    <span><span>模板</span><strong>{homepageSnapshot.todayDiaryStatus === "missing"
                        ? "未开始"
                        : homepageSnapshot.todayDiaryStatus === "unreadable"
                            ? "不可用"
                            : homepageSnapshot.templateValid
                                ? "完整"
                                : `缺 ${homepageSnapshot.missingSections.length}`}</strong></span>
                </button>
            </div>

            {#if taskManagementEnabled && homepageSnapshot.taskIndexAvailable}
                <section class="enhanced-diary-focus" aria-labelledby="enhanced-diary-focus-title">
                    <div class="enhanced-diary-section-heading">
                        <div class="enhanced-diary-section-title" id="enhanced-diary-focus-title">
                            <WorkspaceOverviewIcon name="target" size={16} />
                            <span>今日焦点</span>
                        </div>
                        <button class="enhanced-diary-section-link" type="button" onclick={() => openWorkspace("tasks")}>
                            查看全部 <WorkspaceOverviewIcon name="arrow" size={14} />
                        </button>
                    </div>
                    {#if homepageSnapshot.taskIndexAvailable && homepageSnapshot.focusTasks.length > 0}
                        <div class="enhanced-diary-focus-list">
                            {#each homepageSnapshot.focusTasks as task (task.blockId)}
                                <div class="enhanced-diary-focus-row">
                                    <input
                                        type="checkbox"
                                        checked={task.completed}
                                        aria-label={`完成任务：${task.taskname}`}
                                        disabled={focusTaskBusyId === task.blockId}
                                        onchange={() => void handleToggleFocusTask(task)}
                                    />
                                    <button
                                        class="enhanced-diary-focus-task"
                                        type="button"
                                        title={task.taskname}
                                        onclick={() => openWorkspace("tasks")}
                                    >
                                        {task.taskname}
                                    </button>
                                    {#if focusTaskHint(task)}
                                        <span class:enhanced-diary-focus-hint--danger={task.isOverdue} class="enhanced-diary-focus-hint">{focusTaskHint(task)}</span>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    {:else if homepageSnapshot.taskIndexAvailable}
                        <div class="enhanced-diary-focus-empty">
                            <WorkspaceOverviewIcon name="target" size={14} />
                            <span>今日暂无待处理焦点</span>
                        </div>
                    {/if}
                </section>
            {/if}

            {#if homepageAttentionItems.length > 0}
                <section class="enhanced-diary-attention" aria-label="需要关注">
                    <div class="enhanced-diary-section-title">
                        <WorkspaceOverviewIcon name="attention" size={15} />
                        <span>需要关注</span>
                    </div>
                    <div class="enhanced-diary-attention-list">
                        {#each homepageAttentionItems as item (item.key)}
                            <button class="enhanced-diary-attention-item" type="button" onclick={() => handleAttentionClick(item)}>
                                <span>{item.label}</span>
                                <WorkspaceOverviewIcon name="arrow" size={14} />
                            </button>
                        {/each}
                    </div>
                </section>
            {/if}
        {/if}

        <section class="enhanced-diary-periods" aria-label="周期状态">
            <div class="enhanced-diary-section-heading">
                <div class="enhanced-diary-section-title">
                    <WorkspaceOverviewIcon name="calendar" size={15} />
                    <span>周期状态</span>
                </div>
                <span class="enhanced-diary-section-note">点击查看操作</span>
            </div>
            <div class="enhanced-diary-period-track">
                {#each cards as card (card.period)}
                    <button
                        class="enhanced-diary-period-item status-{card.status}"
                        type="button"
                        title={`${card.title} · ${card.statusLabel}`}
                        onclick={(event) => handleCardClick(card, event)}
                        onkeydown={(event) => handleCardKeydown(card, event)}
                    >
                        <span class="enhanced-diary-period-marker">
                            <span>{PERIOD_SHORT_LABELS[card.period]}</span>
                            <WorkspaceOverviewIcon name={periodIconName(card.status)} size={13} />
                        </span>
                        <span class="enhanced-diary-period-copy">
                            <strong>{card.title}</strong>
                            <span>{card.statusLabel}</span>
                            {#if card.countdown}
                                <small class="enhanced-diary-period-countdown">
                                    <WorkspaceOverviewIcon name="clock" size={10} />
                                    <span>{card.countdown}</span>
                                </small>
                            {/if}
                        </span>
                    </button>
                {/each}
            </div>
        </section>
    </div>
</div>
{:else}
<div class="enhanced-diary-container enhanced-diary-locked" data-widget-part="root">
    <AdvancedFeatureLock
        title="强化日记工作台"
        subtitle={taskManagementEnabled ? "把日记、任务、记录、复盘和计划承接整合成一个专业工作台。" : "把日记、记录、复盘和计划承接整合成一个专业工作台。"}
        icon="diary"
        features={taskManagementEnabled
            ? [
                "任务、记录、复盘集中管理",
                "今日作战台与风险提醒",
                "计划承接与复盘内容编辑",
                "快速记录和自定义分类"
            ]
            : [
                "记录、复盘集中管理",
                "今日作战台与提醒",
                "计划承接与复盘内容编辑",
                "快速记录和自定义分类"
            ]}
        highlights={["Dashboard", "复盘工作流", "计划承接"]}
        tutorialUrl="https://glaube-ty.top/tutorials/siyuan-homepage/enhanced-diary-workbench/"
        compact
    />
</div>
{/if}

<style>
    .enhanced-diary-container {
        width: 100%;
        height: 100%;
        min-height: 0;
        box-sizing: border-box;
        background: transparent;
        border-radius: 8px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 7px;
        overflow: hidden;
        color: var(--b3-theme-on-background);
        container-type: inline-size;
        container-name: hp-widget;
    }

    /* Homepage Widget 的通用 drag handle 固定占用右上角；强化日记业务操作不进入该 host chrome 安全区。 */
    .enhanced-diary-topbar {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        min-height: 30px;
        box-sizing: border-box;
        padding-inline-end: 38px;
    }

    .enhanced-diary-topbar :global(.hp-widget-title) {
        flex: 1 1 auto;
        min-width: 0;
        width: auto;
        margin: 0;
        padding: 0;
        border: 0;
        font-size: 16px;
        font-weight: 650;
        line-height: 1.2;
        text-align: left;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .enhanced-diary-container.is-mobile-placement .enhanced-diary-topbar {
        padding-inline-end: 0;
    }

    /* Mobile Homepage editing chrome reserves both 44px host controls, edge inset, and visual breathing room. */
    :global(.mobile-homepage.mobile-homepage--editing) .enhanced-diary-container.is-mobile-placement .enhanced-diary-topbar {
        padding-inline-end: 110px;
    }

    /* Non-editing context actions reserve the single 44px action button, edge inset, and visual breathing room. */
    :global(.mobile-homepage:not(.mobile-homepage--editing) .widget-block[data-widget-context-actions="true"]) .enhanced-diary-container.is-mobile-placement .enhanced-diary-topbar {
        padding-inline-end: 60px;
    }

    .enhanced-diary-quick-dock {
        align-self: flex-end;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 3px;
        width: fit-content;
        max-width: 100%;
        min-height: 30px;
        margin-top: 4px;
        border-radius: 8px;
        padding: 1px 2px;
        background: color-mix(in srgb, var(--b3-theme-on-background) 4%, transparent);
    }

    .enhanced-diary-quick-action,
    .enhanced-diary-section-link,
    .enhanced-diary-metric,
    .enhanced-diary-attention-item,
    .enhanced-diary-period-item,
    .enhanced-diary-focus-task {
        border: 0;
        background: transparent;
        color: var(--b3-theme-on-surface, var(--b3-theme-on-background));
        cursor: pointer;
        font: inherit;
    }

    .enhanced-diary-quick-action {
        width: 30px;
        height: 30px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 7px;
        padding: 0;
        color: var(--b3-theme-on-surface, var(--b3-theme-on-background));
    }

    .enhanced-diary-quick-action:hover,
    .enhanced-diary-quick-action:focus-visible,
    .enhanced-diary-section-link:hover,
    .enhanced-diary-section-link:focus-visible,
    .enhanced-diary-metric:hover,
    .enhanced-diary-metric:focus-visible,
    .enhanced-diary-attention-item:hover,
    .enhanced-diary-attention-item:focus-visible,
    .enhanced-diary-period-item:hover,
    .enhanced-diary-period-item:focus-visible {
        outline: none;
        color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, transparent);
    }

    .enhanced-diary-quick-action:focus-visible,
    .enhanced-diary-section-link:focus-visible,
    .enhanced-diary-metric:focus-visible,
    .enhanced-diary-attention-item:focus-visible,
    .enhanced-diary-period-item:focus-visible,
    .enhanced-diary-focus-task:focus-visible,
    .enhanced-diary-today:focus-visible {
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--b3-theme-primary) 45%, transparent);
    }

    .enhanced-diary-quick-action:disabled,
    .enhanced-diary-today:disabled {
        cursor: not-allowed;
        opacity: 0.55;
    }

    .enhanced-diary-body {
        flex: 1 1 auto;
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior-y: contain;
        touch-action: pan-y;
        -webkit-overflow-scrolling: touch;
    }

    .enhanced-diary-loading {
        color: var(--b3-theme-on-surface, var(--b3-theme-on-background));
        opacity: 0.65;
        font-size: 12px;
        padding: 12px 4px;
    }

    .enhanced-diary-unavailable {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        color: var(--b3-theme-on-surface, var(--b3-theme-on-background));
        font-size: 12px;
        padding: 10px 4px;
    }

    .enhanced-diary-unavailable > span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .enhanced-diary-retry {
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        gap: 3px;
        border: 0;
        border-radius: 5px;
        padding: 3px 5px;
        background: transparent;
        color: var(--b3-theme-primary);
        cursor: pointer;
        font: inherit;
        font-size: 11px;
    }

    .enhanced-diary-retry:hover,
    .enhanced-diary-retry:focus-visible {
        outline: none;
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, transparent);
    }

    .enhanced-diary-today {
        width: 100%;
        min-width: 0;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        border: 0;
        border-radius: 10px;
        padding: 10px 11px;
        background: color-mix(in srgb, var(--b3-theme-primary) 7%, var(--b3-theme-surface, transparent));
        color: var(--b3-theme-on-surface, var(--b3-theme-on-background));
        text-align: left;
        cursor: pointer;
    }

    .enhanced-diary-today--missing {
        background: color-mix(in srgb, var(--b3-theme-on-surface, #555) 5%, var(--b3-theme-surface, transparent));
    }

    .enhanced-diary-today--attention {
        background: color-mix(in srgb, var(--b3-theme-error, #c94d4d) 8%, var(--b3-theme-surface, transparent));
    }

    .enhanced-diary-today-icon {
        width: 34px;
        height: 34px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 9px;
        color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 13%, transparent);
    }

    .enhanced-diary-today--attention .enhanced-diary-today-icon {
        color: var(--b3-theme-error, #c94d4d);
        background: color-mix(in srgb, var(--b3-theme-error, #c94d4d) 12%, transparent);
    }

    .enhanced-diary-today-copy {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .enhanced-diary-today-date {
        font-size: 11px;
        opacity: 0.62;
    }

    .enhanced-diary-today-copy strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 14px;
        line-height: 1.25;
    }

    .enhanced-diary-today-copy > span:last-child {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 11px;
        opacity: 0.67;
    }

    .enhanced-diary-today-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--b3-theme-primary);
        opacity: 0.75;
    }

    .enhanced-diary-metrics {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        margin-top: 7px;
        border: 1px solid color-mix(in srgb, var(--b3-border-color) 75%, transparent);
        border-radius: 8px;
        overflow: hidden;
        background: color-mix(in srgb, var(--b3-theme-surface, transparent) 45%, transparent);
    }

    .enhanced-diary-metric {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 7px;
        text-align: left;
    }

    .enhanced-diary-metric + .enhanced-diary-metric {
        border-left: 1px solid color-mix(in srgb, var(--b3-border-color) 72%, transparent);
    }

    .enhanced-diary-metric > :global(svg) {
        flex: 0 0 auto;
        opacity: 0.68;
    }

    .enhanced-diary-metric > span {
        min-width: 0;
        display: flex;
        align-items: baseline;
        flex-direction: row;
        flex-wrap: wrap;
        column-gap: 4px;
        row-gap: 1px;
    }

    .enhanced-diary-metric > span > span {
        font-size: 11px;
        opacity: 0.65;
        white-space: nowrap;
    }

    .enhanced-diary-metric strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
        font-weight: 600;
    }

    .enhanced-diary-focus,
    .enhanced-diary-attention,
    .enhanced-diary-periods {
        min-width: 0;
        margin-top: 10px;
    }

    .enhanced-diary-section-heading,
    .enhanced-diary-section-title {
        display: flex;
        align-items: center;
        min-width: 0;
    }

    .enhanced-diary-section-heading {
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 5px;
    }

    .enhanced-diary-section-title {
        gap: 5px;
        font-size: 12px;
        font-weight: 650;
    }

    .enhanced-diary-section-title :global(svg) {
        flex: 0 0 auto;
        color: var(--b3-theme-primary);
    }

    .enhanced-diary-section-link {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 3px 4px;
        border-radius: 5px;
        color: var(--b3-theme-primary);
        font-size: 11px;
        white-space: nowrap;
    }

    .enhanced-diary-section-note {
        font-size: 10px;
        opacity: 0.52;
    }

    .enhanced-diary-focus-list {
        border-top: 1px solid color-mix(in srgb, var(--b3-border-color) 70%, transparent);
    }

    .enhanced-diary-focus-row {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 7px;
        min-height: 34px;
        border-bottom: 1px solid color-mix(in srgb, var(--b3-border-color) 58%, transparent);
    }

    .enhanced-diary-focus-row input {
        flex: 0 0 auto;
        width: 14px;
        height: 14px;
        margin: 0;
        accent-color: var(--b3-theme-primary);
    }

    .enhanced-diary-focus-task {
        min-width: 0;
        flex: 1 1 auto;
        overflow: hidden;
        padding: 5px 0;
        text-align: left;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
    }

    .enhanced-diary-focus-task:hover {
        color: var(--b3-theme-primary);
    }

    .enhanced-diary-focus-hint {
        flex: 0 0 auto;
        max-width: 40px;
        overflow: hidden;
        color: var(--b3-theme-primary);
        font-size: 10px;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .enhanced-diary-focus-hint--danger {
        color: var(--b3-theme-error, #c94d4d);
    }

    .enhanced-diary-focus-empty {
        display: flex;
        align-items: center;
        gap: 5px;
        min-height: 28px;
        color: var(--b3-theme-on-surface, var(--b3-theme-on-background));
        font-size: 11px;
        opacity: 0.62;
    }

    .enhanced-diary-attention {
        padding: 8px 9px;
        border-radius: 8px;
        background: color-mix(in srgb, var(--b3-theme-error, #c94d4d) 6%, transparent);
    }

    .enhanced-diary-attention .enhanced-diary-section-title {
        color: var(--b3-theme-error, #c94d4d);
    }

    .enhanced-diary-attention .enhanced-diary-section-title :global(svg) {
        color: inherit;
    }

    .enhanced-diary-attention-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-top: 4px;
    }

    .enhanced-diary-attention-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-width: 0;
        padding: 3px 2px;
        border-radius: 4px;
        color: var(--b3-theme-on-surface, var(--b3-theme-on-background));
        font-size: 11px;
        text-align: left;
    }

    .enhanced-diary-attention-item span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .enhanced-diary-period-track {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        border-top: 1px solid color-mix(in srgb, var(--b3-border-color) 70%, transparent);
        border-bottom: 1px solid color-mix(in srgb, var(--b3-border-color) 70%, transparent);
    }

    .enhanced-diary-period-item {
        min-width: 0;
        display: flex;
        align-items: flex-start;
        gap: 6px;
        padding: 8px 6px;
        text-align: left;
    }

    .enhanced-diary-period-item + .enhanced-diary-period-item {
        border-left: 1px solid color-mix(in srgb, var(--b3-border-color) 60%, transparent);
    }

    .enhanced-diary-period-marker {
        flex: 0 0 auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        color: var(--b3-theme-primary);
        font-size: 11px;
        font-weight: 650;
    }

    .enhanced-diary-period-copy {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
    }

    .enhanced-diary-period-copy strong,
    .enhanced-diary-period-copy > span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .enhanced-diary-period-copy strong {
        font-size: 11px;
        font-weight: 600;
    }

    .enhanced-diary-period-copy > span {
        font-size: 10px;
        opacity: 0.62;
    }

    .enhanced-diary-period-countdown {
        display: inline-flex;
        align-items: center;
        align-self: flex-start;
        justify-content: flex-start;
        gap: 2px;
        min-width: 0;
        max-width: 100%;
        line-height: 1.2;
        color: var(--b3-theme-primary);
        font-size: 10px;
        text-align: left;
    }

    .enhanced-diary-period-countdown :global(svg) {
        flex: 0 0 auto;
    }

    .enhanced-diary-period-countdown > span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .status-overdue .enhanced-diary-period-marker,
    .status-missing_template .enhanced-diary-period-marker {
        color: var(--b3-theme-error, #c94d4d);
    }

    .status-completed .enhanced-diary-period-marker {
        color: var(--b3-theme-success, var(--b3-theme-primary));
    }

    @container hp-widget (max-width: 359px) {
        .enhanced-diary-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .enhanced-diary-metric:nth-child(odd) + .enhanced-diary-metric {
            border-left: 0;
        }

        .enhanced-diary-metric:nth-child(n + 3) {
            border-top: 1px solid color-mix(in srgb, var(--b3-border-color) 72%, transparent);
        }

        .enhanced-diary-topbar {
            align-items: flex-start;
        }
    }

    @container hp-widget (max-width: 239px) {
        .enhanced-diary-period-track {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .enhanced-diary-period-item:nth-child(odd) + .enhanced-diary-period-item {
            border-left: 0;
        }

        .enhanced-diary-period-item:nth-child(n + 3) {
            border-top: 1px solid color-mix(in srgb, var(--b3-border-color) 60%, transparent);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .enhanced-diary-container * {
            transition: none !important;
        }
    }

    :global(.enhanced-diary-body-menu-overlay) {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 100000;
        background: transparent;
    }

    :global(.enhanced-diary-body-menu-popup) {
        position: fixed;
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        min-width: 200px;
        overflow: hidden;
    }

    :global(.enhanced-diary-body-menu-title) {
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        border-bottom: 1px solid var(--b3-border-color);
    }

    :global(.enhanced-diary-body-menu-item) {
        padding: 8px 12px;
        font-size: 13px;
        color: var(--b3-theme-on-surface);
        cursor: pointer;
        transition: background 0.1s;
    }

    :global(.enhanced-diary-body-menu-item:hover) {
        background: var(--b3-theme-primary);
        color: #fff;
    }

    :global(.enhanced-diary-action-dialog) {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding-top: 4px;
    }

    :global(.enhanced-diary-action-dialog label) {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
    }

    :global(.enhanced-diary-action-row) {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
    }

    :global(.enhanced-diary-action-footer) {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding-top: 4px;
    }

    :global(.enhanced-diary-record-textarea) {
        min-height: 140px;
        resize: vertical;
    }

    .enhanced-diary-locked {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        text-align: center;
        min-height: 120px;
    }

    .locked-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--b3-theme-on-background);
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }

    .locked-desc {
        font-size: 13px;
        color: var(--b3-theme-on-surface);
        opacity: 0.65;
        margin: 0;
    }
</style>
