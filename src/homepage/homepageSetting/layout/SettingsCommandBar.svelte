<script lang="ts">
    import { onMount } from "svelte";
    import { AlertCircle, Check, LoaderCircle, Search, X } from "@lucide/svelte";
    import PremiumMark from "@/components/utils/shared/PremiumMark.svelte";
    import { searchHomepageSettings, type SettingSearchResult, type SettingsSaveStatus } from "../settingsExperience";

    interface Props {
        saveStatus: SettingsSaveStatus;
        saveMode?: "auto" | "manual" | "none";
        onSelectResult: (result: SettingSearchResult) => void;
        onRetrySave: () => void;
    }

    let { saveStatus, saveMode = "auto", onSelectResult, onRetrySave }: Props = $props();
    let query = $state("");
    let inputElement: HTMLInputElement | null = $state(null);
    let open = $state(false);
    let activeIndex = $state(0);
    let results = $derived(searchHomepageSettings(query));

    let statusMeta = $derived.by(() => {
        if (saveStatus === "pending" || saveStatus === "saving") {
            return { label: "保存中", tone: "working", icon: LoaderCircle } as const;
        }
        if (saveStatus === "saved") return { label: "已保存", tone: "success", icon: Check } as const;
        if (saveStatus === "synced") return { label: "已同步", tone: "success", icon: Check } as const;
        if (saveStatus === "error") return { label: "保存失败，点击重试", tone: "error", icon: AlertCircle } as const;
        if (saveMode === "manual") return { label: "在页面内保存", tone: "idle", icon: Check } as const;
        return { label: "自动保存", tone: "idle", icon: Check } as const;
    });
    let StatusIcon = $derived(statusMeta.icon);

    $effect(() => {
        query;
        activeIndex = 0;
    });

    function selectResult(result: SettingSearchResult): void {
        onSelectResult(result);
        query = "";
        open = false;
    }

    function handleInputKeydown(event: KeyboardEvent): void {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            open = true;
            activeIndex = Math.min(activeIndex + 1, Math.max(0, results.length - 1));
            return;
        }
        if (event.key === "ArrowUp") {
            event.preventDefault();
            activeIndex = Math.max(0, activeIndex - 1);
            return;
        }
        if (event.key === "Enter" && results[activeIndex]) {
            event.preventDefault();
            selectResult(results[activeIndex]);
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            query = "";
            open = false;
            inputElement?.blur();
        }
    }

    function handleBlur(): void {
        window.setTimeout(() => {
            if (document.activeElement !== inputElement) open = false;
        }, 120);
    }

    onMount(() => {
        const handleShortcut = (event: KeyboardEvent): void => {
            if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLocaleLowerCase() !== "k") return;
            event.preventDefault();
            inputElement?.focus();
            open = true;
        };
        window.addEventListener("keydown", handleShortcut);
        return () => window.removeEventListener("keydown", handleShortcut);
    });
</script>

<div class="settings-command-bar">
    <div class="settings-search" role="search">
        <Search size={16} aria-hidden="true" />
        <label class="fn__none" for="homepage-settings-search">搜索设置</label>
        <input
            id="homepage-settings-search"
            bind:this={inputElement}
            bind:value={query}
            type="search"
            role="combobox"
            placeholder="搜索设置、功能或作用域"
            autocomplete="off"
            aria-label="搜索全部主页插件设置"
            aria-autocomplete="list"
            aria-expanded={open && query.trim().length > 0}
            aria-controls="homepage-settings-search-results"
            aria-activedescendant={open && results[activeIndex] ? `homepage-settings-search-result-${results[activeIndex].id}` : undefined}
            onfocus={() => open = true}
            oninput={() => open = true}
            onkeydown={handleInputKeydown}
            onblur={handleBlur}
        />
        {#if query}
            <button class="settings-search__clear" type="button" aria-label="清空设置搜索" onclick={() => { query = ""; inputElement?.focus(); }}>
                <X size={14} aria-hidden="true" />
            </button>
        {/if}

        {#if open && query.trim().length > 0}
            <div id="homepage-settings-search-results" class="settings-search-results" role="listbox" aria-label="设置搜索结果">
                {#if results.length > 0}
                    {#each results as result, index (result.id)}
                        <button
                            id={`homepage-settings-search-result-${result.id}`}
                            type="button"
                            role="option"
                            aria-selected={index === activeIndex}
                            class:active={index === activeIndex}
                            onmousedown={(event) => event.preventDefault()}
                            onmouseenter={() => activeIndex = index}
                            onclick={() => selectResult(result)}
                        >
                            <span class="settings-search-result__body">
                                <span class="settings-search-result__title">
                                    <span class="settings-search-result__title-text">{result.title}</span>
                                    {#if result.requiresAdvanced}<PremiumMark />{/if}
                                </span>
                                <span class="settings-search-result__description">{result.description}</span>
                                <span class="settings-search-result__path">{result.pathLabel}</span>
                            </span>
                            <span class="settings-search-result__scope">{result.scopeLabel}</span>
                        </button>
                    {/each}
                {:else}
                    <div class="settings-search-empty">
                        <strong>没有找到“{query.trim()}”</strong>
                        <span>可以尝试功能名称，例如“横幅”“机器人”“当前设备”或“通知”。</span>
                    </div>
                {/if}
            </div>
        {/if}
    </div>

    {#if saveMode !== "none"}
    <button
        type="button"
        class="settings-save-state"
        class:settings-save-state--working={statusMeta.tone === "working"}
        class:settings-save-state--success={statusMeta.tone === "success"}
        class:settings-save-state--error={statusMeta.tone === "error"}
        disabled={saveStatus !== "error"}
        aria-live="polite"
        onclick={() => saveStatus === "error" && onRetrySave()}
    >
        <StatusIcon size={14} aria-hidden="true" class={statusMeta.tone === "working" ? "spin" : undefined} />
        <span>{statusMeta.label}</span>
    </button>
    {/if}
</div>

<style>
    .settings-command-bar {
        position: relative;
        z-index: 12;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex: 0 0 auto;
        min-height: 56px;
        padding: 8px 16px;
        box-sizing: border-box;
        background: color-mix(in srgb, var(--b3-theme-background) 94%, var(--b3-theme-primary) 6%);
        border-bottom: 1px solid var(--b3-border-color);
    }

    .settings-search {
        position: relative;
        display: flex;
        align-items: center;
        width: min(520px, 100%);
        min-width: 180px;
        color: var(--b3-theme-on-surface-light);
    }

    .settings-search > :global(svg:first-child) {
        position: absolute;
        left: 12px;
        z-index: 1;
        pointer-events: none;
    }

    .settings-search input {
        width: 100%;
        height: 40px;
        padding: 0 42px 0 38px;
        box-sizing: border-box;
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        outline: none;
        color: var(--b3-theme-on-surface);
        background: var(--b3-theme-surface);
        font: inherit;
        transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
    }

    .settings-search input:focus {
        border-color: var(--b3-theme-primary);
        background: var(--b3-theme-background);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--b3-theme-primary) 16%, transparent);
    }

    .settings-search__clear {
        position: absolute;
        right: 4px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        border: 0;
        border-radius: 8px;
        color: var(--b3-theme-on-surface-light);
        background: transparent;
        cursor: pointer;
    }

    .settings-search__clear:hover,
    .settings-search__clear:focus-visible {
        color: var(--b3-theme-on-surface);
        background: var(--b3-list-hover);
        outline: none;
    }

    .settings-search-results {
        position: absolute;
        top: calc(100% + 8px);
        left: 0;
        width: 100%;
        max-height: min(520px, calc(100vh - 180px));
        overflow: auto;
        padding: 6px;
        box-sizing: border-box;
        border: 1px solid var(--b3-border-color);
        border-radius: 12px;
        background: var(--b3-theme-surface);
        box-shadow: 0 14px 38px color-mix(in srgb, var(--b3-theme-on-surface) 16%, transparent);
    }

    .settings-search-results button {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        width: 100%;
        min-height: 64px;
        padding: 10px 12px;
        border: 0;
        border-radius: 8px;
        color: var(--b3-theme-on-surface);
        background: transparent;
        text-align: left;
        cursor: pointer;
    }

    .settings-search-results button:hover,
    .settings-search-results button.active {
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, var(--b3-list-hover));
    }

    .settings-search-results button:focus-visible {
        outline: 2px solid var(--b3-theme-primary);
        outline-offset: -2px;
    }

    .settings-search-result__body {
        display: grid;
        min-width: 0;
        gap: 2px;
    }

    .settings-search-result__title {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        overflow: hidden;
        font-size: 13px;
        font-weight: 650;
        line-height: 1.45;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .settings-search-result__title-text {
        overflow: hidden;
        min-width: 0;
        text-overflow: ellipsis;
    }

    .settings-search-result__description,
    .settings-search-result__path {
        overflow: hidden;
        color: var(--b3-theme-on-surface-light);
        font-size: 11px;
        line-height: 1.4;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .settings-search-result__path {
        color: color-mix(in srgb, var(--b3-theme-primary) 72%, var(--b3-theme-on-surface));
    }

    .settings-search-result__scope {
        flex: 0 0 auto;
        padding: 3px 7px;
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 22%, var(--b3-border-color));
        border-radius: 999px;
        color: var(--b3-theme-on-surface-light);
        background: color-mix(in srgb, var(--b3-theme-primary) 6%, transparent);
        font-size: 10px;
        line-height: 1.4;
    }

    .settings-search-empty {
        display: grid;
        gap: 4px;
        padding: 18px 14px;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        line-height: 1.5;
    }

    .settings-search-empty strong {
        color: var(--b3-theme-on-surface);
        font-size: 13px;
    }

    .settings-save-state {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-width: 92px;
        min-height: 36px;
        padding: 6px 10px;
        border: 1px solid transparent;
        border-radius: 999px;
        color: var(--b3-theme-on-surface-light);
        background: transparent;
        font-size: 11px;
        white-space: nowrap;
    }

    .settings-save-state:disabled {
        opacity: 1;
        cursor: default;
    }

    .settings-save-state--working {
        color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, transparent);
    }

    .settings-save-state--success {
        color: var(--b3-theme-primary);
    }

    .settings-save-state--error {
        color: var(--b3-theme-error);
        border-color: color-mix(in srgb, var(--b3-theme-error) 28%, transparent);
        background: color-mix(in srgb, var(--b3-theme-error) 8%, transparent);
        cursor: pointer;
    }

    .settings-save-state--error:hover,
    .settings-save-state--error:focus-visible {
        background: color-mix(in srgb, var(--b3-theme-error) 14%, transparent);
        outline: none;
    }

    .settings-save-state :global(.spin) {
        animation: settings-command-spin 900ms linear infinite;
    }

    @keyframes settings-command-spin {
        to { transform: rotate(360deg); }
    }

    @media (max-width: 760px) {
        .settings-command-bar {
            padding-inline: 10px;
        }

        .settings-save-state {
            min-width: 36px;
        }

        .settings-save-state span {
            display: none;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .settings-search input,
        .settings-save-state :global(.spin) {
            transition: none;
            animation: none;
        }
    }
</style>
