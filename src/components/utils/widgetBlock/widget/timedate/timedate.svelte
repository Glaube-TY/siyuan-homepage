<script lang="ts">
    import { onMount } from "svelte";

    import Classic from "./_classic.svelte";
    import Simple1 from "./_simple1.svelte";
    import Simple2 from "./_simple2.svelte";
    import Dial1 from "./_dial1.svelte";
    import Dial2 from "./_dial2.svelte";
    import Dial3 from "./_dial3.svelte";
    import Dial4 from "./_dial4.svelte";
    import Dial5 from "./_dial5.svelte";
    import Dial6 from "./_dial6.svelte";
    import Dial7 from "./_dial7.svelte";
    import Dial8 from "./_dial8.svelte";
    import Dial9 from "./_dial9.svelte";

    export let contentTypeJson: string = "{}";
    export let plugin: any;

    // 时钟组件相关变量
    let timeType: string = "classic";

    onMount(() => {
        if (contentTypeJson) {
            try {
                const config = JSON.parse(contentTypeJson);
                if (config.type === "timedate" && config.data) {
                    // 时钟组件相关变量
                    timeType = config.data?.timeType || "classic";
                }
            } catch (e) {
                console.warn("无法解析 contentTypeJson", e);
            }
        }
    });
</script>

{#if timeType === "classic"}
    <Classic {contentTypeJson}></Classic>
{:else if timeType === "simple1"}
    <Simple1 {contentTypeJson}></Simple1>
{:else if timeType === "simple2"}
    <Simple2 {contentTypeJson}></Simple2>
{:else if timeType === "dial1"}
    <Dial1 {contentTypeJson}></Dial1>
{:else if timeType === "dial2"}
    <Dial2 {contentTypeJson}></Dial2>
{:else if timeType === "dial3"}
    <Dial3 {contentTypeJson} {plugin}></Dial3>
{:else if timeType === "dial4"}
    <Dial4 {contentTypeJson} {plugin}></Dial4>
{:else if timeType === "dial5"}
    <Dial5 {contentTypeJson} {plugin}></Dial5>
{:else if timeType === "dial6"}
    <Dial6 {contentTypeJson} {plugin}></Dial6>
{:else if timeType === "dial7"}
    <Dial7 {contentTypeJson} {plugin}></Dial7>
{:else if timeType === "dial8"}
    <Dial8 {contentTypeJson} {plugin}></Dial8>
{:else if timeType === "dial9"}
    <Dial9 {contentTypeJson} {plugin}></Dial9>
{/if}

<style lang="scss">
</style>
