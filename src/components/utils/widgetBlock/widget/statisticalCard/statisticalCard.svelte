<script lang="ts">
    import { onMount } from "svelte";
    import { getStatisticalData } from "../../../../tools/statisticalAPI";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
    }

    let { plugin, contentTypeJson = "{}" }: Props = $props();

    let parsedContent = $derived(JSON.parse(contentTypeJson));
    let statisticalCardTitle = $derived(parsedContent.data?.statisticalCardTitle || "统计卡片");
    let statisticalCardTitleSize = $derived(parsedContent.data?.statisticalCardTitleSize || 1);
    let statisticalCardTitleColor = $derived(parsedContent.data?.statisticalCardTitleColor || "#000000");
    let statisticalCardContent = $derived(parsedContent.data?.statisticalCardContent || "notebooksCount");
    const statisticalCardCountSize =
        $derived(parsedContent.data?.statisticalCardCountSize || 2);
    const statisticalCardCountColor =
        $derived(parsedContent.data?.statisticalCardCountColor || "#000000");
    let customSQLCount = $derived(parsedContent.data?.customSQLCount || "");

    let statisticalCount = $state(0);

    let advancedEnabled = $state(false);

    onMount(async () => {
        advancedEnabled = plugin.ADVANCED;

        if (statisticalCardContent === "customSQLCount") {
            const res = await plugin.client.sql({
                stmt: customSQLCount,
            });
            statisticalCount = res.data.length;
        } else {
            statisticalCount = await getStatisticalData(
                statisticalCardContent,
                plugin,
            );
        }
    });
</script>

<div class="content-display">
    {#if advancedEnabled}
        <div class="card-header">
            <div
                class="card-title"
                style="font-size: {statisticalCardTitleSize}rem; color: {statisticalCardTitleColor};"
            >
                {statisticalCardTitle}
            </div>
        </div>
        <div class="card-body">
            <div
                class="statistical-count"
                style="font-size: {statisticalCardCountSize}rem; color: {statisticalCardCountColor};"
            >
                {statisticalCount}
            </div>
        </div>
    {:else}
        <div class="content-not-advanced">
            <h2>👑高级会员专属功能👑</h2>
            <h3>请在“主页设置”→“会员服务”中开通高级会员后使用</h3>
        </div>
    {/if}
</div>

<style lang="scss">
    .content-display {
        width: 100%;
        height: calc(100%);
        display: flex;
        flex-direction: column;
        padding: 0.5rem;
        box-sizing: border-box;
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);

        .card-header {
            text-align: center;
            border-bottom: 1px solid var(--b3-border-color);
            padding-bottom: 0.5rem;

            .card-title {
                margin: 0;
                font-weight: 600;
            }
        }

        .card-body {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            padding-top: 0.5rem;
            word-break: break-all;

            .statistical-count {
                font-size: 2.5rem;
                font-weight: 700;
            }
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
    }
</style>
