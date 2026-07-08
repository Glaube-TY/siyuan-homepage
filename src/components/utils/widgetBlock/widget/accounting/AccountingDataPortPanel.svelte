<script lang="ts">
    import AccountingIcon from "./AccountingIcon.svelte";
    import {
        parseQianjiCsv,
        parseQianjiJson,
        parseSiyuanHomepageJson,
        parseGenericCsv,
        detectImportFormat,
        buildAccountingImportPreview,
        importAccountingData,
        exportAccountingData,
        readFileAsText,
        isPcEnvironment,
        type AccountingImportFormat,
        type AccountingImportPreview,
        type AccountingImportResult,
        type AccountingImportRow,
    } from "./accountingImportExport";
    import { loadAccountingRecordsAll } from "./accountingData";
    import { loadAccountingAccounts } from "./accountingAccountData";
    import type { AccountingAppSettings } from "./accountingSettings";
    import type { AccountingAccount, AccountingAccountInput } from "./accountingTypes";

    interface Props {
        plugin: any;
        appSettings: AccountingAppSettings | null;
        onImportCompleted?: () => void | Promise<void>;
    }

    let { plugin, appSettings, onImportCompleted }: Props = $props();

    let selectedFormat = $state<AccountingImportFormat>("auto");
    let preview = $state<AccountingImportPreview | null>(null);
    let pendingRows = $state<AccountingImportRow[]>([]);
    let pendingAssets = $state<AccountingAccountInput[]>([]);
    let isImporting = $state(false);
    let progress = $state({ current: 0, total: 0, success: 0, skipped: 0, failed: 0 });
    let result = $state<AccountingImportResult | null>(null);
    let importError = $state("");
    let fileName = $state("");
    let isPc = $state(isPcEnvironment());

    let fileInput: HTMLInputElement | undefined = $state();

    const formatLabels: Record<AccountingImportFormat, string> = {
        auto: "自动识别",
        "qianji-csv": "钱迹 CSV",
        "qianji-json": "钱迹 JSON TXT",
        "siyuan-homepage-json": "插件 JSON 备份",
        "generic-csv": "通用 CSV",
    };

    async function buildPreview(format: Exclude<AccountingImportFormat, "auto">, text: string): Promise<void> {
        if (!appSettings) {
            importError = "请先完成记账设置";
            return;
        }

        let rows: AccountingImportRow[] = [];
        let assets: AccountingAccountInput[] = [];
        const errors: string[] = [];

        try {
            switch (format) {
                case "qianji-csv": {
                    const parsed = parseQianjiCsv(text, appSettings);
                    rows = parsed.rows;
                    errors.push(...parsed.errors);
                    break;
                }
                case "qianji-json": {
                    const parsed = parseQianjiJson(text, appSettings);
                    rows = parsed.rows;
                    errors.push(...parsed.errors);
                    break;
                }
                case "siyuan-homepage-json": {
                    const parsed = parseSiyuanHomepageJson(text);
                    rows = parsed.rows;
                    assets = parsed.assets;
                    errors.push(...parsed.errors);
                    break;
                }
                case "generic-csv": {
                    const parsed = parseGenericCsv(text, appSettings);
                    rows = parsed.rows;
                    errors.push(...parsed.errors);
                    break;
                }
            }
        } catch (e) {
            importError = e instanceof Error ? e.message : "解析失败";
            return;
        }

        const existingRecordIds = new Set<string>();
        const existingAccounts: AccountingAccount[] = [];

        try {
            const recordsResult = await loadAccountingRecordsAll(plugin);
            recordsResult.records.forEach((r) => existingRecordIds.add(r.recordId));
        } catch {
            errors.push("无法读取现有流水，预览中的重复数量可能不准确。");
        }

        try {
            const accountsResult = await loadAccountingAccounts(plugin);
            existingAccounts.push(...accountsResult.accounts);
        } catch {
            errors.push("无法读取现有资产，预览中的新增资产数量可能不准确。");
        }

        pendingRows = rows;
        pendingAssets = assets;
        preview = buildAccountingImportPreview(format, rows, existingRecordIds, existingAccounts, errors);
        result = null;
        importError = "";
    }

    async function handleFileSelect(event: Event): Promise<void> {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file || !appSettings) return;

        fileName = file.name;
        importError = "";
        result = null;
        preview = null;
        pendingRows = [];
        pendingAssets = [];

        try {
            const text = await readFileAsText(file);
            const detected: Exclude<AccountingImportFormat, "auto"> =
                selectedFormat === "auto" ? detectImportFormat(file.name, text) : selectedFormat;
            if (selectedFormat === "auto") {
                selectedFormat = detected;
            }
            await buildPreview(detected, text);
        } catch (e) {
            importError = e instanceof Error ? e.message : "读取文件失败";
        } finally {
            if (fileInput) fileInput.value = "";
        }
    }

    async function runImport(): Promise<void> {
        if (!appSettings || pendingRows.length === 0) return;

        isImporting = true;
        progress = { current: 0, total: pendingRows.length, success: 0, skipped: 0, failed: 0 };
        result = null;
        importError = "";

        try {
            const existingRecordIds = new Set<string>();
            const existingAccounts: AccountingAccount[] = [];

            try {
                const recordsResult = await loadAccountingRecordsAll(plugin);
                recordsResult.records.forEach((r) => existingRecordIds.add(r.recordId));
            } catch {
                // ignore
            }

            try {
                const accountsResult = await loadAccountingAccounts(plugin);
                existingAccounts.push(...accountsResult.accounts);
            } catch {
                // ignore
            }

            result = await importAccountingData({
                plugin,
                appSettings,
                rows: pendingRows,
                existingRecordIds,
                existingAccounts,
                assets: pendingAssets,
                onProgress: (p) => {
                    progress = p;
                },
            });

            await onImportCompleted?.();
        } catch (e) {
            importError = e instanceof Error ? e.message : "导入失败";
        } finally {
            isImporting = false;
            progress = { current: 0, total: 0, success: 0, skipped: 0, failed: 0 };
        }
    }

    function clearPreview(): void {
        preview = null;
        pendingRows = [];
        pendingAssets = [];
        result = null;
        importError = "";
        fileName = "";
        selectedFormat = "auto";
    }

    function triggerDownload(blob: Blob, name: string): void {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function runExport(): Promise<void> {
        if (!appSettings) {
            importError = "请先完成记账设置";
            return;
        }
        try {
            const { blob, fileName: exportName } = await exportAccountingData({ plugin, appSettings });
            triggerDownload(blob, exportName);
        } catch (e) {
            importError = e instanceof Error ? e.message : "导出失败";
        }
    }
</script>

<section class="sp-section">
    <div class="sp-section-title">数据导入 / 导出</div>

    <div class="sp-row">
        <label class="sp-label" for="import-format">导入格式</label>
        <select id="import-format" class="sp-select" bind:value={selectedFormat} disabled={isImporting}>
            <option value="auto">自动识别</option>
            <option value="qianji-csv">钱迹 CSV</option>
            <option value="qianji-json">钱迹 JSON TXT</option>
            <option value="siyuan-homepage-json">插件 JSON 备份</option>
            <option value="generic-csv">通用 CSV</option>
        </select>
    </div>

    {#if !isPc}
        <div class="sp-hint">数据导入/导出仅支持 PC 端。</div>
    {:else}
        <div class="sp-actions">
            <button class="sp-button sp-button--secondary" onclick={() => fileInput?.click()} disabled={isImporting}>
                <AccountingIcon name="open" size={14} />
                <span>选择文件</span>
            </button>
            <input bind:this={fileInput} type="file" accept=".csv,.txt,.json" onchange={handleFileSelect} style="display: none;" />
        </div>
    {/if}

    {#if fileName}
        <div class="sp-file-name">已选择：{fileName}</div>
    {/if}

    {#if preview}
        <div class="sp-preview">
            <div class="sp-preview-title">导入预览</div>
            <div class="sp-preview-grid">
                <div class="sp-preview-item">
                    <span class="sp-preview-label">识别格式</span>
                    <span class="sp-preview-value">{formatLabels[preview.format]}</span>
                </div>
                <div class="sp-preview-item">
                    <span class="sp-preview-label">总记录</span>
                    <span class="sp-preview-value">{preview.totalRows}</span>
                </div>
                <div class="sp-preview-item">
                    <span class="sp-preview-label">有效 / 无效</span>
                    <span class="sp-preview-value">{preview.validRows} / {preview.invalidRows}</span>
                </div>
                <div class="sp-preview-item">
                    <span class="sp-preview-label">支出 / 收入 / 转账</span>
                    <span class="sp-preview-value">{preview.expenseCount} / {preview.incomeCount} / {preview.transferCount}</span>
                </div>
                <div class="sp-preview-item">
                    <span class="sp-preview-label">预计重复</span>
                    <span class="sp-preview-value">{preview.duplicateCount}</span>
                </div>
                <div class="sp-preview-item">
                    <span class="sp-preview-label">预计新增资产</span>
                    <span class="sp-preview-value">{preview.newAssetCount}</span>
                </div>
            </div>

            {#if preview.sampleRows.length > 0}
                <div class="sp-preview-subtitle">前 {preview.sampleRows.length} 条预览</div>
                <div class="sp-sample-list">
                    {#each preview.sampleRows as row}
                        <div class="sp-sample-item">
                            <span class="sp-sample-date">{row.date}</span>
                            <span class="sp-sample-direction" data-direction={row.direction}>
                                {row.direction === "expense" ? "支" : row.direction === "income" ? "收" : "转"}
                            </span>
                            <span class="sp-sample-title">{row.title}</span>
                            <span class="sp-sample-amount">{row.amount.toFixed(2)} {row.currency}</span>
                        </div>
                    {/each}
                </div>
            {/if}

            {#if preview.errors.length > 0}
                <div class="sp-preview-errors">
                    {#each preview.errors.slice(0, 5) as err}
                        <div class="sp-preview-error">{err}</div>
                    {/each}
                </div>
            {/if}
        </div>

        <div class="sp-actions">
            <button class="sp-button sp-button--primary" onclick={runImport} disabled={isImporting || preview.validRows === 0}>
                {#if isImporting}
                    导入中…
                {:else}
                    确认导入
                {/if}
            </button>
            <button class="sp-button sp-button--ghost" onclick={clearPreview} disabled={isImporting}>清空预览</button>
        </div>
    {/if}

    {#if isImporting}
        <div class="sp-progress">
            导入中 {progress.current}/{progress.total} · 成功 {progress.success} · 跳过 {progress.skipped} · 失败 {progress.failed}
        </div>
    {/if}

    {#if result}
        <div class="sp-result">
            导入完成：成功 {result.successCount} · 跳过重复 {result.skippedCount} · 失败 {result.failedCount} · 新增资产 {result.newAssetCount}
            {#if result.errors.length > 0}
                <div class="sp-result-errors">
                    {#each result.errors.slice(0, 5) as err}
                        <div class="sp-result-error">{err.recordId}: {err.message}</div>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}

    {#if importError}
        <div class="sp-error">{importError}</div>
    {/if}

    {#if isPc}
        <div class="sp-actions">
            <button class="sp-button sp-button--secondary" onclick={runExport} disabled={isImporting}>
                <AccountingIcon name="records" size={14} />
                <span>导出备份</span>
            </button>
        </div>
    {/if}
</section>

<style>
    .sp-section {
        margin-top: 16px;
        padding: 16px;
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 8px;
        background: var(--b3-theme-background, #fff);
    }

    .sp-section-title {
        font-size: 15px;
        font-weight: 600;
        margin-bottom: 12px;
        color: var(--b3-theme-on-background, #222);
    }

    .sp-row {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
    }

    .sp-label {
        font-size: 13px;
        color: var(--b3-theme-on-surface, #666);
        white-space: nowrap;
    }

    .sp-select {
        flex: 1;
        padding: 6px 10px;
        font-size: 13px;
        border: 1px solid var(--b3-border-color, #d0d0d0);
        border-radius: 6px;
        background: var(--b3-theme-background, #fff);
        color: var(--b3-theme-on-background, #222);
    }

    .sp-hint {
        font-size: 13px;
        color: var(--b3-theme-on-surface, #888);
        padding: 12px 0;
    }

    .sp-actions {
        display: flex;
        gap: 8px;
        margin-top: 12px;
    }

    .sp-button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        font-size: 13px;
        border-radius: 6px;
        border: 1px solid var(--b3-border-color, #d0d0d0);
        background: var(--b3-theme-background, #fff);
        color: var(--b3-theme-on-background, #222);
        cursor: pointer;
    }

    .sp-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .sp-button--primary {
        background: var(--b3-theme-primary, #4285f4);
        color: #fff;
        border-color: var(--b3-theme-primary, #4285f4);
    }

    .sp-button--ghost {
        border-color: transparent;
        background: transparent;
    }

    .sp-file-name {
        font-size: 12px;
        color: var(--b3-theme-on-surface, #888);
        margin-top: 8px;
    }

    .sp-preview {
        margin-top: 12px;
        padding: 12px;
        border-radius: 6px;
        background: var(--b3-theme-surface, #f8f9fa);
    }

    .sp-preview-title,
    .sp-preview-subtitle {
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 8px;
        color: var(--b3-theme-on-background, #222);
    }

    .sp-preview-subtitle {
        margin-top: 12px;
    }

    .sp-preview-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 8px;
    }

    .sp-preview-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .sp-preview-label {
        font-size: 11px;
        color: var(--b3-theme-on-surface, #888);
    }

    .sp-preview-value {
        font-size: 13px;
        color: var(--b3-theme-on-background, #222);
    }

    .sp-sample-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .sp-sample-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        padding: 6px 8px;
        border-radius: 4px;
        background: var(--b3-theme-background, #fff);
        color: var(--b3-theme-on-background, #222);
    }

    .sp-sample-date {
        color: var(--b3-theme-on-surface, #888);
        white-space: nowrap;
    }

    .sp-sample-direction {
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        font-size: 10px;
        color: #fff;
        flex-shrink: 0;
    }

    .sp-sample-direction[data-direction="expense"] {
        background: #ef4444;
    }

    .sp-sample-direction[data-direction="income"] {
        background: #22c55e;
    }

    .sp-sample-direction[data-direction="transfer"] {
        background: #8b5cf6;
    }

    .sp-sample-title {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .sp-sample-amount {
        white-space: nowrap;
        font-weight: 500;
    }

    .sp-preview-errors,
    .sp-result-errors {
        margin-top: 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .sp-preview-error,
    .sp-result-error {
        font-size: 12px;
        color: #ef4444;
    }

    .sp-progress {
        margin-top: 12px;
        font-size: 13px;
        color: var(--b3-theme-primary, #4285f4);
    }

    .sp-result {
        margin-top: 12px;
        font-size: 13px;
        padding: 10px;
        border-radius: 6px;
        background: var(--b3-theme-surface, #f0fdf4);
        color: var(--b3-theme-on-background, #222);
    }

    .sp-error {
        margin-top: 12px;
        font-size: 13px;
        color: #ef4444;
        padding: 8px;
        border-radius: 6px;
        background: #fef2f2;
    }
</style>
