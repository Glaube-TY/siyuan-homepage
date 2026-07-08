<script lang="ts">
    import { onMount } from "svelte";
    import { confirmDialogBoolean, safeConfirmContent } from "@/libs/dialog";
    import AccountingIcon from "./AccountingIcon.svelte";
    import type { AccountingIconName } from "./accountingIconTypes";
    import AccountingDashboard from "./AccountingDashboard.svelte";
    import AccountingRecordForm from "./AccountingRecordForm.svelte";
    import AccountingRecordList from "./AccountingRecordList.svelte";
    import AccountingCharts from "./AccountingCharts.svelte";
    import AccountingSettingsPanel from "./AccountingSettingsPanel.svelte";
    import AccountingAssetsPanel from "./AccountingAssetsPanel.svelte";
    import type { AccountingAppSettings } from "./accountingSettings";
    import { loadAccountingSettings } from "./accountingSettings";
    import { loadAccountingAccounts } from "./accountingAccountData";
    import {
        formatAccountingCurrency,
        summarizeAccounting,
    } from "./accountingAnalytics";
    import {
        archiveAccountingRecord,
        findAccountingRecordById,
        loadAccountingRecordsAll,
        loadAccountingRecordsForYear,
        loadAccountingRecordYears,
        saveAccountingRecord,
    } from "./accountingData";
    import type {
        AccountingAccount,
        AccountingFilter,
        AccountingPeriod,
        AccountingRecord,
        AccountingRecordInput,
        AccountingStoreStatus,
        AccountingWidgetConfig,
    } from "./accountingTypes";

    type DialogTab = "overview" | "transactions" | "record" | "analytics" | "settings" | "assets";

    interface Props {
        config: AccountingWidgetConfig;
        plugin?: any;
        appSettings?: AccountingAppSettings | null;
        accounts?: AccountingAccount[];
        initialTab?: DialogTab;
        initialRecordId?: string;
        onClose: () => void;
        onChanged?: () => void | Promise<void>;
        onSettingsChanged?: () => void;
    }

    let {
        config,
        plugin,
        appSettings = null,
        accounts = [],
        initialTab = "overview",
        initialRecordId = "",
        onClose,
        onChanged,
        onSettingsChanged,
    }: Props = $props();

    // Local mirrors — refreshed internally (set in onMount)
    let localAppSettings = $state<AccountingAppSettings | null>(null);
    let localAccounts = $state<AccountingAccount[]>([]);

    let effectiveCurrency = $derived(localAppSettings?.defaultCurrency || "CNY");
    let effectiveBudget = $derived(localAppSettings?.monthlyBudget ?? 0);
    let effectivePeriod = $derived(localAppSettings?.defaultPeriod || "month");

    let activeTab = $state<DialogTab>("overview");
    let dialogBodyEl = $state<HTMLDivElement | null>(null);
    let records = $state<AccountingRecord[]>([]);
    let status = $state<AccountingStoreStatus>({
        ok: false,
        missingFields: [],
        message: "加载中...",
    });
    let isLoading = $state(true);
    let isSaving = $state(false);
    let actionError = $state("");
    let editingRecord = $state<AccountingRecord | null>(null);
    let listFilter = $state<AccountingFilter>({ direction: "all", month: getCurrentYearMonth() });
    let period = $state<AccountingPeriod>("month");
    let initialEditApplied = false;
    let availableYears = $state<number[]>([]);
    let selectedYear = $state<number>(new Date().getFullYear());
    let assetBalanceRecords = $state<AccountingRecord[]>([]);

    let summary = $derived(summarizeAccounting(records, {
        period: effectivePeriod,
        monthlyBudget: effectiveBudget,
        recentLimit: config.homeRecentLimit,
    }));

    const tabs: Array<{ key: DialogTab; label: string; icon: AccountingIconName }> = [
        { key: "overview", label: "概览", icon: "wallet" },
        { key: "transactions", label: "流水", icon: "records" },
        { key: "record", label: "记一笔", icon: "plus" },
        { key: "analytics", label: "分析", icon: "chartColumn" },
        { key: "settings", label: "设置", icon: "settings" },
        { key: "assets", label: "资产", icon: "landmark" },
    ];

    onMount(() => {
        activeTab = initialRecordId ? "record" : initialTab;
        localAppSettings = appSettings;
        localAccounts = accounts;
        period = localAppSettings?.defaultPeriod || "month";
        void initializeYearsAndRecords();
    });

    function getCurrentYearMonth(): string {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }

    function getMonthForYear(year: number): string {
        const month = listFilter.month?.split("-")[1] || getCurrentYearMonth().split("-")[1];
        return `${year}-${month}`;
    }

    async function initializeYearsAndRecords(): Promise<void> {
        if (!plugin) return;
        const years = await loadAccountingRecordYears(plugin);
        availableYears = years;
        const currentYear = new Date().getFullYear();
        if (years.length === 0) {
            selectedYear = currentYear;
        } else if (years.includes(currentYear)) {
            selectedYear = currentYear;
        } else {
            selectedYear = years[0];
        }
        listFilter = { ...listFilter, month: getMonthForYear(selectedYear) };
        await refreshRecordsForYear(selectedYear);
        await refreshAssetBalanceRecords();
        if (initialRecordId && !initialEditApplied) {
            await openRecordAcrossYears(initialRecordId);
        }
    }

    async function refreshAssets(): Promise<void> {
        if (!plugin) {
            localAccounts = [];
            return;
        }
        try {
            const result = await loadAccountingAccounts(plugin);
            localAccounts = result.accounts;
        } catch {
            localAccounts = [];
        }
    }

    async function refreshSettingsAndAssets(): Promise<void> {
        if (!plugin) return;
        try {
            const settings = await loadAccountingSettings(plugin);
            localAppSettings = settings;
            await refreshRecordsForYear(selectedYear);
            await refreshAssets();
            await refreshAssetBalanceRecords();
        } catch {
            // Keep existing state on error
        }
    }

    async function refreshRecordsForYear(year: number): Promise<void> {
        if (!plugin) return;
        isLoading = true;
        try {
            actionError = "";
            selectedYear = year;
            const result = await loadAccountingRecordsForYear(plugin, year);
            records = result.records;
            status = result.status;
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

    async function refreshAssetBalanceRecords(): Promise<void> {
        if (!plugin) {
            assetBalanceRecords = records;
            return;
        }
        try {
            const result = await loadAccountingRecordsAll(plugin);
            assetBalanceRecords = result.records;
        } catch {
            assetBalanceRecords = records;
        }
    }

    async function openRecordAcrossYears(recordId: string): Promise<void> {
        if (!plugin) return;
        const localMatch = records.find((r) => r.recordId === recordId);
        if (localMatch) {
            editingRecord = localMatch;
            activeTab = "record";
            initialEditApplied = true;
            return;
        }
        const record = await findAccountingRecordById(plugin, recordId);
        if (record) {
            const year = parseInt(record.date.slice(0, 4), 10);
            if (Number.isFinite(year)) {
                selectedYear = year;
                await refreshRecordsForYear(year);
            }
            editingRecord = record;
            activeTab = "record";
        }
        initialEditApplied = true;
    }

    async function handleMonthChange(month: string | undefined): Promise<void> {
        if (!month) {
            await refreshRecordsForYear(selectedYear);
            return;
        }
        listFilter = { ...listFilter, month };
    }

    function openCreateForm(): void {
        editingRecord = null;
        activeTab = "record";
    }

    function openEditForm(record: AccountingRecord): void {
        editingRecord = record;
        activeTab = "record";
    }

    async function handleSaveRecord(input: AccountingRecordInput): Promise<void> {
        if (!plugin) return;
        isSaving = true;
        actionError = "";
        try {
            await saveAccountingRecord(plugin, {
                ...input,
                recordId: editingRecord?.recordId || input.recordId,
                createdAt: editingRecord?.createdAt || input.createdAt,
                currency: input.currency || effectiveCurrency,
            });
            editingRecord = null;
            activeTab = "transactions";
            await refreshRecordsForYear(selectedYear);
            await refreshAssetBalanceRecords();
            await onChanged?.();
        } catch (error) {
            actionError = error instanceof Error ? error.message : "保存记账流水失败";
        } finally {
            isSaving = false;
        }
    }

    async function handleDeleteRecord(record: AccountingRecord): Promise<void> {
        if (!plugin) return;
        const confirmed = await confirmDialogBoolean({
            title: "删除流水",
            content: safeConfirmContent("确定归档流水「", record.title, "」吗？"),
        });
        if (!confirmed) return;

        actionError = "";
        try {
            await archiveAccountingRecord(plugin, record.recordId, record.date);
            if (editingRecord?.recordId === record.recordId) {
                editingRecord = null;
            }
            await refreshRecordsForYear(selectedYear);
            await refreshAssetBalanceRecords();
            await onChanged?.();
        } catch (error) {
            actionError = error instanceof Error ? error.message : "删除流水失败";
        }
    }
</script>

<div class="accounting-dialog" role="dialog" aria-label="记账详情">
        <header class="dialog-header">
            <div class="dialog-title">
                <span class="dialog-icon"><AccountingIcon name="wallet" size={19} /></span>
                <div>
                    <h2>{config.title || "记账"}</h2>
                    <p>{records.length} 条未归档流水 · {formatAccountingCurrency(summary.balance, effectiveCurrency)} 结余</p>
                </div>
            </div>
            <button type="button" class="dialog-close" onclick={onClose} title="关闭">
                <AccountingIcon name="close" size={18} />
            </button>
        </header>

        <div class="dialog-tabs-shell">
            <nav class="dialog-tabs" aria-label="记账页签">
                {#each tabs as tab}
                    <button
                        type="button"
                        class:active={activeTab === tab.key}
                        class:is-primary={tab.key === "record"}
                        onclick={() => {
                            activeTab = tab.key;
                            if (tab.key === "record" && !editingRecord) {
                                editingRecord = null;
                            }
                            // Reset scroll on tab switch
                            if (dialogBodyEl) {
                                requestAnimationFrame(() => { dialogBodyEl!.scrollTop = 0; });
                            }
                        }}
                    >
                        <AccountingIcon name={tab.icon} size={15} />
                        <span>{tab.label}</span>
                    </button>
                {/each}
            </nav>
        </div>

        {#if actionError}
            <div class="dialog-error">{actionError}</div>
        {/if}

        <div class="dialog-body" bind:this={dialogBodyEl}>
            {#if isLoading}
                <div class="dialog-state">加载记账数据...</div>
            {:else if !status.ok}
                <div class="dialog-state error">
                    <strong>{status.message}</strong>
                    {#if status.missingFields.length > 0}
                        <span>缺少字段：{status.missingFields.join("、")}</span>
                    {/if}
                </div>
            {:else if activeTab === "overview"}
                <AccountingDashboard
                    {summary}
                    records={summary.recentRecords}
                    defaultCurrency={effectiveCurrency}
                    monthlyBudget={effectiveBudget}
                    onAdd={openCreateForm}
                    onEdit={openEditForm}
                />
            {:else if activeTab === "transactions"}
                <AccountingRecordList
                    {records}
                    accounts={localAccounts}
                    availableYears={availableYears}
                    selectedYear={selectedYear}
                    bind:filter={listFilter}
                    defaultCurrency={effectiveCurrency}
                    onEdit={openEditForm}
                    onDelete={handleDeleteRecord}
                    onMonthChange={handleMonthChange}
                    onYearChange={async (year) => {
                        listFilter = listFilter.month
                            ? { ...listFilter, month: getMonthForYear(year) }
                            : { ...listFilter };
                        await refreshRecordsForYear(year);
                    }}
                />
            {:else if activeTab === "record"}
                <AccountingRecordForm
                    record={editingRecord}
                    defaultCurrency={effectiveCurrency}
                    submitting={isSaving}
                    appSettings={localAppSettings}
                    accounts={localAccounts}
                    balanceRecords={assetBalanceRecords}
                    onSubmit={handleSaveRecord}
                    onCancel={() => {
                        editingRecord = null;
                        activeTab = "transactions";
                    }}
                />
            {:else if activeTab === "analytics"}
                <div class="analytics-head">
                    <label>
                        <span>统计周期</span>
                        <select bind:value={period}>
                            <option value="month">本月</option>
                            <option value="recent30">近 30 天</option>
                            <option value="year">本年</option>
                        </select>
                    </label>
                    <p>转账记录已保存，但趋势和分类统计默认只统计收入与支出。</p>
                </div>
                <AccountingCharts
                    {records}
                    {period}
                    year={selectedYear}
                    defaultCurrency={effectiveCurrency}
                    onYearChange={async (year) => {
                        await refreshRecordsForYear(year);
                    }}
                />
            {:else if activeTab === "settings"}
                <AccountingSettingsPanel
                    {plugin}
                    appSettings={localAppSettings}
                    onChanged={async () => {
                        await refreshSettingsAndAssets();
                        onSettingsChanged?.();
                    }}
                />
            {:else if activeTab === "assets"}
                <AccountingAssetsPanel
                    {plugin}
                    appSettings={localAppSettings}
                    accounts={localAccounts}
                    records={assetBalanceRecords}
                    onChanged={async () => {
                        await refreshSettingsAndAssets();
                        await refreshAssetBalanceRecords();
                        onSettingsChanged?.();
                    }}
                />
            {/if}
        </div>
</div>

<style lang="scss">
    .accounting-dialog {
        width: 100%;
        height: 100%;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border-radius: 10px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
    }

    .dialog-header {
        flex: 0 0 auto;
        min-height: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.9rem 1rem;
        border-bottom: 1px solid var(--b3-border-color);
    }

    .dialog-title {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 0.7rem;
    }

    .dialog-icon {
        width: 2.25rem;
        height: 2.25rem;
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
        color: var(--b3-theme-primary);
    }

    h2, p { margin: 0; }

    h2 {
        font-size: 1.05rem;
        line-height: 1.35;
    }

    .dialog-title p,
    .analytics-head p {
        margin-top: 0.12rem;
        color: var(--b3-theme-on-surface-light);
        font-size: 0.76rem;
    }

    .dialog-close {
        width: 2rem;
        height: 2rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: transparent;
        color: var(--b3-theme-on-background);
        cursor: pointer;
    }

    .dialog-tabs-shell {
        flex: 0 0 auto;
        min-height: 0;
        overflow: hidden;
        padding: 0.6rem 0.75rem 0;
        background: var(--b3-theme-background);
    }

    .dialog-tabs {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 0;
        padding: 0.35rem;
        border-radius: 10px;
        background: var(--b3-theme-surface);
        overflow: hidden;
        scrollbar-width: none;
        -ms-overflow-style: none;
    }

    .dialog-tabs::-webkit-scrollbar {
        display: none;
    }

    .dialog-tabs button {
        min-width: 0;
        height: 2.05rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.3rem;
        padding: 0.28rem 0.35rem;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--b3-theme-on-surface-light);
        cursor: pointer;
        font: inherit;
        font-size: 0.8rem;
        font-weight: 550;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: all 0.15s;
    }

    .dialog-tabs button:hover {
        color: var(--b3-theme-on-background);
    }

    .dialog-tabs button.active {
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        font-weight: 650;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }

    .dialog-tabs button.is-primary.active {
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
        box-shadow: 0 2px 6px color-mix(in srgb, var(--b3-theme-primary) 40%, transparent);
    }

    .dialog-error {
        flex: 0 0 auto;
        margin: 0.65rem 1rem 0;
        padding: 0.45rem 0.6rem;
        border-radius: 6px;
        background: color-mix(in srgb, var(--b3-theme-error) 12%, transparent);
        color: var(--b3-theme-error);
        font-size: 0.78rem;
    }

    .dialog-body {
        flex: 1 1 0;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 1rem;
        scrollbar-gutter: stable;
        overscroll-behavior: contain;
    }

    .dialog-state {
        min-height: 16rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.45rem;
        color: var(--b3-theme-on-surface-light);
        text-align: center;
    }

    .dialog-state.error strong {
        color: var(--b3-theme-error);
    }

    .analytics-head {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 0.75rem;
        margin-bottom: 0.75rem;
        flex-wrap: wrap;
    }

    .analytics-head label {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        color: var(--b3-theme-on-surface-light);
        font-size: 0.76rem;
    }

    .analytics-head select {
        min-width: 9rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-background);
        padding: 0.38rem 0.45rem;
        font: inherit;
    }

    // ── Dialog host container fixes ──
    :global(.accounting-detail-dialog-host .dialog-content) {
        overflow: hidden;
        min-height: 0;
    }

    :global(.accounting-detail-dialog-host .b3-dialog__container) {
        overflow: hidden;
    }

    // ── Mobile / narrow width ──
    @media (max-width: 640px) {
        .accounting-dialog {
            border-radius: 0;
        }

        .dialog-tabs {
            display: flex;
            overflow-x: auto;
            overflow-y: hidden;
            scrollbar-width: none;
            -ms-overflow-style: none;
        }

        .dialog-tabs::-webkit-scrollbar {
            display: none;
        }

        .dialog-tabs button {
            flex: 0 0 auto;
            min-width: 5.5rem;
        }
    }
</style>
