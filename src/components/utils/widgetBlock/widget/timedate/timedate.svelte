<script lang="ts">
    import { onMount } from "svelte";

    import Classic from "./_classic.svelte";
    import Simple1 from "./_simple1.svelte";
    import Simple2 from "./_simple2.svelte";
    import Dial1 from "./_dial1.svelte";
    import Dial2 from "./_dial2.svelte";

    export let contentTypeJson: string = "{}";

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
{/if}

<style lang="scss">
</style>
