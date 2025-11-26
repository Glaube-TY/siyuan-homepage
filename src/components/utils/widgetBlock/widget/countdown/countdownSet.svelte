<script lang="ts">
    import { onMount } from "svelte";
    import { getImage } from "@/components/tools/getImage";

    export let eventList: Array<{ name: string; date: string }> = [
        { name: "", date: "" },
    ];
    export let countdownStyle: string = "list";

    // 卡片1配置
    export let countdownCard1BgSelect: string = "remote";
    export let countdownCard1RemoteBg: string =
        "https://haowallpaper.com/link/common/file/previewFileImg/16665839129185664";
    export let countdownCard1LocalBg: string = "";

    // 卡片2配置
    export let countdownCard2BgColor: string = "#000000";

    // 列表2配置
    export let countdownList2BgColor: string = "#000000";

    let countdownCard1BgImageData: string = "";
    // 获取卡片1背景图片
    async function getCountdownCard1BgImage() {
        if (countdownCard1BgSelect === "remote") {
            if (
                !window.navigator.userAgent.includes("Electron") ||
                typeof window.require !== "function"
            ) {
                countdownCard1BgImageData = await getImage(
                    countdownCard1RemoteBg,
                );
            } else {
                countdownCard1BgImageData = countdownCard1RemoteBg;
            }
        } else {
            countdownCard1BgImageData = countdownCard1LocalBg;
        }
    }

    let countdownCard1BgInput: HTMLInputElement | null = null;
    // 处理卡片1背景上传
    function handleCountdownCard1Upload() {
        const file = countdownCard1BgInput?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            if (reader.result && typeof reader.result === "string") {
                countdownCard1LocalBg = reader.result;
                countdownCard1BgImageData = reader.result;
            }
        };
        reader.readAsDataURL(file);
    }

    onMount(async () => {
        // 组件挂载时的初始化逻辑
        if (eventList.length === 0) {
            eventList = [{ name: "", date: "" }];
        }

        // 初始化卡片1背景图片
        if (countdownCard1BgSelect === "remote" && countdownCard1RemoteBg) {
            await getCountdownCard1BgImage();
        }
    });

    // 处理添加倒数日事件
    function addEvent() {
        eventList = [...eventList, { name: "", date: "" }];
    }

    // 处理删除倒数日事件
    function removeEvent(index: number) {
        eventList = eventList.filter((_, i) => i !== index);
    }
</script>

<div class="content-display">
    <div class="countdown">
        <div class="countdown-table">
            <table>
                <tbody>
                    {#each eventList as event, index}
                        <tr class="event-form-group" data-index={index}>
                            <td>
                                <input
                                    id="event-name-{index}"
                                    type="text"
                                    bind:value={event.name}
                                    placeholder="例如：生日"
                                />
                            </td>
                            <td>
                                <input
                                    id="event-date-{index}"
                                    class="date-input"
                                    type="date"
                                    bind:value={event.date}
                                />
                            </td>
                            <td>
                                <button
                                    class="remove-event"
                                    title="删除"
                                    on:click={() => removeEvent(index)}
                                >
                                    🗑
                                </button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
            <button class="add-event-btn" on:click={addEvent}>添加倒数日</button
            >
        </div>

        <div class="form-group">
            <label for="countdown-style">样式：</label>
            <select id="countdown-style" bind:value={countdownStyle}>
                <option value="list1">列表1</option>
                <option value="list2">列表2</option>
                <option value="card1">卡片1</option>
                <option value="card2">卡片2</option>
            </select>
        </div>
        {#if countdownStyle === "card1"}
            <div class="form-group countdown-card1-bg-select">
                <div class="bg-select">
                    <label>
                        背景设置：
                        <select
                            bind:value={countdownCard1BgSelect}
                            on:change={() => {
                                if (countdownCard1BgSelect === "remote") {
                                    countdownCard1LocalBg = "";
                                    getCountdownCard1BgImage();
                                } else {
                                    countdownCard1RemoteBg = "";
                                    countdownCard1BgImageData =
                                        countdownCard1LocalBg;
                                }
                            }}
                        >
                            <option value="remote">远程图片</option>
                            <option value="local">本地图片</option>
                        </select>
                    </label>
                    {#if countdownCard1BgSelect === "remote"}
                        <input
                            type="text"
                            bind:value={countdownCard1RemoteBg}
                            on:change={getCountdownCard1BgImage}
                            placeholder="输入远程图片URL"
                        />
                    {:else}
                        <button on:click={() => countdownCard1BgInput?.click()}>
                            上传图片
                        </button>

                        <input
                            type="file"
                            bind:this={countdownCard1BgInput}
                            accept="image/*"
                            on:change={handleCountdownCard1Upload}
                            style="display: none;"
                        />
                    {/if}
                </div>
                <div class="image-preview">
                    {#if countdownCard1BgSelect === "remote" && countdownCard1BgImageData}
                        <img
                            src={countdownCard1BgImageData}
                            alt="倒数日卡片1背景预览"
                        />
                    {:else if countdownCard1BgSelect === "local" && countdownCard1LocalBg}
                        <img
                            src={countdownCard1LocalBg}
                            alt="倒数日卡片1背景预览"
                        />
                    {/if}
                </div>
            </div>
        {:else if countdownStyle === "card2"}
            <div class="form-group">
                <label for="countdown-card2-bg-color"
                    >背景颜色：
                    <input
                        id="countdown-card2-bg-color"
                        type="color"
                        bind:value={countdownCard2BgColor}
                    /></label
                >
            </div>
        {:else if countdownStyle === "list2"}
            <div class="form-group">
                <label for="countdown-list2-bg-color"
                    >背景颜色：
                    <input
                        id="countdown-list2-bg-color"
                        type="color"
                        bind:value={countdownList2BgColor}
                    /></label
                >
            </div>
        {/if}

        <hr />
        <div>
            组件说明：<a
                href="https://ttl8ygt82u.feishu.cn/wiki/KjYew1TbViBCIQkmsbBcBO6vnOd?from=from_copylink"
                target="_blank">倒数日</a
            >
        </div>
    </div>
</div>

<style lang="scss">
    .countdown {
        display: flex;
        flex-direction: column;
        width: 100%;

        .countdown-table {
            display: flex;
            flex-direction: column;
            padding: 0.5rem;
            gap: 0.5rem;
            list-style: none;
            max-height: 200px;
            overflow-y: auto;
            align-items: center;
            border: 1px solid var(--b3-theme-primary);
            border-radius: 8px;

            .event-form-group {
                border: 1px solid var(--b3-theme-primary-lighter);
                padding: 1rem;
                border-radius: 8px;
                background: var(--b3-theme-background);

                .form-group {
                    display: flex;
                    flex-direction: row;
                    align-items: center;

                    label {
                        font-size: 14px;
                        margin-right: 0.5rem;
                        white-space: nowrap;
                        width: auto;
                    }

                    input[type="text"],
                    input[type="date"] {
                        max-width: 100px;
                        background-color: var(--b3-theme-surface);
                    }

                    .remove-event {
                        margin-left: 0.5rem;
                        cursor: pointer;
                        border: none;
                        background: none;

                        &:hover {
                            background-color: var(--b3-theme-error);
                            border-radius: 50%;
                        }
                    }
                }
            }

            .remove-event {
                cursor: pointer;
                border: none;
                background: none;

                &:hover {
                    background-color: var(--b3-theme-error);
                    border-radius: 50%;
                }
            }

            .add-event-btn {
                padding: 0.4rem 0.75rem;
                border-radius: 6px;
                background-color: var(--b3-theme-primary);
                color: white;
                cursor: pointer;
                transition:
                    background-color 0.2s ease,
                    transform 0.1s ease;

                &:hover {
                    transform: scale(1.05);
                }
            }
        }

        .countdown-card1-bg-select {
            display: flex;
            align-items: flex-start;
            gap: 1rem;
            flex-wrap: wrap;
            padding: 1rem 0;

            .bg-select {
                flex: 1 1 auto;
                max-width: 200px;
                display: flex;
                flex-direction: column;
                gap: 0.5rem;

                label {
                    font-size: 14px;
                    font-weight: 500;
                }

                select,
                input[type="text"] {
                    padding: 0.4rem;
                    box-sizing: border-box;
                    font-size: 14px;
                    border-radius: 6px;
                    width: 100%;
                    transition: all 0.2s ease;

                    &:focus {
                        outline: none;
                        border-color: var(--b3-theme-primary);
                        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
                    }

                    &:hover {
                        border-color: var(--b3-theme-primary-light);
                    }
                }

                button {
                    padding: 0.4rem 0.6rem;
                    font-size: 14px;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    width: 100%;
                    align-self: flex-start;

                    &:hover {
                        background-color: var(--b3-theme-primary-light);
                        border-color: var(--b3-theme-primary);
                    }

                    &:focus {
                        outline: none;
                        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
                    }
                }
            }

            .image-preview {
                flex: 0 0 auto;
                display: flex;
                align-items: center;
                justify-content: center;
                width: auto; // 固定宽度为 200px
                background-color: rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
                border: 1px solid #ccc;
                transition: box-shadow 0.3s ease;
                padding: 0.5rem;

                img {
                    width: 150px; // 宽度填满容器（200px）
                    height: auto; // 高度自适应，保持图片比例
                    max-height: 100px;
                    object-fit: contain;
                    border-radius: 6px;
                }

                &:hover {
                    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
                }
            }
        }
    }
</style>
