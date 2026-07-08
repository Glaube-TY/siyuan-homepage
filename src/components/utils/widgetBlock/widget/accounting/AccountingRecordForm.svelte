<script lang="ts">
    import { onMount } from "svelte";
    import AccountingIcon from "./AccountingIcon.svelte";
    import {
        DEFAULT_ACCOUNTS,
    } from "./accountingConstants";
    import {
        EXPENSE_CATEGORIES,
        getCategoriesByDirection,
    } from "./accountingCategoryConfig";
    import type { CategoryItem } from "./accountingCategoryConfig";
    import {
        calculateAssetBalances,
        formatAccountingDate,
        resolveAssetRef,
    } from "./accountingAnalytics";
    import { getEffectiveCategories, type AccountingAppSettings } from "./accountingSettings";
    import { normalizeAccountingCurrency } from "./accountingConstants";
    import type {
        AccountingAccount,
        AccountingDirection,
        AccountingRecord,
        AccountingRecordInput,
    } from "./accountingTypes";
    import type { AccountingIconName } from "./accountingIconTypes";

    type DraftRecord = {
        recordId?: string;
        title: string;
        direction: AccountingDirection;
        amount: number;
        date: string;
        categoryPrimary: string;
        categorySecondary: string;
        account: string;
        counterAccount?: string;
        tags: string;
        note: string;
        currency: string;
        createdAt?: string;
    };

    interface Props {
        record?: AccountingRecord | null;
        defaultCurrency?: string;
        submitting?: boolean;
        appSettings?: AccountingAppSettings | null;
        accounts?: AccountingAccount[];
        balanceRecords?: AccountingRecord[];
        onSubmit: (input: AccountingRecordInput) => void | Promise<void>;
        onCancel?: () => void;
    }

    let {
        record = null,
        defaultCurrency = "CNY",
        submitting = false,
        appSettings = null,
        accounts = [],
        balanceRecords = [],
        onSubmit,
        onCancel,
    }: Props = $props();

    let activeAccounts = $derived(accounts.filter((a) => !a.archived));

    let draft = $state<DraftRecord>(createDraft(null, "CNY"));
    let formError = $state("");
    let lastRecordKey = $state("");
    let amountDisplay = $state("0");
    let showMore = $state(false);
    let assetPickerOpen = $state(false);
    let datePickerOpen = $state(false);
    let assetPickerTarget: "account" | "counterAccount" = $state("account");
    let assetPickerStyle = $state("");
    let datePickerStyle = $state("");

    let categories = $derived(
        appSettings
            ? getEffectiveCategories(appSettings, draft.direction)
            : getCategoriesByDirection(draft.direction),
    );
    let selectedCategory = $derived(
        categories.find((c) => c.label === draft.categoryPrimary) || null,
    );

    let balanceMap = $derived(calculateAssetBalances(accounts, balanceRecords));

    let selectedAccount = $derived(resolveAssetRef(draft.account, activeAccounts));
    let selectedCounterAccount = $derived(resolveAssetRef(draft.counterAccount, activeAccounts));

    $effect(() => {
        const key = record?.recordId || "new";
        if (key !== lastRecordKey) {
            draft = createDraft(record, defaultCurrency);
            amountDisplay = formatAmountForDisplay(draft.amount);
            formError = "";
            showMore = false;
            lastRecordKey = key;
        }
    });

    function createDraft(source: AccountingRecord | null, currency: string): DraftRecord {
        if (source) {
            return {
                recordId: source.recordId,
                title: source.title,
                direction: source.direction,
                amount: source.amount,
                date: source.date,
                categoryPrimary: source.categoryPrimary,
                categorySecondary: source.categorySecondary,
                account: source.account,
                counterAccount: source.counterAccount,
                tags: source.tags,
                note: source.note,
                currency: source.currency || currency || "CNY",
                createdAt: source.createdAt,
            };
        }
        return {
            title: "",
            direction: "expense",
            amount: 0,
            date: formatAccountingDate(new Date()),
            categoryPrimary: appSettings
                ? (getEffectiveCategories(appSettings, "expense")[0]?.label || "其他")
                : EXPENSE_CATEGORIES[0]?.label || "其他",
            categorySecondary: "",
            account: activeAccounts[0]?.name || DEFAULT_ACCOUNTS[0] || "",
            tags: "",
            note: "",
            currency: currency || "CNY",
        };
    }

    function formatAmountForDisplay(value: number): string {
        if (!value || value === 0) return "0";
        return String(value);
    }

    function selectDirection(dir: AccountingDirection): void {
        draft.direction = dir;
        const cats = appSettings
            ? getEffectiveCategories(appSettings, dir)
            : getCategoriesByDirection(dir);
        draft.categoryPrimary = cats[0]?.label || "其他";
        draft.categorySecondary = "";
    }

    function selectCategory(cat: CategoryItem): void {
        draft.categoryPrimary = cat.label;
        draft.categorySecondary = "";
    }

    function selectSecondary(sec: string): void {
        draft.categorySecondary = sec === draft.categorySecondary ? "" : sec;
    }

    function getFloatingPanelStyle(anchor: EventTarget | null, preferredWidth: number): string {
        if (!(anchor instanceof HTMLElement) || typeof window === "undefined") {
            return "";
        }

        const margin = 12;
        const gap = 8;
        const rect = anchor.getBoundingClientRect();
        const width = Math.min(preferredWidth, window.innerWidth - margin * 2);
        const left = Math.min(Math.max(rect.left, margin), window.innerWidth - width - margin);
        const estimatedHeight = Math.min(440, window.innerHeight - margin * 2);
        const hasBottomSpace = rect.bottom + gap + estimatedHeight <= window.innerHeight - margin;
        const top = hasBottomSpace
            ? rect.bottom + gap
            : Math.max(margin, rect.top - estimatedHeight - gap);
        const maxHeight = hasBottomSpace
            ? Math.max(180, window.innerHeight - top - margin)
            : Math.max(180, rect.top - top - gap);
        return `--picker-left: ${left}px; --picker-top: ${top}px; --picker-width: ${width}px; --picker-max-height: ${maxHeight}px;`;
    }

    function openAssetPicker(target: "account" | "counterAccount", anchor: EventTarget | null = null): void {
        assetPickerTarget = target;
        assetPickerStyle = getFloatingPanelStyle(anchor, 460);
        assetPickerOpen = true;
    }

    function closeAssetPicker(): void {
        assetPickerOpen = false;
    }

    function selectAsset(account: AccountingAccount): void {
        if (assetPickerTarget === "counterAccount") {
            draft.counterAccount = account.accountId;
        } else {
            draft.account = account.accountId;
        }
        closeAssetPicker();
    }

    function assetDisplayName(ref: string | undefined): string {
        if (!ref) return "选择资产";
        const asset = resolveAssetRef(ref, activeAccounts);
        return asset?.name || "选择资产";
    }

    function assetDisplaySub(ref: string | undefined): string {
        const asset = resolveAssetRef(ref, activeAccounts);
        if (!asset) return "未识别资产";
        return formatAssetBalance(asset);
    }

    function getAssetBalance(asset: AccountingAccount): number {
        const computed = balanceMap.get(asset.accountId);
        if (computed !== undefined && (balanceRecords.length > 0 || asset.openingBalance !== 0)) {
            return computed;
        }
        return asset.currentBalance;
    }

    function formatAssetBalance(asset: AccountingAccount): string {
        return `${asset.currency} ${getAssetBalance(asset).toFixed(2)}`;
    }

    function setDate(date: string): void {
        draft.date = date;
        closeDatePicker();
    }

    function openDatePicker(anchor: EventTarget | null = null): void {
        datePickerStyle = getFloatingPanelStyle(anchor, 320);
        datePickerOpen = true;
    }

    function closeDatePicker(): void {
        datePickerOpen = false;
    }

    function assetIcon(type: string): AccountingIconName {
        const map: Record<string, AccountingIconName> = {
            internet: "smartphone",
            debitCard: "banknote",
            savingsCard: "piggyBank",
            creditCard: "landmark",
            cash: "banknote",
            other: "moreHorizontal",
        };
        return map[type] || "moreHorizontal";
    }

    function assetTypeLabel(type: string): string {
        const map: Record<string, string> = {
            internet: "互联网账户",
            debitCard: "借记卡",
            savingsCard: "储蓄卡",
            creditCard: "信用卡",
            cash: "现金",
            other: "其他",
        };
        return map[type] || type || "其他";
    }

    function dateQuickOptions(): { label: string; value: string }[] {
        const today = new Date();
        return [
            { label: "今天", value: formatAccountingDate(today) },
            { label: "昨天", value: formatAccountingDate(new Date(today.getTime() - 86400000)) },
            { label: "前天", value: formatAccountingDate(new Date(today.getTime() - 172800000)) },
        ];
    }

    function dateDisplayLabel(value: string): string {
        const quick = dateQuickOptions().find((opt) => opt.value === value);
        return quick?.label || value.replace(/-/g, "/");
    }

    function handleNumpadKey(key: string): void {
        if (key === "backspace") {
            amountDisplay = amountDisplay.length > 1
                ? amountDisplay.slice(0, -1)
                : "0";
            return;
        }
        if (key === ".") {
            if (amountDisplay.includes(".")) return;
            amountDisplay += ".";
            return;
        }
        if (key === "clear") {
            amountDisplay = "0";
            return;
        }
        if (amountDisplay === "0" && key !== ".") {
            amountDisplay = key;
        } else {
            amountDisplay += key;
        }
    }

    function currentAmount(): number {
        const val = parseFloat(amountDisplay);
        return Number.isFinite(val) ? Math.max(0, val) : 0;
    }

    async function handleSave(andContinue: boolean): Promise<void> {
        formError = "";
        const amount = currentAmount();
        if (amount <= 0) {
            formError = "请输入金额";
            return;
        }

        if (draft.direction === "transfer") {
            const fromId = resolveAssetRef(draft.account, activeAccounts)?.accountId || draft.account;
            const toId = draft.counterAccount ? (resolveAssetRef(draft.counterAccount, activeAccounts)?.accountId || draft.counterAccount) : undefined;
            if (fromId && toId && fromId === toId) {
                formError = "转出资产和转入资产不能相同";
                return;
            }
            if (!toId) {
                formError = "请选择转入资产";
                return;
            }
        } else if (!draft.account) {
            formError = "请选择资产";
            return;
        }

        const title = draft.title.trim() || draft.categoryPrimary;
        const accountId = resolveAssetRef(draft.account, activeAccounts)?.accountId || draft.account;
        const counterAccountId = draft.counterAccount ? (resolveAssetRef(draft.counterAccount, activeAccounts)?.accountId || draft.counterAccount) : undefined;
        try {
            await onSubmit({
                ...draft,
                title,
                amount,
                account: accountId,
                counterAccount: counterAccountId || undefined,
                categoryPrimary: draft.categoryPrimary || "其他",
                currency: normalizeAccountingCurrency(draft.currency || defaultCurrency, "CNY"),
            });
            if (!draft.recordId && andContinue) {
                draft = createDraft(null, defaultCurrency);
                amountDisplay = "0";
                showMore = false;
            }
        } catch (error) {
            formError = error instanceof Error ? error.message : "保存失败";
        }
    }

    onMount(() => {
        if (!draft.account && activeAccounts.length > 0) {
            draft.account = activeAccounts[0].accountId;
        }
    });
</script>

<div class="quick-entry">
    <div class="qe-phone-panel">
        <!-- Type Switch -->
        <div class="qe-type-switch" role="radiogroup" aria-label="记账类型">
        <button
            class="qe-type-btn"
            class:active={draft.direction === "expense"}
            onclick={() => selectDirection("expense")}
        >支出</button>
        <button
            class="qe-type-btn"
            class:active={draft.direction === "income"}
            onclick={() => selectDirection("income")}
        >收入</button>
        <button
            class="qe-type-btn"
            class:active={draft.direction === "transfer"}
            onclick={() => selectDirection("transfer")}
        >转账</button>
    </div>

    <!-- Category Grid (expense/income only) -->
    {#if draft.direction !== "transfer"}
        <div class="qe-categories">
            {#each categories as cat (cat.key)}
                <button
                    class="qe-cat-btn"
                    class:selected={draft.categoryPrimary === cat.label}
                    onclick={() => selectCategory(cat)}
                    title={cat.label}
                >
                    <span class="qe-cat-icon">
                        <AccountingIcon name={cat.icon} size={22} strokeWidth={1.8} />
                    </span>
                    <span class="qe-cat-label">{cat.label}</span>
                </button>
            {/each}
        </div>

        {#if selectedCategory && selectedCategory.secondaries.length > 0}
            <div class="qe-secondary">
                {#each selectedCategory.secondaries as sec}
                    <button
                        class="qe-sec-chip"
                        class:active={draft.categorySecondary === sec}
                        onclick={() => selectSecondary(sec)}
                    >{sec}</button>
                {/each}
            </div>
        {/if}
    {:else}
        <!-- Transfer: asset transfer panel -->
        <div class="qe-transfer">
            <button class="qe-asset-select" onclick={(event) => openAssetPicker("account", event.currentTarget)}>
                <span class="qe-asset-select-label">转出</span>
                <span class="qe-asset-select-main">
                    <span class="qe-asset-select-name">{assetDisplayName(draft.account)}</span>
                    <span class="qe-asset-select-sub">{assetDisplaySub(draft.account)}</span>
                </span>
            </button>
            <div class="qe-transfer-arrow">
                <AccountingIcon name="arrowRightLeft" size={20} />
            </div>
            <button class="qe-asset-select" onclick={(event) => openAssetPicker("counterAccount", event.currentTarget)}>
                <span class="qe-asset-select-label">转入</span>
                <span class="qe-asset-select-main">
                    <span class="qe-asset-select-name">{assetDisplayName(draft.counterAccount)}</span>
                    <span class="qe-asset-select-sub">{assetDisplaySub(draft.counterAccount)}</span>
                </span>
            </button>
        </div>
    {/if}

    <!-- Note and Amount -->
    <div class="qe-record-line">
        <input
            class="qe-note-input"
            type="text"
            bind:value={draft.note}
            placeholder="点击输入备注…"
        />
        <div class="qe-amount-area">
            <span class="qe-currency">{draft.currency === "CNY" ? "¥" : draft.currency}</span>
            <span class="qe-amount-value">{amountDisplay}</span>
        </div>
    </div>

    <!-- Record Options -->
    <div class="qe-action-row">
        {#if draft.direction !== "transfer"}
            <button class="qe-action-pill qe-asset-select single" onclick={(event) => openAssetPicker("account", event.currentTarget)}>
                <span class="qe-asset-select-name">{assetDisplayName(draft.account)}</span>
            </button>
        {/if}
        <button class="qe-action-pill" onclick={(event) => openDatePicker(event.currentTarget)}>
            <AccountingIcon name="calendar" size={15} />
            <span>{dateDisplayLabel(draft.date)}</span>
        </button>
        <button
            class="qe-action-pill qe-more-toggle"
            class:open={showMore}
            onclick={() => (showMore = !showMore)}
        >
            {showMore ? "收起" : "更多"}
        </button>
    </div>

    {#if showMore}
        <div class="qe-more-panel">
            <label class="qe-field">
                <span>标题</span>
                <input type="text" bind:value={draft.title} placeholder="选填，不填则使用分类名" />
            </label>
            <label class="qe-field">
                <span>标签</span>
                <input type="text" bind:value={draft.tags} placeholder="逗号分隔" />
            </label>
        </div>
    {/if}

    <!-- Error -->
    {#if formError}
        <div class="qe-error">{formError}</div>
    {/if}

    <!-- Numpad & Actions -->
    <div class="qe-numpad">
        <div class="qe-numpad-grid">
            <button class="qe-key" onclick={() => handleNumpadKey("1")}>1</button>
            <button class="qe-key" onclick={() => handleNumpadKey("2")}>2</button>
            <button class="qe-key" onclick={() => handleNumpadKey("3")}>3</button>
            <button class="qe-key qe-key-fn" onclick={() => handleNumpadKey("backspace")}>
                <AccountingIcon name="close" size={16} strokeWidth={2.5} />
            </button>

            <button class="qe-key" onclick={() => handleNumpadKey("4")}>4</button>
            <button class="qe-key" onclick={() => handleNumpadKey("5")}>5</button>
            <button class="qe-key" onclick={() => handleNumpadKey("6")}>6</button>
            <button class="qe-key qe-key-save" onclick={() => handleSave(false)} disabled={submitting}>
                {submitting ? "…" : draft.recordId ? "修改" : "保存"}
            </button>

            <button class="qe-key" onclick={() => handleNumpadKey("7")}>7</button>
            <button class="qe-key" onclick={() => handleNumpadKey("8")}>8</button>
            <button class="qe-key" onclick={() => handleNumpadKey("9")}>9</button>
            <button class="qe-key qe-key-continue" onclick={() => handleSave(true)} disabled={submitting || !!draft.recordId}>
                再记
            </button>

            <button class="qe-key" onclick={() => handleNumpadKey("clear")}>C</button>
            <button class="qe-key" onclick={() => handleNumpadKey("0")}>0</button>
            <button class="qe-key" onclick={() => handleNumpadKey(".")}>.</button>
            {#if onCancel}
                <button class="qe-key qe-key-cancel" onclick={onCancel}>取消</button>
            {:else}
                <button class="qe-key qe-key-empty" disabled aria-hidden="true"></button>
            {/if}
        </div>
    </div>
</div>
</div>

<!-- Asset Picker Modal -->
{#if assetPickerOpen}
    <div class="asset-picker-overlay" onclick={closeAssetPicker} onkeydown={(e) => e.key === 'Escape' && closeAssetPicker()} role="dialog" aria-modal="true" aria-label="选择资产" tabindex="-1">
        <div class="asset-picker-panel" style={assetPickerStyle} role="presentation" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
            <div class="asset-picker-header">
                <strong>选择资产</strong>
                <button class="asset-picker-close" onclick={closeAssetPicker}>
                    <AccountingIcon name="close" size={18} />
                </button>
            </div>
            {#if activeAccounts.length === 0}
                <div class="asset-picker-empty">
                    <AccountingIcon name="landmark" size={32} />
                    <span>暂无资产，请先到资产页新增</span>
                </div>
            {:else}
                <div class="asset-picker-list">
                    {#each activeAccounts as acct}
                        <button
                            class="asset-picker-item"
                            class:active={assetPickerTarget === "counterAccount"
                                ? selectedCounterAccount?.accountId === acct.accountId
                                : selectedAccount?.accountId === acct.accountId}
                            onclick={() => selectAsset(acct)}
                        >
                            <span class="asset-picker-icon">
                                <AccountingIcon name={assetIcon(acct.type)} size={20} />
                            </span>
                            <span class="asset-picker-info">
                                <span class="asset-picker-name">{acct.name}</span>
                                <span class="asset-picker-type">{assetTypeLabel(acct.type)}</span>
                            </span>
                            <span class="asset-picker-balance">
                                {formatAssetBalance(acct)}
                            </span>
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
{/if}

{#if datePickerOpen}
    <div class="date-picker-overlay" onclick={closeDatePicker} onkeydown={(e) => e.key === 'Escape' && closeDatePicker()} role="dialog" aria-modal="true" aria-label="选择日期" tabindex="-1">
        <div class="date-picker-panel" style={datePickerStyle} role="presentation" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
            <div class="date-picker-header">
                <strong>选择日期</strong>
                <button class="date-picker-close" onclick={closeDatePicker}>
                    <AccountingIcon name="close" size={18} />
                </button>
            </div>
            <div class="date-picker-quick">
                {#each dateQuickOptions() as opt}
                    <button
                        class="date-picker-chip"
                        class:active={draft.date === opt.value}
                        onclick={() => setDate(opt.value)}
                    >{opt.label}</button>
                {/each}
            </div>
            <label class="date-picker-field">
                <span>自定义日期</span>
                <input
                    type="date"
                    bind:value={draft.date}
                    onchange={closeDatePicker}
                />
            </label>
        </div>
    </div>
{/if}

<style lang="scss">
    .quick-entry {
        display: flex;
        flex-direction: column;
        min-width: 0;
        user-select: none;
    }

    .qe-phone-panel {
        width: 100%;
        max-width: none;
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
        min-width: 0;
    }

    // ── Type Switch ──
    .qe-type-switch {
        display: flex;
        background: var(--b3-theme-surface);
        border-radius: 10px;
        padding: 3px;
        gap: 2px;
    }

    .qe-type-btn {
        flex: 1;
        min-height: 2.2rem;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--b3-theme-on-surface-light);
        font: inherit;
        font-size: 0.88rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
    }

    .qe-type-btn.active {
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }

    // ── Category Grid ──
    .qe-categories {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(72px, 86px));
        justify-content: space-between;
        gap: 0.65rem 0.75rem;
        width: 100%;
    }

    .qe-cat-btn {
        width: 100%;
        max-width: 86px;
        aspect-ratio: 1 / 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.25rem;
        padding: 0.3rem;
        border: 1.5px solid transparent;
        border-radius: 12px;
        background: transparent;
        color: var(--b3-theme-on-surface-light);
        cursor: pointer;
        font: inherit;
        transition: all 0.15s;
        box-sizing: border-box;
    }

    .qe-cat-btn:hover {
        background: color-mix(in srgb, var(--b3-theme-primary) 6%, transparent);
    }

    .qe-cat-btn.selected {
        border-color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
        color: var(--b3-theme-primary);
    }

    .qe-cat-icon {
        width: 2.2rem;
        height: 2.2rem;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--b3-theme-surface-light) 60%, transparent);
        transition: background 0.15s;
    }

    .qe-cat-btn.selected .qe-cat-icon {
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
    }

    .qe-cat-label {
        font-size: 0.68rem;
        font-weight: 550;
        line-height: 1.2;
    }

    // ── Secondary Chips ──
    .qe-secondary {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        padding: 0.55rem 0.65rem;
        border-radius: 12px;
        background: color-mix(in srgb, var(--b3-theme-surface) 70%, transparent);
    }

    .qe-sec-chip {
        padding: 0.32rem 0.7rem;
        border: 1px solid transparent;
        border-radius: 999px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-surface-light);
        font: inherit;
        font-size: 0.76rem;
        cursor: pointer;
        transition: all 0.12s;
    }

    .qe-sec-chip.active {
        border-color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
        color: var(--b3-theme-primary);
        font-weight: 600;
    }

    // ── Transfer Panel ──
    .qe-transfer {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
    }

    .qe-transfer-arrow {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--b3-theme-primary);
        padding: 0.1rem 0;
    }

    .qe-transfer-arrow :global(svg) {
        transform: rotate(90deg);
    }

    // ── Amount ──
    .qe-record-line {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.75rem;
        padding: 0.35rem 0.2rem 0.15rem;
    }

    .qe-amount-area {
        display: flex;
        align-items: baseline;
        justify-content: flex-end;
        gap: 0.2rem;
        min-width: 5.5rem;
    }

    .qe-currency {
        font-size: 0.92rem;
        font-weight: 500;
        color: var(--b3-theme-on-surface-light);
    }

    .qe-amount-value {
        font-size: 2.15rem;
        font-weight: 700;
        color: #e85b61;
        line-height: 1.15;
        letter-spacing: 0;
    }

    // ── Asset Select Button ──
    .qe-asset-select {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.55rem 0.7rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-background);
        font: inherit;
        cursor: pointer;
        text-align: left;
        transition: border-color 0.12s;
    }

    .qe-asset-select:hover {
        border-color: color-mix(in srgb, var(--b3-theme-primary) 50%, var(--b3-border-color));
    }

    .qe-asset-select-label {
        font-size: 0.72rem;
        color: var(--b3-theme-on-surface-light);
        font-weight: 500;
    }

    .qe-asset-select-main {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.05rem;
    }

    .qe-asset-select-name {
        font-weight: 600;
        font-size: 0.9rem;
    }

    .qe-asset-select-sub {
        font-size: 0.72rem;
        color: var(--b3-theme-on-surface-light);
    }

    // ── Note & Record Options ──
    .qe-note-input {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        padding: 0.35rem 0;
        border: none;
        background: transparent;
        color: var(--b3-theme-on-background);
        font: inherit;
        font-size: 1rem;
        outline: none;
    }

    .qe-note-input::placeholder {
        color: var(--b3-theme-on-surface-light);
    }

    .qe-action-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .qe-action-pill {
        min-height: 2.25rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.35rem;
        padding: 0.35rem 0.95rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 999px;
        background: color-mix(in srgb, var(--b3-theme-background) 86%, var(--b3-theme-surface));
        color: var(--b3-theme-on-background);
        font: inherit;
        font-size: 0.88rem;
        font-weight: 600;
        line-height: 1.2;
        cursor: pointer;
        transition: border-color 0.12s, background 0.12s;
        white-space: nowrap;
    }

    .qe-action-pill:hover {
        border-color: color-mix(in srgb, var(--b3-theme-primary) 45%, var(--b3-border-color));
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, var(--b3-theme-background));
    }

    .qe-action-row .qe-asset-select {
        width: auto;
        max-width: 11rem;
        padding: 0.35rem 1rem;
        text-align: center;
    }

    // ── More Toggle ──
    .qe-more-toggle {
        color: var(--b3-theme-on-background);
    }

    .qe-more-toggle.open {
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
    }

    .qe-more-panel {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.6rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: color-mix(in srgb, var(--b3-theme-surface) 50%, transparent);
    }

    .qe-field {
        display: flex;
        flex-direction: column;
        gap: 0.22rem;
        font-size: 0.74rem;
        color: var(--b3-theme-on-surface-light);
    }

    .qe-field input {
        width: 100%;
        box-sizing: border-box;
        padding: 0.4rem 0.55rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        font: inherit;
    }

    // ── Error ──
    .qe-error {
        padding: 0.4rem 0.6rem;
        border-radius: 8px;
        background: color-mix(in srgb, var(--b3-theme-error) 10%, transparent);
        color: var(--b3-theme-error);
        font-size: 0.78rem;
        font-weight: 550;
        text-align: center;
    }

    // ── Numpad ──
    .qe-numpad {
        margin-top: 0.2rem;
    }

    .qe-numpad-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0.4rem;
    }

    .qe-key {
        min-height: 2.8rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-background);
        font: inherit;
        font-size: 1.1rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.1s;
    }

    .qe-key:hover {
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, var(--b3-theme-surface));
    }

    .qe-key:active {
        background: color-mix(in srgb, var(--b3-theme-primary) 16%, var(--b3-theme-surface));
    }

    .qe-key-fn {
        color: var(--b3-theme-on-surface-light);
    }

    .qe-key-save {
        background: var(--b3-theme-primary);
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
        font-size: 0.88rem;
        font-weight: 700;
        grid-row: span 1;
    }

    .qe-key-save:hover {
        background: color-mix(in srgb, var(--b3-theme-primary) 85%, black);
    }

    .qe-key-continue {
        background: color-mix(in srgb, var(--b3-theme-primary) 15%, transparent);
        border-color: color-mix(in srgb, var(--b3-theme-primary) 30%, transparent);
        color: var(--b3-theme-primary);
        font-size: 0.82rem;
        font-weight: 600;
    }

    .qe-key-cancel {
        color: var(--b3-theme-on-surface-light);
        font-size: 0.82rem;
    }

    .qe-key-empty {
        visibility: hidden;
    }

    .qe-key:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    // ── Date Picker Modal ──
    .date-picker-overlay {
        position: fixed;
        inset: 0;
        z-index: 1000;
        background: rgba(0, 0, 0, 0.08);
    }

    .date-picker-panel {
        position: fixed;
        left: var(--picker-left, 1rem);
        top: var(--picker-top, 1rem);
        width: var(--picker-width, 320px);
        max-height: var(--picker-max-height, 70vh);
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding: 0.9rem;
        border-radius: 16px;
        background: var(--b3-theme-background);
        box-shadow: 0 8px 32px rgba(0,0,0,0.18);
        overflow: auto;
    }

    .date-picker-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
    }

    .date-picker-header strong {
        font-size: 0.95rem;
    }

    .date-picker-close {
        width: 2rem;
        height: 2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: var(--b3-theme-on-surface-light);
        cursor: pointer;
    }

    .date-picker-quick {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .date-picker-chip {
        padding: 0.4rem 0.9rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 999px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface-light);
        font: inherit;
        font-size: 0.84rem;
        cursor: pointer;
        transition: all 0.12s;
    }

    .date-picker-chip.active {
        border-color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
        color: var(--b3-theme-primary);
        font-weight: 600;
    }

    .date-picker-field {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        color: var(--b3-theme-on-surface-light);
        font-size: 0.78rem;
    }

    .date-picker-field input {
        width: 100%;
        box-sizing: border-box;
        padding: 0.55rem 0.65rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-background);
        font: inherit;
    }

    // ── Asset Picker Modal ──
    .asset-picker-overlay {
        position: fixed;
        inset: 0;
        z-index: 1000;
        background: rgba(0, 0, 0, 0.08);
    }

    .asset-picker-panel {
        position: fixed;
        left: var(--picker-left, 1rem);
        top: var(--picker-top, 1rem);
        width: var(--picker-width, 460px);
        max-height: var(--picker-max-height, 70vh);
        display: flex;
        flex-direction: column;
        border-radius: 16px;
        background: var(--b3-theme-background);
        box-shadow: 0 8px 32px rgba(0,0,0,0.18);
        overflow: hidden;
    }

    .asset-picker-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.85rem 1rem;
        border-bottom: 1px solid var(--b3-border-color);
    }

    .asset-picker-header strong {
        font-size: 0.95rem;
    }

    .asset-picker-close {
        width: 2rem;
        height: 2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: var(--b3-theme-on-surface-light);
        cursor: pointer;
    }

    .asset-picker-list {
        overflow-y: auto;
        padding: 0.4rem;
    }

    .asset-picker-item {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 0.65rem;
        padding: 0.7rem 0.8rem;
        border: 1px solid transparent;
        border-radius: 10px;
        background: transparent;
        color: var(--b3-theme-on-background);
        font: inherit;
        text-align: left;
        cursor: pointer;
        transition: background 0.12s, border-color 0.12s;
    }

    .asset-picker-item:hover {
        background: color-mix(in srgb, var(--b3-theme-surface) 70%, transparent);
    }

    .asset-picker-item.active {
        border-color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
    }

    .asset-picker-icon {
        width: 2.2rem;
        height: 2.2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 10px;
        background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
        color: var(--b3-theme-primary);
    }

    .asset-picker-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.05rem;
    }

    .asset-picker-name {
        font-weight: 600;
        font-size: 0.9rem;
    }

    .asset-picker-type {
        font-size: 0.72rem;
        color: var(--b3-theme-on-surface-light);
    }

    .asset-picker-balance {
        font-size: 0.82rem;
        font-weight: 600;
        color: var(--b3-theme-on-background);
    }

    .asset-picker-empty {
        min-height: 10rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        color: var(--b3-theme-on-surface-light);
        text-align: center;
        padding: 1rem;
    }

    @media (max-width: 560px) {
        .qe-categories {
            grid-template-columns: repeat(5, 1fr);
            gap: 0.4rem;
            justify-content: stretch;
        }

        .qe-cat-btn {
            width: 100%;
            min-height: auto;
        }

        .qe-amount-value {
            font-size: 2rem;
        }

        .qe-key {
            min-height: 2.6rem;
            font-size: 1rem;
        }
    }
</style>
