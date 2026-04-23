<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        advancedEnabled?: boolean;
        selectedConstellation?: string;
    }

    let { advancedEnabled = false, selectedConstellation = $bindable("capricorn") }: Props = $props();

    // 星座选项：显示中文，值为英文
    const constellations = [
        { value: "capricorn", label: "摩羯" },
        { value: "aquarius", label: "水瓶" },
        { value: "pisces", label: "双鱼" },
        { value: "aries", label: "白羊" },
        { value: "taurus", label: "金牛" },
        { value: "gemini", label: "双子" },
        { value: "cancer", label: "巨蟹" },
        { value: "leo", label: "狮子" },
        { value: "virgo", label: "处女" },
        { value: "libra", label: "天秤" },
        { value: "scorpio", label: "天蝎" },
        { value: "sagittarius", label: "射手" },
    ];
</script>

{#if advancedEnabled}
    <SettingSection>
        <SettingRow title="选择星座">
            <select bind:value={selectedConstellation} class="control-sm">
                {#each constellations as constellation}
                    <option value={constellation.value}>{constellation.label}</option>
                {/each}
            </select>
        </SettingRow>
    </SettingSection>
    <p>注：若某一接口失效请联系我更新~</p>
{:else}
    <h3>👑会员专属权益👑</h3>
{/if}
