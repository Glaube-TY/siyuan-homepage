<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import { Protyle } from "siyuan";
    import { getContentBearingRootDocumentCandidates } from "@/components/tools/siyuanComponentDataApi";
    import { openDocs } from "@/components/tools/openDocs";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import { isValidSiyuanBlockId } from "../../utils/widget-instance-utils";
    import { normalizeProtyleDisplayConfig } from "./protyleDisplayConfig";

    // 组件销毁后丢弃异步结果，避免更新已卸载状态
    let isDestroyed = false;
    let isMounted = $state(false);
    let sourceGeneration = 0;
    let protyleGeneration = 0;
    let protyleFrame = 0;

    onDestroy(() => {
        isDestroyed = true;
        isMounted = false;
        sourceGeneration += 1;
        destroyProtyle();
    });

    interface Props {
        plugin: any;
        contentTypeJson?: string;
    }

    let { plugin, contentTypeJson = "{}" }: Props = $props();

    function parseContentTypeJson(raw: string): any {
        try {
            return JSON.parse(raw || "{}");
        } catch {
            return {};
        }
    }

    const parsed = $derived(parseContentTypeJson(contentTypeJson));
    const configuredBlockID = $derived(String(parsed.data?.[0]?.customBlockId || "").trim());
    const isRandomDoc = $derived(Boolean(parsed.data?.[0]?.isRandomDoc));
    const displayConfig = $derived(normalizeProtyleDisplayConfig(parsed.data?.[0]));
    const protyleOptionsKey = $derived(JSON.stringify({
        showBreadcrumb: displayConfig.showBreadcrumb,
        showDocumentTitle: displayConfig.showDocumentTitle,
    }));
    let blockID = $state("");

    // 文档来源变化时更新目标。漫游结果异步返回，generation 用于丢弃旧请求。
    $effect(() => {
        if (!isMounted) return;

        const generation = ++sourceGeneration;
        if (isRandomDoc) {
            blockID = "";
            void getRandomDocID(generation);
        } else {
            blockID = configuredBlockID;
        }
    });

    // 只在组件挂载、bind:this 与布局稳定后创建编辑器。
    $effect(() => {
        void protyleOptionsKey;
        if (!isMounted || !blockID || !isValidSiyuanBlockId(blockID)) {
            destroyProtyle();
            return;
        }
        destroyAndCreateProtyle(blockID);
    });

    let divProtyle: HTMLDivElement = $state();
    let protyle: any;

    function destroyProtyle(): void {
        protyleGeneration += 1;
        if (protyleFrame) {
            window.cancelAnimationFrame(protyleFrame);
            protyleFrame = 0;
        }
        if (protyle) {
            try { protyle.destroy(); } catch (e) { console.warn("[Protyle] destroy failed:", e); }
            protyle = null;
        }
        if (divProtyle) {
            divProtyle.replaceChildren();
        }
    }

    function destroyAndCreateProtyle(validId: string): void {
        destroyProtyle();
        if (!validId || !isValidSiyuanBlockId(validId) || isDestroyed) return;
        if (!divProtyle || !divProtyle.isConnected) return;
        const gen = ++protyleGeneration;
        protyleFrame = window.requestAnimationFrame(() => {
            protyleFrame = 0;
            if (gen !== protyleGeneration || isDestroyed) return;
            if (!divProtyle || !divProtyle.isConnected) return;
            try {
                divProtyle.replaceChildren();
                protyle = new Protyle(plugin.app, divProtyle, {
                    blockId: validId as string,
                    mode: "wysiwyg",
                    render: {
                        breadcrumb: displayConfig.showBreadcrumb,
                        title: displayConfig.showDocumentTitle,
                    },
                });
            } catch (error) {
                console.warn("[Protyle] new Protyle failed:", error);
            }
        });
    }

    onMount(async () => {
        isDestroyed = false;
        await tick();
        if (isDestroyed) return;
        isMounted = true;
    });

    async function getRandomDocID(generation: number): Promise<void> {
        const docs = await getContentBearingRootDocumentCandidates(200);
        if (isDestroyed || generation !== sourceGeneration || docs.length === 0) {
            return;
        }
        const candidates = docs.filter((doc) => isValidSiyuanBlockId(doc.id));
        if (candidates.length === 0) return;
        const candidate = candidates[Math.floor(Math.random() * candidates.length)];
        blockID = candidate.id;
    }
</script>

<div
    class="content-display"
    class:content-full-width={displayConfig.contentWidthMode === "full"}
    class:content-padding-custom={displayConfig.contentPadding !== "system"}
    class:inner-card={displayConfig.innerCard}
    style={`--protyle-outer-padding:${displayConfig.outerPadding}px;--protyle-content-padding:${displayConfig.contentPadding === "system" ? 0 : displayConfig.contentPadding}px;`}
>
    <div id="protyle" bind:this={divProtyle}></div>
    {#if !displayConfig.showBreadcrumb && blockID && isValidSiyuanBlockId(blockID)}
        <button
            type="button"
            class="open-source-button"
            title="在思源中打开原文"
            aria-label="在思源中打开原文"
            onclick={(event) => {
                event.stopPropagation();
                openDocs(plugin, blockID);
            }}
        >
            <SiyuanIcon name="open" size={15} />
        </button>
    {/if}
</div>

<style>
    .content-display {
        position: relative;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        padding: var(--protyle-outer-padding, 16px);
        box-sizing: border-box;
        border-radius: 0;
        box-shadow: none;
    }

    .content-display.inner-card {
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
    }

    #protyle {
        flex: 1;
        width: 100%;
        height: 100%;
        border: none;
        margin: 0;
        padding: 0;
    }

    .content-display.content-full-width :global(.protyle-wysiwyg),
    .content-display.content-full-width :global(.protyle-title) {
        width: auto !important;
        max-width: none !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
    }

    .content-display.content-padding-custom :global(.protyle-wysiwyg),
    .content-display.content-padding-custom :global(.protyle-title) {
        padding-left: var(--protyle-content-padding) !important;
        padding-right: var(--protyle-content-padding) !important;
    }

    .content-display.content-padding-custom :global(.protyle-wysiwyg) {
        padding-top: var(--protyle-content-padding) !important;
        padding-bottom: var(--protyle-content-padding) !important;
    }

    .open-source-button {
        position: absolute;
        top: max(6px, var(--protyle-outer-padding, 0px));
        right: max(6px, var(--protyle-outer-padding, 0px));
        z-index: 5;
        width: 30px;
        height: 30px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        color: var(--b3-theme-on-surface);
        background: color-mix(in srgb, var(--b3-theme-background) 88%, transparent);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.16s ease, background-color 0.16s ease;
    }

    .content-display:hover .open-source-button,
    .open-source-button:focus-visible {
        opacity: 1;
    }

    .open-source-button:hover {
        background: var(--b3-list-hover);
    }

    @media (hover: none) {
        .open-source-button {
            opacity: 0.72;
        }
    }
</style>
