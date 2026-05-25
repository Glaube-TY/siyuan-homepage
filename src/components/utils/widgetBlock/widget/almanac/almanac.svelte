<script lang="ts">
    import { onMount } from "svelte";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";

    import Classic from "./_classic.svelte";
    import Tradition1 from "./_tradition1.svelte";

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

    const parsedContent = $derived(parseContentTypeJson(contentTypeJson));
    const almanacStyle = $derived(parsedContent.data?.almanacStyle || "classic");

    let advancedEnabled = $state(false);

    onMount(async () => {
        advancedEnabled = plugin.ADVANCED;
    });
</script>

<div class="content-display">
    {#if advancedEnabled}
        {#if almanacStyle === "classic"}
            <Classic></Classic>
        {:else if almanacStyle === "tradition1"}
            <Tradition1></Tradition1>
        {:else}
            <div class="almanac-display">
                <div class="almanac-classic"></div>
            </div>
        {/if}
    {:else}
        <div class="content-not-advanced">
            <AdvancedFeatureLock
                title="黄历"
                subtitle="每日黄历宜忌展示，传统日历风格。"
                icon="calendar"
                features={[
                    "每日黄历宜忌展示",
                    "传统与现代风格结合",
                    "适合传统文化爱好者"
                ]}
                highlights={["黄历宜忌", "传统风格", "每日更新"]}
                compact
            />
        </div>
    {/if}
</div>

<style lang="scss">
    .content-display {
        width: 100%;
        height: calc(100%);
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
    }

    .content-not-advanced {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
    }
</style>
