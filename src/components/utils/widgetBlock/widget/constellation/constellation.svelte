<script lang="ts">
    import { showMessage } from "siyuan";
    import { onMount } from "svelte";
    import WidgetSemanticTitle from "@/homepage/theme/widgetPresentation/components/WidgetSemanticTitle.svelte";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
    import ClassicConstellation from "./_classic.svelte";
    import ElegantConstellation from "./_elegant.svelte";
    import {
        getConstellationApiValue,
        getConstellationDisplayName,
        normalizeConstellationStyle,
        normalizeConstellationValue,
        type ConstellationValue,
    } from "./constellationShared";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
    }

    type LoadState = "idle" | "loading" | "ready" | "error";

    let { plugin, contentTypeJson = "{}" }: Props = $props();

    function parseContentTypeJson(raw: string): Record<string, any> {
        try {
            const parsed = JSON.parse(raw || "{}");
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch {
            return {};
        }
    }

    const parsedContent = $derived(parseContentTypeJson(contentTypeJson));
    const selectedConstellation = $derived(
        normalizeConstellationValue(parsedContent.data?.selectedConstellation),
    );
    const constellationStyle = $derived(
        normalizeConstellationStyle(parsedContent.data?.constellationStyle),
    );

    let constellationData: Record<string, any> | null = $state(null);
    let advancedEnabled = $state(false);
    let loadState = $state<LoadState>("idle");
    let loadError = $state("");
    let requestGeneration = 0;
    let destroyed = false;

    async function loadConstellationInfo(value: ConstellationValue): Promise<void> {
        const generation = ++requestGeneration;
        loadState = "loading";
        loadError = "";
        constellationData = null;

        try {
            const response = await fetch(
                `https://v2.xxapi.cn/api/horoscope?type=${encodeURIComponent(getConstellationApiValue(value))}&time=today`,
            );
            if (!response.ok) throw new Error(`接口返回 ${response.status}`);

            const payload = await response.json();
            if (payload?.code != 200) {
                throw new Error(payload?.msg || "接口返回异常");
            }
            if (!payload.data || typeof payload.data !== "object") {
                throw new Error("接口返回数据为空");
            }

            if (destroyed || generation !== requestGeneration) return;
            constellationData = payload.data;
            loadState = "ready";
        } catch (error) {
            if (destroyed || generation !== requestGeneration) return;
            loadError = error instanceof Error ? error.message : "运势接口暂不可用";
            loadState = "error";
            showMessage(
                `获取 ${getConstellationDisplayName(value)} 运势错误：${loadError}`,
                5000,
                "error",
            );
        }
    }

    $effect(() => {
        if (!advancedEnabled) {
            requestGeneration++;
            constellationData = null;
            loadState = "idle";
            return;
        }

        const value = selectedConstellation;
        void loadConstellationInfo(value);
    });

    onMount(() => {
        advancedEnabled = Boolean(plugin?.ADVANCED);
        return () => {
            destroyed = true;
            requestGeneration++;
        };
    });

    function retry(): void {
        if (advancedEnabled) void loadConstellationInfo(selectedConstellation);
    }
</script>

<div class="content-display" data-widget-part="root">
    {#if advancedEnabled}
        {#if constellationStyle === "classic"}
            <WidgetSemanticTitle
                widgetType="constellation"
                configuredTitle={constellationData?.title || getConstellationDisplayName(selectedConstellation)}
                semanticLabel="星座运势"
                fallbackIcon="iconGraph"
            />
        {/if}

        {#if loadState === "ready" && constellationData}
            <div class="constellation-body" data-widget-part="body">
                {#if constellationStyle === "classic"}
                    <ClassicConstellation data={constellationData} />
                {:else}
                    <ElegantConstellation
                        data={constellationData}
                        selectedConstellation={selectedConstellation}
                    />
                {/if}
            </div>
        {:else if loadState === "error"}
            <div class="constellation-state constellation-state-error" data-widget-part="body" role="alert">
                <span class="state-mark">!</span>
                <div>
                    <strong>运势信息暂时不可用</strong>
                    <small>{loadError || "接口没有返回有效数据"}</small>
                </div>
                <button type="button" onclick={retry}>重试</button>
            </div>
        {:else}
            <div class="constellation-state" data-widget-part="body" role="status" aria-live="polite" aria-busy="true">
                <span class="state-mark">✦</span>
                <div>
                    <strong>正在加载运势信息…</strong>
                    <small>{getConstellationDisplayName(selectedConstellation)} · 今日</small>
                </div>
            </div>
        {/if}
    {:else}
        <div class="content-not-advanced" data-widget-part="body">
            <AdvancedFeatureLock
                title="星座运势"
                subtitle="每日星座运势更新，了解今日运势走向。"
                icon="star"
                features={[
                    "每日星座运势更新",
                    "多维度运势解析",
                    "适合星座文化爱好者"
                ]}
                highlights={["星座运势", "多维度解析", "每日更新"]}
                compact
            />
        </div>
    {/if}
</div>

<style lang="scss">
    .content-display {
        display: flex;
        width: 100%;
        height: 100%;
        min-height: 0;
        flex-direction: column;
        padding: 1rem;
        box-sizing: border-box;
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
        container: constellation-widget / inline-size;

        :global(.hp-widget-title) {
            margin-bottom: 0.5rem;
            padding-bottom: 0.3rem;
            border-bottom: 1px solid var(--b3-border-color);
            font-size: 18px;
            font-weight: 600;
            line-height: 1.2;
            text-align: center;
        }
    }

    .constellation-body {
        min-width: 0;
        min-height: 0;
    }

    .constellation-state {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 0.7rem;
        padding: 1.25rem 0.5rem;
        color: var(--b3-theme-on-surface-light);
    }

    .constellation-state > div {
        display: flex;
        min-width: 0;
        flex: 1;
        flex-direction: column;
        gap: 0.2rem;
    }

    .constellation-state strong,
    .constellation-state small {
        overflow-wrap: anywhere;
    }

    .constellation-state strong {
        color: var(--b3-theme-on-surface);
        font-size: 13px;
    }

    .constellation-state small {
        font-size: 12px;
    }

    .state-mark {
        display: grid;
        width: 1.6rem;
        height: 1.6rem;
        flex: 0 0 auto;
        place-items: center;
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 30%, transparent);
        border-radius: 50%;
        color: var(--b3-theme-primary);
        font-weight: 700;
    }

    .constellation-state-error .state-mark {
        border-color: color-mix(in srgb, var(--b3-theme-error) 35%, transparent);
        color: var(--b3-theme-error);
    }

    .constellation-state button {
        flex: 0 0 auto;
        padding: 0.35rem 0.65rem;
        border: 1px solid var(--b3-theme-primary);
        border-radius: 6px;
        background: transparent;
        color: var(--b3-theme-primary);
        cursor: pointer;
        font: inherit;
        font-size: 12px;
    }

    .content-not-advanced {
        display: flex;
        width: 100%;
        min-height: 0;
        flex: 1;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
    }
</style>
