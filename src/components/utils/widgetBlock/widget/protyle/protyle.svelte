<script lang="ts">
    import { onMount } from "svelte";
    import { Protyle } from "siyuan";
    import { sql } from "@/api";

    export let plugin: any;
    export let contentTypeJson: string = "{}";
    const parsed = JSON.parse(contentTypeJson);
    let blockID = parsed.data?.[0]?.customBlockId;
    const isRandomDoc = parsed.data?.[0]?.isRandomDoc;

    let divProtyle: HTMLDivElement;
    let protyle: any;

    onMount(async () => {
        if (isRandomDoc) {
            await getRandomDocID();
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
        const query =
            "SELECT * FROM blocks WHERE type = 'd' order by random() limit 1";
        const response = await sql(query);
        const randomDocID = response[0].id;
        blockID = randomDocID;
    }
</script>

<div class="content-display">
    <div id="protyle" bind:this={divProtyle} />
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
