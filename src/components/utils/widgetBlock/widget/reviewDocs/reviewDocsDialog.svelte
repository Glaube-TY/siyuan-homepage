<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import { getBlockAttrs } from "@/api";
    import { resolveDatabaseIdFromExistingWidgets } from "../sharedDatabaseId";
    import {
        getReviewTargetInfo,
        markReviewTarget,
        parseReviewAttrsFromBlockAttrs,
        updateReviewTarget,
    } from "./reviewDocs";
    import {
        DEFAULT_REVIEW_INTERVALS_TEXT,
        addDaysFromToday,
        parseIntervalsText,
        toLocalDateString,
    } from "./reviewDocsSchedule";
    import type { ReviewPlanType, ReviewPriority, ReviewTargetInfo, ReviewTargetType } from "./reviewDocsTypes";

    interface Props {
        plugin: any;
        targetId: string;
        targetType: ReviewTargetType;
        mode?: "create" | "edit";
        databaseId?: string;
        defaultIntervalsText?: string;
        close: () => void;
        onSaved?: () => void;
    }

    let {
        plugin,
        targetId,
        targetType,
        mode = "create",
        databaseId = "",
        defaultIntervalsText = DEFAULT_REVIEW_INTERVALS_TEXT,
        close,
        onSaved = () => {},
    }: Props = $props();

    let isLoading = $state(true);
    let isSaving = $state(false);
    let targetInfo = $state<ReviewTargetInfo | null>(null);
    let effectiveDatabaseId = $state("");
    let nextDate = $state(toLocalDateString());
    let plan = $state<Exclude<ReviewPlanType, "">>("manual");
    let intervalsText = $state(DEFAULT_REVIEW_INTERVALS_TEXT);
    let category = $state("");
    let priority = $state<Exclude<ReviewPriority, "">>("medium");
    let note = $state("");

    const advancedEnabled = $derived(Boolean(plugin?.ADVANCED));

    onMount(async () => {
        try {
            effectiveDatabaseId = databaseId;
            intervalsText = defaultIntervalsText || DEFAULT_REVIEW_INTERVALS_TEXT;
            targetInfo = await getReviewTargetInfo(targetId, targetType);
            const attrs = parseReviewAttrsFromBlockAttrs(await getBlockAttrs(targetId));
            if (attrs) {
                nextDate = attrs.nextDate || nextDate;
                plan = attrs.plan || "manual";
                intervalsText = attrs.intervals.length > 0
                    ? attrs.intervals.join(",")
                    : intervalsText;
                category = attrs.category || "";
                priority = attrs.priority || "medium";
                note = attrs.note || "";
            }

            if (!effectiveDatabaseId?.trim()) {
                const resolved = await resolveDatabaseIdFromExistingWidgets(
                    plugin,
                    "reviewDocs",
                    "",
                    { type: "reviewDocs", data: {} }
                );
                effectiveDatabaseId = resolved.databaseId || "";
            }
        } catch (error) {
            showMessage(error instanceof Error ? error.message : "读取复习目标失败", 4000);
        } finally {
            isLoading = false;
        }
    });

    function setQuickDate(days: number) {
        nextDate = addDaysFromToday(days);
    }

    async function saveReviewPlan() {
        if (!advancedEnabled) {
            showMessage("复习文档为高级会员专属功能", 3000);
            return;
        }
        if (!nextDate) {
            showMessage("请选择复习日期", 3000);
            return;
        }

        let intervals: number[] = [];
        try {
            intervals = plan === "manual" ? [] : parseIntervalsText(intervalsText);
        } catch (error) {
            showMessage(error instanceof Error ? error.message : "间隔配置格式错误", 4000);
            return;
        }

        isSaving = true;
        try {
            const input = {
                nextDate,
                note,
                category,
                priority,
                plan,
                intervals,
            };
            const result = mode === "edit"
                ? await updateReviewTarget({
                    targetId,
                    targetType,
                    databaseId: effectiveDatabaseId,
                    input,
                })
                : await markReviewTarget({
                    targetId,
                    targetType,
                    databaseId: effectiveDatabaseId,
                    input,
                });

            showMessage(result.logWarning ? `${result.message}，但日志记录失败：${result.logWarning}` : result.message, 4000);
            onSaved();
            close();
        } catch (error) {
            showMessage(error instanceof Error ? error.message : "保存复习计划失败", 4000);
        } finally {
            isSaving = false;
        }
    }
</script>

<div class="review-docs-dialog">
    <div class="dialog-header">
        {#if targetInfo}
            <p class="dialog-target-info">{targetInfo.type === "doc" ? "文档" : "块"} · {targetInfo.title}</p>
        {/if}
    </div>

    {#if !advancedEnabled}
        <div class="lock-panel">
            复习文档为高级会员专属功能，当前账号不能写入复习属性。
        </div>
    {:else if isLoading}
        <div class="loading">加载中...</div>
    {:else}
        <div class="form-grid">
            <label class="field">
                <span>复习日期</span>
                <input type="date" bind:value={nextDate} />
            </label>

            <div class="quick-dates" aria-label="快捷日期">
                <button type="button" onclick={() => setQuickDate(0)}>今天</button>
                <button type="button" onclick={() => setQuickDate(1)}>明天</button>
                <button type="button" onclick={() => setQuickDate(3)}>三天后</button>
                <button type="button" onclick={() => setQuickDate(7)}>一周后</button>
            </div>

            <label class="field">
                <span>复习计划</span>
                <select bind:value={plan}>
                    <option value="manual">手动计划</option>
                    <option value="ebbinghaus">艾宾浩斯</option>
                    <option value="custom">自定义间隔</option>
                </select>
            </label>

            {#if plan !== "manual"}
                <label class="field">
                    <span>间隔天数</span>
                    <input type="text" bind:value={intervalsText} placeholder="0,1,2,4,7,15,30,60" />
                </label>
            {/if}

            <label class="field">
                <span>分类</span>
                <input type="text" bind:value={category} placeholder="课程、论文、项目..." />
            </label>

            <label class="field">
                <span>优先级</span>
                <select bind:value={priority}>
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                </select>
            </label>

            <label class="field field-full">
                <span>备注</span>
                <textarea bind:value={note} rows="4" placeholder="这次复习需要重点看的内容"></textarea>
            </label>
        </div>
    {/if}

    <div class="dialog-actions">
        <button type="button" class="secondary" onclick={close}>取消</button>
        <button type="button" class="primary" disabled={isSaving || isLoading || !advancedEnabled} onclick={saveReviewPlan}>
            {isSaving ? "保存中..." : "保存"}
        </button>
    </div>
</div>

<style lang="scss">
    .review-docs-dialog {
        display: flex;
        flex-direction: column;
        gap: 14px;
        width: 100%;
        max-width: none;
        box-sizing: border-box;
        padding: 16px;
        color: var(--b3-theme-on-surface, #222);

        .dialog-header {
            display: flex;
            justify-content: flex-start;
            gap: 12px;
            border-bottom: 1px solid var(--b3-border-color, #e5e7eb);
            padding-bottom: 10px;
        }

        .dialog-target-info {
            margin: 0;
            font-size: 13px;
            opacity: 0.78;
            line-height: 1.5;
        }

        .lock-panel,
        .loading {
            padding: 18px;
            border: 1px dashed var(--b3-border-color, #d1d5db);
            border-radius: 8px;
            background: var(--b3-theme-surface, #fff);
            font-size: 13px;
            line-height: 1.6;
        }

        .form-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
        }

        .field {
            display: flex;
            flex-direction: column;
            gap: 6px;
            min-width: 0;
        }

        .field-full {
            grid-column: 1 / -1;
        }

        .field span {
            font-size: 12px;
            font-weight: 600;
            opacity: 0.78;
        }

        input,
        select,
        textarea {
            width: 100%;
            min-width: 0;
            box-sizing: border-box;
            border: 1px solid var(--b3-border-color, #d1d5db);
            border-radius: 6px;
            background: var(--b3-theme-background, #fff);
            color: var(--b3-theme-on-surface, #222);
            font-size: 13px;
            padding: 7px 9px;
            outline: none;
        }

        textarea {
            resize: vertical;
            min-height: 88px;
        }

        .quick-dates {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 6px;
            align-self: end;
        }

        button {
            border: 1px solid var(--b3-border-color, #d1d5db);
            border-radius: 6px;
            background: var(--b3-theme-surface, #fff);
            color: var(--b3-theme-on-surface, #222);
            cursor: pointer;
            font-size: 13px;
            padding: 7px 10px;
        }

        button:hover:not(:disabled) {
            background: var(--b3-list-hover, #f3f4f6);
        }

        button:disabled {
            opacity: 0.55;
            cursor: not-allowed;
        }

        .dialog-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            border-top: 1px solid var(--b3-border-color, #e5e7eb);
            padding-top: 12px;
        }

        .primary {
            color: var(--b3-theme-on-primary, #fff);
            background: var(--b3-theme-primary, #3578e5);
            border-color: var(--b3-theme-primary, #3578e5);
        }

        .secondary {
            background: transparent;
        }

        @media (max-width: 640px) {
            .form-grid {
                grid-template-columns: 1fr;
            }

            .quick-dates {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
        }
    }
</style>
