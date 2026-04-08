<script lang="ts">
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

<div class="content-display">
    {#if advancedEnabled}
        <div class="content-panel constellation">
            <label for="constellation"
                >选择星座：
                <select id="constellation" bind:value={selectedConstellation}>
                    {#each constellations as constellation}
                        <option value={constellation.value}>{constellation.label}</option>
                    {/each}
                </select>
            </label>
        </div>
    {:else}
        <h3>👑会员专属权益👑</h3>
    {/if}
    <p>注：若某一接口失效请联系我更新~</p>
</div>