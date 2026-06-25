<script lang="ts">
    import { onMount } from "svelte";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
    import { getStatisticalData } from "../../../../tools/statisticalAPI";
    import { sql } from "@/api";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
        placement?: string;
    }

    let { plugin, contentTypeJson = "{}", placement = "homepage" }: Props = $props();

    let parsedContent = $derived(JSON.parse(contentTypeJson));
    const isMobilePlacement = $derived(placement === "mobile");
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
            const res = await sql(customSQLCount);
            statisticalCount = res.length;
        } else {
            statisticalCount = await getStatisticalData(
                statisticalCardContent,
                plugin,
            );
        }
    });
</script>

<div class:mobile-stat-card={isMobilePlacement} class="content-display">
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
            <AdvancedFeatureLock
                title="统计卡片"
                subtitle="数据统计可视化，直观展示关键指标。"
                icon="barChart"
                features={[
                    "数据统计可视化",
                    "自定义统计维度",
                    "适合数据追踪和展示"
                ]}
                highlights={["数据可视化", "自定义维度", "关键指标"]}
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

    .mobile-stat-card {
        padding: 12px !important;
        justify-content: center;
        gap: 6px;
        background: linear-gradient(145deg, rgba(79, 70, 229, 0.1), rgba(14, 165, 233, 0.06));
        box-shadow: none;

        .card-header {
            border-bottom: none;
            padding-bottom: 0;
        }

        .card-title {
            font-size: 13px !important;
            color: var(--b3-theme-secondary) !important;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .card-body {
            padding-top: 0;
        }

        .statistical-count {
            font-size: clamp(30px, 12vw, 48px) !important;
            line-height: 1;
            letter-spacing: 0;
        }
    }
</style>
