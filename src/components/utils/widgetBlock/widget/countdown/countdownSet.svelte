<script lang="ts">
    import { onMount } from "svelte";

    export let countdownStyle: string = "list";
    export let countdownFullBgSelect: string = "remote";
    export let countdownFullBg: string =
        "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80";
    export let countdownFontSize: number = 3;
    export let eventList: Array<{ name: string; date: string }> = [
        { name: "", date: "" },
    ];
    export let countdownLocalBg: string = "";

    let countdownBgInput: HTMLInputElement | null = null;

    onMount(async () => {
        // 组件挂载时的初始化逻辑
        if (eventList.length === 0) {
            eventList = [{ name: "", date: "" }];
        }
    });

    function handleCountdownUpload() {
        const file = countdownBgInput?.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                countdownLocalBg = e.target?.result as string;
            };
            reader.readAsDataURL(file);
        }
    }

    function addEvent() {
        eventList = [...eventList, { name: "", date: "" }];
    }

    function removeEvent(index: number) {
        eventList = eventList.filter((_, i) => i !== index);
    }
</script>

<div class="content-display">
    <div class="content-panel countdown">
        <div class="form-group">
            <label for="countdown-style">选择显示方式：</label>
            <select id="countdown-style" bind:value={countdownStyle}>
                <option value="list">列表</option>
                <option value="full">整页</option>
            </select>
        </div>
        {#if countdownStyle === "full"}
            <div class="form-group">
                <label>
                    背景设置：
                    <select bind:value={countdownFullBgSelect}>
                        <option value="remote">远程图片</option>
                        <option value="local">本地图片</option>
                    </select>
                </label>
                {#if countdownFullBgSelect === "remote"}
                    <input
                        type="text"
                        bind:value={countdownFullBg}
                        placeholder="输入远程图片URL"
                    />
                {:else}
                    <button on:click={() => countdownBgInput?.click()}
                        >上传图片</button
                    >
                    <input
                        type="file"
                        bind:this={countdownBgInput}
                        accept="image/*"
                        on:change={handleCountdownUpload}
                        style="display: none;"
                    />
                    <span>无预览直接确认</span>
                {/if}
            </div>
            <div class="form-group">
                <label>
                    字体大小：
                    <input
                        type="number"
                        min="1"
                        max="10"
                        bind:value={countdownFontSize}
                        placeholder="例如：3"
                    />
                </label>
            </div>
        {/if}
        <div class="countdown-grid">
            {#each eventList as event, index}
                <div class="event-form-group" data-index={index}>
                    <div class="form-group">
                        <label for="event-name-{index}"> 名称： </label>
                        <input
                            id="event-name-{index}"
                            type="text"
                            bind:value={event.name}
                            placeholder="例如：纪念日"
                        />
                        <button
                            class="remove-event"
                            title="删除"
                            on:click={() => removeEvent(index)}
                            style="margin-top: 0.5rem;"
                        >
                            🗑
                        </button>
                    </div>

                    <div class="form-group">
                        <label for="event-date-{index}"> 日期： </label>
                        <input
                            id="event-date-{index}"
                            class="date-input"
                            type="date"
                            bind:value={event.date}
                        />
                    </div>
                </div>
            {/each}
        </div>
        <button class="add-event-btn" style="margin: 1rem;" on:click={addEvent}
            >➕ 添加</button
        >

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
        .countdown-grid {
            display: grid;
            gap: 0.5rem;
            margin: 0;
            padding: 0;
            list-style: none;
            max-height: 200px;
            overflow-y: auto;
            grid-template-columns: repeat(2, 1fr);
        }

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

        .add-event-btn {
            margin: 1rem 0 0 0;
            padding: 0.4rem 0.75rem;
            font-size: 14px;
            font-weight: 600;
            border: none;
            border-radius: 6px;
            background-color: #dbeafe; // 浅蓝色
            color: #1e40af; // 深蓝文字
            cursor: pointer;
            transition:
                background-color 0.2s ease,
                transform 0.1s ease;

            &:hover {
                background-color: #bfdbfe;
            }

            &:active {
                background-color: #93c5fd;
                transform: scale(0.98);
            }
        }
    }
</style>
