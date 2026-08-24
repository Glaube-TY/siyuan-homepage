<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import type { KbSettings, WebSearchSettings } from "@/features/kb/types/settings";
    import { DEFAULT_KB_SETTINGS } from "@/features/kb/constants/default-settings";
    import { getKbSettingsForEdit, saveKbSettings } from "@/features/kb/services/settings/kb-settings-service";
    import WebSearchSettingsTab from "@/features/kb/components/panels/settings-tabs/web-search-settings-tab.svelte";

    let settings: KbSettings = structuredClone(DEFAULT_KB_SETTINGS);
    let loading = true;
    let message = "";
    let error = false;
    const AUTO_SAVE_DELAY_MS = 600;
    let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
    let autoSaveTask: Promise<void> = Promise.resolve();
    let settingsLoaded = false;
    let lastSavedSignature = "";

    function webSearchSignature(value: WebSearchSettings): string {
        return JSON.stringify(value);
    }

    onMount(async () => {
        try {
            settings = await getKbSettingsForEdit();
            lastSavedSignature = webSearchSignature(settings.webSearch);
            settingsLoaded = true;
        } catch (reason) {
            error = true;
            message = reason instanceof Error ? reason.message : "联网搜索设置加载失败。";
        } finally {
            loading = false;
        }
    });

    function scheduleAutoSave(): void {
        if (!settingsLoaded) return;
        const signature = webSearchSignature(settings.webSearch);
        if (signature === lastSavedSignature) return;
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        message = "等待自动保存...";
        error = false;
        autoSaveTimer = setTimeout(() => {
            autoSaveTimer = null;
            void queueAutoSave(structuredClone(settings.webSearch), signature);
        }, AUTO_SAVE_DELAY_MS);
    }

    function queueAutoSave(draft: WebSearchSettings, signature: string): Promise<void> {
        autoSaveTask = autoSaveTask
            .catch(() => undefined)
            .then(async () => {
                if (!settingsLoaded || signature === lastSavedSignature) return;
                message = "自动保存中...";
                error = false;
                let saveSucceeded = false;
                try {
                    const mergedSettings = await saveKbSettings({ webSearch: draft });
                    lastSavedSignature = webSearchSignature(mergedSettings.webSearch);
                    if (webSearchSignature(settings.webSearch) === signature) {
                        settings = { ...settings, webSearch: mergedSettings.webSearch };
                    }
                    message = "已自动保存";
                    saveSucceeded = true;
                } catch (reason) {
                    error = true;
                    message = reason instanceof Error ? reason.message : "联网搜索设置自动保存失败。";
                }
                if (saveSucceeded && webSearchSignature(settings.webSearch) !== lastSavedSignature) {
                    scheduleAutoSave();
                }
            });
        return autoSaveTask;
    }

    onDestroy(() => {
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        if (settingsLoaded && webSearchSignature(settings.webSearch) !== lastSavedSignature) {
            void queueAutoSave(structuredClone(settings.webSearch), webSearchSignature(settings.webSearch));
        }
    });
</script>

{#if loading}
    <div class="web-search-center-loading">加载联网搜索设置...</div>
{:else}
    <div class="web-search-center">
        <div class="web-search-center-header">
            <div>
                <h3>全局联网搜索</h3>
                <p>AI 知识库、Robot 和其他 Agent 入口共用这里的联网搜索设置。</p>
            </div>
            <div class="web-search-center-actions" aria-live="polite">
                {#if message}
                    <span class:error>{message}</span>
                {/if}
            </div>
        </div>
        {#if error}
            <div class="web-search-center-error">{message}</div>
        {:else}
            <WebSearchSettingsTab bind:settings onSettingsChange={scheduleAutoSave} />
        {/if}
    </div>
{/if}

<style>
    .web-search-center-loading {
        padding: 2rem;
        color: var(--b3-theme-on-surface-light);
    }

    .web-search-center {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .web-search-center-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        padding-bottom: 0.75rem;
        border-bottom: 1px solid var(--b3-border-color);
    }

    h3 {
        margin: 0 0 0.25rem;
        font-size: 16px;
    }

    p {
        margin: 0;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
    }

    .web-search-center-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-shrink: 0;
    }

    .web-search-center-actions span {
        color: var(--b3-theme-primary);
        font-size: 12px;
    }

    .web-search-center-actions span.error,
    .web-search-center-error {
        color: var(--b3-theme-error);
    }

    .web-search-center-error {
        padding: 0.75rem;
        border: 1px solid var(--b3-theme-error);
        border-radius: 6px;
        font-size: 12px;
    }
</style>
