<script lang="ts">
    import { onMount } from "svelte";
    import { getImage } from "@/components/tools/getImage";

    interface Props {
        advancedEnabled?: boolean;
        dailyQuoteMode?: string;
        dailyQuoteFontSize?: number;
        dailyQuoteSource?: string;
        customDailyQuoteContent?: string;
        dailyQuoteBgSelect?: string;
        dailyQuoteRemoteBg?: string;
        dailyQuoteLocalBg?: string;
        dailyQuoteBgInput?: HTMLInputElement | null;
    }

    let {
        advancedEnabled = false,
        dailyQuoteMode = $bindable("custom"),
        dailyQuoteFontSize = $bindable(1),
        dailyQuoteSource = $bindable("classic"),
        customDailyQuoteContent = $bindable(""),
        dailyQuoteBgSelect = $bindable("remote"),
        dailyQuoteRemoteBg = $bindable("https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80"),
        dailyQuoteLocalBg = $bindable(""),
        dailyQuoteBgInput = $bindable(null)
    }: Props = $props();

    let getDailyQuoteBgImage: () => Promise<void> = $state();
    let handleDailyQuoteUpload: () => void = $state();

    let dailyQuoteBgImageData: string = $state("");

    onMount(async () => {
        // 初始化背景图片
        if (!dailyQuoteBgImageData && dailyQuoteBgSelect === "remote") {
            await getDailyQuoteBgImage();
        }
    });

    // 获取背景图片
    getDailyQuoteBgImage = async () => {
        if (dailyQuoteBgSelect === "remote") {
            dailyQuoteBgImageData = await getImage(dailyQuoteRemoteBg);
        } else {
            dailyQuoteBgImageData = dailyQuoteLocalBg;
        }
    };

    // 处理图片上传
    handleDailyQuoteUpload = () => {
        const file = dailyQuoteBgInput?.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = () => {
                dailyQuoteLocalBg = reader.result as string;
            };
            reader.readAsDataURL(file);
        }
    };
</script>

<div class="content-display">
    <div class="content-panel dailyQuote">
        <div class="form-group dailyQuoteMode">
            <label>
                每日一言模式：<select bind:value={dailyQuoteMode}>
                    <option value="custom">自定义文字</option>
                    <option value="remote">远程接口👑</option>
                </select>
            </label>
            <label for="">
                字体大小：<input
                    type="number"
                    bind:value={dailyQuoteFontSize}
                />
            </label>
        </div>

        {#if dailyQuoteMode === "remote"}
            {#if advancedEnabled}
                <label for="">
                    接口来源：<select bind:value={dailyQuoteSource}>
                        <option value="classic">今日语录</option>
                        <option value="celebrity">名人名言</option>
                        <option value="emotion">情感语录</option>
                        <option value="gaoxiao">搞笑语录</option>
                        <option value="pyq">朋友圈语录</option>
                        <option value="straybirdsZH">飞鸟集（中文版）</option>
                        <option value="straybirdsEN">飞鸟集（英文版）</option>
                        <option value="lovegarden">爱情公寓语录</option>
                    </select>
                </label>
            {:else}
                <h3>👑会员专属权益👑</h3>
            {/if}
        {:else}
            <label for="">
                自定义内容：（每句话一行）
                <textarea
                    name=""
                    id=""
                    cols="30"
                    rows="10"
                    bind:value={customDailyQuoteContent}
                ></textarea>
            </label>
        {/if}

        <div class="form-group dailyQuoteBackgroundImg">
            <div class="type-select-and-input">
                <label>
                    背景设置：
                    <select
                        bind:value={dailyQuoteBgSelect}
                        onchange={() => {
                            if (dailyQuoteBgSelect === "remote") {
                                dailyQuoteLocalBg = "";
                            } else {
                                dailyQuoteRemoteBg = "";
                            }
                        }}
                    >
                        <option value="remote">远程图片</option>
                        <option value="local">本地图片</option>
                    </select>
                </label>
                {#if dailyQuoteBgSelect === "remote"}
                    <input
                        type="text"
                        bind:value={dailyQuoteRemoteBg}
                        onchange={getDailyQuoteBgImage}
                        placeholder="输入远程图片URL"
                    />
                {:else}
                    <button onclick={() => dailyQuoteBgInput?.click()}>
                        上传图片
                    </button>

                    <input
                        type="file"
                        bind:this={dailyQuoteBgInput}
                        accept="image/*"
                        onchange={handleDailyQuoteUpload}
                        style="display: none;"
                    />
                {/if}
            </div>
            <div class="image-preview">
                {#if dailyQuoteBgSelect === "remote" && dailyQuoteBgImageData}
                    <img src={dailyQuoteBgImageData} alt="每日一言背景预览" />
                {:else if dailyQuoteBgSelect === "local" && dailyQuoteLocalBg}
                    <img src={dailyQuoteLocalBg} alt="每日一言背景预览" />
                {/if}
            </div>
        </div>
        <p>注：若某一接口失效请联系我更新~</p>
    </div>
</div>

<style lang="scss">
    .dailyQuote {
        display: flex;
        flex-direction: column;
        gap: 1rem;

        textarea {
            height: 100px;
        }

        .dailyQuoteBackgroundImg {
            display: flex;
            align-items: flex-start;
            gap: 1rem;
            flex-wrap: wrap;
            border-top: 1px solid var(--b3-border-color);
            padding: 1rem 0;

            .type-select-and-input {
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
