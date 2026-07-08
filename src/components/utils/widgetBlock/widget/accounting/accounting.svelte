<script lang="ts">
    import { onMount, onDestroy, mount } from "svelte";
    import { svelteDialog } from "@/libs/dialog";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
    import AccountingIcon from "./AccountingIcon.svelte";
    import AccountingDetailDialog from "./AccountingDetailDialog.svelte";
    import {
        formatAccountingCurrency,
        summarizeAccounting,
    } from "./accountingAnalytics";
    import {
        loadAccountingRecordsForYear,
        loadRecentRecords,
    } from "./accountingData";
    import { loadAccountingAccounts } from "./accountingAccountData";
    import { normalizeAccountingWidgetConfig } from "./accountingConstants";
    import { loadAccountingSettings, type AccountingAppSettings } from "./accountingSettings";
    import type {
        AccountingAccount,
        AccountingRecord,
        AccountingStoreStatus,
    } from "./accountingTypes";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
    }

    type DetailTab = "overview" | "transactions" | "record" | "analytics" | "settings" | "assets";

    let { plugin, contentTypeJson = "{}" }: Props = $props();

    let parsedContent = $derived(parseContent(contentTypeJson));
    let config = $derived(normalizeAccountingWidgetConfig(parsedContent.data));
    let advancedEnabled = $state(false);
    let isLoading = $state(true);
    let currentYearRecords = $state<AccountingRecord[]>([]);
    let recentRecords = $state<AccountingRecord[]>([]);
    let status = $state<AccountingStoreStatus>({
        ok: false,
        missingFields: [],
        message: "加载中...",
    });
    let appSettings = $state<AccountingAppSettings | null>(null);
    let accounts = $state<AccountingAccount[]>([]);
    let detailDialogRef: { close: () => void } | null = null;

    let effectiveBudget = $derived(appSettings?.monthlyBudget ?? 0);
    let effectiveCurrency = $derived(appSettings?.defaultCurrency || "CNY");

    let summary = $derived(summarizeAccounting(currentYearRecords, {
        period: "month",
        monthlyBudget: effectiveBudget,
        recentLimit: config.homeRecentLimit,
        recentRecords,
    }));

    onMount(async () => {
        advancedEnabled = Boolean(plugin?.ADVANCED);
        if (!advancedEnabled) {
            isLoading = false;
            return;
        }

        // Load independent settings
        appSettings = await loadAccountingSettings(plugin, parsedContent);

        await refreshRecords();
        await refreshAccounts();
    });

    onDestroy(() => {
        if (detailDialogRef) {
            detailDialogRef.close();
            detailDialogRef = null;
        }
    });

    function parseContent(value: string): Record<string, any> {
        try {
            return JSON.parse(value || "{}");
        } catch {
            return {};
        }
    }

    async function refreshRecords(): Promise<void> {
        isLoading = true;
        try {
            const currentYear = new Date().getFullYear();
            const currentYearResult = await loadAccountingRecordsForYear(plugin, currentYear);
            const recentResult = await loadRecentRecords(plugin, config.homeRecentLimit);
            currentYearRecords = currentYearResult.records;
            recentRecords = recentResult.records;
            status = currentYearResult.status;
        } catch (error) {
            status = {
                ok: false,
                missingFields: [],
                message: error instanceof Error ? error.message : "加载记账数据失败",
            };
        } finally {
            isLoading = false;
        }
    }

    async function refreshAccounts(): Promise<void> {
        try {
            const result = await loadAccountingAccounts(plugin);
            accounts = result.accounts;
        } catch {
            accounts = [];
        }
    }

    async function handleSettingsChanged(): Promise<void> {
        if (!plugin || !parsedContent) return;
        appSettings = await loadAccountingSettings(plugin, parsedContent);
        await refreshRecords();
        await refreshAccounts();
    }

    function openDetail(tab: DetailTab = "overview", recordId = ""): void {
        if (detailDialogRef) {
            detailDialogRef.close();
            detailDialogRef = null;
        }
        try {
            const dialog = svelteDialog({
                width: "min(980px, calc(100vw - 32px))",
                height: "min(760px, calc(100vh - 64px))",
                title: "",
                constructor: (containerEl: HTMLElement) => {
                    return mount(AccountingDetailDialog, {
                        target: containerEl,
                        props: {
                            config,
                            plugin,
                            appSettings,
                            accounts,
                            initialTab: tab,
                            initialRecordId: recordId,
                            onClose: () => dialog.close(),
                            onChanged: refreshRecords,
                            onSettingsChanged: () => { void handleSettingsChanged(); },
                        },
                    });
                },
                callback: () => {
                    detailDialogRef = null;
                },
            });
            detailDialogRef = dialog;
            dialog.dialog.element.classList.add("accounting-detail-dialog-host");
        } catch {
            detailDialogRef = null;
            status = { ...status, message: "打开记账详情失败" };
        }
    }
</script>

<div class="accounting-widget">
    {#if !advancedEnabled}
        <div class="content-not-advanced">
            <AdvancedFeatureLock
                title="记账"
                subtitle="记录个人收支流水，查看预算进度和分类趋势。"
                icon="database"
                features={[
                    "收支流水新增、编辑和归档",
                    "本月收入、支出、结余和预算进度",
                    "趋势图与分类支出分析"
                ]}
                highlights={["个人账本", "预算进度", "财务分析"]}
                compact
            />
        </div>
    {:else if isLoading}
        <div class="state-text">加载记账数据...</div>
    {:else if !status.ok}
        <div class="setup-state">
            <AccountingIcon name="wallet" size={28} />
            <strong>{status.message}</strong>
            {#if status.missingFields.length > 0}
                <span>缺少字段：{status.missingFields.join("、")}</span>
            {/if}
        </div>
    {:else}
        <section class="accounting-card">
            <header class="card-header">
                <div class="title-wrap">
                    <AccountingIcon name="wallet" size={18} />
                    <h3>{config.title || "记账"}</h3>
                </div>
                <button type="button" onclick={() => openDetail("overview")} title="打开账本">
                    <AccountingIcon name="open" size={15} />
                </button>
            </header>

            <button type="button" class="card-body" onclick={() => openDetail("overview")}>
                <div class="balance-block">
                    <span>本月结余</span>
                    <strong>{formatAccountingCurrency(summary.balance, effectiveCurrency)}</strong>
                </div>

                <div class="mini-summary">
                    <span class="income">
                        <small>收入</small>
                        <b>{formatAccountingCurrency(summary.incomeTotal, effectiveCurrency)}</b>
                    </span>
                    <span class="expense">
                        <small>支出</small>
                        <b>{formatAccountingCurrency(summary.expenseTotal, effectiveCurrency)}</b>
                    </span>
                    <span class="expense">
                        <small>今日支出</small>
                        <b>{formatAccountingCurrency(summary.todayExpense, effectiveCurrency)}</b>
                    </span>
                </div>
            </button>

            <div class="card-actions">
                <button type="button" onclick={() => openDetail("record")}>
                    <AccountingIcon name="plus" size={15} />
                    <span>记一笔</span>
                </button>
                <button type="button" class="ghost" onclick={() => openDetail("transactions")}>
                    <AccountingIcon name="records" size={15} />
                    <span>打开账本</span>
                </button>
            </div>

            {#if config.showRecentRecords}
                <div class="recent-section">
                    <div class="section-title">最近流水</div>
                    {#if summary.recentRecords.length === 0}
                        <div class="empty-recent">暂无流水，点击“记一笔”开始记录。</div>
                    {:else}
                        <div class="recent-list">
                            {#each summary.recentRecords as record (record.recordId)}
                                <button type="button" class="recent-row" onclick={() => openDetail("record", record.recordId)}>
                                    <span class="category">{record.categoryPrimary || "其他"}</span>
                                    <span class="record-title">{record.title}</span>
                                    <span class="amount" class:income={record.direction === "income"} class:expense={record.direction === "expense"}>
                                        {record.direction === "income" ? "+" : record.direction === "expense" ? "-" : ""}{formatAccountingCurrency(record.amount, record.currency || effectiveCurrency)}
                                    </span>
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}
        </section>
    {/if}
</div>

<style lang="scss">
    .accounting-widget {
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        box-sizing: border-box;
        padding: 0.75rem;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        color: var(--b3-theme-on-background);
        background: transparent;
    }

    .content-not-advanced {
        width: 100%;
        height: 100%;
        min-height: 0;
        overflow: hidden;
        padding: 8px;
        box-sizing: border-box;
    }

    .state-text,
    .setup-state {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.45rem;
        text-align: center;
        color: var(--b3-theme-on-surface-light);
    }

    .setup-state :global(svg) {
        color: var(--b3-theme-primary);
    }

    .setup-state strong {
        color: var(--b3-theme-on-background);
    }

    .accounting-card {
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        overflow: hidden;
    }

    .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.65rem;
    }

    .title-wrap {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 0.4rem;
        color: var(--b3-theme-primary);
    }

    h3 {
        margin: 0;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--b3-theme-on-background);
        font-size: 1rem;
        line-height: 1.3;
    }

    button {
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: transparent;
        color: var(--b3-theme-on-background);
        cursor: pointer;
        font: inherit;
    }

    button:hover {
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
    }

    .card-header button {
        width: 1.9rem;
        height: 1.9rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
    }

    .card-body {
        width: 100%;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        padding: 0.72rem;
        text-align: left;
        border-color: color-mix(in srgb, var(--b3-theme-primary) 20%, var(--b3-border-color));
        background: color-mix(in srgb, var(--b3-theme-primary) 7%, transparent);
    }

    .balance-block {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.18rem;
    }

    .balance-block span,
    .mini-summary small,
    .section-title {
        color: var(--b3-theme-on-surface-light);
        font-size: 0.74rem;
    }

    .balance-block strong {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--b3-theme-primary);
        font-size: 1.45rem;
        line-height: 1.2;
    }

    .mini-summary {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.42rem;
    }

    .mini-summary span {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.16rem;
        padding: 0.42rem;
        border-radius: 6px;
        background: color-mix(in srgb, var(--b3-theme-background) 68%, transparent);
    }

    .mini-summary b {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.86rem;
    }

    .income b,
    .amount.income {
        color: #1f8f55;
    }

    .expense b,
    .amount.expense {
        color: #c9553f;
    }

    .card-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.45rem;
    }

    .card-actions button {
        min-width: 0;
        min-height: 2rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.35rem;
        padding: 0.34rem 0.45rem;
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
        border-color: var(--b3-theme-primary);
        font-weight: 650;
    }

    .card-actions button.ghost {
        background: transparent;
        color: var(--b3-theme-primary);
    }

    .recent-section {
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 0.38rem;
        overflow: hidden;
    }

    .recent-list {
        min-height: 0;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 0.32rem;
        padding-right: 0.12rem;
    }

    .recent-row {
        width: 100%;
        min-width: 0;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.42rem;
        padding: 0.38rem 0.45rem;
        text-align: left;
        background: color-mix(in srgb, var(--b3-theme-surface-light) 68%, transparent);
    }

    .category {
        max-width: 4.5rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        padding: 0.14rem 0.36rem;
        border-radius: 999px;
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
        color: var(--b3-theme-primary);
        font-size: 0.7rem;
    }

    .record-title {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 650;
    }

    .amount {
        font-weight: 700;
        white-space: nowrap;
        font-size: 0.78rem;
    }

    .empty-recent {
        flex: 1;
        min-height: 3rem;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--b3-theme-on-surface-light);
        text-align: center;
        font-size: 0.78rem;
    }
</style>

