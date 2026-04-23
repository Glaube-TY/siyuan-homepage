<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        advancedEnabled: boolean;
        NewsType?: string;
    }

    let { advancedEnabled, NewsType = $bindable("daily-news-bulletin") }: Props = $props();
</script>

{#if advancedEnabled}
    <SettingSection>
        <SettingRow title="新闻类型">
            <select bind:value={NewsType} class="control-md">
                <option value="daily-news-bulletin">每日新闻快报</option>
                <option value="daily-news-bulletin-v2">每日新闻快报v2</option>
                <option value="daily-news-bulletin-v3">每日新闻快报v3</option>
                <option value="daily-news-bulletin-weather">每日新闻快报+当地天气</option>
                <option value="daily-news-zhihu">知乎日报</option>
            </select>
        </SettingRow>
    </SettingSection>
    <p>注：若某一接口失效请联系我更新~</p>
{:else}
    <h3>👑会员专属权益👑</h3>
{/if}
