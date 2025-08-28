<script lang="ts">
    import { onMount } from "svelte";
    import { getStatisticalData } from "./statisticalAPI";

    export let plugin: any;
    export let contentTypeJson: string = "{}";

    const parsedContent = JSON.parse(contentTypeJson);
    const statisticalCardTitle =
        parsedContent.data?.statisticalCardTitle || "统计卡片";
    const statisticalCardTitleSize =
        parsedContent.data?.statisticalCardTitleSize || 1;
    const statisticalCardTitleColor =
        parsedContent.data?.statisticalCardTitleColor || "#000000";
    const statisticalCardContent =
        parsedContent.data?.statisticalCardContent || "notebooksCount";
    const statisticalCardCountSize =
        parsedContent.data?.statisticalCardCountSize || 2;
    const statisticalCardCountColor =
        parsedContent.data?.statisticalCardCountColor || "#000000";
    const customSQLCount = parsedContent.data?.customSQLCount || "";

    let statisticalCount = 0;

    onMount(async () => {
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
    <div class="card-header">
        <div class="card-title" style="font-size: {statisticalCardTitleSize}rem; color: {statisticalCardTitleColor};">{statisticalCardTitle}</div>
    </div>
    <div class="card-body">
        <div class="statistical-count" style="font-size: {statisticalCardCountSize}rem; color: {statisticalCardCountColor};">{statisticalCount}</div>
    </div>
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

            .statistical-count {
                font-size: 2.5rem;
                font-weight: 700;
            }
        }
    }
</style>
