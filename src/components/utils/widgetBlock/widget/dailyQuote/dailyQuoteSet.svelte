<script lang="ts">
    import { onMount } from "svelte";
    import { getImage } from "@/components/tools/getImage";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

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

<SettingSection>
    <SettingRow title="每日一言模式">
        <select bind:value={dailyQuoteMode} class="control-sm">
            <option value="custom">自定义文字</option>
            <option value="remote">远程接口👑</option>
        </select>
    </SettingRow>

    <SettingRow title="字体大小">
        <input type="number" bind:value={dailyQuoteFontSize} class="control-xs" />
    </SettingRow>
</SettingSection>

{#if dailyQuoteMode === "remote"}
    {#if advancedEnabled}
        <SettingSection>
            <SettingRow title="接口来源">
                <select bind:value={dailyQuoteSource} class="control-md">
                    <option value="classic">今日语录</option>
                    <option value="celebrity">名人名言</option>
                    <option value="emotion">情感语录</option>
                    <option value="gaoxiao">搞笑语录</option>
                    <option value="pyq">朋友圈语录</option>
                    <option value="straybirdsZH">飞鸟集（中文版）</option>
                    <option value="straybirdsEN">飞鸟集（英文版）</option>
                    <option value="lovegarden">爱情公寓语录</option>
                </select>
            </SettingRow>
        </SettingSection>
    {:else}
        <h3>👑会员专属权益👑</h3>
    {/if}
{:else}
    <SettingSection>
        <SettingRow title="自定义内容" description="每句话一行">
            <textarea bind:value={customDailyQuoteContent}></textarea>
        </SettingRow>
    </SettingSection>
{/if}

<SettingSection title="背景设置">
    <SettingRow title="图片来源">
        <select
            bind:value={dailyQuoteBgSelect}
            onchange={() => {
                if (dailyQuoteBgSelect === "remote") {
                    dailyQuoteLocalBg = "";
                } else {
                    dailyQuoteRemoteBg = "";
                }
            }}
            class="control-sm"
        >
            <option value="remote">远程图片</option>
            <option value="local">本地图片</option>
        </select>
    </SettingRow>

    {#if dailyQuoteBgSelect === "remote"}
        <SettingRow title="图片URL">
            <input
                type="text"
                bind:value={dailyQuoteRemoteBg}
                onchange={getDailyQuoteBgImage}
                placeholder="输入远程图片URL"
                class="control-full"
            />
        </SettingRow>
    {:else}
        <SettingRow title="上传图片">
            <button onclick={() => dailyQuoteBgInput?.click()} class="file-action-btn">📁</button>
            <input
                type="file"
                bind:this={dailyQuoteBgInput}
                accept="image/*"
                onchange={handleDailyQuoteUpload}
                style="display: none;"
            />
        </SettingRow>
    {/if}

    <!-- 全宽预览块 -->
    {#if dailyQuoteBgSelect === "remote" && dailyQuoteBgImageData}
        <div class="preview-block">
            <img src={dailyQuoteBgImageData} alt="每日一言背景预览" />
        </div>
    {:else if dailyQuoteBgSelect === "local" && dailyQuoteLocalBg}
        <div class="preview-block">
            <img src={dailyQuoteLocalBg} alt="每日一言背景预览" />
        </div>
    {/if}
</SettingSection>

<p>注：若某一接口失效请联系我更新~</p>

<style lang="scss">
    textarea {
        width: 100%;
        min-height: 100px;
        padding: 0.5rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        background: var(--b3-theme-background);
        font-family: inherit;
        resize: vertical;
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
