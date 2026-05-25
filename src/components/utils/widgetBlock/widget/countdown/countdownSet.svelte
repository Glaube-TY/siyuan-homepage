<script lang="ts">
    import { onMount } from "svelte";
    import ImageSourceSetting from "../../shared/ImageSourceSetting.svelte";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";

    interface Props {
        eventList?: Array<{
            id?: string;
            name: string;
            date: string;
            anniversary: boolean;
            order?: number;
            createdAt?: string;
            updatedAt?: string;
        }>;
        countdownStyle?: string;
        countdownDatabaseId?: string;
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
        countdownStyle = $bindable("list1"),
        countdownDatabaseId = $bindable(""),
        countdownCard1BgSelect = $bindable("remote"),
        countdownCard1RemoteBg = $bindable("https://haowallpaper.com/link/common/file/previewFileImg/16665839129185664"),
        countdownCard1LocalBg = $bindable(""),
        countdownCard2BgColor = $bindable("#000000"),
        countdownList2BgColor = $bindable("#000000")
    }: Props = $props();

    onMount(() => {
        // 组件挂载时的初始化逻辑
        if (eventList.length === 0) {
            eventList = [{ name: "", date: "", anniversary: false }];
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

<SettingSection title="倒数日数据库">
    <SettingRow
        title="数据库 ID"
        description="倒数日事件会保存到思源数据库。同一主页空间内的倒数日组件会自动共用已有数据库 ID。"
    >
        <input
            class="control-full"
            type="text"
            bind:value={countdownDatabaseId}
            placeholder="输入倒数日数据库 ID"
        />
    </SettingRow>
    {#if !countdownDatabaseId?.trim()}
        <div class="database-hint">请先填写数据库 ID，倒数日事件将保存到数据库。</div>
    {/if}
</SettingSection>

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
                                <SiyuanIcon name="delete" size={14} />
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
    <ImageSourceSetting
        title="卡片1背景"
        bind:source={countdownCard1BgSelect}
        bind:remoteUrl={countdownCard1RemoteBg}
        bind:localDataUrl={countdownCard1LocalBg}
        remotePlaceholder="输入远程图片URL"
        previewAlt="倒数日卡片1背景预览"
    />
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

    .database-hint {
        color: var(--b3-theme-secondary);
        font-size: 12px;
        line-height: 1.5;
    }
</style>
