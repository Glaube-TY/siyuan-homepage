<script lang="ts">
    import { onMount } from "svelte";
    import { getImage } from "@/components/tools/getImage";
    import { forwardProxy } from "@/api";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";

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
    const historyDaysType = $derived(parsedContent.data?.historyDaysType || "list");

    let historyDaysList: any[] = $state([]);
    let historyDaysImage: string = $state("");

    let advancedEnabled = $state(false);

    onMount(async () => {
        advancedEnabled = plugin.ADVANCED;
        if (historyDaysType === "list") {
            await getHistoryDaysList();
        } else if (historyDaysType === "img") {
            await getHistoryDaysImage();
        }
    });

    async function getHistoryDaysList() {
        try {
            const repo = await forwardProxy(
                "https://v2.xxapi.cn/api/history",
                "GET",
                {},
                [
                    {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                    },
                ],
                7000,
                "application/json"
            );

            const responseBody =
                typeof repo.body === "string"
                    ? JSON.parse(repo.body)
                    : repo.body;

            if (responseBody.code === 200) {
                historyDaysList = responseBody.data;
            } else {
                console.error("获取历史事件失败:", responseBody.msg);
            }
        } catch (error) {
            console.error("获取历史事件失败:", error);
        }
    }

    async function getHistoryDaysImage() {
        try {
            const repo = await forwardProxy(
                "https://v2.xxapi.cn/api/historypic?return-302",
                "GET",
                {},
                [
                    {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                    },
                ],
                7000,
                "application/json"
            );

            const responseBody =
                typeof repo.body === "string"
                    ? JSON.parse(repo.body)
                    : repo.body;

            if (responseBody.code === 200) {
                if (plugin.isMobile) {
                    historyDaysImage = await getImage(responseBody.data);
                } else {
                    historyDaysImage = responseBody.data;
                }
            } else {
                console.error("获取历史事件图片失败:", responseBody.msg);
            }
        } catch (error) {
            console.error("获取历史事件图片失败:", error);
        }
    }
</script>

<div class="content-display">
    {#if advancedEnabled}
        <div class="historyDays-content">
            {#if historyDaysType === "list"}
                <div class="history-days-list">
                    {#each historyDaysList as event}
                        <div class="history-event-card">
                            <p>{event}</p>
                        </div>
                    {/each}
                </div>
            {:else if historyDaysType === "img"}
                <div class="history-days-image">
                    <img src={historyDaysImage} alt="历史上的今天" />
                </div>
            {/if}
        </div>
    {:else}
        <div class="content-not-advanced">
            <AdvancedFeatureLock
                title="历史上的今天"
                subtitle="查看历史事件，丰富主页内容。"
                icon="history"
                features={[
                    "查看历史事件",
                    "丰富主页内容",
                    "适合知识型主页"
                ]}
                highlights={["历史事件", "知识型", "每日更新"]}
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

        .historyDays-content {
            width: 100%;
            height: 100%;
            padding: 0.1rem;
            overflow-y: auto;

            .history-days-list {
                display: flex;
                flex-direction: column;
                gap: 12px;
                padding: 12px;
            }

            .history-event-card {
                background-color: var(--b3-theme-surface);
                border-radius: 8px;
                padding: 12px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                transition: transform 0.2s;

                &:hover {
                    transform: translateY(-2px);
                }

                p {
                    margin: 0;
                    font-size: 14px;
                    line-height: 1.4;
                    color: var(--b3-theme-on-surface);
                    font-weight: bold; /* 加粗文字 */
                }
            }

            .history-days-image {
                width: 100%;
                height: 100%;
                display: flex;
                justify-content: center;
                align-items: flex-start;
                padding: 12px;

                img {
                    width: 100%;
                    height: auto;
                    object-fit: contain;
                    min-height: 100%;
                    max-width: 100%;
                }
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
