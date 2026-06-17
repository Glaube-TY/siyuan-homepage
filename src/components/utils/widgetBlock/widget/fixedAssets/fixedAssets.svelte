<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import {
        archiveFixedAsset,
        getAssetCostDays,
        getAssetDailyCost,
        getAssetTotalCost,
        getDaysBetween,
        loadFixedAssets,
        saveFixedAsset,
        FIXED_ASSET_COST_PERIODS,
        normalizeFixedAssetCostPeriod,
        getAssetPeriodCost,
        type FixedAssetCostMode,
        type FixedAssetRecord,
        type FixedAssetsStoreStatus,
    } from "./fixedAssetsData";
    import { openSiyuanEmojiPicker } from "@/homepage/homepageSetting/emojiPicker";
    import { resolveConfiguredDocIcon } from "@/components/tools/docIcon";
    import { resolveDatabaseIdFromExistingWidgets } from "../sharedDatabaseId";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
    import { confirmDialogBoolean, safeConfirmContent } from "@/libs/dialog";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
    }

    type FixedAssetSortBy = "updated" | "dailyCost" | "totalCost" | "days" | "name";

    type FixedAssetForm = {
        id?: string;
        name: string;
        category: string;
        icon: string;
        purchasePrice: number;
        extraCost: number;
        purchaseDate: string;
        retireDate: string;
        warrantyDate: string;
        expectedDays: number;
        costMode: FixedAssetCostMode;
        note: string;
        createdAt?: string;
        updatedAt?: string;
    };

    let { plugin, contentTypeJson = "{}" }: Props = $props();

    let parsedContent = $derived(parseContent(contentTypeJson));
    let widgetTitle = $derived(parsedContent.data?.fixedAssetsTitle || "固定资产");
    let configuredDatabaseId = $derived(parsedContent.data?.fixedAssetsDatabaseId || "");
    let listLimit = $derived(Math.max(1, Number(parsedContent.data?.fixedAssetsListLimit) || 6));
    let sortBy = $derived(normalizeSortBy(parsedContent.data?.fixedAssetsSortBy));
    let showHourly = $derived(parsedContent.data?.fixedAssetsShowHourly ?? true);
    let showMonthly = $derived(parsedContent.data?.fixedAssetsShowMonthly ?? true);
    let showWeekly = $derived(parsedContent.data?.fixedAssetsShowWeekly ?? false);
    let showQuarterly = $derived(parsedContent.data?.fixedAssetsShowQuarterly ?? false);
    let showYearly = $derived(parsedContent.data?.fixedAssetsShowYearly ?? false);
    let itemCostPeriod = $derived(normalizeFixedAssetCostPeriod(parsedContent.data?.fixedAssetsItemCostPeriod, "day"));

    let advancedEnabled = $state(false);
    let isLoading = $state(true);
    let isSaving = $state(false);
    let assets = $state<FixedAssetRecord[]>([]);
    let status = $state<FixedAssetsStoreStatus>({
        ok: false,
        missingFields: [],
        message: "加载中",
    });
    let editorOpen = $state(false);
    let editingAssetId = $state<string | null>(null);
    let form = $state<FixedAssetForm>(createEmptyForm());
    let iconPickerButtonRef = $state<HTMLButtonElement | null>(null);
    let effectiveDatabaseId = $state("");

    let sortedAssets = $derived(sortAssets(assets, sortBy).slice(0, listLimit));
    let totalCost = $derived(assets.reduce((sum, asset) => sum + getAssetTotalCost(asset), 0));
    let totalDailyCost = $derived(assets.reduce((sum, asset) => sum + getAssetDailyCost(asset), 0));
    
    let summaryCards = $derived.by(() => {
        type SummaryCard = { label: string; value: string; subtle?: boolean };
        const cards: SummaryCard[] = [];
        
        // 总资产（必显示）
        cards.push({
            label: "总资产",
            value: formatCurrency(totalCost),
        });
        
        // 日均成本（必显示）
        cards.push({
            label: "日均",
            value: formatCost(totalDailyCost, "/天"),
        });
        
        // 小时成本
        if (showHourly) {
            const totalHourlyCost = totalDailyCost * FIXED_ASSET_COST_PERIODS.hour.dailyMultiplier;
            cards.push({
                label: "小时",
                value: formatCost(totalHourlyCost, "/时"),
                subtle: true,
            });
        }
        
        // 周均成本
        if (showWeekly) {
            const totalWeeklyCost = totalDailyCost * FIXED_ASSET_COST_PERIODS.week.dailyMultiplier;
            cards.push({
                label: "周均",
                value: formatCost(totalWeeklyCost, "/周"),
                subtle: true,
            });
        }
        
        // 月均成本
        if (showMonthly) {
            const totalMonthlyCost = totalDailyCost * FIXED_ASSET_COST_PERIODS.month.dailyMultiplier;
            cards.push({
                label: "月均",
                value: formatCost(totalMonthlyCost, "/月"),
                subtle: true,
            });
        }
        
        // 季均成本
        if (showQuarterly) {
            const totalQuarterlyCost = totalDailyCost * FIXED_ASSET_COST_PERIODS.quarter.dailyMultiplier;
            cards.push({
                label: "季均",
                value: formatCost(totalQuarterlyCost, "/季"),
                subtle: true,
            });
        }
        
        // 年均成本
        if (showYearly) {
            const totalYearlyCost = totalDailyCost * FIXED_ASSET_COST_PERIODS.year.dailyMultiplier;
            cards.push({
                label: "年均",
                value: formatCost(totalYearlyCost, "/年"),
                subtle: true,
            });
        }
        
        return cards;
    });

    onMount(async () => {
        advancedEnabled = Boolean(plugin?.ADVANCED);
        if (!advancedEnabled) {
            isLoading = false;
            return;
        }

        const result = await resolveDatabaseIdFromExistingWidgets(
            plugin,
            "fixedAssets",
            parsedContent.blockId,
            parsedContent,
        );
        effectiveDatabaseId = result.databaseId || configuredDatabaseId;
        await refreshAssets();
    });

    function parseContent(value: string): any {
        try {
            return JSON.parse(value || "{}");
        } catch (error) {
            console.warn("[fixedAssets] 无法解析组件配置", error);
            return {};
        }
    }

    function normalizeSortBy(value: unknown): FixedAssetSortBy {
        if (
            value === "updated" ||
            value === "dailyCost" ||
            value === "totalCost" ||
            value === "days" ||
            value === "name"
        ) {
            return value;
        }
        return "updated";
    }

    function createEmptyForm(): FixedAssetForm {
        return {
            name: "",
            category: "未分类",
            icon: "▣",
            purchasePrice: 0,
            extraCost: 0,
            purchaseDate: new Date().toISOString().slice(0, 10),
            retireDate: "",
            warrantyDate: "",
            expectedDays: 0,
            costMode: "elapsed",
            note: "",
        };
    }

    function createFormFromAsset(asset: FixedAssetRecord): FixedAssetForm {
        return {
            id: asset.id,
            name: asset.name,
            category: asset.category,
            icon: asset.icon,
            purchasePrice: asset.purchasePrice,
            extraCost: asset.extraCost,
            purchaseDate: asset.purchaseDate,
            retireDate: asset.retireDate || "",
            warrantyDate: asset.warrantyDate || "",
            expectedDays: asset.expectedDays || 0,
            costMode: asset.costMode,
            note: asset.note || "",
            createdAt: asset.createdAt,
            updatedAt: asset.updatedAt,
        };
    }

    async function refreshAssets(): Promise<void> {
        isLoading = true;
        const result = await loadFixedAssets(effectiveDatabaseId);
        assets = result.assets;
        status = result.status;
        isLoading = false;
    }

    function sortAssets(list: FixedAssetRecord[], sortValue: FixedAssetSortBy): FixedAssetRecord[] {
        const today = new Date().toISOString().slice(0, 10);
        const sorted = [...list];

        sorted.sort((a, b) => {
            if (sortValue === "dailyCost") return getAssetDailyCost(b) - getAssetDailyCost(a);
            if (sortValue === "totalCost") return getAssetTotalCost(b) - getAssetTotalCost(a);
            if (sortValue === "days") {
                return getDaysBetween(b.purchaseDate, today) - getDaysBetween(a.purchaseDate, today);
            }
            if (sortValue === "name") return a.name.localeCompare(b.name, "zh-CN");
            return b.updatedAt.localeCompare(a.updatedAt);
        });

        return sorted;
    }

    function formatCurrency(value: number): string {
        return new Intl.NumberFormat("zh-CN", {
            style: "currency",
            currency: "CNY",
            maximumFractionDigits: value >= 100 ? 0 : 2,
        }).format(Number.isFinite(value) ? value : 0);
    }

    function formatCost(value: number, suffix: string): string {
        return `${formatCurrency(value)}${suffix}`;
    }

    function getOwnedDays(asset: FixedAssetRecord): number {
        return getDaysBetween(asset.purchaseDate, new Date().toISOString().slice(0, 10));
    }

    function openCreateEditor(): void {
        editingAssetId = null;
        form = createEmptyForm();
        editorOpen = true;
    }

    function openEditEditor(asset: FixedAssetRecord): void {
        editingAssetId = asset.id;
        form = createFormFromAsset(asset);
        editorOpen = true;
    }

    function closeEditor(): void {
        editorOpen = false;
        editingAssetId = null;
        form = createEmptyForm();
    }

    function getIconResult(value: string): { type: "image" | "text"; value: string } {
        return resolveConfiguredDocIcon(value, "▣");
    }

    function handlePickAssetIcon(): void {
        if (!iconPickerButtonRef) return;
        openSiyuanEmojiPicker(iconPickerButtonRef, (emoji) => {
            form.icon = emoji || "▣";
        });
    }

    function handleFormSubmit(event: SubmitEvent): void {
        event.preventDefault();
        void handleSaveAsset();
    }

    async function handleSaveAsset(): Promise<void> {
        if (!form.name.trim()) {
            showMessage("请输入物品名称");
            return;
        }
        if (!form.purchaseDate) {
            showMessage("请选择购买日期");
            return;
        }

        isSaving = true;
        try {
            await saveFixedAsset(effectiveDatabaseId, {
                ...form,
                id: form.id || editingAssetId || undefined,
                purchasePrice: Number(form.purchasePrice) || 0,
                extraCost: Number(form.extraCost) || 0,
                expectedDays: Number(form.expectedDays) || 0,
            });
            showMessage("固定资产已保存");
            closeEditor();
            await refreshAssets();
        } catch (error) {
            showMessage(error instanceof Error ? error.message : "保存失败");
        } finally {
            isSaving = false;
        }
    }

    async function handleDeleteAsset(asset: FixedAssetRecord): Promise<void> {
        const confirmed = await confirmDialogBoolean({
            title: "删除资产",
            content: safeConfirmContent("确定删除资产「", asset.name, "」吗？"),
        });
        if (!confirmed) return;

        try {
            await archiveFixedAsset(effectiveDatabaseId, asset.id);
            showMessage("资产已删除");
            await refreshAssets();
        } catch (error) {
            showMessage(error instanceof Error ? error.message : "删除失败");
        }
    }
</script>

<div class="fixed-assets-widget">
    {#if !advancedEnabled}
        <div class="content-not-advanced">
            <AdvancedFeatureLock
                title="固定资产"
                subtitle="资产记录与动态成本计算，量化你的消费价值。"
                icon="database"
                features={[
                    "固定资产记录和管理",
                    "动态成本计算（日/周/月/年）",
                    "适合资产追踪和财务分析"
                ]}
                highlights={["资产记录", "成本计算", "财务分析"]}
                compact
            />
        </div>
    {:else if isLoading}
        <div class="state-text">加载固定资产...</div>
    {:else if !status.ok}
        <div class="setup-state">
            <div class="setup-title">需要配置固定资产数据库</div>
            <p>{status.message}</p>
            {#if status.missingFields.length > 0}
                <p class="field-hint">缺少字段：{status.missingFields.join("、")}</p>
            {/if}
            <p class="field-hint">请在组件内容设置中填写固定资产数据库 ID。</p>
        </div>
    {:else}
        <div class="asset-header">
            <h3 class="widget-title">{widgetTitle}</h3>
            <div class="asset-subtitle">共 {assets.length} 件物品</div>
        </div>

        <div class="asset-scroll-area">
            <div class="summary-panel">
                {#each summaryCards as card, index}
                    <div class="summary-item" class:subtle={card.subtle} class:full={summaryCards.length % 2 === 1 && index === summaryCards.length - 1}>
                        <span>{card.label}</span>
                        <strong>{card.value}</strong>
                    </div>
                {/each}
            </div>

            {#if sortedAssets.length === 0}
                <div class="empty-state">
                    <p>还没有资产记录</p>
                    <button onclick={openCreateEditor}>添加第一件资产</button>
                </div>
            {:else}
                <div class="asset-list">
                    <button class="asset-create-card" onclick={openCreateEditor}>
                        <span>添加资产</span>
                    </button>
                    {#each sortedAssets as asset (asset.id)}
                        {@const iconResult = getIconResult(asset.icon)}
                        <article class="asset-card">
                            <button class="asset-main" onclick={() => openEditEditor(asset)} title="编辑资产">
                                <span class="asset-icon">
                                    {#if iconResult.type === "image"}
                                        <img class="asset-icon__image" src={iconResult.value} alt="" />
                                    {:else}
                                        <span class="asset-icon__text">{iconResult.value}</span>
                                    {/if}
                                </span>
                                <span class="asset-info">
                                    <span class="asset-name">{asset.name}</span>
                                    <span class="asset-meta">
                                        {asset.category} · {formatCurrency(getAssetTotalCost(asset))} · {formatCost(getAssetPeriodCost(asset, itemCostPeriod), FIXED_ASSET_COST_PERIODS[itemCostPeriod].suffix)}
                                    </span>
                                    {#if asset.note?.trim()}
                                        <span class="asset-note" title={asset.note}>{asset.note}</span>
                                    {/if}
                                </span>
                                <span class="asset-days">
                                    <strong>{getOwnedDays(asset)}</strong>
                                    <span>天</span>
                                </span>
                            </button>
                            <button class="asset-delete" onclick={() => handleDeleteAsset(asset)} title="删除资产">删除</button>
                        </article>
                    {/each}
                </div>
            {/if}
        </div>

        {#if editorOpen}
            {@const formIconResult = getIconResult(form.icon)}
            <div class="asset-editor-backdrop">
                <form class="asset-editor" onsubmit={handleFormSubmit}>
                    <div class="editor-header">
                        <strong>{editingAssetId ? "编辑资产" : "添加资产"}</strong>
                    </div>

                    <label>
                        <span>物品名称</span>
                        <input type="text" bind:value={form.name} placeholder="例如：笔记本电脑" />
                    </label>

                    <div class="editor-grid">
                        <label>
                            <span>分类</span>
                            <input type="text" bind:value={form.category} placeholder="数码产品" />
                        </label>
                        <label>
                            <span>图标</span>
                            <div class="asset-icon-field">
                                <button
                                    bind:this={iconPickerButtonRef}
                                    type="button"
                                    class="asset-icon-picker"
                                    onclick={handlePickAssetIcon}
                                    title="点击选择图标"
                                >
                                    <span class="asset-icon-picker-preview">
                                        {#if formIconResult.type === "image"}
                                            <img class="asset-icon-picker-preview__image" src={formIconResult.value} alt="" />
                                        {:else}
                                            <span class="asset-icon-picker-preview__text">{formIconResult.value}</span>
                                        {/if}
                                    </span>
                                    <span class="asset-icon-picker-text">点击选择图标</span>
                                </button>
                            </div>
                        </label>
                    </div>

                    <div class="editor-grid">
                        <label>
                            <span>购买价格</span>
                            <input type="number" min="0" step="0.01" bind:value={form.purchasePrice} />
                        </label>
                        <label>
                            <span>附加成本</span>
                            <input type="number" min="0" step="0.01" bind:value={form.extraCost} />
                        </label>
                    </div>

                    <div class="editor-grid">
                        <label>
                            <span>购买日期</span>
                            <input type="date" bind:value={form.purchaseDate} />
                        </label>
                        <label>
                            <span>退役日期</span>
                            <input type="date" bind:value={form.retireDate} />
                        </label>
                    </div>

                    <div class="editor-grid">
                        <label>
                            <span>过保日期</span>
                            <input type="date" bind:value={form.warrantyDate} />
                        </label>
                        <label>
                            <span>预计天数</span>
                            <input type="number" min="0" bind:value={form.expectedDays} />
                        </label>
                    </div>

                    <label>
                        <span>均价方式</span>
                        <select bind:value={form.costMode}>
                            <option value="elapsed">按已拥有时间</option>
                            <option value="expectedLife">按预计使用天数</option>
                            <option value="retireDate">按购买到退役日期</option>
                        </select>
                    </label>

                    <label>
                        <span>备注</span>
                        <textarea bind:value={form.note} placeholder="维修、配件、购买渠道等"></textarea>
                    </label>

                    <div class="editor-preview">
                        <span>当前日均</span>
                        <strong>{formatCost(getAssetTotalCost(form) / Math.max(1, getAssetCostDays({
                            ...form,
                            id: form.id || "preview",
                            createdAt: form.createdAt || "",
                            updatedAt: form.updatedAt || "",
                        })), "/天")}</strong>
                    </div>

                    <div class="editor-actions">
                        <button type="button" class="ghost" onclick={closeEditor}>取消</button>
                        <button type="submit" disabled={isSaving}>{isSaving ? "保存中..." : "保存"}</button>
                    </div>
                </form>
            </div>
        {/if}
    {/if}
</div>

<style lang="scss">
    .fixed-assets-widget {
        position: relative;
        width: 100%;
        height: 100%;
        min-height: 0;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.75rem;
        overflow: hidden;
        overscroll-behavior: contain;
        color: var(--b3-theme-on-background);
        background: transparent;
    }

    .content-not-advanced {
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        box-sizing: border-box;
        overflow: hidden;
        padding: 8px;
    }

    .state-text,
    .setup-state,
    .empty-state {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        text-align: center;
        color: var(--b3-theme-on-surface-light);
    }

    .setup-title {
        font-size: 1rem;
        font-weight: 700;
        color: var(--b3-theme-primary);
    }

    .setup-state p,
    .empty-state p {
        margin: 0;
        line-height: 1.6;
    }

    .field-hint {
        font-size: 0.78rem;
    }

    .asset-header {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.1rem;
        padding-inline: 3rem;
        text-align: center;
    }

    .widget-title {
        width: 100%;
        margin: 0 0 0.12rem;
        padding-bottom: 0.3rem;
        border-bottom: 1px solid var(--b3-border-color);
        font-size: 18px;
        font-weight: 600;
        line-height: 1.2;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .asset-subtitle {
        font-size: 0.72rem;
        color: var(--b3-theme-on-surface-light);
    }

    button {
        border: 1px solid var(--b3-border-color);
        background: transparent;
        color: var(--b3-theme-on-background);
        border-radius: 6px;
        cursor: pointer;
        font: inherit;
    }

    button:hover:not(:disabled) {
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
    }

    button:disabled {
        cursor: not-allowed;
        opacity: 0.6;
    }

    .empty-state button,
    .editor-actions button[type="submit"] {
        padding: 0.25rem 0.7rem;
        border-color: var(--b3-theme-primary);
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
    }

    .summary-panel {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.4rem;
    }

    .asset-scroll-area {
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior: contain;
        padding-right: 0.15rem;
        padding-bottom: 0.15rem;
    }

    .summary-item {
        min-width: 0;
        padding: 0.5rem;
        border-radius: 8px;
        background: color-mix(in srgb, var(--b3-theme-surface-light) 78%, transparent);
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
    }

    .summary-item span {
        font-size: 0.72rem;
        color: var(--b3-theme-on-surface-light);
    }

    .summary-item strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--b3-theme-primary);
    }

    .summary-item.subtle strong {
        font-size: 0.86rem;
        color: var(--b3-theme-on-background);
    }

    .summary-item.full {
        grid-column: 1 / -1;
    }

    .asset-list {
        flex: 0 0 auto;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
        overflow: visible;
    }

    .asset-create-card {
        width: 100%;
        padding: 0.45rem 0.6rem;
        border-style: dashed;
        border-color: color-mix(in srgb, var(--b3-theme-primary) 60%, transparent);
        color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 9%, transparent);
        font-weight: 600;
    }

    .asset-card {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 0;
        gap: 0;
        align-items: stretch;
        overflow: hidden;
        transition:
            grid-template-columns 0.22s ease,
            gap 0.22s ease;
    }

    .asset-card:hover,
    .asset-card:focus-within {
        grid-template-columns: minmax(0, 1fr) 3.3rem;
        gap: 0.35rem;
    }

    .asset-main {
        min-width: 0;
        width: 100%;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.55rem;
        padding: 0.55rem;
        text-align: left;
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
    }

    .asset-icon {
        width: 2rem;
        height: 2rem;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--b3-theme-background) 64%, transparent);
        color: var(--b3-theme-primary);
        font-weight: 700;
    }

    .asset-icon__image {
        width: 100%;
        height: 100%;
        object-fit: contain;
        border-radius: 6px;
    }

    .asset-icon__text {
        font-size: inherit;
        color: inherit;
    }

    .asset-icon-field {
        display: flex;
        align-items: center;
        justify-content: flex-start;
    }

    .asset-icon-picker {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        min-height: 2.2rem;
        padding: 0.35rem 0.7rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: color-mix(in srgb, var(--b3-theme-surface) 100%, transparent);
        color: var(--b3-theme-on-background);
        cursor: pointer;
        font: inherit;
    }

    .asset-icon-picker:hover {
        border-color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
    }

    .asset-icon-picker-text {
        font-size: 0.82rem;
        color: var(--b3-theme-on-surface-light);
        white-space: nowrap;
    }

    .asset-icon-picker-preview {
        width: 1.4rem;
        height: 1.4rem;
        flex: 0 0 1.4rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }

    .asset-icon-picker-preview__image {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }

    .asset-icon-picker-preview__text {
        line-height: 1;
        font-size: 1rem;
    }

    .asset-note {
        display: block;
        margin-top: 0.24rem;
        font-size: 0.72rem;
        color: var(--b3-theme-on-surface-light);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .asset-info {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.18rem;
    }

    .asset-name,
    .asset-meta {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .asset-name {
        font-weight: 700;
    }

    .asset-meta {
        font-size: 0.72rem;
        color: var(--b3-theme-on-surface-light);
    }

    .asset-days {
        display: flex;
        align-items: baseline;
        gap: 0.18rem;
        color: var(--b3-theme-primary);
    }

    .asset-days strong {
        font-size: 1.3rem;
    }

    .asset-delete {
        width: 100%;
        min-width: 0;
        padding: 0;
        font-size: 0.72rem;
        color: var(--b3-theme-error);
        background: color-mix(in srgb, var(--b3-theme-background) 42%, transparent);
        opacity: 0;
        overflow: hidden;
        pointer-events: none;
        transform: translateX(100%);
        white-space: nowrap;
        transition:
            opacity 0.18s ease,
            transform 0.22s ease;
    }

    .asset-card:hover .asset-delete,
    .asset-card:focus-within .asset-delete {
        opacity: 1;
        pointer-events: auto;
        transform: translateX(0);
    }

    .asset-editor-backdrop {
        position: absolute;
        inset: 0;
        padding: 0.6rem;
        background: rgba(0, 0, 0, 0.18);
        display: flex;
        align-items: stretch;
        justify-content: center;
        z-index: 5;
    }

    .asset-editor {
        width: min(100%, 520px);
        max-height: 100%;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
        padding: 0.75rem;
        box-sizing: border-box;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
    }

    .editor-header,
    .editor-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.6rem;
    }

    .editor-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.5rem;
    }

    label {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 0.78rem;
        color: var(--b3-theme-on-surface-light);
    }

    input,
    select,
    textarea {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-background);
        padding: 0.38rem 0.45rem;
        font: inherit;
    }

    textarea {
        min-height: 4.5rem;
        resize: vertical;
    }

    .editor-preview {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem;
        border-radius: 6px;
        background: var(--b3-theme-surface-light);
    }

    .editor-actions {
        justify-content: flex-end;
    }

    .editor-actions button {
        padding: 0.35rem 1rem;
    }

    .editor-actions .ghost {
        background: transparent;
    }
</style>
