<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
    import {
        CONSTELLATION_OPTIONS,
        CONSTELLATION_STYLE_OPTIONS,
        type ConstellationStyle,
        type ConstellationValue,
    } from "./constellationShared";

    interface Props {
        advancedEnabled?: boolean;
        selectedConstellation?: ConstellationValue;
        constellationStyle?: ConstellationStyle;
    }

    let {
        advancedEnabled = false,
        selectedConstellation = $bindable("capricorn"),
        constellationStyle = $bindable("classic"),
    }: Props = $props();
</script>

{#if advancedEnabled}
    <SettingSection>
        <SettingRow title="选择星座">
            <select bind:value={selectedConstellation} class="control-sm">
                {#each CONSTELLATION_OPTIONS as constellation}
                    <option value={constellation.value}>{constellation.label}</option>
                {/each}
            </select>
        </SettingRow>
        <SettingRow title="展示样式">
            <select bind:value={constellationStyle} class="control-sm">
                {#each CONSTELLATION_STYLE_OPTIONS as style}
                    <option value={style.value}>{style.label}</option>
                {/each}
            </select>
        </SettingRow>
    </SettingSection>
    <p>注：若某一接口失效请联系我更新~</p>
{:else}
    <AdvancedFeatureLock
        title="星座运势"
        subtitle="每日星座运势更新，了解今日运势走向。"
        icon="star"
        features={[
            "每日星座运势更新",
            "多维度运势解析",
            "适合星座文化爱好者"
        ]}
        highlights={["星座运势", "多维度解析", "每日更新"]}
    />
{/if}
