<script lang="ts">
    import { onMount } from "svelte";
    import { getImage } from "@/components/tools/getImage";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        eventList?: Array<{
        name: string;
        date: string;
        anniversary: boolean;
    }>;
        countdownStyle?: string;
        // 卡片1配置
        countdownCard1BgSelect?: string;
        countdownCard1RemoteBg?: string;
        countdownCard1LocalBg?: string;
        // 卡片2配置
        countdownCard2BgColor?: string;
        // 列表2配置
        countdownList2BgColor?: string;
    }

    let {
        eventList = $bindable([{ name: "", date: "", anniversary: false }]),
        countdownStyle = $bindable("list"),
        countdownCard1BgSelect = $bindable("remote"),
        countdownCard1RemoteBg = $bindable("https://haowallpaper.com/link/common/file/previewFileImg/16665839129185664"),
        countdownCard1LocalBg = $bindable(""),
        countdownCard2BgColor = $bindable("#000000"),
        countdownList2BgColor = $bindable("#000000")
    }: Props = $props();

    let countdownCard1BgImageData: string = $state("");

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

    let countdownCard1BgInput: HTMLInputElement | null = $state(null);

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
            eventList = [{ name: "", date: "", anniversary: false }];
        }

        // 初始化卡片1背景图片
        if (countdownCard1BgSelect === "remote" && countdownCard1RemoteBg) {
            await getCountdownCard1BgImage();
        }
    });

    // 处理添加倒数日事件
    function addEvent() {
        eventList = [...eventList, { name: "", date: "", anniversary: false }];
    }

    // 处理删除倒数日事件
    function removeEvent(index: number) {
        eventList = eventList.filter((_, i) => i !== index);
    }
</script>

<SettingSection title="倒数日事件">
    <div class="event-table-wrapper">
        <table>
            <tbody>
                <tr>
                    <th>事件名称</th>
                    <th>事件日期</th>
                    <th>周年</th>
                    <th>删除</th>
                </tr>
                {#each eventList as event, index}
                    <tr class="event-form-group" data-index={index}>
                        <td>
                            <input
                                type="text"
                                bind:value={event.name}
                                placeholder="例如：生日"
                            />
                        </td>
                        <td>
                            <input
                                type="date"
                                bind:value={event.date}
                            />
                        </td>
                        <td style="text-align: center;">
                            <input type="checkbox" bind:checked={event.anniversary} />
                        </td>
                        <td>
                            <button class="remove-event" title="删除" onclick={() => removeEvent(index)}>
                                🗑
                            </button>
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
        <button class="add-event-btn" onclick={addEvent}>添加倒数日</button>
    </div>
</SettingSection>

<SettingSection>
    <SettingRow title="样式">
        <select bind:value={countdownStyle} class="control-sm">
            <option value="list1">列表1</option>
            <option value="list2">列表2</option>
            <option value="card1">卡片1</option>
            <option value="card2">卡片2</option>
        </select>
    </SettingRow>
</SettingSection>

{#if countdownStyle === "card1"}
    <SettingSection title="卡片1背景">
        <SettingRow title="图片来源">
            <select
                bind:value={countdownCard1BgSelect}
                onchange={() => {
                    if (countdownCard1BgSelect === "remote") {
                        countdownCard1LocalBg = "";
                        getCountdownCard1BgImage();
                    } else {
                        countdownCard1RemoteBg = "";
                        countdownCard1BgImageData = countdownCard1LocalBg;
                    }
                }}
                class="control-sm"
            >
                <option value="remote">远程图片</option>
                <option value="local">本地图片</option>
            </select>
        </SettingRow>

        {#if countdownCard1BgSelect === "remote"}
            <SettingRow title="图片URL">
                <input
                    type="text"
                    bind:value={countdownCard1RemoteBg}
                    onchange={getCountdownCard1BgImage}
                    placeholder="输入远程图片URL"
                    class="control-full"
                />
            </SettingRow>
        {:else}
            <SettingRow title="上传图片">
                <button onclick={() => countdownCard1BgInput?.click()} class="file-action-btn">📁</button>
                <input
                    type="file"
                    bind:this={countdownCard1BgInput}
                    accept="image/*"
                    onchange={handleCountdownCard1Upload}
                    style="display: none;"
                />
            </SettingRow>
        {/if}

        <!-- 全宽预览块 -->
        {#if countdownCard1BgSelect === "remote" && countdownCard1BgImageData}
            <div class="preview-block">
                <img src={countdownCard1BgImageData} alt="倒数日卡片1背景预览" />
            </div>
        {:else if countdownCard1BgSelect === "local" && countdownCard1LocalBg}
            <div class="preview-block">
                <img src={countdownCard1LocalBg} alt="倒数日卡片1背景预览" />
            </div>
        {/if}
    </SettingSection>
{:else if countdownStyle === "card2"}
    <SettingSection>
        <SettingRow title="背景颜色">
            <input type="color" bind:value={countdownCard2BgColor} />
        </SettingRow>
    </SettingSection>
{:else if countdownStyle === "list2"}
    <SettingSection>
        <SettingRow title="背景颜色">
            <input type="color" bind:value={countdownList2BgColor} />
        </SettingRow>
    </SettingSection>
{/if}

<style lang="scss">
    .event-table-wrapper {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;

        table {
            width: 100%;
            border-collapse: collapse;

            th, td {
                padding: 0.5rem;
                text-align: left;
                border-bottom: 1px solid var(--b3-border-color);
            }

            th {
                font-weight: 600;
                background: var(--b3-theme-surface);
            }

            input[type="text"] {
                width: 100%;
                padding: 0.3rem;
                border: 1px solid var(--b3-border-color);
                border-radius: 4px;
            }

            input[type="date"] {
                padding: 0.3rem;
                border: 1px solid var(--b3-border-color);
                border-radius: 4px;
            }

            .remove-event {
                cursor: pointer;
                border: none;
                background: none;
                padding: 0.25rem;

                &:hover {
                    background-color: var(--b3-theme-error);
                    border-radius: 50%;
                }
            }
        }

        .add-event-btn {
            padding: 0.4rem 0.75rem;
            border-radius: 6px;
            background-color: var(--b3-theme-primary);
            color: white;
            cursor: pointer;
            transition: background-color 0.2s ease, transform 0.1s ease;
            align-self: flex-start;

            &:hover {
                transform: scale(1.05);
            }
        }
    }

    .preview-block {
        margin-top: 0.75rem;
        padding: 0.75rem;
        background-color: rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        border: 1px solid var(--b3-border-color);
        display: flex;
        justify-content: center;
        align-items: center;

        img {
            max-width: 100%;
            max-height: 150px;
            border-radius: 6px;
            object-fit: contain;
        }
    }
</style>
