<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { Protyle } from "siyuan";
    import { getRootDocumentCandidates } from "@/components/tools/siyuanComponentDataApi";
    import { isValidSiyuanNodeId } from "../../utils/widget-instance-utils";

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
                protyle = new Protyle(plugin.app, divProtyle, { blockId: validId as string });
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
        if (blockID && isValidSiyuanNodeId(blockID)) {
            destroyAndCreateProtyle(blockID);
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

<div class="content-display">
    <div id="protyle" bind:this={divProtyle}></div>
</div>

<style>
    .content-display {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        padding: 1rem;
        box-sizing: border-box;
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
</style>
