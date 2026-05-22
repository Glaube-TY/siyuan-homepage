<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { showMessage, Dialog } from "siyuan";
    import {
        ENHANCED_DIARY_PERIODS,
        type EnhancedDiaryConfig,
        type EnhancedDiaryPeriod,
        type EnhancedDiaryStatus,
        type EnhancedDiaryPeriodContext,
    } from "./enhancedDiaryTypes";
    import { loadEnhancedDiaryConfig } from "./enhancedDiaryConfig";
    import {
        formatDiaryDate,
        getPeriodContext,
        getPreviousPeriodContext,
        getEnhancedDiaryStatus,
    } from "./enhancedDiaryUtils";
    import {
        getDiaryDocumentForDate,
        openDiaryDocument,
        openOrCreateDiaryForDate,
        appendTemplateToDiary,
        toggleCompletionMarker,
        skipPeriod,
        restoreSkippedPeriod,
    } from "./enhancedDiaryDoc";
    import type { EnhancedDiaryTemplateContext } from "./enhancedDiaryTypes";
    import {
        addNewTaskToDiary,
        addQuickRecordToDiary,
        getOrCreateTodayDiaryDocument,
    } from "./enhancedDiaryActions";
    import {
        ENHANCED_DIARY_RECORD_CATEGORY_TITLES,
        type EnhancedDiaryRecordCategoryKey,
    } from "./enhancedDiaryWorkspaceSections";
    import {
        buildEnhancedDiaryWorkspaceSummary,
        type EnhancedDiaryWorkspaceSummary,
    } from "./enhancedDiaryWorkspaceSummary";

    function cloneDate(date: Date): Date {
        return new Date(date.getTime());
    }

    interface Props {
        plugin: any;
        contentTypeJson?: string;
    }

    let { plugin }: Props = $props();

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

    let config = $state<EnhancedDiaryConfig | null>(null);
    let cards = $state<CardInfo[]>([]);
    let menuCard = $state<CardInfo | null>(null);
    let bodyMenuEl: HTMLDivElement | null = null;
    let bodyMenuKeydownHandler: ((ev: KeyboardEvent) => void) | null = null;
    let actionBusy = $state(false);
    let todayWorkspaceSummary = $state<EnhancedDiaryWorkspaceSummary | null>(null);
    let todayDiaryExists = $state(false);

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

    const QUICK_RECORD_CATEGORY_OPTIONS: {
        key: EnhancedDiaryRecordCategoryKey;
        label: string;
    }[] = [
        { key: "uncategorized", label: ENHANCED_DIARY_RECORD_CATEGORY_TITLES.uncategorized },
        { key: "idea", label: ENHANCED_DIARY_RECORD_CATEGORY_TITLES.idea },
        { key: "problem", label: ENHANCED_DIARY_RECORD_CATEGORY_TITLES.problem },
        { key: "decision", label: ENHANCED_DIARY_RECORD_CATEGORY_TITLES.decision },
        { key: "log", label: ENHANCED_DIARY_RECORD_CATEGORY_TITLES.log },
    ];

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
            config: config!,
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
    ): Promise<CardInfo> {
        if (period === "day") {
            const ctx = getPeriodContext(period, now, config!);
            return buildCardForContext(period, ctx, now);
        }

        const currentCtx = getPeriodContext(period, now, config!);
        const currentCard = await buildCardForContext(period, currentCtx, now);

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
            const prevCtx = getPreviousPeriodContext(period, cursorBaseDate, config!);
            const prevCard = await buildCardForContext(period, prevCtx, now);

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

    async function buildCards(): Promise<void> {
        if (!config) return;
        const now = new Date();
        cards = await Promise.all(
            ENHANCED_DIARY_PERIODS.map((period) => resolveDisplayCardForPeriod(period, now)),
        );
    }

    async function loadAndBuildCards(): Promise<void> {
        const loaded = await loadEnhancedDiaryConfig(plugin);
        config = loaded;
        await buildCards();
        await loadTodayWorkspaceSummary();
    }

    async function loadTodayWorkspaceSummary(): Promise<void> {
        const doc = await getDiaryDocumentForDate(new Date());
        todayDiaryExists = !!doc;
        todayWorkspaceSummary = doc
            ? buildEnhancedDiaryWorkspaceSummary(doc.content)
            : null;
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
            const dialog = new Dialog({
                title: "取消跳过",
                content: `<div style="padding:12px 0;">请选择取消跳过后的状态。</div>
                    <div style="display:flex;gap:8px;justify-content:flex-end;">
                        <button class="b3-button b3-button--outline" data-mode="pending">恢复为未完成</button>
                        <button class="b3-button b3-button--outline" data-mode="completed">直接标记完成</button>
                        <button class="b3-button b3-button--outline" data-mode="cancel">取消</button>
                    </div>`,
                width: "400px",
                destroyCallback: () => finish(null),
            } as any);
            dialog.element.querySelectorAll("button[data-mode]").forEach((btn) => {
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

    function getDialogInputValue(dialog: Dialog, selector: string): string {
        const el = dialog.element.querySelector(selector) as
            | HTMLInputElement
            | HTMLTextAreaElement
            | HTMLSelectElement
            | null;
        return el?.value?.trim() || "";
    }

    function parseTagInput(value: string): string[] {
        return value
            .split(/[，,\s]+/)
            .map((tag) => tag.trim())
            .filter(Boolean);
    }

    function renderCategoryOptions(): string {
        return QUICK_RECORD_CATEGORY_OPTIONS.map(
            (item) => `<option value="${item.key}">${item.label}</option>`,
        ).join("");
    }

    function openNewTaskDialog(): void {
        if (actionBusy) return;

        const today = formatDiaryDate(new Date());
        const dialog = new Dialog({
            title: "新建任务",
            content: `<div class="enhanced-diary-action-dialog">
                    <label>任务名称
                        <input class="b3-text-field" data-field="taskname" type="text" placeholder="输入任务名称" />
                    </label>
                    <div class="enhanced-diary-action-row">
                        <label>开始日期
                            <input class="b3-text-field" data-field="startDate" type="date" value="${today}" />
                        </label>
                        <label>截止日期
                            <input class="b3-text-field" data-field="deadline" type="date" />
                        </label>
                    </div>
                    <div class="enhanced-diary-action-row">
                        <label>优先级
                            <select class="b3-select" data-field="priority">
                                <option value="">无</option>
                                <option value="❗">低</option>
                                <option value="❗❗">中</option>
                                <option value="❗❗❗">高</option>
                                <option value="❗❗❗❗">紧急</option>
                            </select>
                        </label>
                        <label>标签
                            <input class="b3-text-field" data-field="tags" type="text" placeholder="多个标签用逗号或空格分隔" />
                        </label>
                    </div>
                    <div class="enhanced-diary-action-footer">
                        <button class="b3-button b3-button--outline" data-action="cancel">取消</button>
                        <button class="b3-button" data-action="submit">添加</button>
                    </div>
                </div>`,
            width: "520px",
        } as any);

        dialog.element.querySelector('[data-action="cancel"]')?.addEventListener("click", () => {
            dialog.destroy();
        });

        dialog.element.querySelector('[data-action="submit"]')?.addEventListener("click", async () => {
            const taskname = getDialogInputValue(dialog, '[data-field="taskname"]');
            if (!taskname) {
                showMessage("请输入任务名称", 3000);
                return;
            }

            actionBusy = true;
            try {
                const docId = await getTodayDocIdForAction();
                if (!docId) return;

                const result = await addNewTaskToDiary({
                    docId,
                    task: {
                        taskname,
                        priority: getDialogInputValue(dialog, '[data-field="priority"]'),
                        startDate: getDialogInputValue(dialog, '[data-field="startDate"]'),
                        deadline: getDialogInputValue(dialog, '[data-field="deadline"]'),
                        tags: parseTagInput(getDialogInputValue(dialog, '[data-field="tags"]')),
                    },
                });

                if (result.ok) {
                    showMessage("已写入今日日记的「新建任务」区块", 3000);
                    dialog.destroy();
                    await loadAndBuildCards();
                } else {
                    showMessage(result.message || "新增任务失败", 4000);
                }
            } finally {
                actionBusy = false;
            }
        });
    }

    function openQuickRecordDialog(): void {
        if (actionBusy) return;

        const dialog = new Dialog({
            title: "快速记录",
            content: `<div class="enhanced-diary-action-dialog">
                    <label>分类
                        <select class="b3-select" data-field="category">
                            ${renderCategoryOptions()}
                        </select>
                    </label>
                    <label>记录内容
                        <textarea class="b3-text-field enhanced-diary-record-textarea" data-field="content" placeholder="写下这条记录"></textarea>
                    </label>
                    <div class="enhanced-diary-action-footer">
                        <button class="b3-button b3-button--outline" data-action="cancel">取消</button>
                        <button class="b3-button" data-action="submit">添加</button>
                    </div>
                </div>`,
            width: "520px",
        } as any);

        dialog.element.querySelector('[data-action="cancel"]')?.addEventListener("click", () => {
            dialog.destroy();
        });

        dialog.element.querySelector('[data-action="submit"]')?.addEventListener("click", async () => {
            const content = getDialogInputValue(dialog, '[data-field="content"]');
            if (!content) {
                showMessage("请输入记录内容", 3000);
                return;
            }

            actionBusy = true;
            try {
                const docId = await getTodayDocIdForAction();
                if (!docId) return;

                const categoryKey = getDialogInputValue(
                    dialog,
                    '[data-field="category"]',
                ) as EnhancedDiaryRecordCategoryKey;
                const result = await addQuickRecordToDiary({
                    docId,
                    categoryKey,
                    content,
                });

                if (result.ok) {
                    showMessage("已写入今日日记的「快速记录」区块", 3000);
                    dialog.destroy();
                    await loadAndBuildCards();
                } else {
                    showMessage(result.message || "新增记录失败", 4000);
                }
            } finally {
                actionBusy = false;
            }
        });
    }

    async function openTodayDiary(): Promise<void> {
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
            } else {
                showMessage("打开今日日记失败，请稍后重试", 4000);
            }
        } finally {
            actionBusy = false;
        }
    }

    function openWorkspace(): void {
        if (typeof plugin?.openEnhancedDiaryWorkspace === "function") {
            plugin.openEnhancedDiaryWorkspace();
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
            }
        } else if (action === "append_template") {
            if (!menuCard || !menuCard.docId) {
                showMessage("未找到对应日记", 3000);
            } else if (!config) {
                showMessage("强化日记配置未加载", 3000);
            } else {
                const template = config.templates[menuCard.period];
                const result = await appendTemplateToDiary({
                    docId: menuCard.docId,
                    period: menuCard.period,
                    template,
                    context: menuCard.templateContext,
                });
                if (result.ok && result.skipped) {
                    if (result.reason === "marker_exists") {
                        showMessage("检测到已有完成标记，已跳过重复补充", 3000);
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
                } else {
                    if (result.reason === "empty_template") {
                        showMessage("模板为空，无法补充", 3000);
                    } else if (result.reason === "append_failed") {
                        showMessage("补充模板失败，请稍后重试", 3000);
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
                const result = await toggleCompletionMarker({
                    docId: menuCard.docId,
                    period: menuCard.period,
                    completed: true,
                });
                if (result.ok && result.skipped) {
                    showMessage("当前周期已是完成状态", 3000);
                } else if (result.ok) {
                    showMessage("已标记完成", 3000);
                } else if (result.reason === "marker_not_found") {
                    showMessage("当前日记缺少完成标记，请先补充模板", 4000);
                } else {
                    showMessage("标记完成失败，请稍后重试", 4000);
                }
                await loadAndBuildCards();
            }
        } else if (action === "uncomplete") {
            if (!menuCard || !menuCard.docId) {
                showMessage("未找到对应日记", 3000);
            } else {
                const result = await toggleCompletionMarker({
                    docId: menuCard.docId,
                    period: menuCard.period,
                    completed: false,
                });
                if (result.ok && result.skipped) {
                    showMessage("当前周期已是未完成状态", 3000);
                } else if (result.ok) {
                    showMessage("已取消完成", 3000);
                } else if (result.reason === "marker_not_found") {
                    showMessage("当前日记缺少完成标记，请先补充模板", 4000);
                } else {
                    showMessage("取消完成失败，请稍后重试", 4000);
                }
                await loadAndBuildCards();
            }
        } else if (action === "skip") {
            if (!menuCard || !menuCard.docId) {
                showMessage("未找到对应日记", 3000);
            } else {
                const result = await skipPeriod({
                    docId: menuCard.docId,
                    period: menuCard.period,
                });
                if (result.ok && result.skipped) {
                    showMessage("当前周期已跳过", 3000);
                } else if (result.ok) {
                    showMessage("已跳过本周期", 3000);
                } else if (result.reason === "marker_not_found") {
                    showMessage("当前日记缺少完成标记，请先补充模板", 4000);
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
            const result = await restoreSkippedPeriod({
                docId: currentCard.docId,
                period: currentCard.period,
                mode,
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
        loadAndBuildCards();
    });

    onDestroy(() => {
        removeBodyMenu();
    });
</script>

<div class="enhanced-diary-container">
    <div class="enhanced-diary-header">
        <span class="enhanced-diary-title">强化日记</span>
        <button
            class="enhanced-diary-open-button"
            type="button"
            onclick={openTodayDiary}
            disabled={actionBusy}
        >
            打开今日日记
        </button>
        <button
            class="enhanced-diary-open-button"
            type="button"
            onclick={openWorkspace}
        >
            查看工作台
        </button>
    </div>

    <div class="enhanced-diary-quick-actions">
        <button type="button" onclick={openNewTaskDialog} disabled={actionBusy}>
            新建任务
        </button>
        <button type="button" onclick={openQuickRecordDialog} disabled={actionBusy}>
            快速记录
        </button>
    </div>

    {#if todayWorkspaceSummary}
        <div class="enhanced-diary-summary">
            <div>
                <span class="summary-label">今日任务</span>
                <strong>{todayWorkspaceSummary.newTaskCount + todayWorkspaceSummary.migratedTaskCount}</strong>
            </div>
            <div>
                <span class="summary-label">快速记录</span>
                <strong>{todayWorkspaceSummary.quickRecordCount}</strong>
            </div>
            <div>
                <span class="summary-label">项目推进</span>
                <strong>{todayWorkspaceSummary.projectCount}</strong>
            </div>
            <div>
                <span class="summary-label">模板</span>
                <strong>{todayWorkspaceSummary.templateValid ? "完整" : "缺失"}</strong>
            </div>
        </div>
        {#if !todayWorkspaceSummary.templateValid}
            <div class="enhanced-diary-warning">
                缺少 {todayWorkspaceSummary.missing.slice(0, 3).join("、")}
                {todayWorkspaceSummary.missing.length > 3 ? " 等区块" : ""}
            </div>
        {/if}
    {:else if !todayDiaryExists}
        <div class="enhanced-diary-empty">
            今日还没有日记，创建后可补充强化日记模板。
        </div>
    {/if}

    <div class="cards-grid">
        {#each cards as card}
            <div
                class="diary-card"
                role="button"
                tabindex="0"
                onclick={(e) => handleCardClick(card, e)}
                onkeydown={(e) => handleCardKeydown(card, e)}
            >
                <div class="card-header">
                    <span class="card-title">{card.title}</span>
                    <span class="card-status status-{card.status}"
                        >{card.statusLabel}</span
                    >
                </div>
                <div class="card-date">{card.dateOrRange}</div>
                {#if card.countdown}
                    <div class="card-countdown">⏰ {card.countdown}</div>
                {/if}
                <div class="card-action">{card.nextAction}</div>
            </div>
        {/each}
    </div>
</div>

<style>
    .enhanced-diary-container {
        width: 100%;
        height: 100%;
        min-height: 0;
        box-sizing: border-box;
        background: transparent;
        border-radius: 8px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior: contain;
        color: var(--b3-theme-on-background);
    }

    .enhanced-diary-header {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
    }

    .enhanced-diary-title {
        grid-column: 1 / -1;
        display: block;
        min-width: 0;
        margin: 0 3rem 4px;
        padding-bottom: 0.3rem;
        border-bottom: 1px solid var(--b3-border-color);
        font-size: 18px;
        font-weight: 600;
        line-height: 1.2;
        text-align: center;
        color: var(--b3-theme-on-background);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .enhanced-diary-open-button {
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        font-size: 12px;
        padding: 7px 10px;
        cursor: pointer;
        min-width: 0;
        min-height: 32px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .enhanced-diary-open-button:hover {
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
    }

    .enhanced-diary-open-button:disabled {
        cursor: not-allowed;
        opacity: 0.6;
    }

    .enhanced-diary-quick-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 12px;
    }

    .enhanced-diary-quick-actions button {
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        font-size: 13px;
        padding: 8px 10px;
        cursor: pointer;
    }

    .enhanced-diary-quick-actions button:hover {
        border-color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, transparent);
    }

    .enhanced-diary-quick-actions button:disabled {
        cursor: not-allowed;
        opacity: 0.6;
    }

    .enhanced-diary-summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
        gap: 8px;
        margin-bottom: 10px;
    }

    .enhanced-diary-summary > div {
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
        padding: 8px;
        min-width: 0;
    }

    .summary-label {
        display: block;
        color: var(--b3-theme-on-surface);
        font-size: 11px;
        opacity: 0.65;
        margin-bottom: 3px;
    }

    .enhanced-diary-summary strong {
        color: var(--b3-theme-on-surface);
        font-size: 14px;
        font-weight: 600;
    }

    .enhanced-diary-warning,
    .enhanced-diary-empty {
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        font-size: 12px;
        line-height: 1.5;
        padding: 8px 10px;
        margin-bottom: 10px;
    }

    .enhanced-diary-warning {
        border-color: rgba(255, 165, 0, 0.45);
        color: #b87300;
    }

    .cards-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 10px;
        padding-bottom: 2px;
    }

    .diary-card {
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        padding: 12px;
        cursor: pointer;
        transition:
            border-color 0.15s,
            box-shadow 0.15s;
    }

    .diary-card:hover {
        border-color: var(--b3-theme-primary);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
    }

    .card-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
    }

    .card-status {
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 3px;
        font-weight: 500;
    }

    .status-not_due {
        background: rgba(0, 128, 255, 0.1);
        color: #0080ff;
    }

    .status-not_created {
        background: rgba(128, 128, 128, 0.1);
        color: #888;
    }

    .status-missing_template {
        background: rgba(255, 165, 0, 0.1);
        color: #ffa500;
    }

    .status-pending {
        background: rgba(255, 193, 7, 0.1);
        color: #e6a800;
    }

    .status-completed {
        background: rgba(40, 167, 69, 0.1);
        color: #28a745;
    }

    .status-overdue {
        background: rgba(220, 53, 69, 0.1);
        color: #dc3545;
    }

    .status-skipped {
        background: rgba(108, 117, 125, 0.1);
        color: #6c757d;
    }

    .card-date {
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.7;
        margin-bottom: 4px;
    }

    .card-countdown {
        font-size: 12px;
        color: var(--b3-theme-primary);
        margin-bottom: 4px;
    }

    .card-action {
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.6;
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

    @media (max-width: 480px) {
        .enhanced-diary-header {
            align-items: stretch;
            grid-template-columns: 1fr;
            gap: 8px;
        }

        .enhanced-diary-title {
            margin-inline: 2.4rem;
        }

        .enhanced-diary-quick-actions,
        .enhanced-diary-summary,
        :global(.enhanced-diary-action-row) {
            grid-template-columns: 1fr;
        }

        .cards-grid {
            grid-template-columns: 1fr;
        }
    }
</style>
