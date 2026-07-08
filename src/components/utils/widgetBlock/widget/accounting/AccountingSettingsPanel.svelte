<script lang="ts">
    import AccountingIcon from "./AccountingIcon.svelte";
    import AccountingCategoryManager from "./AccountingCategoryManager.svelte";
    import AccountingDataPortPanel from "./AccountingDataPortPanel.svelte";
    import { saveAccountingSettings, type AccountingAppSettings } from "./accountingSettings";
    import { CURRENCY_OPTIONS, normalizeAccountingCurrency } from "./accountingConstants";
    import type { AccountingPeriod } from "./accountingTypes";
    import type { CategoryItem } from "./accountingCategoryConfig";

    interface Props {
        plugin: any;
        appSettings: AccountingAppSettings | null;
        onChanged?: () => void | Promise<void>;
    }

    let { plugin, appSettings, onChanged }: Props = $props();

    // ── Local draft — never mutate appSettings prop directly ──
    let draftSettings = $state<AccountingAppSettings | null>(null);
    let lastSettingsSig = $state("");

    let defaultCurrency2 = $state("CNY");
    let monthlyBudget2 = $state(0);
    let defaultPeriod2 = $state<AccountingPeriod>("month");
    let saved = $state(false);
    let saveError = $state("");

    let activeDirection = $state<"expense" | "income">("expense");

    // Sync from prop to draft (one-way, guarded)
    $effect(() => {
        if (!appSettings) return;
        const sig = appSettings.updatedAt || "";
        if (sig === lastSettingsSig) return;
        lastSettingsSig = sig;
        draftSettings = JSON.parse(JSON.stringify(appSettings));
        defaultCurrency2 = appSettings.defaultCurrency;
        monthlyBudget2 = appSettings.monthlyBudget;
        defaultPeriod2 = appSettings.defaultPeriod;
    });

    let categories_ = $derived(
        draftSettings
            ? (activeDirection === "expense"
                ? draftSettings.categories.expense
                : draftSettings.categories.income)
            : [],
    );

    function handleCategoriesChange(updated: CategoryItem[]): void {
        if (!draftSettings) return;
        if (activeDirection === "expense") {
            draftSettings.categories.expense = updated;
        } else {
            draftSettings.categories.income = updated;
        }
    }

    async function saveAll(): Promise<void> {
        if (!draftSettings || !plugin) return;
        saveError = "";
        const updated: AccountingAppSettings = {
            ...draftSettings,
            defaultCurrency: normalizeAccountingCurrency(defaultCurrency2, "CNY"),
            monthlyBudget: Math.max(0, Number(monthlyBudget2) || 0),
            defaultPeriod: defaultPeriod2,
        };
        try {
            await saveAccountingSettings(plugin, updated);
            saved = true;
            setTimeout(() => (saved = false), 2000);
            onChanged?.();
        } catch (e) {
            saveError = e instanceof Error ? e.message : "保存失败";
        }
    }
</script>

<div class="settings-panel">
    {#if saveError}
        <div class="sp-error">{saveError}</div>
    {/if}
    {#if saved}
        <div class="sp-saved">设置已保存</div>
    {/if}

    <!-- Preferences -->
    <section class="sp-section">
        <h3><AccountingIcon name="check" size={16} /> 偏好设置</h3>
        <div class="sp-row">
            <label class="sp-field">
                <span>默认币种</span>
                <select bind:value={defaultCurrency2} class="sp-sm">
                    {#each CURRENCY_OPTIONS as opt}
                        <option value={opt.value}>{opt.label}</option>
                    {/each}
                </select>
            </label>
            <label class="sp-field">
                <span>月预算</span>
                <input type="number" min="0" step="0.01" bind:value={monthlyBudget2} class="sp-sm" />
            </label>
        </div>
        <label class="sp-field">
            <span>默认统计周期</span>
            <select bind:value={defaultPeriod2} class="sp-md">
                <option value="month">本月</option>
                <option value="recent30">近 30 天</option>
                <option value="year">本年</option>
            </select>
        </label>
    </section>

    <!-- Category Management -->
    <section class="sp-section">
        <h3><AccountingIcon name="tags" size={16} /> 分类管理</h3>
        <div class="sp-cat-tabs">
            <button class:active={activeDirection === "expense"} onclick={() => (activeDirection = "expense")}>支出</button>
            <button class:active={activeDirection === "income"} onclick={() => (activeDirection = "income")}>收入</button>
        </div>
        {#if appSettings}
            <AccountingCategoryManager
                categories={categories_}
                direction={activeDirection}
                onChange={handleCategoriesChange}
            />
        {/if}
    </section>

    <!-- Data Import / Export -->
    {#if appSettings}
        <AccountingDataPortPanel {plugin} {appSettings} onImportCompleted={async () => { await onChanged?.(); }} />
    {/if}

    <button class="sp-save-btn" onclick={saveAll}>
        <AccountingIcon name="check" size={16} /> 保存所有设置
    </button>
</div>

<style lang="scss">
    .settings-panel {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-width: 0;
        padding-bottom: 2rem;
    }

    .sp-section {
        padding: 0.85rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-background);
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
    }

    .sp-section h3 {
        margin: 0;
        font-size: 0.92rem;
        display: flex;
        align-items: center;
        gap: 0.4rem;
        color: var(--b3-theme-on-background);
    }

    .sp-section h3 :global(svg) { color: var(--b3-theme-primary); }

    .sp-field {
        display: flex;
        flex-direction: column;
        gap: 0.22rem;
        font-size: 0.76rem;
        color: var(--b3-theme-on-surface-light);
        min-width: 0;
    }

    .sp-field input, .sp-field select {
        padding: 0.38rem 0.5rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-background);
        font: inherit;
        box-sizing: border-box;
        width: 100%;
    }

    .sp-field input.sp-sm { max-width: 8rem; }
    .sp-field select.sp-md { max-width: 10rem; }

    .sp-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
}

.sp-error {
        padding: 0.45rem 0.6rem;
        border-radius: 8px;
        background: color-mix(in srgb, var(--b3-theme-error) 12%, transparent);
        color: var(--b3-theme-error);
        font-size: 0.78rem;
    }

    .sp-saved {
        padding: 0.45rem 0.6rem;
        border-radius: 8px;
        background: color-mix(in srgb, #1f8f55 12%, transparent);
        color: #1f8f55;
        font-size: 0.78rem;
        font-weight: 600;
    }

    .sp-cat-tabs {
        display: flex;
        gap: 0.25rem;
        background: var(--b3-theme-surface);
        border-radius: 8px;
        padding: 2px;
    }

    .sp-cat-tabs button {
        flex: 1;
        border: none;
        border-radius: 7px;
        padding: 0.3rem 0.5rem;
        background: transparent;
        color: var(--b3-theme-on-surface-light);
        font: inherit;
        font-size: 0.78rem;
        cursor: pointer;
    }

    .sp-cat-tabs button.active {
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        box-shadow: 0 1px 2px rgba(0,0,0,0.06);
    }

    .sp-save-btn {
        padding: 0.65rem;
        font-size: 0.9rem;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        border: 1px solid var(--b3-theme-primary);
        border-radius: 6px;
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
        cursor: pointer;
        font-weight: 600;
    }
</style>
