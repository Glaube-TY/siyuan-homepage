<script lang="ts">
    import { onMount } from "svelte";
    import { getImage } from "@/components/tools/getImage";

    export let plugin: any;
    export let contentTypeJson: string = "{}";

    const parsedContent = JSON.parse(contentTypeJson);
    const historyDaysType = parsedContent.data?.historyDaysType || "list";

    let historyDaysList: any[] = [];
    let historyDaysImage: string = "";

    let advancedEnabled = false;

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
            const repo = await plugin.client.forwardProxy({
                url: "https://v2.xxapi.cn/api/history",
                method: "GET",
                headers: [
                    {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                    },
                ],
                contentType: "application/json",
                payloadEncoding: "text",
                responseEncoding: "text",
                timeout: 7000,
                payload: undefined,
            });

            const responseBody =
                typeof repo.data.body === "string"
                    ? JSON.parse(repo.data.body)
                    : repo.data.body;

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
            const repo = await plugin.client.forwardProxy({
                url: "https://v2.xxapi.cn/api/historypic?return-302",
                method: "GET",
                headers: [
                    {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                    },
                ],
                contentType: "application/json",
                payloadEncoding: "text",
                responseEncoding: "text",
                timeout: 7000,
                payload: undefined,
            });

            const responseBody =
                typeof repo.data.body === "string"
                    ? JSON.parse(repo.data.body)
                    : repo.data.body;

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
            <h2>👑高级会员专属功能👑</h2>
            <h3>请在"主页设置"→"会员服务"中开通高级会员后使用</h3>
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
