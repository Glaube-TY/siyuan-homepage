<script lang="ts">
    import { onMount } from "svelte";
    import { Dialog, showMessage } from "siyuan";
    import WorkspaceHeader from "./components/WorkspaceHeader.svelte";
    import WorkspaceSidebar, { type WorkspaceTab } from "./components/WorkspaceSidebar.svelte";
    import { getWorkspaceReviewFields, isEnhancedDiaryTaskManagementEnabled } from "../enhancedDiaryTemplateFieldMapping";
        import WorkspaceOverview from "./components/WorkspaceOverview.svelte";
    import WorkspaceTaskPanel from "./components/WorkspaceTaskPanel.svelte";
    import WorkspaceRecordPanel from "./components/WorkspaceRecordPanel.svelte";
    import WorkspaceCalendarPanel from "./components/WorkspaceCalendarPanel.svelte";
    import WorkspaceNotificationPanel from "./components/WorkspaceNotificationPanel.svelte";
    import WorkspaceReviewPanel from "./components/WorkspaceReviewPanel.svelte";
    import WorkspaceProjectPanel from "./components/WorkspaceProjectPanel.svelte";
    import WorkspacePlanPanel from "./components/WorkspacePlanPanel.svelte";
        import WorkspaceCommandPalette, { type WorkspaceCommand } from "./components/WorkspaceCommandPalette.svelte";
    import WorkspaceQuickCreateFab from "./components/WorkspaceQuickCreateFab.svelte";
    import WorkspaceEmptyState from "./components/WorkspaceEmptyState.svelte";
    import WorkspaceSettingsPage from "./components/WorkspaceSettingsPage.svelte";
    import WorkspaceGlobalSearch from "./components/WorkspaceGlobalSearch.svelte";
    import AdvancedFeatureLock from "../../common/AdvancedFeatureLock.svelte";
    import {
        openTaskEditorSvelteDialog,
        openQuickRecordSvelteDialog,
        openDeleteTaskSvelteDialog,
        openDeleteRecordSvelteDialog,
        openMigrateTaskSvelteDialog,
        openProjectRelationRepairDialog,
        openArchiveProjectDialog,
    } from "./enhancedDiaryWorkspaceDialogs";
    import "./workspaceDesignTokens.css";
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
        completeWorkspaceTasksSequentially,
        queryWorkspaceTasks,
        updateWorkspaceTask,
        type EnhancedDiaryWorkspaceTask,
    } from "./enhancedDiaryWorkspaceTaskService";
    import {
        addWorkspaceQuickRecord,
        deleteQuickRecord,
        queryQuickRecordsInDateRange,
        updateQuickRecord,
        type EnhancedDiaryWorkspaceRecord,
        type QuickRecordDialogSubmitInput,
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
    import { ENHANCED_DIARY_INDEXES_UPDATED_EVENT } from "../enhancedDiaryIndex";
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
        validateEnhancedDiaryWriteTarget,
        formatDiaryAttrDate,
    } from "../enhancedDiaryDoc";
    import type { EnhancedDiaryWorkspaceReviewCard } from "./enhancedDiaryWorkspaceViewModel";
    import type { WorkspaceTaskStatusFilter, WorkspaceRecordViewMode, WorkspaceRecordCategoryFilter, GoRecordsOptions, GoTasksOptions, WorkspaceProjectStatusFilter, WorkspaceTaskRiskFilter, WorkspaceTaskViewMode, WorkspaceTaskScheduleFilter, WorkspaceTaskCompletionScope } from "./enhancedDiaryWorkspaceNavigation";
    import { getUnhandledNotificationCount } from "./enhancedDiaryWorkspaceNotificationState";
    import { readEnhancedDiaryProjectIndex, rebuildEnhancedDiaryProjectIndex } from "../enhancedDiaryProjectIndex";
    import type { EnhancedDiaryProjectRecordIndexItem } from "../enhancedDiaryProjectRecordIndex";
    import { repairEnhancedDiaryProjectRelation, type ProjectRelationRepairMode } from "./enhancedDiaryWorkspaceProjectRelation";
    import {
        archiveEnhancedDiaryProject,
        getEnhancedDiaryProjectLifecycleContext,
        restoreEnhancedDiaryProject,
    } from "./enhancedDiaryWorkspaceProjectLifecycle";
    import type { EnhancedDiaryWorkspaceNotification } from "./enhancedDiaryWorkspaceNotifications";

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
    let taskStatusFilter = $state<WorkspaceTaskStatusFilter>("active");
    let taskCompletionScopeFilter = $state<WorkspaceTaskCompletionScope>("active");
    let taskQuickFilter = $state<WorkspaceTaskStatusFilter>("active");
    let taskTagFilter = $state("");
    let taskTagsFilter = $state<string[]>([]);
    let taskDateFilter = $state("");
    let taskProjectFilter = $state("");
    let taskViewFilter = $state<WorkspaceTaskViewMode>("list");
    let taskScheduleFilter = $state<WorkspaceTaskScheduleFilter>("all");
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
    let projectStatusFilter: WorkspaceProjectStatusFilter = $state("all");
    let projectFilterVersion = $state(0);
    let projectSelectTargetId = $state("");
    let projectSelectVersion = $state(0);
    let workspaceMutationVersion = $state(0);
    let archivePrecheckActive = $state(false);
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
        statusOrOptions: WorkspaceTaskStatusFilter | GoTasksOptions = "active",
        tagFilter = "",
        dateFilter = "",
        riskFilter: WorkspaceTaskRiskFilter = "all"
    ): void {
        if (typeof statusOrOptions === "object") {
            const options = statusOrOptions;
            const status = options.status || "active";
            taskCompletionScopeFilter = options.completionScope
                || (status === "completed" ? "completed" : status === "all" ? "all" : "active");
            taskQuickFilter = options.quickFilter
                || (status !== "active" && status !== "completed" && status !== "all" ? status : "active");
            taskStatusFilter = status;
            taskTagsFilter = options.tags || (options.tag ? [options.tag] : []);
            taskTagFilter = taskTagsFilter[0] || "";
            taskDateFilter = options.date || "";
            taskProjectFilter = options.projectTargetId || "";
            taskRiskFilter = options.risk || "all";
            taskViewFilter = options.view || "list";
            taskScheduleFilter = options.schedule || "all";
            taskSelectBlockId = options.taskBlockId || "";
            if (options.taskBlockId) taskSelectVersion += 1;
        } else {
            taskStatusFilter = statusOrOptions;
            taskCompletionScopeFilter = statusOrOptions === "completed" ? "completed" : statusOrOptions === "all" ? "all" : "active";
            taskQuickFilter = statusOrOptions !== "active" && statusOrOptions !== "completed" && statusOrOptions !== "all" ? statusOrOptions : "active";
            taskTagFilter = tagFilter;
            taskTagsFilter = tagFilter ? [tagFilter] : [];
            taskDateFilter = dateFilter;
            taskProjectFilter = "";
            taskRiskFilter = riskFilter;
            taskViewFilter = "list";
            taskScheduleFilter = "all";
            taskSelectBlockId = "";
        }
        taskFilterVersion += 1;
        selectTab("tasks");
    }

    function goTasksByDate(date: string): void {
        goTasks({ status: "active", date });
    }

    function getTaskTagSuggestions(): string[] {
        const seen = new Set<string>();
        return (state?.tasks || []).flatMap((task) => task.tags).filter((tag) => {
            const key = tag.trim().toLocaleLowerCase();
            if (!key || seen.has(key)) return false;
            seen.add(key); return true;
        });
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

    function goProjects(statusFilter: WorkspaceProjectStatusFilter = "all"): void {
        projectStatusFilter = statusFilter;
        projectFilterVersion += 1;
        selectTab("projects");
    }

    const taskManagementEnabled = $derived(state ? isEnhancedDiaryTaskManagementEnabled(state.config) : true);

    const todayTaskCount = $derived(taskManagementEnabled && state ? state.tasks.filter((task) => task.isTodayTask).length : 0);
    const activeTaskCount = $derived(taskManagementEnabled && state ? state.tasks.filter((task) => !task.completed).length : 0);
    const overdueTaskCount = $derived(taskManagementEnabled && state ? state.tasks.filter((task) => task.isOverdue).length : 0);
    const migrateTaskCount = $derived(taskManagementEnabled && state ? state.tasks.filter((task) => task.shouldMigrate).length : 0);
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

    const selectedCalendarMetadata = $derived(
        calendarDays.find((day) => day.date === selectedCalendarDate)?.metadata || null
    );

    $effect(() => {
        if (!taskManagementEnabled && activeTab === "tasks") {
            selectTab("overview");
        }
    });

    const commandItems = $derived.by((): WorkspaceCommand[] => {
        const notificationCount = unhandledNotificationCount;
        const baseCommands: WorkspaceCommand[] = [
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
                id: "projects",
                group: "项目",
                title: `项目中心 ${state?.projects.length || 0}`,
                description: "查看项目树、项目目标和项目记录",
                keywords: ["project", "项目"],
                run: () => goProjects("all"),
            },
            {
                id: "plans",
                group: "导航",
                title: "计划中心",
                description: "查看日、周、月、年周期计划",
                keywords: ["计划", "周期计划", "明日关注", "下周计划", "下月计划", "年度方向"],
                run: () => selectTab("plans"),
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
            {
                id: "projects-risk",
                group: "项目",
                title: `风险项目 ${riskyProjectCount}`,
                description: "查看存在逾期、堆积或停滞迹象的项目",
                keywords: ["project", "risk", "health", "项目", "风险", "健康度"],
                run: () => goProjects("risk"),
            },
        ];

        if (!taskManagementEnabled) {
            return baseCommands;
        }

        return [
            {
                id: "create-task",
                group: "创建",
                title: "新建任务",
                description: "写入今日日记的「新建任务」区块",
                keywords: ["task", "todo", "任务"],
                run: () => openCreateTaskDialog(),
            },
            ...baseCommands,
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
        ];
    });

    let refreshFlight: Promise<void> | null = null;

    function refresh(): Promise<void> {
        if (refreshFlight) return refreshFlight;
        const run = (async () => {
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
                refreshFlight = null;
            }
        })();
        refreshFlight = run;
        return run;
    }

    let refreshTimer: number | null = null;
    let indexRefreshTimer: number | null = null;
    let refreshMutationTail: Promise<void> = Promise.resolve();

    function handleEnhancedDiaryIndexesUpdated(): void {
        if (!advancedEnabled) return;
        if (indexRefreshTimer) window.clearTimeout(indexRefreshTimer);
        indexRefreshTimer = window.setTimeout(async () => {
            indexRefreshTimer = null;
            const running = refreshFlight;
            if (running) await running;
            if (advancedEnabled) await refresh();
        }, 120);
    }

    async function refreshAfterWorkspaceMutation(notifyProjectData = false): Promise<void> {
        const queued = refreshMutationTail.catch(() => undefined).then(async () => {
            if (refreshTimer) {
                window.clearTimeout(refreshTimer);
                refreshTimer = null;
            }
            await refresh();
            if (notifyProjectData) workspaceMutationVersion += 1;
            refreshTimer = window.setTimeout(() => {
                refreshTimer = null;
                void refresh();
            }, 400);
        });
        refreshMutationTail = queued.then(() => undefined, () => undefined);
        await queued;
    }

    async function saveWorkspaceSettings(config: EnhancedDiaryWorkspaceState["config"]): Promise<void> {
        if (settingsSaving) return;
        settingsSaving = true;
        try {
            const previousStorage = state?.config.projectStorage;
            const storageChanged = JSON.stringify(previousStorage || {}) !== JSON.stringify(config.projectStorage);
            await saveEnhancedDiaryConfig(plugin, config);
            if (state) {
                state = { ...state, config };
            }
            calendarMonthCache = new Map();
            await loadCalendar();
            let indexMessage = "";
            if (storageChanged) {
                const storageReady = config.projectStorage.mode === "notebook"
                    ? Boolean(config.projectStorage.notebookId)
                    : Boolean(config.projectStorage.parentDocId);
                if (storageReady) {
                    try {
                        const status = await rebuildEnhancedDiaryProjectIndex(config.projectStorage);
                        if (status.lastStatus !== "success") {
                            indexMessage = "设置已保存，但项目索引重建失败，请在项目页面手动刷新索引。";
                        }
                    } catch {
                        indexMessage = "设置已保存，但项目索引重建失败，请在项目页面手动刷新索引。";
                    }
                }
            }
            showMessage(indexMessage || (storageChanged ? "设置已保存，项目索引已按新位置重建；既有关联不会被删除。" : "工作台设置已保存"), 3500);
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
            const historyRecords = await loadWorkspaceHistoryRecords(state.date, state.config);
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
            "plans",
            "review",
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
            selectedDayDetail = await loadWorkspaceDayDetail(parseLocalDate(dateStr), state.config);
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
                calendarDate.getMonth(),
                state.config
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
        if (result.reason === "existing_doc_unreadable") {
            showMessage("日记已存在，但正文暂时无法读取，请稍后重试。", 4000);
        } else if (!result.id) {
            showMessage("打开今日日记失败，请检查日记笔记本设置", 4000);
        }
        await refreshAfterWorkspaceMutation();
    }

    async function ensureTodayDiaryAndAppendTemplate(options: { openDoc: boolean } = { openDoc: false }): Promise<void> {
        if (!state) return;

        const result = await getOrCreateTodayDiaryDocument(plugin, state.config);

        if (!result.ok || !result.docId) {
            const messages: Record<string, string> = {
                missing_notebook: "请先在强化日记设置中选择日记笔记本。",
                index_not_ready: "日记索引尚未就绪，请稍后重试。",
                existing_doc_unreadable: "今日日记已存在但暂时无法读取内容，请稍后重试。",
                create_failed: "创建今日日记失败，请检查日记笔记本设置。",
                read_failed: "今日日记已创建但读取内容失败，请刷新后重试。",
            };
            showMessage(messages[result.reason || ""] || "操作失败", 4000);
            return;
        }

        const docId = result.docId;
        if (options.openDoc) {
            openDiaryDocument(plugin, docId);
        }

        const dayCard = state.reviewCards.find((card) => card.period === "day");
        if (!dayCard) {
            showMessage(result.created ? "已创建今日日记" : "已定位到今日日记", 3000);
            await refreshAfterWorkspaceMutation();
            return;
        }

        const appendResult = await appendTemplateToDiary({
            docId,
            period: "day",
            template: state.config.templates.day,
            context: dayCard.templateContext,
            headingStructure: state.config.headingStructure,
            mapping: state.config.templateFieldMapping,
            taskManagementEnabled,
        });
        if (appendResult.ok && appendResult.skipped) {
            showMessage(result.created ? "已创建今日日记，模板已存在" : "已打开今日日记，模板已存在", 3000);
        } else if (appendResult.ok) {
            showMessage(result.created ? "已创建今日日记并补齐模板" : "已补齐今日模板", 3000);
        } else if (appendResult.reason && appendResult.reason.startsWith("template_incomplete:")) {
            const missingList = appendResult.reason.slice("template_incomplete:".length).trim();
            showMessage(`根标题已存在，但以下子区块缺失且无法自动定位补全：${missingList}。请在文档中手动添加。`, 5000);
        } else {
            showMessage("补充模板失败", 3000);
        }
        await refreshAfterWorkspaceMutation();
    }

    async function appendTodayTemplate(): Promise<void> {
        await ensureTodayDiaryAndAppendTemplate({ openDoc: false });
    }

    async function openTodayAndAppendTemplate(): Promise<void> {
        await ensureTodayDiaryAndAppendTemplate({ openDoc: true });
    }

    function openCreateTaskDialog(input: Partial<GenerateTasksPlusTaskInput> = {}): void {
        if (!taskManagementEnabled) {
            showMessage("任务管理已关闭", 3000);
            return;
        }
        openTaskEditorSvelteDialog({
            mode: "create",
            initialInput: input,
            projectStorage: state?.config.projectStorage,
            tagSuggestions: getTaskTagSuggestions(),
            onSubmit: async (taskInput) => {
                return await submitNewTaskForWorkspace(taskInput);
            },
        });
    }

    async function submitNewTaskForWorkspace(input: GenerateTasksPlusTaskInput): Promise<boolean> {
        if (!taskManagementEnabled) {
            showMessage("任务管理已关闭", 3000);
            return false;
        }
        if (actionBusy) return false;
        actionBusy = true;
        try {
            const todayDoc = await getOrCreateTodayDiaryDocument(plugin, state.config);
            if (!todayDoc.ok || !todayDoc.docId) {
                showMessage("未能打开或创建今日日记，任务未写入", 4000);
                return false;
            }
            const result = await addNewTaskToDiary({
                docId: todayDoc.docId,
                task: input,
                dailyNotebookId: state.config.dailyNotebookId!,
                expectedDate: formatDiaryAttrDate(new Date()),
                headingStructure: state.config.headingStructure,
                mapping: state.config.templateFieldMapping,
                projectStorage: state.config.projectStorage,
            });
            if (result.ok) {
                showMessage(result.message || "任务已写入「新建任务」区块", result.message ? 5000 : 3000);
                await refreshAfterWorkspaceMutation(true);
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
        if (!taskManagementEnabled) {
            showMessage("任务管理已关闭", 3000);
            return;
        }
        const firstContentLine = record.content
            .split("\n")
            .map((line) => line.trim())
            .find(Boolean);
        openTaskEditorSvelteDialog({
            mode: "create",
            initialInput: {
                taskname: firstContentLine || record.headingTitle,
                tags: record.tags || [record.categoryTitle].filter(Boolean),
                projectTargetId: record.projectTargetId,
            },
            projectStorage: state?.config.projectStorage,
            tagSuggestions: getTaskTagSuggestions(),
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
                            const expectedDate = record.date ? record.date.replace(/-/g, "") : "";
                            if (!expectedDate || expectedDate.length !== 8) {
                                showMessage("记录日期无效，请刷新工作台后重试。", 4000);
                                return false;
                            }
                            const deleteResult = await deleteQuickRecord(record, {
                                dailyNotebookId: state.config.dailyNotebookId!,
                                expectedDate,
                            });
                            if (deleteResult.ok) {
                                await refreshAfterWorkspaceMutation(true);
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
                projectTargetId: task.projectTargetId,
            },
            projectStorage: state?.config.projectStorage,
            tagSuggestions: getTaskTagSuggestions(),
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
            const result = await updateWorkspaceTask(editingTask, input, state.config.projectStorage);
            if (result.ok) {
                showMessage(result.partial ? result.message || "任务已更新，但项目关系同步不完整" : "任务已更新", result.partial ? 5000 : 3000);
                editingTask = null;
                await refreshAfterWorkspaceMutation(true);
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
            if (result.ok) {
                showMessage(result.partial ? result.message || "任务状态已更新，但项目关系同步不完整" : "任务状态已更新", result.partial ? 5000 : 3000);
                await refreshAfterWorkspaceMutation(true);
            } else {
                showMessage(result.message || "任务状态更新失败", 3000);
            }
        } finally {
            actionBusy = false;
        }
    }

    async function confirmDeleteTask(task: EnhancedDiaryWorkspaceTask | null, mode: "log" | "delete"): Promise<boolean> {
        if (!state || !task || actionBusy) return false;
        actionBusy = true;
        try {
            const result = await deleteWorkspaceTask(plugin, state.config, task, mode);
            if (result.ok) {
                showMessage("任务已删除", 3000);
                deletingTask = null;
                await refreshAfterWorkspaceMutation(true);
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
                await refreshAfterWorkspaceMutation(true);
                return true;
            } else if (result.changed) {
                showMessage(result.message || "任务已移动，但后续处理失败，请刷新后检查", 4000);
                migratingTask = null;
                await refreshAfterWorkspaceMutation(true);
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
                const message = result.partial
                    ? (result.message || "任务已推迟，但项目关系同步不完整")
                    : (target === "tomorrow" ? "任务已推迟到明天" : "任务已推迟到下周");
                showMessage(message, result.partial ? 5000 : 3000);
                await refreshAfterWorkspaceMutation(true);
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
            const result = await completeWorkspaceTasksSequentially(tasks);
            const message = result.partialCount > 0
                ? `已完成 ${result.successCount}/${result.total} 个任务，其中 ${result.partialCount} 个项目关系同步不完整`
                : `已完成 ${result.successCount}/${result.total} 个任务`;
            showMessage(message, result.partialCount > 0 ? 5000 : 3000);
            await refreshAfterWorkspaceMutation(result.successCount > 0);
        } finally {
            actionBusy = false;
        }
    }

    async function batchPostponeTasks(tasks: EnhancedDiaryWorkspaceTask[], target: "tomorrow" | "nextWeek"): Promise<void> {
        if (actionBusy || tasks.length === 0) return;
        actionBusy = true;
        try {
            const targets = tasks.filter((task) => !task.completed);
            let successCount = 0;
            let partialCount = 0;
            let failedCount = 0;
            for (const task of targets) {
                try {
                    const result = await postponeWorkspaceTask(task, target);
                    if (result.ok) {
                        successCount += 1;
                        if (result.partial) partialCount += 1;
                    } else {
                        failedCount += 1;
                    }
                } catch {
                    failedCount += 1;
                }
            }
            const baseMessage = target === "tomorrow"
                ? `已推迟 ${successCount}/${targets.length} 个任务到明天`
                : `已推迟 ${successCount}/${targets.length} 个任务到下周`;
            const message = partialCount > 0 || failedCount > 0
                ? `${baseMessage}（${partialCount > 0 ? `${partialCount} 个项目关系同步不完整` : ""}${partialCount > 0 && failedCount > 0 ? "、" : ""}${failedCount > 0 ? `${failedCount} 个失败` : ""}）`
                : baseMessage;
            const hasChange = successCount > 0 || partialCount > 0;
            showMessage(message, hasChange ? 5000 : 3000);
            await refreshAfterWorkspaceMutation(hasChange);
        } finally {
            actionBusy = false;
        }
    }

    async function createRecord(
        input: QuickRecordDialogSubmitInput
    ): Promise<boolean> {
        if (!state || actionBusy) return false;
        actionBusy = true;
        try {
            const result = await addWorkspaceQuickRecord(plugin, state.config, input.categoryTitle, input.content, input);
            if (result.ok) {
                showMessage(result.message || "记录已写入「快速记录」区块", result.message ? 5000 : 3000);
                await refreshAfterWorkspaceMutation(true);
                return true;
            } else {
                showMessage(result.message || "新增记录失败", 4000);
                return false;
            }
        } finally {
            actionBusy = false;
        }
    }

    function openQuickRecordDialogForWorkspace(initialProjectTargetId?: string | Event): void {
        const projectTargetId = typeof initialProjectTargetId === "string" ? initialProjectTargetId : "";
        openQuickRecordSvelteDialog({
            mode: "create",
            suggestedCategories: state?.config?.recordCategorySuggestions || ["未分类", "想法", "问题", "决策", "日志"],
            projectStorage: state?.config.projectStorage,
            initialProjectTargetId: projectTargetId,
            onSubmit: async (input) => {
                return await createRecord(input);
            },
        });
    }

    async function openArchiveProjectForWorkspace(targetId: string): Promise<void> {
        if (!state || actionBusy || archivePrecheckActive) return;
        archivePrecheckActive = true;
        let dialogOpened = false;
        try {
            const context = await getEnhancedDiaryProjectLifecycleContext(state.config.projectStorage, targetId);
            let latestTasks: EnhancedDiaryWorkspaceTask[];
            try {
                latestTasks = await queryWorkspaceTasks(state.config, state.date, plugin, {
                    forceIndexRefresh: true,
                    requireFreshIndex: true,
                });
            } catch (reason) {
                const detail = reason instanceof Error ? reason.message : String(reason);
                showMessage(`无法确认项目内未完成任务，未执行归档：${detail}`, 5000);
                return;
            }
            const affectedIds = new Set(context.affectedTargetIds);
            const pendingTasks = latestTasks.filter((task) =>
                !task.completed && Boolean(task.projectTargetId) && affectedIds.has(task.projectTargetId!),
            );
            openArchiveProjectDialog({
                projectName: context.target.title,
                projectPath: context.target.pathTitles,
                descendantCount: context.descendantCount,
                pendingTaskCount: pendingTasks.length,
                onSelect: async (mode) => {
                    if (!state || actionBusy) return { accepted: false };
                    actionBusy = true;
                    try {
                        if (mode === "verify_and_archive" || mode === "complete_and_archive") {
                            let currentPendingTasks: EnhancedDiaryWorkspaceTask[];
                            try {
                                const currentContext = await getEnhancedDiaryProjectLifecycleContext(state.config.projectStorage, targetId);
                                const currentTasks = await queryWorkspaceTasks(state.config, state.date, plugin, {
                                    forceIndexRefresh: true,
                                    requireFreshIndex: true,
                                });
                                const currentAffectedIds = new Set(currentContext.affectedTargetIds);
                                currentPendingTasks = currentTasks.filter((task) =>
                                    !task.completed && Boolean(task.projectTargetId) && currentAffectedIds.has(task.projectTargetId!),
                                );
                            } catch (reason) {
                                const detail = reason instanceof Error ? reason.message : String(reason);
                                showMessage(`无法确认项目内未完成任务，未执行归档：${detail}`, 5000);
                                return { accepted: false };
                            }
                            if (mode === "verify_and_archive" && currentPendingTasks.length > 0) {
                                return {
                                    accepted: false,
                                    pendingTaskCount: currentPendingTasks.length,
                                    message: `检测到项目中新出现 ${currentPendingTasks.length} 条未完成任务，请重新选择归档方式。`,
                                };
                            }
                            if (mode === "complete_and_archive") {
                                const relationSnapshots = currentPendingTasks.map((task) => ({
                                    blockId: task.blockId,
                                    projectTargetId: task.projectTargetId,
                                    hiddenProjectTargetId: task.hiddenProjectTargetId,
                                    visibleProjectTargetId: task.visibleProjectTargetId,
                                    projectRelationStatus: task.projectRelationStatus,
                                }));
                                const batchResult = await completeWorkspaceTasksSequentially(currentPendingTasks);
                                await refreshAfterWorkspaceMutation(batchResult.successCount > 0);
                                if (batchResult.failedCount > 0) {
                                    showMessage(`任务完成结果：成功 ${batchResult.successCount} 个，失败 ${batchResult.failedCount} 个；项目未归档。`, 5000);
                                    return { accepted: false };
                                }
                                try {
                                    const finalContext = await getEnhancedDiaryProjectLifecycleContext(state.config.projectStorage, targetId);
                                    const finalTasks = await queryWorkspaceTasks(state.config, state.date, plugin, {
                                        forceIndexRefresh: true,
                                        requireFreshIndex: true,
                                    });
                                    const finalTaskMap = new Map(finalTasks.map((t) => [t.blockId, t]));
                                    const invalidTasks = relationSnapshots.filter((snapshot) => {
                                        const finalTask = finalTaskMap.get(snapshot.blockId);
                                        if (!finalTask) return true;
                                        if (!finalTask.completed) return true;
                                        if (finalTask.projectTargetId !== snapshot.projectTargetId) return true;
                                        if (finalTask.hiddenProjectTargetId !== snapshot.hiddenProjectTargetId) return true;
                                        if (finalTask.visibleProjectTargetId !== snapshot.visibleProjectTargetId) return true;
                                        if (snapshot.projectRelationStatus === "normal" && finalTask.projectRelationStatus !== "normal") return true;
                                        return false;
                                    });
                                    if (invalidTasks.length > 0) {
                                        return {
                                            accepted: false,
                                            message: `已完成 ${batchResult.successCount} 条任务，但有 ${invalidTasks.length} 条任务的项目关系未通过校验，项目尚未归档，请刷新或检查关系。`,
                                        };
                                    }
                                    const finalAffectedIds = new Set(finalContext.affectedTargetIds);
                                    const finalPendingTasks = finalTasks.filter((task) =>
                                        !task.completed && Boolean(task.projectTargetId) && finalAffectedIds.has(task.projectTargetId!),
                                    );
                                    if (finalPendingTasks.length > 0) {
                                        return {
                                            accepted: false,
                                            pendingTaskCount: finalPendingTasks.length,
                                            message: `完成过程中又检测到 ${finalPendingTasks.length} 条新的未完成任务，已完成的任务保持完成，请再次确认。`,
                                        };
                                    }
                                } catch (reason) {
                                    const detail = reason instanceof Error ? reason.message : String(reason);
                                    const message = `已完成 ${batchResult.successCount} 条任务，但无法确认最新任务状态，项目未归档：${detail}`;
                                    showMessage(message, 5500);
                                    return { accepted: false, message };
                                }
                            }
                        }
                        const result = await archiveEnhancedDiaryProject(state.config.projectStorage, targetId);
                        if (result.status === "blocked") {
                            showMessage(result.message, 4500);
                            return { accepted: false };
                        }
                        await refreshAfterWorkspaceMutation(true);
                        if (result.status === "partial" && result.unverifiedTargetIds.length > 0) {
                            showMessage(`项目状态只完成了部分写入，有 ${result.unverifiedTargetIds.length} 个项目节点尚未确认，请重试归档。`, 5500);
                            return { accepted: false };
                        }
                        if (result.status === "partial") {
                            showMessage("项目已归档，但项目索引刷新未完成，请稍后刷新索引。", 5000);
                            return { accepted: true };
                        }
                        showMessage("项目已归档，项目文档和日记内容均未移动。", 3000);
                        return { accepted: true };
                    } catch (reason) {
                        showMessage(reason instanceof Error ? reason.message : "项目归档失败", 4500);
                        return { accepted: false };
                    } finally {
                        actionBusy = false;
                    }
                },
                onClose: () => {
                    archivePrecheckActive = false;
                },
            });
            dialogOpened = true;
        } catch (reason) {
            const detail = reason instanceof Error ? reason.message : String(reason);
            showMessage(`无法确认完整项目范围，未执行归档：${detail}`, 5000);
        } finally {
            if (!dialogOpened) archivePrecheckActive = false;
        }
    }

    async function restoreProjectForWorkspace(targetId: string): Promise<void> {
        if (!state || actionBusy) return;
        actionBusy = true;
        try {
            const result = await restoreEnhancedDiaryProject(state.config.projectStorage, targetId);
            if (result.status === "blocked") {
                showMessage(result.message, 4000);
                return;
            }
            await refreshAfterWorkspaceMutation(true);
            if (result.status === "partial" && result.unverifiedTargetIds.length > 0) {
                showMessage(`项目恢复只完成了部分写入，有 ${result.unverifiedTargetIds.length} 个项目节点尚未确认。`, 5500);
                return;
            }
            if (result.status === "partial") {
                showMessage("项目状态已经恢复，但项目索引刷新未完成，请稍后刷新索引。", 5000);
                return;
            }
            showMessage("项目已恢复", 3000);
        } catch (reason) {
            showMessage(reason instanceof Error ? reason.message : "恢复项目失败", 4500);
        } finally {
            actionBusy = false;
        }
    }

    async function resolveProjectRecord(
        item: EnhancedDiaryProjectRecordIndexItem,
    ): Promise<EnhancedDiaryWorkspaceRecord | null> {
        if (!state) return null;
        const loaded = [...state.records, ...state.historyRecords].find((record) =>
            record.headingBlockId === item.headingBlockId || record.id === item.id
        );
        if (loaded) return loaded;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return null;
        const date = parseLocalDate(item.date);
        const records = await queryQuickRecordsInDateRange({
            startDate: date,
            endDate: date,
            includeToday: true,
            config: state.config,
        });
        return records.find((record) => record.headingBlockId === item.headingBlockId || record.id === item.id) || null;
    }

    async function openProjectRecordAction(
        item: EnhancedDiaryProjectRecordIndexItem,
        action: (record: EnhancedDiaryWorkspaceRecord) => void,
    ): Promise<void> {
        try {
            const record = await resolveProjectRecord(item);
            if (!record) {
                showMessage("未能读取记录的完整块结构，请刷新工作台后重试。", 4000);
                return;
            }
            action(record);
        } catch (error) {
            console.warn("[enhancedDiaryWorkspacePage] load project record failed", error);
            showMessage("读取项目记录失败，请稍后重试。", 4000);
        }
    }

    async function confirmDeleteRecord(record: EnhancedDiaryWorkspaceRecord | null): Promise<boolean> {
        if (!record || actionBusy) return false;
        actionBusy = true;
        try {
            const expectedDate = record.date ? record.date.replace(/-/g, "") : "";
            if (!expectedDate || expectedDate.length !== 8) {
                showMessage("记录日期无效，请刷新工作台后重试。", 4000);
                actionBusy = false;
                return false;
            }
            const result = await deleteQuickRecord(record, {
                dailyNotebookId: state.config.dailyNotebookId!,
                expectedDate,
            });
            if (result.ok) {
                showMessage("记录已删除", 3000);
                deletingRecord = null;
                await refreshAfterWorkspaceMutation(true);
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
            initialTags: record.tags,
            initialProjectTargetId: record.projectTargetId,
            initialIsKeyRecord: record.isKeyRecord,
            projectStorage: state?.config.projectStorage,
            suggestedCategories: state?.config?.recordCategorySuggestions || [],
            onSubmit: async (input) => {
                return await editRecord(input);
            },
            onClose: () => {
                editingRecord = null;
            },
        });
    }

    function openDeleteTaskDialog(task: EnhancedDiaryWorkspaceTask): void {
        deletingTask = task;
        openDeleteTaskSvelteDialog({
            task,
            onSelect: async (mode) => {
                return confirmDeleteTask(task, mode);
            },
            onClose: () => {
                deletingTask = null;
            },
        });
    }

    function openDeleteRecordDialog(record: EnhancedDiaryWorkspaceRecord): void {
        deletingRecord = record;
        openDeleteRecordSvelteDialog({
            record,
            onConfirm: async () => {
                return confirmDeleteRecord(record);
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
        input: QuickRecordDialogSubmitInput
    ): Promise<boolean> {
        if (!editingRecord || actionBusy) return false;
        actionBusy = true;
        try {
            const expectedDate = editingRecord.date ? editingRecord.date.replace(/-/g, "") : "";
            if (!expectedDate || expectedDate.length !== 8) {
                showMessage("记录日期无效，请刷新工作台后重试。", 4000);
                actionBusy = false;
                return false;
            }
            const result = await updateQuickRecord(editingRecord, input.content, {
                dailyNotebookId: state.config.dailyNotebookId!,
                expectedDate,
                projectStorage: state.config.projectStorage,
            }, input);
            if (result.ok) {
                showMessage(result.message || "记录已更新", result.message ? 5000 : 3000);
                editingRecord = null;
                await refreshAfterWorkspaceMutation(true);
                return true;
            } else {
                showMessage(result.message || "更新记录失败", 4000);
                return false;
            }
        } finally {
            actionBusy = false;
        }
    }

    function openTaskSearchResult(task: EnhancedDiaryWorkspaceTask): void {
        goTasks({
            completionScope: task.completed ? "completed" : "active",
            taskBlockId: task.blockId,
            view: "list",
        });
    }

    function openProjectSearchResult(targetId: string): void {
        projectSelectTargetId = targetId; projectSelectVersion += 1; selectTab("projects");
    }

    function openNotificationSearchResult(notificationId: string): void {
        notificationSelectId = notificationId; notificationSelectVersion += 1; selectTab("notifications");
    }

    async function openProjectRelationRepair(item: EnhancedDiaryWorkspaceNotification): Promise<void> {
        if (!state) return;
        const task = item.relationEntityKind === "task" ? state.tasks.find((value) => value.blockId === item.relatedTaskId) : undefined;
        const record = item.relationEntityKind === "record"
            ? [...state.records, ...state.historyRecords].find((value) => value.headingBlockId === item.relatedRecordId)
            : undefined;
        if (!task && !record) { showMessage("对应内容已变化，请刷新工作台。", 3500); return; }
        const index = await readEnhancedDiaryProjectIndex(state.config.projectStorage);
        const status = task?.projectRelationStatus || record?.projectRelationStatus || "invalid_target";
        openProjectRelationRepairDialog({
            index, status,
            contentLabel: task?.taskname || record?.content?.trim().replace(/\s+/g, " ").slice(0, 120) || record?.headingTitle || "未命名内容",
            hiddenProjectTargetId: task?.hiddenProjectTargetId || record?.hiddenProjectTargetId,
            visibleProjectTargetId: task?.visibleProjectTargetId || record?.visibleProjectTargetId,
            projectTargetId: task?.projectTargetId || record?.projectTargetId,
            onSelect: async (mode: ProjectRelationRepairMode, replacementTargetId?: string) => {
                try {
                    await repairEnhancedDiaryProjectRelation({
                        index, mode, replacementTargetId,
                        target: task ? {
                            kind: "task", relationBlockId: task.blockId,
                            hiddenTargetId: task.hiddenProjectTargetId, visibleTargetId: task.visibleProjectTargetId,
                        } : {
                            kind: "record", relationBlockId: record!.headingBlockId!,
                            contentBlockIds: record!.contentBlockIds || [],
                            hiddenTargetId: record!.hiddenProjectTargetId, visibleTargetId: record!.visibleProjectTargetId,
                        },
                    });
                    await refreshAfterWorkspaceMutation(true);
                    showMessage("项目关系已修复", 2500);
                    return true;
                } catch (reason) {
                    showMessage(reason instanceof Error ? reason.message : "关系修复失败", 4500);
                    return false;
                }
            },
        });
    }

    async function validateReviewWriteTarget(card: EnhancedDiaryWorkspaceReviewCard): Promise<boolean> {
        if (!state || !card.docId) return false;
        const check = await validateEnhancedDiaryWriteTarget(
            card.docId,
            state.config.dailyNotebookId!,
            formatDiaryAttrDate(card.targetDate)
        );
        if (check.status !== "valid") {
            showMessage("日记位置或日期已经变化，请刷新后重试", 4000);
            await refreshAfterWorkspaceMutation();
            return false;
        }
        return true;
    }

    async function appendReviewTemplate(card: EnhancedDiaryWorkspaceReviewCard): Promise<void> {
        if (!state || !card.docId) {
            showMessage("请先创建对应日记后再补充模板", 3000);
            return;
        }
        if (!await validateReviewWriteTarget(card)) return;
        const result = await appendTemplateToDiary({
            docId: card.docId,
            period: card.period,
            template: state.config.templates[card.period],
            context: card.templateContext,
            headingStructure: state.config.headingStructure,
            mapping: state.config.templateFieldMapping,
            taskManagementEnabled,
        });
        if (result.ok && result.skipped) {
            showMessage("模板已存在，无需补充", 3000);
        } else if (result.ok) {
            showMessage("模板已处理", 3000);
        } else if (result.reason && result.reason.startsWith("template_incomplete:")) {
            const missingList = result.reason.slice("template_incomplete:".length).trim();
            showMessage(`根标题已存在，但以下子区块缺失且无法自动定位补全：${missingList}。请在文档中手动添加。`, 5000);
        } else if (result.reason === "read_failed") {
            showMessage("日记正文暂时无法读取，为避免重复写入，本次未补充模板。", 4000);
        } else {
            showMessage("补充模板失败", 3000);
        }
        await refreshAfterWorkspaceMutation();
    }

    async function createOrOpenReview(card: EnhancedDiaryWorkspaceReviewCard): Promise<void> {
        if (!state) return;
        const result = await openOrCreateDiaryForDate(
            plugin,
            card.targetDate,
            state.config.dailyNotebookId
        );
        if (result.id) {
            await refreshAfterWorkspaceMutation();
        } else if (result.reason === "existing_doc_unreadable") {
            showMessage("日记已存在，但正文暂时无法读取，请稍后重试。", 4000);
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
        if (!await validateReviewWriteTarget(card)) return;
        const result = await toggleCompletionMarker({
            docId: card.docId,
            period: card.period,
            completed,
            mapping: state.config.templateFieldMapping,
        });
        showMessage(result.ok ? "复盘状态已更新" : "复盘状态更新失败", 3000);
        await refreshAfterWorkspaceMutation();
    }

    async function skipReview(card: EnhancedDiaryWorkspaceReviewCard): Promise<void> {
        if (!card.docId) {
            showMessage("未找到对应日记", 3000);
            return;
        }
        if (!await validateReviewWriteTarget(card)) return;
        const result = await skipPeriod({ docId: card.docId, period: card.period, mapping: state.config.templateFieldMapping });
        showMessage(result.ok ? "已跳过本周期" : "跳过失败", 3000);
        await refreshAfterWorkspaceMutation();
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
        if (!await validateReviewWriteTarget(card)) return;
        const mode = await selectRestoreSkipMode();
        if (!mode) return;

        const result = await restoreSkippedPeriod({
            docId: card.docId,
            period: card.period,
            mode,
            mapping: state.config.templateFieldMapping,
        });
        showMessage(result.ok ? "已取消跳过" : "取消跳过失败", 3000);
        await refreshAfterWorkspaceMutation();
    }

    async function loadReviewContentForPanel(
        card: EnhancedDiaryWorkspaceReviewCard
    ): Promise<{ fields: EnhancedDiaryReviewField[]; reason?: string }> {
        if (!card.docId) {
            return { fields: [], reason: "no_doc" };
        }
        const result = await loadReviewContent(card.docId, card.period, state.config.headingStructure, state.config.templateFieldMapping);
        const visibleFieldLabels = new Set(
            getWorkspaceReviewFields(state.config.templateFieldMapping, card.period, taskManagementEnabled)
        );
        return {
            ...result,
            fields: result.fields.filter((field) => visibleFieldLabels.has(field.label)),
        };
    }

    async function saveReviewContentFromPanel(
        card: EnhancedDiaryWorkspaceReviewCard,
        fields: EnhancedDiaryReviewField[]
    ): Promise<boolean> {
        if (!card.docId) return false;
        if (!await validateReviewWriteTarget(card)) return false;
        const visibleFieldLabels = new Set(
            getWorkspaceReviewFields(state.config.templateFieldMapping, card.period, taskManagementEnabled)
        );
        const visibleFields = fields.filter((field) => visibleFieldLabels.has(field.label));
        const result = await saveReviewContent(card.docId, card.period, visibleFields, state.config.headingStructure, state.config.templateFieldMapping);
        if (result.ok) {
            showMessage("复盘内容已保存", 2500);
            await refreshAfterWorkspaceMutation();
            return true;
        }
        if (result.reason === "missing_review_root") {
            showMessage("复盘区块缺失，请先补充模板", 3000);
        } else if (result.reason === "read_failed") {
            showMessage("日记正文暂时无法读取，为保护已有内容，本次禁止编辑和保存。", 4000);
        } else if (result.reason === "cleanup_failed") {
            showMessage("新内容已写入，但旧内容清理失败，请打开日记检查重复内容。", 5000);
            // Document was modified — reload to prevent re-saving stale editing state
            await refreshAfterWorkspaceMutation();
        } else if (result.reason === "partial_write") {
            showMessage("部分字段写入失败，旧内容已保留。请稍后重试。", 4000);
            // Part of the document was modified — reload to prevent re-saving stale editing state
            await refreshAfterWorkspaceMutation();
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
        window.addEventListener(ENHANCED_DIARY_INDEXES_UPDATED_EVENT, handleEnhancedDiaryIndexesUpdated);

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
            window.removeEventListener(ENHANCED_DIARY_INDEXES_UPDATED_EVENT, handleEnhancedDiaryIndexesUpdated);
            window.removeEventListener("homepage-advanced-ready", onReady);
            window.removeEventListener("homepage-advanced-unavailable", onUnavailable);
            if (indexRefreshTimer) window.clearTimeout(indexRefreshTimer);
        };
    });
</script>

{#if advancedEnabled}
<div class="workspace-page">
        <WorkspaceHeader
            today={state?.today || ""}
            {loading}
            onRefresh={refresh}
            onOpenAndAppendTemplate={openTodayAndAppendTemplate}
            onOpenCommandPalette={() => (commandPaletteOpen = true)}
            todayTaskCount={todayTaskCount}
            overdueTaskCount={overdueTaskCount}
            recordCount={state?.records?.length || 0}
            projectCount={state?.projects?.length || 0}
            reviewStatusText={reviewStatusText}
            {taskManagementEnabled}
            showPulse={activeTab !== "overview"}
            onGoTasks={(f) => goTasks(f as WorkspaceTaskStatusFilter)}
            onGoRecords={() => goRecords({ mode: "today" })}
            onGoProjects={() => selectTab("projects")}
            onGoReview={() => selectTab("review")}
        />

    {#if state}
        <WorkspaceGlobalSearch
            state={state}
            {taskManagementEnabled}
            onOpenTaskResult={openTaskSearchResult}
            onOpenRecordResult={goRecords}
            onOpenProjectResult={openProjectSearchResult}
            onOpenNotificationResult={openNotificationSearchResult}
            onGoReview={() => selectTab("review")}
            onOpenDoc={openDoc}
        />
    {/if}

    {#if state}
        <div class="workspace-layout">
            <WorkspaceSidebar
                {activeTab}
                notificationCount={unhandledNotificationCount}
                taskManagementEnabled={taskManagementEnabled}
                onSelect={selectTab}
            />
            <main>
                {#if activeTab === "overview"}
                    <WorkspaceOverview
                        {state}
                        {taskManagementEnabled}
                        onOpenTodayAndAppendTemplate={openTodayAndAppendTemplate}
                        onGoTasks={goTasks}
                        onGoRecords={goRecords}
                        onGoReview={() => selectTab("review")}
                        onGoProjects={() => goProjects()}
                        onGoNotifications={() => selectTab("notifications")}
                        onGoPlans={() => selectTab("plans")}
                        onCreateTask={openCreateTaskDialog}
                        onCreateRecord={openQuickRecordDialogForWorkspace}
                        onToggleTask={toggleTask}
                        onOpenTask={openTaskSearchResult}
                        onOpenProject={openProjectSearchResult}
                        onOpenDoc={openDoc}
                    />
                {:else if activeTab === "tasks" && taskManagementEnabled}
                    <WorkspaceTaskPanel
                        tasks={state.tasks}
                        projectTargets={state.projectTargets}
                        today={state.today}
                        taskSettings={state.config.workspaceSettings.tasks}
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
                        onOpenProject={openProjectSearchResult}
                        initialStatusFilter={taskStatusFilter}
                        initialCompletionScope={taskCompletionScopeFilter}
                        initialQuickFilter={taskQuickFilter}
                        initialTagFilter={taskTagFilter}
                        initialTags={taskTagsFilter}
                        initialDateFilter={taskDateFilter}
                        initialProjectFilter={taskProjectFilter}
                        initialView={taskViewFilter}
                        initialScheduleFilter={taskScheduleFilter}
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
                        taskManagementEnabled={taskManagementEnabled}
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
                            taskManagementEnabled={taskManagementEnabled}
                        />
                        <WorkspaceCalendarDayDetail
                            detail={selectedDayDetail}
                            loading={dayDetailLoading}
                            onOpenDoc={openDoc}
                            onOpenRecords={goRecordsByDate}
                            onOpenReview={goReviewByDate}
                            onOpenTasks={goTasksByDate}
                            taskManagementEnabled={taskManagementEnabled}
                            calendarMetadata={selectedCalendarMetadata}
                            displaySettings={state?.config.workspaceSettings.calendar}
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
                        onRepairProjectRelation={openProjectRelationRepair}
                        onOpenIndexManagement={() => showMessage("请到主页设置 > 检索管理中重建项目相关索引。", 4500)}
                        initialSelectedNotificationId={notificationSelectId}
                        selectVersion={notificationSelectVersion}
                        {taskManagementEnabled}
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
                        todayTasks={taskManagementEnabled ? state.tasks.filter(t => t.isTodayTask || t.sourceDate === state.today) : []}
                        {taskManagementEnabled}
                    />
                {:else if activeTab === "projects"}
                    <WorkspaceProjectPanel
                        config={state.config}
                        tasks={taskManagementEnabled ? state.tasks : []}
                        initialTargetId={projectSelectTargetId}
                        selectVersion={projectSelectVersion}
                        {workspaceMutationVersion}
                        {taskManagementEnabled}
                        onOpenDoc={openDoc}
                        onOpenBlock={openDoc}
                        onCreateTask={(targetId) => openCreateTaskDialog({ projectTargetId: targetId })}
                        onOpenTaskCenter={(targetId) => goTasks({ status: "active", projectTargetId: targetId })}
                        onEditTask={openEditTaskDialog}
                        onToggleTask={toggleTask}
                        onDeleteTask={openDeleteTaskDialog}
                        onCreateRecord={(targetId) => openQuickRecordDialogForWorkspace(targetId)}
                        onEditRecord={(item) => openProjectRecordAction(item, openEditRecordDialog)}
                        onDeleteRecord={(item) => openProjectRecordAction(item, openDeleteRecordDialog)}
                        onConvertRecordToTask={(item) => openProjectRecordAction(item, convertRecordToTask)}
                        onArchiveProject={(targetId) => void openArchiveProjectForWorkspace(targetId)}
                        onRestoreProject={(targetId) => void restoreProjectForWorkspace(targetId)}
                        onProjectMoved={() => refreshAfterWorkspaceMutation(true)}
                    />
                {:else if activeTab === "plans"}
                    <WorkspacePlanPanel
                        plans={state.carryoverPlans}
                        {taskManagementEnabled}
                        onOpenDoc={openDoc}
                        onConvertToTask={(content) => openCreateTaskDialog({ taskname: content })}
                    />
                {:else if activeTab === "settings"}
                    <WorkspaceSettingsPage
                        config={state.config}
                        saving={settingsSaving}
                        onSave={saveWorkspaceSettings}
                        onOpenAndAppendTemplate={openTodayAndAppendTemplate}
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

    <WorkspaceCommandPalette
        open={commandPaletteOpen}
        commands={commandItems}
        onClose={() => (commandPaletteOpen = false)}
    />

    {#if state}
        <WorkspaceQuickCreateFab
            taskManagementEnabled={taskManagementEnabled}
            onCreateTask={() => openCreateTaskDialog()}
            onCreateRecord={openQuickRecordDialogForWorkspace}
            onOpenAndAppendTemplate={openTodayAndAppendTemplate}
        />
    {/if}
</div>
{:else}
<div class="workspace-page">
        <AdvancedFeatureLock
            title="强化日记工作台"
            subtitle="把日记、任务、记录、复盘和计划承接整合成一个专业工作台。"
            icon="diary"
            features={[
                "任务、记录、复盘集中管理",
                "今天重点与风险提醒",
                "计划承接与复盘内容编辑",
                "快速记录和自定义分类"
            ]}
            highlights={["今日工作区", "复盘工作流", "计划承接"]}
        />
</div>
{/if}

<style>
    .workspace-page {
        min-height: 100%;
        background: var(--wk-bg-page);
        color: var(--b3-theme-on-background);
        box-sizing: border-box;
        padding: 0;
        position: relative;
        isolation: isolate;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        container-type: inline-size;
    }

    .workspace-layout {
        display: flex;
        flex: 1;
        min-height: 0;
        padding: 0;
        gap: 0;
        container-type: inline-size;
    }

    main {
        flex: 1;
        min-width: 0;
        padding: 28px clamp(20px, 2.5vw, 40px) 48px;
        box-sizing: border-box;
        overflow: auto;
        background: transparent;
        border: 0;
        border-radius: 0;
        box-shadow: none;
        container-type: inline-size;
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

    @container (max-width: 900px) {
        .workspace-page {
            padding: 0;
        }

        .workspace-layout {
            flex-direction: column;
            padding: 0 10px 10px;
            gap: 10px;
        }

        main {
            padding: 22px 16px 96px;
            border-radius: var(--wk-radius-lg);
        }
    }

    .calendar-with-detail {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 18px;
        align-items: start;
        width: min(100%, 1480px);
        margin-inline: auto;
    }

    @container (min-width: 1080px) {
        .calendar-with-detail {
            grid-template-columns: minmax(620px, 1fr) minmax(320px, 380px);
        }

        .calendar-with-detail :global(.day-detail-panel) {
            position: sticky;
            top: 0;
        }
    }
</style>
