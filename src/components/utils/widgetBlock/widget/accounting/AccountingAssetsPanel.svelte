<script lang="ts">
    import AccountingIcon from "./AccountingIcon.svelte";
    import { saveAccountingAccount, archiveAccountingAccount, readAccountingAccountBackup } from "./accountingAccountData";
    import type { AccountingAccount, AccountingAccountInput, AccountingRecord } from "./accountingTypes";
    import { CURRENCY_OPTIONS } from "./accountingConstants";
    import { inspectAccountingBalances } from "./accountingBalances";
    import { formatAccountingCurrency } from "./accountingAnalytics";
    import type { AccountingAppSettings } from "./accountingSettings";

    interface Props {
        plugin: any;
        appSettings: AccountingAppSettings | null;
        accounts: AccountingAccount[];
        records?: AccountingRecord[];
        dataError?: string;
        balancesLoading?: boolean;
        onRetry?: () => void | Promise<void>;
        onQuickTransfer?: (account: AccountingAccount, repay?: boolean) => void;
        onChanged?: () => void | Promise<void>;
    }
    let { plugin, appSettings, accounts, records = [], dataError = "", balancesLoading = false, onRetry, onQuickTransfer, onChanged }: Props = $props();
    let saveError = $state("");
    let isAssetSaving = $state(false);
    let editingAsset = $state<AccountingAccount | null>(null);
    let newName = $state("");
    let newCurrency = $state("CNY");
    let newBalance = $state<number | null>(0);
    let newNote = $state("");
    $effect(() => { if (!editingAsset) newCurrency = appSettings?.defaultCurrency || "CNY"; });
    let report = $derived.by(() => {
        try { return { ...inspectAccountingBalances(accounts, records), error: "" }; }
        catch (error) { return { balances: new Map<string, number>(), issues: new Map<string, string>(), unmatched: [] as string[], currencies: [], error: error instanceof Error ? error.message : "账户余额读取失败" }; }
    });
    let readError = $derived(dataError || report.error);
    let activeAccounts = $derived(accounts.filter(a => !a.archived));
    let previewBalance = $derived(editingAsset && newBalance !== null && !report.issues.has(editingAsset.accountId)
        ? (report.balances.get(editingAsset.accountId) ?? editingAsset.openingBalance) - editingAsset.openingBalance + newBalance
        : undefined);
    let closedUnsettled = $derived(accounts.filter(a => a.archived && ((report.balances.get(a.accountId) || 0) !== 0 || report.issues.has(a.accountId))));

    function money(value: number, currency: string): string {
        try { return formatAccountingCurrency(value, currency); }
        catch { return currency + " " + value.toFixed(2); }
    }
    function resetAssetForm(): void {
        editingAsset = null;
        newName = "";
        newCurrency = appSettings?.defaultCurrency || "CNY";
        newBalance = 0;
        newNote = "";
        saveError = "";
    }
    function startEditAsset(acct: AccountingAccount): void {
        editingAsset = acct;
        newName = acct.name;
        newCurrency = acct.currency;
        newNote = acct.note || "";
        newBalance = acct.openingBalance;
        saveError = "";
    }
    async function saveAssetForm(): Promise<void> {
        if (isAssetSaving || readError || balancesLoading) return;
        if (!plugin) { saveError = "插件未就绪"; return; }
        if (!newName.trim()) { saveError = "请输入账户名称"; return; }
        if (newBalance === null || !Number.isFinite(newBalance)) { saveError = "请输入有效的期初余额"; return; }
        isAssetSaving = true; saveError = "";
        const input: AccountingAccountInput = {
            ...(editingAsset || {}), name: newName.trim(), currency: newCurrency,
            openingBalance: newBalance,
            note: newNote.trim(),
        };
        try {
            await saveAccountingAccount(plugin, input, { expectedUpdatedAt: editingAsset?.updatedAt });
            resetAssetForm(); await onChanged?.();
        } catch (error) { saveError = error instanceof Error ? error.message : "保存账户失败"; }
        finally { isAssetSaving = false; }
    }
    async function archiveAsset(account: AccountingAccount): Promise<void> {
        if (!plugin || isAssetSaving || readError || balancesLoading) return;
        isAssetSaving = true; saveError = "";
        try { await archiveAccountingAccount(plugin, account.accountId, { expectedUpdatedAt: account.updatedAt }); await onChanged?.(); }
        catch (error) { saveError = error instanceof Error ? error.message : "关闭账户失败"; }
        finally { isAssetSaving = false; }
    }
    async function restoreAsset(account: AccountingAccount): Promise<void> {
        if (!plugin || isAssetSaving || readError || balancesLoading) return;
        isAssetSaving = true; saveError = "";
        try { await saveAccountingAccount(plugin, { ...account, archived: false }, { expectedUpdatedAt: account.updatedAt }); await onChanged?.(); }
        catch (error) { saveError = error instanceof Error ? error.message : "恢复账户失败"; }
        finally { isAssetSaving = false; }
    }
    async function downloadBackup(account: AccountingAccount): Promise<void> {
        if (!account.balanceBackupPath) return;
        try {
            const snapshot = await readAccountingAccountBackup(plugin, account.balanceBackupPath);
            const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }));
            const anchor = document.createElement("a"); anchor.href = url; anchor.download = "accounting-assets-before-change.json"; anchor.click();
            URL.revokeObjectURL(url);
        } catch (error) { saveError = error instanceof Error ? error.message : "读取调整前快照失败"; }
    }
</script>


<div class="assets-panel">
    {#if saveError}<div class="assets-error" role="alert">{saveError}</div>{/if}
    {#if readError}
        <div class="assets-error" role="alert"><p>{readError}</p><button type="button" onclick={() => onRetry?.()} disabled={balancesLoading}>重新读取账户与流水</button></div>
    {:else if balancesLoading}
        <p role="status">正在计算账户余额…</p>
    {:else}
        {#each report.currencies as totals (totals.currency)}
            <div class="assets-summary" aria-label={totals.currency + " 已启用账户汇总"}>
                <div class="assets-summary-main"><span class="assets-summary-label">净资产 · {totals.currency}</span><strong class="assets-summary-value">{totals.pending ? "待核对" : money(totals.net, totals.currency)}</strong></div>
                <div class="assets-summary-row">
                    <div class="assets-summary-card"><span>总资产</span><strong class="assets-positive">{totals.pending ? "待核对" : money(totals.assets, totals.currency)}</strong></div>
                    <div class="assets-summary-card"><span>总负债</span><strong class="assets-negative">{totals.pending ? "待核对" : money(totals.liabilities, totals.currency)}</strong></div>
                </div>
            </div>
        {/each}
        {#if report.unmatched.length}<p class="assets-note" role="status">有 {report.unmatched.length} 个历史账户引用未匹配，请在导入或账户明细中核对；汇总仅覆盖已关联账户。</p>{/if}
    {/if}
    {#if activeAccounts.length}
        <section class="assets-group">
            <h3>账户</h3>
            <div class="assets-grid">
                {#each activeAccounts as acct (acct.accountId)}
                    {@const balance = report.balances.get(acct.accountId) ?? acct.openingBalance}
                    {@const issue = report.issues.get(acct.accountId)}
                    <div class="asset-card">
                        <div class="asset-card-head">
                            <span class="asset-card-icon"><AccountingIcon name="wallet" size={18} /></span>
                            <strong title={acct.name}>{acct.name}</strong>
                        </div>
                        <div class="asset-card-balance" class:negative={balance < 0}>
                            {readError || balancesLoading ? "余额未就绪" : issue ? "待核对" : money(balance, acct.currency)}
                        </div>
                        {#if issue}<p class="assets-note">{issue}</p>{/if}
                        <div class="asset-card-actions">
                            <button type="button" onclick={() => startEditAsset(acct)} disabled={isAssetSaving || !!readError || balancesLoading}>编辑</button>
                            {#if onQuickTransfer && !issue}
                                <button type="button" onclick={() => onQuickTransfer?.(acct)} disabled={!!readError || balancesLoading}>转账</button>
                                {#if balance < 0}
                                    <button type="button" onclick={() => onQuickTransfer?.(acct, true)} disabled={!!readError || balancesLoading}>还款</button>
                                {/if}
                            {/if}
                            <button type="button" class="ac-del" onclick={() => archiveAsset(acct)} disabled={isAssetSaving || !!readError || balancesLoading}>关闭</button>
                            {#if acct.balanceBackupPath}<button type="button" onclick={() => downloadBackup(acct)}>调整前快照</button>{/if}
                        </div>
                    </div>
                {/each}
            </div>
        </section>
    {/if}
    {#if closedUnsettled.length}
        <section class="assets-group"><h3>已关闭账户</h3><p class="assets-note">这些账户仍有余额或流水异常，恢复后可纳入汇总。</p>
            {#each closedUnsettled as acct (acct.accountId)}<div class="asset-card-actions"><span>{acct.name} · {acct.currency}</span><button type="button" onclick={() => restoreAsset(acct)} disabled={isAssetSaving || !!readError || balancesLoading}>恢复</button></div>{/each}
        </section>
    {/if}
    {#if !activeAccounts.length && !readError && !balancesLoading}<p class="assets-note">暂无启用的账户。</p>{/if}
    <div class="asset-form">
        <h3>{editingAsset ? "编辑账户" : "新增账户"}</h3>
        <label><span>账户名称</span><input type="text" bind:value={newName} placeholder="例如现金或花呗" /></label>
        <div class="asset-form-row">
            <label><span>币种</span><select bind:value={newCurrency}>
                {#if !CURRENCY_OPTIONS.some(o => o.value === newCurrency)}<option value={newCurrency}>{newCurrency}</option>{/if}
                {#each CURRENCY_OPTIONS as opt}<option value={opt.value}>{opt.label}</option>{/each}
            </select></label>
            <label><span>期初余额</span><input type="number" step="0.01" bind:value={newBalance} /></label>
        </div>
        <p class="assets-note">欠款填负数，期初余额不包含已记流水。</p>
        {#if previewBalance !== undefined && Number.isFinite(previewBalance)}<p class="assets-note" aria-live="polite">保存后余额 {money(previewBalance, newCurrency)}</p>{/if}
        <label><span>备注</span><input type="text" bind:value={newNote} placeholder="选填" /></label>
        <div class="asset-form-actions">
            <button type="button" onclick={saveAssetForm} disabled={isAssetSaving || !!readError || balancesLoading || !newName.trim() || !Number.isFinite(newBalance)}>{isAssetSaving ? "保存中…" : editingAsset ? "保存" : "新增账户"}</button>
            {#if editingAsset}<button type="button" class="af-cancel" onclick={resetAssetForm}>取消</button>{/if}
        </div>
    </div>
</div>


<style lang="scss">
    .assets-note { color: var(--b3-theme-on-surface); font-size: 12px; line-height: 1.5; }
    .assets-panel {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-width: 0;
    }

    .assets-error {
        padding: 0.45rem 0.6rem;
        border-radius: 8px;
        background: color-mix(in srgb, var(--b3-theme-error) 12%, transparent);
        color: var(--b3-theme-error);
        font-size: 0.78rem;
    }

    .assets-summary {
        padding: 1rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 12px;
        background: var(--b3-theme-background);
        box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }

    .assets-summary-main {
        text-align: center;
        margin-bottom: 0.6rem;
    }

    .assets-summary-label {
        font-size: 0.8rem;
        color: var(--b3-theme-on-surface-light);
    }

    .assets-summary-value {
        display: block;
        font-size: 2rem;
        font-weight: 700;
        color: var(--b3-theme-on-background);
    }

    .assets-summary-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.5rem;
    }

    .assets-summary-card {
        text-align: center;
        padding: 0.5rem;
        border-radius: 8px;
        background: color-mix(in srgb, var(--b3-theme-surface) 60%, transparent);
    }

    .assets-summary-card span {
        font-size: 0.74rem;
        color: var(--b3-theme-on-surface-light);
    }

    .assets-summary-card strong {
        display: block;
        font-size: 1.05rem;
    }

    .assets-positive { color: #1f8f55; }
    .assets-negative { color: #c9553f; }

    .assets-group { display: flex; flex-direction: column; gap: 0.5rem; }
    .assets-group h3 {
        margin: 0;
        font-size: 0.88rem;
        font-weight: 650;
        color: var(--b3-theme-on-background);
    }

    .assets-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 0.5rem;
    }

    .asset-card {
        padding: 0.6rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-background);
        box-shadow: 0 1px 2px rgba(0,0,0,0.03);
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }

    .asset-card-head {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .asset-card-icon {
        flex: 0 0 auto;
        width: 2.2rem;
        height: 2.2rem;
        border-radius: 8px;
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
        color: var(--b3-theme-primary);
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .asset-card-head strong {
        min-width: 0;
        font-size: 0.88rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .asset-card-balance {
        font-size: 1.1rem;
        font-weight: 700;
    }

    .asset-card-balance.negative { color: #c9553f; }

    .asset-card-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem;
    }

    .asset-card-actions button {
        padding: 0.2rem 0.45rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 5px;
        background: transparent;
        color: var(--b3-theme-on-surface-light);
        font: inherit;
        font-size: 0.72rem;
        cursor: pointer;
    }

    .asset-card-actions button.ac-del { color: var(--b3-theme-error); }

    .asset-form {
        padding: 0.75rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-background);
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .asset-form h3 { margin: 0; font-size: 0.88rem; }

    .asset-form-row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.5rem;
    }

    .asset-form label {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        font-size: 0.74rem;
        color: var(--b3-theme-on-surface-light);
    }

    .asset-form input, .asset-form select {
        min-width: 0;
        padding: 0.35rem 0.45rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-background);
        font: inherit;
    }

    .asset-form-actions {
        display: flex;
        gap: 0.4rem;
    }

    .asset-form-actions button {
        padding: 0.4rem 0.8rem;
        border: 1px solid var(--b3-theme-primary);
        border-radius: 6px;
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
        cursor: pointer;
        font: inherit;
        font-weight: 600;
    }

    .asset-form-actions button.af-cancel {
        background: transparent;
        color: var(--b3-theme-on-background);
        border-color: var(--b3-border-color);
    }

    button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
