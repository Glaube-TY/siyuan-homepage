<script lang="ts">
    import AccountingIcon from "./AccountingIcon.svelte";
    import type { AccountingIconName } from "./accountingIconTypes";
    import { saveAccountingAccount, archiveAccountingAccount } from "./accountingAccountData";
    import { getAssetTypeLabel, ASSET_TYPE_OPTIONS, type AccountingAccount, type AccountingAccountInput, type AccountingRecord } from "./accountingTypes";
    import { CURRENCY_OPTIONS, normalizeAccountingCurrency } from "./accountingConstants";
    import { calculateAssetBalances } from "./accountingAnalytics";
    import type { AccountingAppSettings } from "./accountingSettings";

    interface Props {
        plugin: any;
        appSettings: AccountingAppSettings | null;
        accounts: AccountingAccount[];
        records?: AccountingRecord[];
        onChanged?: () => void | Promise<void>;
    }

    let { plugin, appSettings, accounts, records = [], onChanged }: Props = $props();

    let saveError = $state("");
    let isAssetSaving = $state(false);
    let editingAsset = $state<AccountingAccount | null>(null);
    let newName = $state("");
    let newType = $state("internet");
    let newCurrency = $state("CNY");
    let newBalance = $state(0);
    let newNote = $state("");

    $effect(() => {
        if (!editingAsset) {
            newCurrency = appSettings?.defaultCurrency || "CNY";
        }
    });

    // ── Computed balance from records ──
    let balanceMap = $derived(calculateAssetBalances(accounts, records));

    let totalAssets = $derived(
        accounts
            .filter((a) => a.type !== "creditCard")
            .reduce((sum, a) => sum + (balanceMap.get(a.accountId) ?? a.currentBalance), 0),
    );
    let totalLiabilities = $derived(
        accounts
            .filter((a) => a.type === "creditCard")
            .reduce((sum, a) => sum + (balanceMap.get(a.accountId) ?? a.currentBalance), 0),
    );
    let netAssets = $derived(totalAssets - totalLiabilities);

    function assetGroup(a: AccountingAccount): "funds" | "credit" | "other" {
        if (a.type === "creditCard") return "credit";
        if (a.type === "internet" || a.type === "debitCard" || a.type === "savingsCard" || a.type === "cash") return "funds";
        return "other";
    }

    let fundAccounts = $derived(accounts.filter((a) => assetGroup(a) === "funds"));
    let creditAccounts = $derived(accounts.filter((a) => assetGroup(a) === "credit"));
    let otherAccounts = $derived(accounts.filter((a) => assetGroup(a) === "other"));

    function assetIcon(type: string): AccountingIconName {
        const map: Record<string, AccountingIconName> = {
            internet: "smartphone",
            debitCard: "banknote",
            savingsCard: "piggyBank",
            creditCard: "landmark",
            cash: "banknote",
        };
        return map[type] || "moreHorizontal";
    }

    // ── Actions ──
    function resetAssetForm(): void {
        editingAsset = null;
        newName = "";
        newType = "internet";
        newCurrency = appSettings?.defaultCurrency || "CNY";
        newBalance = 0;
        newNote = "";
        saveError = "";
    }

    function startEditAsset(acct: AccountingAccount | null): void {
        editingAsset = acct;
        newName = acct?.name || "";
        newType = acct?.type || "internet";
        newCurrency = acct?.currency || appSettings?.defaultCurrency || "CNY";
        newBalance = acct?.openingBalance || 0;
        newNote = acct?.note || "";
        saveError = "";
    }

    async function saveAssetForm(): Promise<void> {
        if (isAssetSaving) return;
        if (!plugin) {
            saveError = "插件未就绪";
            return;
        }
        const name = newName.trim();
        if (!name) { saveError = "请输入资产名称"; return; }
        saveError = "";
        isAssetSaving = true;
        const input: AccountingAccountInput = {
            ...(editingAsset || {}),
            name,
            type: newType,
            currency: normalizeAccountingCurrency(newCurrency, "CNY"),
            openingBalance: Math.max(0, Number(newBalance) || 0),
            currentBalance: editingAsset
                ? editingAsset.currentBalance
                : Math.max(0, Number(newBalance) || 0),
            note: newNote.trim(),
        };
        try {
            await saveAccountingAccount(plugin, input);
            resetAssetForm();
            await onChanged?.();
        } catch (e) {
            saveError = e instanceof Error ? e.message : "保存资产失败";
        } finally {
            isAssetSaving = false;
        }
    }

    async function archiveAsset(accountId: string): Promise<void> {
        if (!plugin) {
            saveError = "插件未就绪";
            return;
        }
        try {
            await archiveAccountingAccount(plugin, accountId);
            await onChanged?.();
        } catch (e) {
            saveError = e instanceof Error ? e.message : "归档资产失败";
        }
    }
</script>

<div class="assets-panel">
    {#if saveError}
        <div class="assets-error">{saveError}</div>
    {/if}

    <!-- Summary Cards -->
        <div class="assets-summary">
            <div class="assets-summary-main">
                <span class="assets-summary-label">净资产</span>
                <strong class="assets-summary-value">{netAssets.toFixed(2)}</strong>
            </div>
            <div class="assets-summary-row">
                <div class="assets-summary-card">
                    <span>总资产</span>
                    <strong class="assets-positive">+{totalAssets.toFixed(2)}</strong>
                </div>
                <div class="assets-summary-card">
                    <span>总负债</span>
                    <strong class="assets-negative">{totalLiabilities > 0 ? "-" : ""}{totalLiabilities.toFixed(2)}</strong>
                </div>
            </div>
        </div>

        <!-- Asset Groups -->
        {#if fundAccounts.length > 0}
            <section class="assets-group">
                <h3>资金类</h3>
                <div class="assets-grid">
                    {#each fundAccounts as acct}
                        <div class="asset-card">
                            <div class="asset-card-head">
                                <span class="asset-card-icon">
                                    <AccountingIcon name={assetIcon(acct.type)} size={18} />
                                </span>
                                <div class="asset-card-info">
                                    <strong>{acct.name}</strong>
                                    <span class="asset-card-type">{getAssetTypeLabel(acct.type)}</span>
                                </div>
                            </div>
                            <div class="asset-card-balance">
                                {acct.currency} {(balanceMap.get(acct.accountId) ?? acct.currentBalance).toFixed(2)}
                            </div>
                            <div class="asset-card-actions">
                                <button onclick={() => startEditAsset(acct)}>编辑</button>
                                <button class="ac-del" onclick={() => archiveAsset(acct.accountId)}>归档</button>
                            </div>
                        </div>
                    {/each}
                </div>
            </section>
        {/if}

        {#if creditAccounts.length > 0}
            <section class="assets-group">
                <h3>信用类</h3>
                <div class="assets-grid">
                    {#each creditAccounts as acct}
                        <div class="asset-card credit">
                            <div class="asset-card-head">
                                <span class="asset-card-icon">
                                    <AccountingIcon name={assetIcon(acct.type)} size={18} />
                                </span>
                                <div class="asset-card-info">
                                    <strong>{acct.name}</strong>
                                    <span class="asset-card-type">{getAssetTypeLabel(acct.type)}</span>
                                </div>
                            </div>
                            <div class="asset-card-balance negative">
                                {acct.currency} {(balanceMap.get(acct.accountId) ?? acct.currentBalance).toFixed(2)}
                            </div>
                            <div class="asset-card-actions">
                                <button onclick={() => startEditAsset(acct)}>编辑</button>
                                <button class="ac-del" onclick={() => archiveAsset(acct.accountId)}>归档</button>
                            </div>
                        </div>
                    {/each}
                </div>
            </section>
        {/if}

        {#if otherAccounts.length > 0}
            <section class="assets-group">
                <h3>其他</h3>
                <div class="assets-grid">
                    {#each otherAccounts as acct}
                        <div class="asset-card">
                            <div class="asset-card-head">
                                <span class="asset-card-icon">
                                    <AccountingIcon name={assetIcon(acct.type)} size={18} />
                                </span>
                                <div class="asset-card-info">
                                    <strong>{acct.name}</strong>
                                    <span class="asset-card-type">{getAssetTypeLabel(acct.type)}</span>
                                </div>
                            </div>
                            <div class="asset-card-balance">
                                {acct.currency} {(balanceMap.get(acct.accountId) ?? acct.currentBalance).toFixed(2)}
                            </div>
                            <div class="asset-card-actions">
                                <button onclick={() => startEditAsset(acct)}>编辑</button>
                                <button class="ac-del" onclick={() => archiveAsset(acct.accountId)}>归档</button>
                            </div>
                        </div>
                    {/each}
                </div>
            </section>
        {/if}

        {#if accounts.length === 0}
            <div class="assets-empty small">
                <p>暂无资产，点击下方"新增资产"开始。</p>
            </div>
        {/if}

        <!-- Add/Edit Form -->
        <div class="asset-form">
            <h3>{editingAsset ? "编辑资产" : "新增资产"}</h3>
            <div class="asset-form-row">
                <label>
                    <span>资产名称</span>
                    <input type="text" bind:value={newName} placeholder="如: 支付宝" />
                </label>
                <label>
                    <span>资产类型</span>
                    <select bind:value={newType}>
                        {#each ASSET_TYPE_OPTIONS as opt}
                            <option value={opt.value}>{opt.label}</option>
                        {/each}
                    </select>
                </label>
            </div>
            <div class="asset-form-row">
                <label>
                    <span>币种</span>
                    <select bind:value={newCurrency}>
                        {#each CURRENCY_OPTIONS as opt}
                            <option value={opt.value}>{opt.label}</option>
                        {/each}
                    </select>
                </label>
                <label>
                    <span>初始余额</span>
                    <input type="number" min="0" step="0.01" bind:value={newBalance} />
                </label>
            </div>
            <label>
                <span>备注</span>
                <input type="text" bind:value={newNote} placeholder="选填" />
            </label>
            <div class="asset-form-actions">
                <button onclick={saveAssetForm} disabled={isAssetSaving || !newName.trim()}>
                    {isAssetSaving ? "保存中…" : editingAsset ? "保存修改" : "新增资产"}
                </button>
                {#if editingAsset}
                    <button class="af-cancel" onclick={() => startEditAsset(null)}>取消</button>
                {/if}
            </div>
        </div>
</div>

<style lang="scss">
    .assets-panel {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-width: 0;
    }

    .assets-empty {
    min-height: 12rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: var(--b3-theme-on-surface-light);
    text-align: center;
}
.assets-empty.small { min-height: 4rem; }

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

    .asset-card.credit {
        border-left: 3px solid #c9553f;
    }

    .asset-card-head {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .asset-card-icon {
        width: 2.2rem;
        height: 2.2rem;
        border-radius: 8px;
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
        color: var(--b3-theme-primary);
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .asset-card-info {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
    }

    .asset-card-info strong {
        font-size: 0.88rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .asset-card-type {
        font-size: 0.7rem;
        color: var(--b3-theme-on-surface-light);
    }

    .asset-card-balance {
        font-size: 1.1rem;
        font-weight: 700;
    }

    .asset-card-balance.negative { color: #c9553f; }

    .asset-card-actions {
        display: flex;
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
        grid-template-columns: 1fr 1fr;
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
