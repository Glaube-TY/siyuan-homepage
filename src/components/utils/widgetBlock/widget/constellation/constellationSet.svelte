<script lang="ts">
    export let advancedEnabled: boolean = false;
    export let selectedConstellation: string = "摩羯";

    const constellations = [
        "摩羯",
        "水瓶",
        "双鱼",
        "白羊",
        "金牛",
        "双子",
        "巨蟹",
        "狮子",
        "处女",
        "天秤",
        "天蝎",
        "射手",
    ];
</script>

<div class="content-display">
    {#if advancedEnabled}
        <div class="content-panel constellation">
            <label for="constellation"
                >选择星座：
                <select id="constellation" bind:value={selectedConstellation}>
                    {#each constellations as constellation}
                        <option value={constellation}>{constellation}</option>
                    {/each}
                </select>
            </label>
        </div>
    {:else}
        <h3>👑会员专属权益👑</h3>
    {/if}
    <hr />
    <div>
        组件说明：<a
            href="https://ttl8ygt82u.feishu.cn/wiki/RqNUwkJaBiJwHHkFAc4cHmWenqb?from=from_copylink"
            target="_blank">星座运势</a
        >
    </div>
    <p>注：若某一接口失效请联系我更新~</p>
</div>