<script lang="ts">
    import ImageSourceSetting from "../../shared/ImageSourceSetting.svelte";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import PremiumSelect, { type PremiumSelectOption } from "@/components/utils/shared/PremiumSelect.svelte";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
    import { isPremiumDailyQuoteMode } from "@/features/entitlement/homepage-premium-features";
    import {
        DAILY_QUOTE_AI_PROMPT_MAX_LENGTH,
        DEFAULT_DAILY_QUOTE_AI_PROMPT,
    } from "./dailyQuoteAiConfig";

    interface Props {
        advancedEnabled?: boolean;
        dailyQuoteMode?: string;
        dailyQuoteFontSize?: number;
        dailyQuoteSource?: string;
        customDailyQuoteContent?: string;
        dailyQuoteAiPrompt?: string;
        dailyQuoteAiUseMemory?: boolean;
        dailyQuoteBgSelect?: string;
        dailyQuoteRemoteBg?: string;
        dailyQuoteLocalBg?: string;
    }

    let {
        advancedEnabled = false,
        dailyQuoteMode = $bindable("custom"),
        dailyQuoteFontSize = $bindable(1),
        dailyQuoteSource = $bindable("classic"),
        customDailyQuoteContent = $bindable(""),
        dailyQuoteAiPrompt = $bindable(DEFAULT_DAILY_QUOTE_AI_PROMPT),
        dailyQuoteAiUseMemory = $bindable(true),
        dailyQuoteBgSelect = $bindable("remote"),
        dailyQuoteRemoteBg = $bindable("https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80"),
        dailyQuoteLocalBg = $bindable("")
    }: Props = $props();

    const DAILY_QUOTE_MODE_OPTIONS: readonly Pick<PremiumSelectOption, "value" | "label">[] = [
        { value: "custom", label: "自定义文字" },
        { value: "ai", label: "AI 生成" },
        { value: "remote", label: "远程接口" },
    ];

    function getDailyQuoteModeOptions(): PremiumSelectOption[] {
        return DAILY_QUOTE_MODE_OPTIONS.map((option) => {
            const requiresAdvanced = isPremiumDailyQuoteMode(option.value);
            return requiresAdvanced
                ? { ...option, requiresAdvanced: true, disabled: !advancedEnabled }
                : option;
        });
    }
</script>

<SettingSection>
    <SettingRow title="每日一言模式">
        <PremiumSelect
            bind:value={dailyQuoteMode}
            options={getDailyQuoteModeOptions()}
            ariaLabel="每日一言模式"
            size="sm"
        />
    </SettingRow>

    <SettingRow title="字体大小">
        <input type="number" bind:value={dailyQuoteFontSize} class="control-xs" />
    </SettingRow>
</SettingSection>

{#if dailyQuoteMode === "remote"}
    {#if advancedEnabled}
        <SettingSection>
            <SettingRow title="接口来源" premium>
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
        <AdvancedFeatureLock
            title="每日一言"
            subtitle="远程接口获取每日名言警句，支持多种语录来源。"
            icon="format"
            features={[
                "多种语录接口来源",
                "名人名言和情感语录",
                "适合激励和灵感启发"
            ]}
            highlights={["远程接口", "多种语录", "灵感启发"]}
        />
    {/if}
{:else if dailyQuoteMode === "ai"}
    {#if advancedEnabled}
        <SettingSection>
            <SettingRow title="AI 生成要求" description="描述你希望每日一句的语气和风格。" premium>
                <textarea
                    bind:value={dailyQuoteAiPrompt}
                    maxlength={DAILY_QUOTE_AI_PROMPT_MAX_LENGTH}
                    rows="4"
                ></textarea>
            </SettingRow>
            <SettingRow
                title="结合全局记忆"
                description="结合 AI 中心的全局记忆，让内容更贴近长期目标和偏好。"
                premium
            >
                <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={dailyQuoteAiUseMemory} />
            </SettingRow>
            <SettingRow
                title="模型与缓存"
                description="模型跟随 AI 中心默认模型；每日自动生成一次，可在组件内手动刷新。"
                premium
            >
                <span class="daily-quote-ai-info">使用 AI 中心默认模型</span>
            </SettingRow>
        </SettingSection>
    {:else}
        <AdvancedFeatureLock
            title="AI 每日一句"
            subtitle="使用 AI 中心每日生成个性化内容。"
            icon="quote"
            features={["每日自动生成", "全局记忆个性化", "手动重新生成"]}
            highlights={["AI 生成", "全局记忆", "每日缓存"]}
        />
    {/if}
{:else}
    <SettingSection>
        <SettingRow title="自定义内容" description="每句话一行">
            <textarea bind:value={customDailyQuoteContent}></textarea>
        </SettingRow>
    </SettingSection>
{/if}

<ImageSourceSetting
    title="背景设置"
    bind:source={dailyQuoteBgSelect}
    bind:remoteUrl={dailyQuoteRemoteBg}
    bind:localDataUrl={dailyQuoteLocalBg}
    remotePlaceholder="输入远程图片URL"
    previewAlt="每日一言背景预览"
/>

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

    .daily-quote-ai-info {
        color: var(--b3-theme-on-surface);
        font-size: 12px;
    }
</style>
