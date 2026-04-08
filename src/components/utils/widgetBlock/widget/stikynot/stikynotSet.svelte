<script lang="ts">
    let { advancedEnabled, stikynotStyle = $bindable() } = $props();
</script>

{#if advancedEnabled}
    <div class="content-panel stikynot">
        <div class="form-group stikynot-background">
            <label for="stikynot-style">
                便签样式：
                <select
                    name="stikynot-style"
                    id="stikynot-style"
                    bind:value={stikynotStyle}
                >
                    <option value="default">默认</option>
                    <option value="kraftPaper">牛皮纸</option>
                    <option value="wood">木纹</option>
                    <option value="marble">大理石</option>
                    <option value="Ink">水墨</option>
                    <option value="beach">海滩</option>
                    <option value="BlueSky">蓝天</option>
                    <option value="sunsetHeart">夕阳</option>
                    <option value="Stars">星空</option>
                    <option value="waterDrop">雨窗</option>
                    <option value="PinkPorcelain">粉瓷</option>
                </select>
            </label>
        </div>
    </div>
{:else}
    <h3>👑会员专属权益👑</h3>
{/if}
