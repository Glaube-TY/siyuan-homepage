<script lang="ts">
    import { onMount } from "svelte";
    import { Dialog, showMessage } from "siyuan";
    import WorkspaceHeader from "./components/WorkspaceHeader.svelte";
    import WorkspaceSidebar, { type WorkspaceTab } from "./components/WorkspaceSidebar.svelte";
    import WorkspaceStatCard from "./components/WorkspaceStatCard.svelte";
    import WorkspaceOverview from "./components/WorkspaceOverview.svelte";
    import WorkspaceTaskPanel from "./components/WorkspaceTaskPanel.svelte";
    import WorkspaceRecordPanel from "./components/WorkspaceRecordPanel.svelte";
    import WorkspaceCalendarPanel from "./components/WorkspaceCalendarPanel.svelte";
    import WorkspaceNotificationPanel from "./components/WorkspaceNotificationPanel.svelte";
    import WorkspaceReviewPanel from "./components/WorkspaceReviewPanel.svelte";
    import WorkspaceProjectPanel from "./components/WorkspaceProjectPanel.svelte";
    import WorkspaceGlobalSearch from "./components/WorkspaceGlobalSearch.svelte";
    import WorkspaceCommandPalette, { type WorkspaceCommand } from "./components/WorkspaceCommandPalette.svelte";
    import WorkspaceQuickCreateFab from "./components/WorkspaceQuickCreateFab.svelte";
    import WorkspaceEmptyState from "./components/WorkspaceEmptyState.svelte";
    import WorkspaceSettingsPage from "./components/WorkspaceSettingsPage.svelte";
    import AdvancedFeatureLock from "../../common/AdvancedFeatureLock.svelte";
    import {
        openTaskEditorSvelteDialog,
        openQuickRecordSvelteDialog,
        openDeleteTaskSvelteDialog,
        openDeleteRecordSvelteDialog,
        openMigrateTaskSvelteDialog,
    } from "./enhancedDiaryWorkspaceDialogs";
    import WorkspaceMorePage from "./components/WorkspaceMorePage.svelte";
    import {
        loadReviewContent,
        saveReviewContent,
        type EnhancedDiaryReviewField,
    } from "./enhancedDiaryWorkspaceReviewContent";
    import {
        loadEnhancedDiaryWorkspaceState,
        loadWorkspaceHistoryRecords,
        loadWorkspaceReviewHistory,
        type EnhancedDiaryWorkspaceState,
    } from "./enhancedDiaryWorkspaceData";
    import {
        deleteWorkspaceTask,
        migrateWorkspaceTaskToToday,
        postponeWorkspaceTask,
        toggleWorkspaceTaskComplete,
        updateWorkspaceTask,
        type EnhancedDiaryWorkspaceTask,
    } from "./enhancedDiaryWorkspaceTaskService";
    import {
        addWorkspaceQuickRecord,
        deleteQuickRecord,
        updateQuickRecord,
        type EnhancedDiaryWorkspaceRecord,
    } from "./enhancedDiaryWorkspaceRecordService";
    import {
        buildWorkspaceCalendarMonth,
        type EnhancedDiaryCalendarDay,
    } from "./enhancedDiaryWorkspaceCalendar";
    import WorkspaceCalendarDayDetail from "./components/WorkspaceCalendarDayDetail.svelte";
    import {
        loadWorkspaceDayDetail,
        type EnhancedDiaryWorkspaceDayDetail,
    } from "./enhancedDiaryWorkspaceDayDetail";
    import { parseLocalDate } from "./enhancedDiaryWorkspaceDate";
    import { formatDiaryDate } from "../enhancedDiaryUtils";
    import { saveEnhancedDiaryConfig } from "../enhancedDiaryConfig";
    import type { GenerateTasksPlusTaskInput } from "../../tasksPlus/tasksPlusParser";
    import {
        addNewTaskToDiary,
        getOrCreateTodayDiaryDocument,
    } from "../enhancedDiaryActions";
    import {
        appendTemplateToDiary,
        openDiaryDocument,
        openOrCreateDiaryForDate,
        restoreSkippedPeriod,
        skipPeriod,
        toggleCompletionMarker,
    } from "../enhancedDiaryDoc";
    import type { EnhancedDiaryWorkspaceReviewCard } from "./enhancedDiaryWorkspaceViewModel";
    import type { WorkspaceTaskStatusFilter, WorkspaceRecordViewMode, WorkspaceRecordCategoryFilter, GoRecordsOptions, WorkspaceProjectStatusFilter, WorkspaceTaskRiskFilter } from "./enhancedDiaryWorkspaceNavigation";
    import { getUnhandledNotificationCount } from "./enhancedDiaryWorkspaceNotificationState";

    interface Props {
        plugin: any;
        initialTab?: WorkspaceTab | string;
    }

    let { plugin, initialTab = "overview" }: Props = $props();

    let state = $state<EnhancedDiaryWorkspaceState | null>(null);
    let activeTab = $state<WorkspaceTab>("overview");
    let loading = $state(true);
    let actionBusy = $state(false);
    let settingsSaving = $state(false);
    let calendarLoading = $state(false);
    let historyRecordsLoading = $state(false);
    let historyRecordsLoaded = $state(false);
    let reviewHistoryLoading = $state(false);
    let reviewHistoryLoaded = $state(false);
    let calendarDate = $state(new Date());
    let calendarDays = $state<EnhancedDiaryCalendarDay[]>([]);
    let selectedCalendarDate = $state(formatDiaryDate(new Date()));
    let selectedDayDetail = $state<EnhancedDiaryWorkspaceDayDetail | null>(null);
    let dayDetailLoading = $state(false);
    let editingTask = $state<EnhancedDiaryWorkspaceTask | null>(null);
    let deletingTask = $state<EnhancedDiaryWorkspaceTask | null>(null);
    let editingRecord = $state<EnhancedDiaryWorkspaceRecord | null>(null);
    let deletingRecord = $state<EnhancedDiaryWorkspaceRecord | null>(null);
    let migratingTask = $state<EnhancedDiaryWorkspaceTask | null>(null);
    let commandPaletteOpen = $state(false);
    let taskStatusFilter = $state<WorkspaceTaskStatusFilter>("all");
    let taskTagFilter = $state("");
    let taskDateFilter = $state("");
    let taskRiskFilter: WorkspaceTaskRiskFilter = $state("all");
    let taskSelectBlockId = $state("");
    let taskFilterVersion = $state(0);
    let taskSelectVersion = $state(0);
    let recordViewMode = $state<WorkspaceRecordViewMode>("today");
    let recordDateFilter = $state("");
    let recordCategoryFilter = $state<WorkspaceRecordCategoryFilter>("all");
    let recordSelectId = $state("");
    let recordFilterVersion = $state(0);
    let recordSelectVersion = $state(0);
    let projectSelectName = $state("");
    let projectSelectVersion = $state(0);
    let projectStatusFilter: WorkspaceProjectStatusFilter = $state("all");
    let projectFilterVersion = $state(0);
    let notificationSelectId = $state("");
    let notificationSelectVersion = $state(0);
    let notificationCountVersion = $state(0);
    let reviewViewMode: "current" | "history" = $state("current");
    let reviewSelectedHistoryKey = $state("");
    let reviewSelectVersion = $state(0);
    let calendarMonthCache = new Map<string, EnhancedDiaryCalendarDay[]>();
    let dayDetailCache = new Map<string, EnhancedDiaryWorkspaceDayDetail | null>();
    let advancedEnabled = $state(false);

    function goTasks(
        statusFilter: WorkspaceTaskStatusFilter = "all",
        tagFilter = "",
        dateFilter = "",
        riskFilter: WorkspaceTaskRiskFilter = "all"
    ): void {
        taskStatusFilter = statusFilter;
        taskTagFilter = tagFilter;
        taskDateFilter = dateFilter;
        taskRiskFilter = riskFilter;
        taskFilterVersion += 1;
        selectTab("tasks");
    }

    function goTasksByDate(date: string): void {
        goTasks("all", "", date);
    }

    function goTaskDetail(task: EnhancedDiaryWorkspaceTask): void {
        taskStatusFilter = "all";
        taskTagFilter = "";
        taskDateFilter = task.sourceDate || "";
        taskRiskFilter = "all";
        taskSelectBlockId = task.blockId;
        taskFilterVersion += 1;
        taskSelectVersion += 1;
        selectTab("tasks");
    }

    function goRecords(options: GoRecordsOptions = {}): void {
        recordViewMode = options.mode || "today";
        recordDateFilter = options.date || "";
        recordCategoryFilter = options.category || "all";
        recordSelectId = options.recordId || "";
        recordFilterVersion += 1;
        recordSelectVersion += 1;
        selectTab("records");
        if (recordViewMode === "history") {
            void ensureHistoryRecordsLoaded();
        }
    }

    function goRecordsByDate(date: string): void {
        if (state && date === state.today) {
            goRecords({ mode: "today" });
        } else {
            goRecords({ mode: "history", date });
        }
    }

    function goReviewByDate(date: string): void {
        reviewViewMode = "history";
        reviewSelectedHistoryKey = `day-${date}`;
        reviewSelectVersion += 1;
        selectTab("review");
        void ensureReviewHistoryLoaded();
    }

    function goProjectDetail(projectName: string): void {
        projectStatusFilter = "all";
        projectFilterVersion += 1;
        projectSelectName = projectName;
        projectSelectVersion += 1;
        selectTab("projects");
    }

    function goProjects(statusFilter: WorkspaceProjectStatusFilter = "all"): void {
        projectStatusFilter = statusFilter;
        projectFilterVersion += 1;
        projectSelectName = "";
        selectTab("projects");
    }

    function goNotificationDetail(notificationId: string): void {
        notificationSelectId = notificationId;
        notificationSelectVersion += 1;
        selectTab("notifications");
    }

    const todayTaskCount = $derived(state ? state.tasks.filter((task) => task.isTodayTask).length : 0);
    const activeTaskCount = $derived(state ? state.tasks.filter((task) => !task.completed).length : 0);
    const overdueTaskCount = $derived(state ? state.tasks.filter((task) => task.isOverdue).length : 0);
    const migrateTaskCount = $derived(state ? state.tasks.filter((task) => task.shouldMigrate).length : 0);
    const riskyProjectCount = $derived(
        state ? state.projects.filter((project) => project.healthTone === "danger" || project.healthTone === "warning").length : 0
    );
    const reviewStatusText = $derived(
        state
            ? `${state.reviewCards.filter((card) => card.status === "completed").length}/${state.reviewCards.length}`
            : "0/0"
    );
    const unhandledNotificationCount = $derived(
        state ? getUnhandledNotificationCount(state.notifications) + notificationCountVersion * 0 : 0
    );

    const commandItems = $derived.by((): WorkspaceCommand[] => {
        const notificationCount = unhandledNotificationCount;
        return [
            {
                id: "create-task",
                group: "创建",
                title: "新建任务",
                description: "写入今日日记的「新建任务」区块",
                keywords: ["task", "todo", "任务"],
                run: () => openCreateTaskDialog(),
            },
            {
                id: "create-record",
                group: "创建",
                title: "快速记录",
                description: "写入今日日记的「快速记录」区块",
                keywords: ["record", "note", "记录"],
                run: () => openQuickRecordDialogForWorkspace(),
            },
            {
                id: "open-today",
                group: "日记",
                title: "打开今日日记",
                description: state?.today ? `打开 ${state.today}` : "打开或创建今天的日记",
                keywords: ["today", "diary", "日记"],
                run: openToday,
            },
            {
                id: "append-template",
                group: "日记",
                title: "补充今日模板",
                description: "检查并补充今日日记模板结构",
                keywords: ["template", "模板"],
                run: appendTodayTemplate,
            },
            {
                id: "overview",
                group: "导航",
                title: "回到总览",
                description: "打开工作台总览页",
                keywords: ["dashboard", "总览"],
                run: () => selectTab("overview"),
            },
            {
                id: "tasks-today",
                group: "任务",
                title: `今日任务 ${todayTaskCount}`,
                description: "进入任务中心并筛选今日任务",
                keywords: ["today", "task", "todo", "任务", "今天"],
                run: () => goTasks("today"),
            },
            {
                id: "tasks-active",
                group: "任务",
                title: `未完成任务 ${activeTaskCount}`,
                description: "进入任务中心并筛选未完成任务",
                keywords: ["active", "todo", "待办", "未完成"],
                run: () => goTasks("active"),
            },
            {
                id: "tasks-overdue",
                group: "任务",
                title: `逾期任务 ${overdueTaskCount}`,
                description: "进入任务中心并筛选逾期任务",
                keywords: ["overdue", "risk", "风险", "逾期"],
                run: () => goTasks("overdue"),
            },
            {
                id: "tasks-migrate",
                group: "任务",
                title: `建议迁移 ${migrateTaskCount}`,
                description: "进入任务中心并筛选建议迁移任务",
                keywords: ["migrate", "迁移"],
                run: () => goTasks("migrate"),
            },
            {
                id: "tasks-risk",
                group: "任务",
                title: "高风险任务",
                description: "进入任务中心并筛选高风险任务",
                keywords: ["risk", "高风险", "风险任务", "停滞", "截止"],
                run: () => goTasks("all", "", "", "risk"),
            },
            {
                id: "records-today",
                group: "记录",
                title: `今日记录 ${state?.records.length || 0}`,
                description: "进入记录中心的今日记录",
                keywords: ["records", "今日记录"],
                run: () => goRecords({ mode: "today" }),
            },
            {
                id: "records-history",
                group: "记录",
                title: "历史记录",
                description: "进入记录中心并加载最近 90 天记录",
                keywords: ["history", "历史记录"],
                run: () => goRecords({ mode: "history" }),
            },
            {
                id: "projects",
                group: "项目",
                title: `项目中心 ${state?.projects.length || 0}`,
                description: "查看项目聚合和项目时间线",
                keywords: ["project", "项目"],
                run: () => goProjects("all"),
            },
            {
                id: "projects-risk",
                group: "项目",
                title: `风险项目 ${riskyProjectCount}`,
                description: "查看存在逾期、堆积或停滞迹象的项目",
                keywords: ["project", "risk", "health", "项目", "风险", "健康度"],
                run: () => goProjects("risk"),
            },
            {
                id: "review",
                group: "复盘",
                title: `复盘中心 ${reviewStatusText}`,
                description: "查看当前复盘和历史档案",
                keywords: ["review", "复盘", "今日复盘", "day review"],
                run: () => selectTab("review"),
            },
            {
                id: "calendar",
                group: "日历",
                title: "日历详情",
                description: "查看月历、热力图和日期详情",
                keywords: ["calendar", "日历"],
                run: () => selectTab("calendar"),
            },
            {
                id: "calendar-today",
                group: "日历",
                title: "定位到今天",
                description: "打开日历并定位到今天",
                keywords: ["calendar", "today", "日历", "今天"],
                run: () => {
                    selectTab("calendar");
                    void jumpCalendarToToday();
                },
            },
            {
                id: "settings",
                group: "设置",
                title: "工作台设置",
                description: "调整日历显示、提醒阈值和模板维护入口",
                keywords: ["settings", "config", "设置", "配置"],
                run: () => selectTab("settings"),
            },
            {
                id: "notifications",
                group: "通知",
                title: `通知中心 ${notificationCount}`,
                description: "查看提醒、风险和暂不处理项",
                keywords: ["notification", "通知", "提醒"],
                run: () => selectTab("notifications"),
            },
        ];
    });

    async function refresh(): Promise<void> {
        loading = true;
        try {
            calendarMonthCache = new Map();
            dayDetailCache = new Map();
            state = await loadEnhancedDiaryWorkspaceState(plugin);
            historyRecordsLoaded = false;
            reviewHistoryLoaded = false;
            await loadCalendar();
            await loadSelectedDayDetail(selectedCalendarDate);
            if (activeTab === "records" && recordViewMode === "history") {
                void ensureHistoryRecordsLoaded();
            }
            if (activeTab === "review") {
                void ensureReviewHistoryLoaded();
            }
        } catch (err) {
            console.warn("[enhancedDiaryWorkspacePage] load failed", err);
            showMessage("强化日记工作台加载失败，请查看控制台日志", 4000);
        } finally {
            loading = false;
        }
    }

    async function saveWorkspaceSettings(config: EnhancedDiaryWorkspaceState["config"]): Promise<void> {
        if (settingsSaving) return;
        settingsSaving = true;
        try {
            await saveEnhancedDiaryConfig(plugin, config);
            if (state) {
                state = { ...state, config };
            }
            calendarMonthCache = new Map();
            await loadCalendar();
            showMessage("工作台设置已保存", 3000);
        } catch (err) {
            console.warn("[enhancedDiaryWorkspacePage] save settings failed", err);
            showMessage("工作台设置保存失败，请稍后重试", 4000);
        } finally {
            settingsSaving = false;
        }
    }

    async function ensureHistoryRecordsLoaded(): Promise<void> {
        if (!state || historyRecordsLoading || historyRecordsLoaded) return;
        historyRecordsLoading = true;
        try {
            const historyRecords = await loadWorkspaceHistoryRecords(state.date);
            if (state) {
                state = { ...state, historyRecords };
                historyRecordsLoaded = true;
            }
        } catch (err) {
            console.warn("[enhancedDiaryWorkspacePage] history records load failed", err);
            showMessage("历史记录加载失败，可稍后重试或刷新工作台", 3000);
        } finally {
            historyRecordsLoading = false;
        }
    }

    async function ensureReviewHistoryLoaded(): Promise<void> {
        if (!state || reviewHistoryLoading || reviewHistoryLoaded) return;
        reviewHistoryLoading = true;
        try {
            const reviewHistory = await loadWorkspaceReviewHistory(state.config, state.date);
            if (state) {
                state = { ...state, reviewHistory };
                reviewHistoryLoaded = true;
            }
        } catch (err) {
            console.warn("[enhancedDiaryWorkspacePage] review history load failed", err);
            showMessage("复盘历史加载失败，可稍后重试或刷新工作台", 3000);
        } finally {
            reviewHistoryLoading = false;
        }
    }

    function selectTab(tab: WorkspaceTab): void {
        activeTab = tab;
        if (tab === "review") {
            void ensureReviewHistoryLoaded();
        }
    }

    function isWorkspaceTab(value: unknown): value is WorkspaceTab {
        return typeof value === "string" && [
            "overview",
            "tasks",
            "projects",
            "records",
            "review",
            "more",
            "calendar",
            "notifications",
            "settings",
        ].includes(value);
    }

    function handleWorkspaceTabRequest(event: Event): void {
        const tab = (event as CustomEvent<{ tab?: unknown }>).detail?.tab;
        if (isWorkspaceTab(tab)) {
            selectTab(tab);
        }
    }

    function handleWorkspaceKeydown(event: KeyboardEvent): void {
        if (event.defaultPrevented || commandPaletteOpen) return;
        if (editingTask || editingRecord || deletingTask || deletingRecord || migratingTask) return;

        const target = event.target as HTMLElement | null;
        if (target) {
            const tagName = target.tagName.toLowerCase();
            if (["input", "textarea", "select", "button"].includes(tagName)) return;
            if (target.isContentEditable || target.closest('[contenteditable="true"]')) return;
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
            event.preventDefault();
            commandPaletteOpen = true;
        }
    }

    async function loadSelectedDayDetail(dateStr: string): Promise<void> {
        selectedCalendarDate = dateStr;
        if (dayDetailCache.has(dateStr)) {
            selectedDayDetail = dayDetailCache.get(dateStr) || null;
            return;
        }
        dayDetailLoading = true;
        try {
            selectedDayDetail = await loadWorkspaceDayDetail(parseLocalDate(dateStr));
            dayDetailCache.set(dateStr, selectedDayDetail);
        } catch (err) {
            console.warn("[enhancedDiaryWorkspace] load day detail failed", err);
            selectedDayDetail = null;
        } finally {
            dayDetailLoading = false;
        }
    }

    async function loadCalendar(): Promise<void> {
        const cacheKey = `${calendarDate.getFullYear()}-${calendarDate.getMonth()}`;
        if (calendarMonthCache.has(cacheKey)) {
            calendarDays = calendarMonthCache.get(cacheKey) || [];
            return;
        }
        calendarLoading = true;
        try {
            calendarDays = await buildWorkspaceCalendarMonth(
                plugin,
                calendarDate.getFullYear(),
                calendarDate.getMonth()
            );
            calendarMonthCache.set(cacheKey, calendarDays);
        } catch (err) {
            console.warn("[enhancedDiaryWorkspacePage] calendar load failed", err);
            showMessage("日历加载失败，请稍后重试", 3000);
        } finally {
            calendarLoading = false;
        }
    }

    function openDoc(docId?: string): void {
        if (!docId) {
            showMessage("未找到相关文档", 3000);
            return;
        }
        openDiaryDocument(plugin, docId);
    }

    async function openToday(): Promise<void> {
        if (!state) return;
        const result = await openOrCreateDiaryForDate(plugin, new Date(), state.config.dailyNotebookId);
        if (!result.id) {
            showMessage("打开今日日记失败，请检查日记笔记本设置", 4000);
        }
        await refresh();
    }

    async function appendTodayTemplate(): Promise<void> {
        if (!state) return;
        const dayCard = state.reviewCards.find((card) => card.period === "day");
        if (!dayCard) return;

        const todayDoc = await getOrCreateTodayDiaryDocument(plugin, state.config);
        if (!todayDoc.ok || !todayDoc.docId) {
            showMessage("未能打开或创建今日日记，无法补充模板", 4000);
            return;
        }

        const result = await appendTemplateToDiary({
            docId: todayDoc.docId,
            period: "day",
            template: state.config.templates.day,
            context: dayCard.templateContext,
        });
        showMessage(result.ok ? "今日模板已处理" : "补充模板失败", 3000);
        await refresh();
    }

    function openCreateTaskDialog(input: Partial<GenerateTasksPlusTaskInput> = {}): void {
        openTaskEditorSvelteDialog({
            mode: "create",
            initialInput: input,
            onSubmit: async (taskInput) => {
                return await submitNewTaskForWorkspace(taskInput);
            },
        });
    }

    async function submitNewTaskForWorkspace(input: GenerateTasksPlusTaskInput): Promise<boolean> {
        if (actionBusy) return false;
        actionBusy = true;
        try {
            const todayDoc = await getOrCreateTodayDiaryDocument(plugin, state.config);
            if (!todayDoc.ok || !todayDoc.docId) {
                showMessage("未能打开或创建今日日记，任务未写入", 4000);
                return false;
            }
            const result = await addNewTaskToDiary({ docId: todayDoc.docId, task: input });
            if (result.ok) {
                showMessage("任务已写入「新建任务」区块", 3000);
                await refresh();
                return true;
            } else {
                showMessage(result.message || "新增任务失败", 4000);
                return false;
            }
        } finally {
            actionBusy = false;
        }
    }

    function convertRecordToTask(record: EnhancedDiaryWorkspaceRecord): void {
        const firstContentLine = record.content
            .split("\n")
            .map((line) => line.trim())
            .find(Boolean);
        openTaskEditorSvelteDialog({
            mode: "create",
            initialInput: {
                taskname: firstContentLine || record.headingTitle,
                tags: [record.categoryTitle].filter(Boolean),
            },
            onSubmit: async (input) => {
                const result = await submitNewTaskForWorkspace(input);
                if (result) {
                    showMessage("任务已创建", 3000);
                    if (!record.headingBlockId) {
                        showMessage("任务已创建，但当前记录无法自动删除，请在日记中手动处理", 4000);
                        return true;
                    }
                    openDeleteRecordSvelteDialog({
                        record,
                        title: "删除原记录",
                        message: "任务已创建，是否删除原记录正文？",
                        onConfirm: async () => {
                            const deleteResult = await deleteQuickRecord(record);
                            if (deleteResult.ok) {
                                await refresh();
                                return true;
                            }
                            return false;
                        }
                    });
                    return true;
                }
                return false;
            }
        });
    }

    function openEditTaskDialog(task: EnhancedDiaryWorkspaceTask): void {
        editingTask = task;
        openTaskEditorSvelteDialog({
            mode: "edit",
            task,
            initialInput: {
                taskname: task.taskname,
                priority: task.priority,
                startDate: task.startDate,
                deadline: task.deadline,
                recurrence: task.recurrence,
                reminder: task.reminder,
                location: task.location,
                tags: task.tags,
            },
            onSubmit: async (input) => {
                await editTask(input);
            },
            onClose: () => {
                editingTask = null;
            },
        });
    }

    async function editTask(input: GenerateTasksPlusTaskInput): Promise<void> {
        if (!editingTask || actionBusy) return;
        actionBusy = true;
        try {
            const result = await updateWorkspaceTask(editingTask, input);
            if (result.ok) {
                showMessage("任务已更新", 3000);
                editingTask = null;
                await refresh();
            } else {
                showMessage(result.message || "任务更新失败", 4000);
            }
        } finally {
            actionBusy = false;
        }
    }

    async function toggleTask(task: EnhancedDiaryWorkspaceTask): Promise<void> {
        if (actionBusy) return;
        actionBusy = true;
        try {
            const result = await toggleWorkspaceTaskComplete(task, !task.completed);
            showMessage(result.ok ? "任务状态已更新" : result.message || "任务状态更新失败", 3000);
            await refresh();
        } finally {
            actionBusy = false;
        }
    }

    async function confirmDeleteTask(mode: "log" | "delete"): Promise<boolean> {
        if (!state || !deletingTask || actionBusy) return false;
        actionBusy = true;
        try {
            const result = await deleteWorkspaceTask(plugin, state.config, deletingTask, mode);
            if (result.ok) {
                showMessage("任务已删除", 3000);
                deletingTask = null;
                await refresh();
                return true;
            } else {
                showMessage(result.message || "删除任务失败", 4000);
                return false;
            }
        } finally {
            actionBusy = false;
        }
    }

    async function confirmMigrateTask(task = migratingTask): Promise<boolean> {
        if (!state || !task || actionBusy) return false;
        if (task.isTodayTask || task.sourceKind === "migrated") {
            showMessage("该任务已经在今日日记中，无需迁移", 3000);
            return false;
        }
        actionBusy = true;
        try {
            const result = await migrateWorkspaceTaskToToday(plugin, state.config, task);
            if (result.ok) {
                showMessage("任务已迁移到今日日记", 3000);
                migratingTask = null;
                await refresh();
                return true;
            } else if (result.changed) {
                showMessage(result.message || "任务已移动，但后续处理失败，请刷新后检查", 4000);
                migratingTask = null;
                await refresh();
                return true;
            } else {
                showMessage(result.message || "迁移任务失败", 4000);
                return false;
            }
        } finally {
            actionBusy = false;
        }
    }

    async function postponeTask(task: EnhancedDiaryWorkspaceTask, target: "tomorrow" | "nextWeek"): Promise<void> {
        if (actionBusy) return;
        actionBusy = true;
        try {
            const result = await postponeWorkspaceTask(task, target);
            if (result.ok) {
                showMessage(target === "tomorrow" ? "任务已推迟到明天" : "任务已推迟到下周", 3000);
                await refresh();
            } else {
                showMessage(result.message || "推迟任务失败", 4000);
            }
        } finally {
            actionBusy = false;
        }
    }

    async function batchCompleteTasks(tasks: EnhancedDiaryWorkspaceTask[]): Promise<void> {
        if (actionBusy || tasks.length === 0) return;
        actionBusy = true;
        try {
            const targets = tasks.filter((task) => !task.completed);
            const results = await Promise.all(targets.map((task) => toggleWorkspaceTaskComplete(task, true)));
            const successCount = results.filter((result) => result.ok).length;
            showMessage(`已完成 ${successCount}/${targets.length} 个任务`, 3000);
            await refresh();
        } finally {
            actionBusy = false;
        }
    }

    async function batchPostponeTasks(tasks: EnhancedDiaryWorkspaceTask[], target: "tomorrow" | "nextWeek"): Promise<void> {
        if (actionBusy || tasks.length === 0) return;
        actionBusy = true;
        try {
            const targets = tasks.filter((task) => !task.completed);
            const results = await Promise.all(targets.map((task) => postponeWorkspaceTask(task, target)));
            const successCount = results.filter((result) => result.ok).length;
            showMessage(
                target === "tomorrow"
                    ? `已推迟 ${successCount}/${targets.length} 个任务到明天`
                    : `已推迟 ${successCount}/${targets.length} 个任务到下周`,
                3000
            );
            await refresh();
        } finally {
            actionBusy = false;
        }
    }

    async function createRecord(
        categoryTitle: string,
        content: string
    ): Promise<boolean> {
        if (!state || actionBusy) return false;
        actionBusy = true;
        try {
            const result = await addWorkspaceQuickRecord(plugin, state.config, categoryTitle, content);
            if (result.ok) {
                showMessage("记录已写入「快速记录」区块", 3000);
                await refresh();
                return true;
            } else {
                showMessage(result.message || "新增记录失败", 4000);
                return false;
            }
        } finally {
            actionBusy = false;
        }
    }

    function openQuickRecordDialogForWorkspace(): void {
        openQuickRecordSvelteDialog({
            mode: "create",
            suggestedCategories: state?.config?.recordCategorySuggestions || ["未分类", "想法", "问题", "决策", "日志"],
            onSubmit: async (categoryTitle, content) => {
                return await createRecord(categoryTitle, content);
            },
        });
    }

    async function confirmDeleteRecord(): Promise<boolean> {
        if (!deletingRecord || actionBusy) return false;
        actionBusy = true;
        try {
            const result = await deleteQuickRecord(deletingRecord);
            if (result.ok) {
                showMessage("记录已删除", 3000);
                deletingRecord = null;
                await refresh();
                return true;
            } else {
                showMessage(result.message || "删除记录失败", 4000);
                return false;
            }
        } finally {
            actionBusy = false;
        }
    }

    function openEditRecordDialog(record: EnhancedDiaryWorkspaceRecord): void {
        editingRecord = record;
        openQuickRecordSvelteDialog({
            mode: "edit",
            initialCategoryTitle: record.categoryTitle,
            initialContent: record.content,
            suggestedCategories: state?.config?.recordCategorySuggestions || [],
            onSubmit: async (categoryTitle, content) => {
                await editRecord(categoryTitle, content);
            },
            onClose: () => {
                editingRecord = null;
            },
        });
    }

    function openDeleteTaskDialog(task: EnhancedDiaryWorkspaceTask): void {
        openDeleteTaskSvelteDialog({
            task,
            onSelect: async (mode) => {
                return confirmDeleteTask(mode);
            },
            onClose: () => {
                deletingTask = null;
            },
        });
    }

    function openDeleteRecordDialog(record: EnhancedDiaryWorkspaceRecord): void {
        openDeleteRecordSvelteDialog({
            record,
            onConfirm: async () => {
                return confirmDeleteRecord();
            },
            onClose: () => {
                deletingRecord = null;
            },
        });
    }

    function openMigrateTaskDialog(task: EnhancedDiaryWorkspaceTask): void {
        if (!state) return;
        openMigrateTaskSvelteDialog({
            task,
            today: state.today,
            onConfirm: async () => {
                return confirmMigrateTask(task);
            },
            onClose: () => {
                migratingTask = null;
            },
        });
    }

    async function editRecord(
        _categoryTitle: string,
        content: string
    ): Promise<void> {
        if (!editingRecord || actionBusy) return;
        actionBusy = true;
        try {
            const result = await updateQuickRecord(editingRecord, content);
            if (result.ok) {
                showMessage("记录已更新", 3000);
                editingRecord = null;
                await refresh();
            } else {
                showMessage(result.message || "更新记录失败", 4000);
            }
        } finally {
            actionBusy = false;
        }
    }

    async function appendReviewTemplate(card: EnhancedDiaryWorkspaceReviewCard): Promise<void> {
        if (!state || !card.docId) {
            showMessage("请先创建对应日记后再补充模板", 3000);
            return;
        }
        const result = await appendTemplateToDiary({
            docId: card.docId,
            period: card.period,
            template: state.config.templates[card.period],
            context: card.templateContext,
        });
        showMessage(result.ok ? "模板已处理" : "补充模板失败", 3000);
        await refresh();
    }

    async function createOrOpenReview(card: EnhancedDiaryWorkspaceReviewCard): Promise<void> {
        if (!state) return;
        const result = await openOrCreateDiaryForDate(
            plugin,
            card.targetDate,
            state.config.dailyNotebookId
        );
        if (result.id) {
            await refresh();
        } else if (result.reason === "only_today_create_supported") {
            showMessage("暂不自动创建非今日日记，请先在思源中创建对应日期日记。", 4000);
        } else if (result.reason === "missing_notebook") {
            showMessage("请先在强化日记设置中选择日记笔记本。", 4000);
        } else {
            showMessage("创建失败，请稍后重试。", 4000);
        }
    }

    async function completeReview(
        card: EnhancedDiaryWorkspaceReviewCard,
        completed: boolean
    ): Promise<void> {
        if (!card.docId) {
            showMessage("未找到对应日记", 3000);
            return;
        }
        const result = await toggleCompletionMarker({
            docId: card.docId,
            period: card.period,
            completed,
        });
        showMessage(result.ok ? "复盘状态已更新" : "复盘状态更新失败", 3000);
        await refresh();
    }

    async function skipReview(card: EnhancedDiaryWorkspaceReviewCard): Promise<void> {
        if (!card.docId) {
            showMessage("未找到对应日记", 3000);
            return;
        }
        const result = await skipPeriod({ docId: card.docId, period: card.period });
        showMessage(result.ok ? "已跳过本周期" : "跳过失败", 3000);
        await refresh();
    }

    function selectRestoreSkipMode(): Promise<"pending" | "completed" | null> {
        return new Promise((resolve) => {
            let settled = false;
            function finish(value: "pending" | "completed" | null) {
                if (settled) return;
                settled = true;
                resolve(value);
            }

            const dialog = new Dialog({
                title: "取消跳过",
                content: `<div style="padding:12px 0;">请选择取消跳过后的状态。</div>
                    <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
                        <button class="b3-button b3-button--outline" data-mode="pending">恢复为未完成</button>
                        <button class="b3-button b3-button--outline" data-mode="completed">直接标记完成</button>
                        <button class="b3-button b3-button--outline" data-mode="cancel">取消</button>
                    </div>`,
                width: "420px",
                destroyCallback: () => finish(null),
            } as any);

            dialog.element.querySelectorAll("button[data-mode]").forEach((button) => {
                button.addEventListener("click", () => {
                    const mode = (button as HTMLButtonElement).getAttribute("data-mode");
                    if (mode === "pending") finish("pending");
                    else if (mode === "completed") finish("completed");
                    else finish(null);
                    dialog.destroy();
                });
            });
        });
    }

    async function restoreSkipReview(card: EnhancedDiaryWorkspaceReviewCard): Promise<void> {
        if (!card.docId) {
            showMessage("未找到对应日记", 3000);
            return;
        }
        const mode = await selectRestoreSkipMode();
        if (!mode) return;

        const result = await restoreSkippedPeriod({
            docId: card.docId,
            period: card.period,
            mode,
        });
        showMessage(result.ok ? "已取消跳过" : "取消跳过失败", 3000);
        await refresh();
    }

    async function loadReviewContentForPanel(
        card: EnhancedDiaryWorkspaceReviewCard
    ): Promise<{ fields: EnhancedDiaryReviewField[]; reason?: string }> {
        if (!card.docId) {
            return { fields: [], reason: "no_doc" };
        }
        return loadReviewContent(card.docId, card.period);
    }

    async function saveReviewContentFromPanel(
        card: EnhancedDiaryWorkspaceReviewCard,
        fields: EnhancedDiaryReviewField[]
    ): Promise<boolean> {
        if (!card.docId) return false;
        const result = await saveReviewContent(card.docId, card.period, fields);
        if (result.ok) {
            showMessage("复盘内容已保存", 2500);
            await refresh();
            return true;
        }
        if (result.reason === "missing_review_root") {
            showMessage("复盘区块缺失，请先补充模板", 3000);
        } else if (result.reason === "write_failed") {
            showMessage("复盘内容写入失败，请稍后重试", 3000);
        } else {
            showMessage("保存失败，请稍后重试", 3000);
        }
        return false;
    }

    async function previousMonth(): Promise<void> {
        calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1);
        selectedCalendarDate = formatDiaryDate(calendarDate);
        await loadCalendar();
        await loadSelectedDayDetail(selectedCalendarDate);
    }

    async function nextMonth(): Promise<void> {
        calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1);
        selectedCalendarDate = formatDiaryDate(calendarDate);
        await loadCalendar();
        await loadSelectedDayDetail(selectedCalendarDate);
    }

    async function jumpCalendarToToday(): Promise<void> {
        const todayStr = state?.today || formatDiaryDate(new Date());
        const todayDate = parseLocalDate(todayStr);
        calendarDate = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
        selectedCalendarDate = todayStr;
        await loadCalendar();
        await loadSelectedDayDetail(todayStr);
    }

    onMount(() => {
        activeTab = isWorkspaceTab(initialTab) ? initialTab : "overview";
        advancedEnabled = Boolean(plugin?.ADVANCED);
        window.addEventListener("keydown", handleWorkspaceKeydown);
        window.addEventListener("siyuan-homepage:enhanced-diary-workspace-tab", handleWorkspaceTabRequest);

        const onReady = () => {
            advancedEnabled = true;
            refresh();
        };
        const onUnavailable = () => {
            advancedEnabled = false;
            state = null;
            loading = false;
            editingTask = null;
            editingRecord = null;
            deletingTask = null;
            deletingRecord = null;
            migratingTask = null;
            commandPaletteOpen = false;
        };
        window.addEventListener("homepage-advanced-ready", onReady);
        window.addEventListener("homepage-advanced-unavailable", onUnavailable);

        if (advancedEnabled) {
            refresh();
        } else {
            loading = false;
        }

        return () => {
            window.removeEventListener("keydown", handleWorkspaceKeydown);
            window.removeEventListener("siyuan-homepage:enhanced-diary-workspace-tab", handleWorkspaceTabRequest);
            window.removeEventListener("homepage-advanced-ready", onReady);
            window.removeEventListener("homepage-advanced-unavailable", onUnavailable);
        };
    });
</script>

{#if advancedEnabled}
<div class="workspace-page">
    <div class="workspace-shell">
        <WorkspaceHeader
            today={state?.today || ""}
            {loading}
            onRefresh={refresh}
            onOpenToday={openToday}
            onAppendTemplate={appendTodayTemplate}
            onOpenCommandPalette={() => (commandPaletteOpen = true)}
        />

    {#if state}
        <div class="stats-grid">
            <WorkspaceStatCard
                label="今日任务"
                value={todayTaskCount}
                tone="primary"
                onclick={() => goTasks("today")}
            />
            <WorkspaceStatCard
                label="逾期任务"
                value={overdueTaskCount}
                tone={overdueTaskCount > 0 ? "danger" : "normal"}
                onclick={() => goTasks("overdue")}
            />
            <WorkspaceStatCard
                label="建议迁移"
                value={migrateTaskCount}
                tone={migrateTaskCount > 0 ? "warning" : "normal"}
                onclick={() => goTasks("migrate")}
            />
            <WorkspaceStatCard
                label="今日记录"
                value={state.records.length}
                onclick={() => goRecords({ mode: "today" })}
            />
            <WorkspaceStatCard
                label="进行中项目"
                value={state.projects.length}
                onclick={() => selectTab("projects")}
            />
            <WorkspaceStatCard
                label="复盘状态"
                value={reviewStatusText}
                onclick={() => selectTab("review")}
            />
        </div>

        <WorkspaceGlobalSearch
            {state}
            onOpenTaskResult={goTaskDetail}
            onOpenRecordResult={goRecords}
            onOpenProjectResult={goProjectDetail}
            onOpenNotificationResult={goNotificationDetail}
            onGoReview={() => selectTab("review")}
            onOpenDoc={openDoc}
        />

        <div class="workspace-body">
            <WorkspaceSidebar
                {activeTab}
                notificationCount={unhandledNotificationCount}
                onSelect={selectTab}
            />
            <main>
                {#if activeTab === "overview"}
                    <WorkspaceOverview
                        {state}
                        onOpenToday={openToday}
                        onGoTasks={goTasks}
                        onGoReview={() => selectTab("review")}
                        onGoProjects={goProjects}
                        onGoNotifications={() => selectTab("notifications")}
                        onCreateTask={openCreateTaskDialog}
                        onCreateRecord={openQuickRecordDialogForWorkspace}
                        onAppendTemplate={appendTodayTemplate}
                        calendarDays={calendarDays}
                        calendarDate={calendarDate}
                        calendarLoading={calendarLoading}
                        selectedCalendarDate={selectedCalendarDate}
                        selectedDayDetail={selectedDayDetail}
                        dayDetailLoading={dayDetailLoading}
                        onSelectDate={(day) => loadSelectedDayDetail(day.date)}
                        onPrevMonth={previousMonth}
                        onNextMonth={nextMonth}
                        onOpenDoc={openDoc}
                        onOpenRecords={goRecordsByDate}
                        onOpenReview={goReviewByDate}
                        onCalendarToday={jumpCalendarToToday}
                        onOpenTasks={goTasksByDate}
                        calendarDisplaySettings={state.config.workspaceSettings.calendar}
                    />
                {:else if activeTab === "tasks"}
                    <WorkspaceTaskPanel
                        tasks={state.tasks}
                        onCreate={openCreateTaskDialog}
                        onToggle={toggleTask}
                        onEdit={openEditTaskDialog}
                        onDelete={openDeleteTaskDialog}
                        onMigrate={openMigrateTaskDialog}
                        onPostpone={postponeTask}
                        onBatchComplete={batchCompleteTasks}
                        onBatchPostpone={batchPostponeTasks}
                        onOpenDoc={openDoc}
                        onOpenBlock={openDoc}
                        initialStatusFilter={taskStatusFilter}
                        initialTagFilter={taskTagFilter}
                        initialDateFilter={taskDateFilter}
                        initialSelectedTaskBlockId={taskSelectBlockId}
                        filterVersion={taskFilterVersion}
                        selectVersion={taskSelectVersion}
                        initialRiskFilter={taskRiskFilter}
                    />
                {:else if activeTab === "records"}
                    <WorkspaceRecordPanel
                        records={state.records}
                        historyRecords={state.historyRecords}
                        historyLoading={historyRecordsLoading}
                        onRequestHistory={ensureHistoryRecordsLoaded}
                        onCreate={openQuickRecordDialogForWorkspace}
                        onOpenDoc={openDoc}
                        onEdit={openEditRecordDialog}
                        onDelete={openDeleteRecordDialog}
                        onConvertToTask={convertRecordToTask}
                        initialViewMode={recordViewMode}
                        initialDateFilter={recordDateFilter}
                        initialCategoryFilter={recordCategoryFilter}
                        initialSelectedRecordId={recordSelectId}
                        filterVersion={recordFilterVersion}
                        selectVersion={recordSelectVersion}
                    />
                {:else if activeTab === "calendar"}
                    <div class="calendar-with-detail">
                        <WorkspaceCalendarPanel
                            days={calendarDays}
                            year={calendarDate.getFullYear()}
                            month={calendarDate.getMonth()}
                            loading={calendarLoading}
                            selectedDate={selectedCalendarDate}
                            onSelectDate={(day) => loadSelectedDayDetail(day.date)}
                            onOpenDoc={openDoc}
                            onPrev={previousMonth}
                            onNext={nextMonth}
                            onToday={jumpCalendarToToday}
                            displaySettings={state.config.workspaceSettings.calendar}
                        />
                        <WorkspaceCalendarDayDetail
                            detail={selectedDayDetail}
                            loading={dayDetailLoading}
                            onOpenDoc={openDoc}
                            onOpenRecords={goRecordsByDate}
                            onOpenReview={goReviewByDate}
                            onOpenTasks={goTasksByDate}
                        />
                    </div>
                {:else if activeTab === "notifications"}
                    <WorkspaceNotificationPanel
                        notifications={state.notifications}
                        tasks={state.tasks}
                        reviewCards={state.reviewCards}
                        onOpenDoc={openDoc}
                        onMigrate={openMigrateTaskDialog}
                        onAppendTemplate={appendTodayTemplate}
                        onCreateOrOpenReview={createOrOpenReview}
                        onAppendReviewTemplate={appendReviewTemplate}
                        onCompleteReview={(card) => completeReview(card, true)}
                        onCompleteTask={toggleTask}
                        onPostponeTask={postponeTask}
                        onSnoozedChange={() => (notificationCountVersion += 1)}
                        initialSelectedNotificationId={notificationSelectId}
                        selectVersion={notificationSelectVersion}
                    />
                {:else if activeTab === "review"}
                    <WorkspaceReviewPanel
                        cards={state.reviewCards}
                        history={state.reviewHistory}
                        historyLoading={reviewHistoryLoading}
                        onRequestHistory={ensureReviewHistoryLoaded}
                        onOpen={(card) => openDoc(card.docId)}
                        onCreateOrOpen={createOrOpenReview}
                        onAppendTemplate={appendReviewTemplate}
                        onComplete={completeReview}
                        onSkip={skipReview}
                        onRestoreSkip={restoreSkipReview}
                        onLoadContent={loadReviewContentForPanel}
                        onSaveContent={saveReviewContentFromPanel}
                        onOpenToday={openToday}
                        onOpenRecords={goRecordsByDate}
                        initialViewMode={reviewViewMode}
                        initialSelectedHistoryKey={reviewSelectedHistoryKey}
                        selectVersion={reviewSelectVersion}
                        todayRecords={state.records}
                        todayTasks={state.tasks.filter(t => t.isTodayTask || t.sourceDate === state.today)}
                    />
                {:else if activeTab === "projects"}
                    <WorkspaceProjectPanel
                        projects={state.projects}
                        tasks={state.tasks}
                        onGoTasks={(projectName) => goTasks("all", projectName || "")}
                        initialSelectedProjectName={projectSelectName}
                        selectVersion={projectSelectVersion}
                        initialStatusFilter={projectStatusFilter}
                        filterVersion={projectFilterVersion}
                    />
                {:else if activeTab === "settings"}
                    <WorkspaceSettingsPage
                        config={state.config}
                        saving={settingsSaving}
                        onSave={saveWorkspaceSettings}
                        onOpenToday={openToday}
                        onAppendTemplate={appendTodayTemplate}
                    />
                {:else if activeTab === "more"}
                    <WorkspaceMorePage
                        onGoCalendar={() => selectTab("calendar")}
                        onGoNotifications={() => selectTab("notifications")}
                        onOpenToday={openToday}
                        onAppendTemplate={appendTodayTemplate}
                        notificationCount={unhandledNotificationCount}
                        todayDiaryExists={state.todayDiaryExists}
                        templateValid={state.templateValid}
                        missingSections={state.missingSections}
                    />
                {/if}
            </main>
        </div>
    {:else if loading}
        <div class="loading-state">
            <span class="loading-spinner"></span>
            强化日记工作台加载中...
        </div>
    {:else}
        <WorkspaceEmptyState title="工作台加载失败" description="请刷新或查看控制台日志。" />
    {/if}
    </div><!-- /.workspace-shell -->
</div>

<WorkspaceCommandPalette
    open={commandPaletteOpen}
    commands={commandItems}
    onClose={() => (commandPaletteOpen = false)}
/>

{#if state}
    <WorkspaceQuickCreateFab
        onCreateTask={() => openCreateTaskDialog()}
        onCreateRecord={openQuickRecordDialogForWorkspace}
        onOpenToday={openToday}
        onAppendTemplate={appendTodayTemplate}
    />
{/if}
{:else}
<div class="workspace-page">
    <div class="workspace-shell">
        <AdvancedFeatureLock
            title="强化日记工作台"
            subtitle="把日记、任务、记录、复盘和计划承接整合成一个专业工作台。"
            icon="diary"
            features={[
                "任务、记录、复盘集中管理",
                "今日作战台与风险提醒",
                "计划承接与复盘内容编辑",
                "快速记录和自定义分类"
            ]}
            highlights={["Dashboard", "复盘工作流", "计划承接"]}
        />
    </div>
</div>
{/if}

<style>
    .workspace-page {
        min-height: 100%;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        box-sizing: border-box;
        padding: 16px;
    }

    .workspace-shell {
        border: 1px solid var(--b3-border-color);
        border-radius: 14px;
        overflow: hidden;
        background: var(--b3-theme-surface);
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.07);
        min-height: calc(100vh - 32px);
        display: flex;
        flex-direction: column;
    }

    .stats-grid {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 10px;
        padding: 14px 20px;
        background: var(--b3-theme-background);
        border-bottom: 1px solid var(--b3-border-color);
    }

    .workspace-body {
        display: flex;
        flex: 1;
        min-height: 0;
    }

    main {
        flex: 1;
        min-width: 0;
        padding: 20px 24px 32px;
        box-sizing: border-box;
        overflow: auto;
        background: var(--b3-theme-background);
    }

    .loading-state {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 32px auto;
        width: fit-content;
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-surface);
        padding: 20px 28px;
        color: var(--b3-theme-on-surface);
        font-size: 14px;
    }

    .loading-spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid var(--b3-border-color);
        border-top-color: var(--b3-theme-primary);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        flex-shrink: 0;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    @media (max-width: 1180px) {
        .stats-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
        }
    }

    @media (max-width: 900px) {
        .workspace-page {
            padding: 8px;
        }

        .workspace-shell {
            border-radius: 10px;
        }

        .workspace-body {
            flex-direction: column;
        }

        .stats-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            padding: 12px;
        }

        main {
            padding: 14px;
        }
    }

    @media (max-width: 560px) {
        .stats-grid {
            grid-template-columns: 1fr;
        }
    }

    .calendar-with-detail {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 340px;
        gap: 16px;
        align-items: start;
    }

    @media (max-width: 1100px) {
        .calendar-with-detail {
            grid-template-columns: 1fr;
        }
    }
</style>
