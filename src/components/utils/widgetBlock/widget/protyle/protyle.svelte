<script lang="ts">
    import { onMount } from "svelte";
    import { Protyle } from "siyuan";

    export let plugin: any;
    export let contentTypeJson: string = "{}";

    let divProtyle: HTMLDivElement;
    let protyle: any;
    let blockID: string = "";

    onMount(async () => {
        protyle = await initProtyle(); // 初始化编辑器
    });

    // 初始化 Protyle 编辑器
    async function initProtyle() {
        const parsed = JSON.parse(contentTypeJson);

        if (parsed.type === "custom-protyle") {
            blockID = parsed.data?.[0]?.customBlockId;
        }

        return new Protyle(plugin.app, divProtyle, { // 创建编辑器实例
            blockId: blockID
        });
    }
</script>

<div class="content-display">
    <div id="protyle" bind:this={divProtyle}/>
</div>

<style>
    .content-display {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        padding: 1rem;
        box-sizing: border-box;
        background-color: var(--bg3-color-dark);
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
