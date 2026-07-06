<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { Protyle } from "siyuan";
    import { getRootDocumentCandidates } from "@/components/tools/siyuanComponentDataApi";

    // 组件销毁后丢弃异步结果，避免更新已卸载状态
    let isDestroyed = false;

    onDestroy(() => {
        isDestroyed = true;
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

    $effect(() => {
        if (configuredBlockID === lastConfiguredBlockID) {
            return;
        }
        lastConfiguredBlockID = configuredBlockID;
        blockID = configuredBlockID;
    });

    let divProtyle: HTMLDivElement = $state();
    // 保留 Protyle 实例引用，防止编辑器被垃圾回收
    let protyle: any;

    onMount(async () => {
        isDestroyed = false;
        if (isRandomDoc) {
            await getRandomDocID();
            if (isDestroyed) return;
        }
        protyle = await initProtyle(); // 初始化编辑器
    });

    // 初始化 Protyle 编辑器
    async function initProtyle() {
        return new Protyle(plugin.app, divProtyle, {
            blockId: blockID,
        });
    }

    async function getRandomDocID() {
        const docs = await getRootDocumentCandidates(200);
        if (isDestroyed || docs.length === 0) {
            return;
        }
        blockID = docs[Math.floor(Math.random() * docs.length)].id;
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
