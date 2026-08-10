<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { Protyle } from "siyuan";
    import { getRootDocumentCandidates } from "@/components/tools/siyuanComponentDataApi";
    import { openDocs } from "@/components/tools/openDocs";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import { isValidSiyuanNodeId } from "../../utils/widget-instance-utils";
    import { normalizeProtyleDisplayConfig } from "./protyleDisplayConfig";

    // 组件销毁后丢弃异步结果，避免更新已卸载状态
    let isDestroyed = false;
    let protyleGeneration = 0;

    onDestroy(() => {
        isDestroyed = true;
        if (protyle) {
            try { protyle.destroy(); } catch (e) { console.warn("[Protyle] destroy failed:", e); }
            protyle = null;
        }
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
    const configuredBlockID = $derived(parsed.data?.[0]?.customBlockId || "");
    const isRandomDoc = $derived(Boolean(parsed.data?.[0]?.isRandomDoc));
    const displayConfig = $derived(normalizeProtyleDisplayConfig(parsed.data?.[0]));
    const protyleOptionsKey = $derived(JSON.stringify({
        showBreadcrumb: displayConfig.showBreadcrumb,
        showDocumentTitle: displayConfig.showDocumentTitle,
    }));
    let blockID = $state("");
    let lastConfiguredBlockID = $state("");

    // ID变化时销毁旧实例
    $effect(() => {
        if (configuredBlockID === lastConfiguredBlockID) {
            return;
        }
        lastConfiguredBlockID = configuredBlockID;
        if (protyle) {
            try { protyle.destroy(); } catch (e) { console.warn("[Protyle] destroy on ID change failed:", e); }
            protyle = null;
        }
        blockID = configuredBlockID;
    });

    // blockID变化时重建实例
    $effect(() => {
        void protyleOptionsKey;
        if (!blockID) return;
        if (!isValidSiyuanNodeId(blockID)) return;
        destroyAndCreateProtyle(blockID);
    });

    let divProtyle: HTMLDivElement = $state();
    let protyle: any;

    function destroyAndCreateProtyle(validId: string): void {
        if (protyle) {
            try { protyle.destroy(); } catch (e) { console.warn("[Protyle] destroy failed:", e); }
            protyle = null;
        }
        if (!validId || !isValidSiyuanNodeId(validId) || isDestroyed) return;
        if (!divProtyle || !divProtyle.isConnected) return;
        const gen = ++protyleGeneration;
        queueMicrotask(() => {
            if (gen !== protyleGeneration || isDestroyed) return;
            if (!divProtyle || !divProtyle.isConnected) return;
            try {
                protyle = new Protyle(plugin.app, divProtyle, {
                    blockId: validId as string,
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
        if (isRandomDoc) {
            await getRandomDocID();
            if (isDestroyed) return;
        }
    });

    async function getRandomDocID(): Promise<void> {
        const docs = await getRootDocumentCandidates(200);
        if (isDestroyed || docs.length === 0) {
            return;
        }
        const candidate = docs.find((doc) => isValidSiyuanNodeId(doc.id));
        if (candidate) {
            blockID = candidate.id;
        }
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
    {#if !displayConfig.showBreadcrumb && blockID && isValidSiyuanNodeId(blockID)}
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
