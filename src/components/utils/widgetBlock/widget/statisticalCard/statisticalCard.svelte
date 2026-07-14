<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
    import {
        getStatisticalData,
        refreshStatIndexFromRecentDocuments,
        STAT_INDEX_UPDATED_EVENT,
    } from "../../../../tools/statisticalAPI";
    import { sql } from "@/api";
    import type { WidgetRuntimeContext } from "../../widgetMountRegistry";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
        placement?: string;
        runtimeContext?: WidgetRuntimeContext;
    }

    let { plugin, contentTypeJson = "{}", placement = "homepage", runtimeContext = {} }: Props = $props();

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

    let statisticalCount = $state<number | null>(null);
    let statisticalStatus = $state<"ok" | "empty" | "unsupported" | "error">("empty");
    let statisticalMessage = $state("");
    let isInitializing = $state(false);
    let destroyed = false;

    let advancedEnabled = $state(false);

    async function loadStatisticalData() {
        await refreshStatIndexFromRecentDocuments(plugin, {
            force: runtimeContext.forceIndexRefresh === true,
        });
        const result = await getStatisticalData(
            statisticalCardContent,
            plugin,
        );
        statisticalCount = typeof result.value === "number" ? result.value : null;
        statisticalStatus = result.status;
        statisticalMessage = result.message || "";
    }

    onMount(async () => {
        advancedEnabled = plugin.ADVANCED;

        if (statisticalCardContent === "customSQLCount") {
            if (!String(customSQLCount || "").trim()) {
                statisticalCount = null;
                statisticalStatus = "empty";
                statisticalMessage = "未配置 SQL";
                return;
            }
            try {
                const res = await sql(customSQLCount);
                statisticalCount = Array.isArray(res) ? res.length : 0;
                statisticalStatus = "ok";
                statisticalMessage = "用户自定义 SQL 可能触发全库扫描";
            } catch (error) {
                statisticalCount = null;
                statisticalStatus = "error";
                statisticalMessage = error instanceof Error ? error.message : "SQL 执行失败";
            }
        } else {
            isInitializing = true;
            statisticalMessage = "正在读取统计索引...";
            try {
                await loadStatisticalData();
            } catch (error) {
                statisticalCount = null;
                statisticalStatus = "error";
                statisticalMessage = error instanceof Error ? error.message : "统计索引初始化失败，请到主页设置 > 检索管理中手动重建索引。";
            } finally {
                isInitializing = false;
            }
        }
        if (!destroyed) window.addEventListener(STAT_INDEX_UPDATED_EVENT, handleStatIndexUpdated);
    });

    function handleStatIndexUpdated(): void {
        if (statisticalCardContent !== "customSQLCount") void loadStatisticalData();
    }

    onDestroy(() => {
        destroyed = true;
        window.removeEventListener(STAT_INDEX_UPDATED_EVENT, handleStatIndexUpdated);
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
            {#if isInitializing}
                <div class="statistical-disabled">
                    <strong>正在读取统计索引...</strong>
                </div>
            {:else if statisticalCount === null}
                <div class="statistical-disabled">
                    <strong>
                        {statisticalCardContent === "customSQLCount" && statisticalStatus === "empty"
                            ? "未配置 SQL"
                            : statisticalStatus === "empty" && statisticalMessage.includes("需要重建")
                                ? "统计索引需要重建"
                                : statisticalStatus === "empty" && statisticalMessage.includes("尚未建立")
                                    ? "统计索引尚未建立"
                                    : statisticalStatus === "empty"
                                        ? "暂无统计数据"
                            : statisticalStatus === "error"
                                ? "统计索引错误"
                                : "暂无统计数据"}
                    </strong>
                    {#if statisticalMessage}
                        <span>{statisticalMessage}</span>
                    {/if}
                </div>
            {:else}
                <div
                    class="statistical-count"
                    style="font-size: {statisticalCardCountSize}rem; color: {statisticalCardCountColor};"
                >
                    {statisticalCount}
                </div>
                {#if statisticalMessage && statisticalStatus !== "ok"}
                    <div class="statistical-hint">{statisticalMessage}</div>
                {/if}
            {/if}
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
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding-top: 0.5rem;
            gap: 4px;

            .statistical-count {
                font-size: 2.5rem;
                font-weight: 700;
                white-space: nowrap;
                word-break: normal;
                line-height: 1;
                max-width: 100%;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .statistical-disabled {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 6px;
                text-align: center;
                line-height: 1.5;

                strong {
                    color: var(--b3-theme-on-surface);
                    font-size: 16px;
                }

                span {
                    color: var(--b3-theme-secondary);
                    font-size: 12px;
                }
            }

            .statistical-hint {
                margin-top: 6px;
                color: var(--b3-theme-secondary);
                font-size: 12px;
                text-align: center;
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
