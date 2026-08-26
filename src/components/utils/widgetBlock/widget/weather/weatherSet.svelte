<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import PremiumSelect, { type PremiumSelectOption } from "@/components/utils/shared/PremiumSelect.svelte";
    import { isPremiumWeatherStyle } from "@/features/entitlement/homepage-premium-features";

    interface Props {
        customWeatherCityName?: string;
        customWeatherCityCode?: string;
        weatherStyle?: string;
        advancedEnabled?: boolean;
    }

    let { customWeatherCityName = $bindable(""), customWeatherCityCode = $bindable(""), weatherStyle = $bindable("default"), advancedEnabled = false }: Props = $props();

    const WEATHER_STYLE_OPTIONS: readonly Pick<PremiumSelectOption, "value" | "label">[] = [
        { value: "default", label: "默认" },
        { value: "simple1", label: "简约1" },
        { value: "simple2", label: "简约2" },
    ];

    function getWeatherStyleOptions(): PremiumSelectOption[] {
        return WEATHER_STYLE_OPTIONS.map((option) => {
            const requiresAdvanced = isPremiumWeatherStyle(option.value);
            return requiresAdvanced
                ? { ...option, requiresAdvanced: true, disabled: !advancedEnabled }
                : option;
        });
    }
</script>

<SettingSection>
    <SettingRow title="样式">
        <PremiumSelect
            bind:value={weatherStyle}
            options={getWeatherStyleOptions()}
            ariaLabel="天气样式"
            size="sm"
        />
    </SettingRow>
</SettingSection>

{#if weatherStyle === "default" || weatherStyle === "simple1" || weatherStyle === "simple2"}
    <SettingSection>
        <SettingRow title="城市名称">
            <input
                type="text"
                bind:value={customWeatherCityName}
                placeholder="例如：北京"
                class="control-full"
            />
        </SettingRow>

        <SettingRow title="城市编码">
            <input
                type="text"
                bind:value={customWeatherCityCode}
                placeholder="例如：110000"
            />
        </SettingRow>

        <div class="help-text">
            城市编码为 6 位数字，例如：110000 为北京，即当地身份证前 6 位。<br />
            若两个都填写，则优先用城市编码查询，因为这会更加精确。
        </div>
    </SettingSection>
{/if}

<style lang="scss">
    .help-text {
        padding: 0.75rem;
        background: var(--b3-theme-surface);
        border-radius: 4px;
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        line-height: 1.5;
        margin-top: 0.5rem;
    }
</style>
