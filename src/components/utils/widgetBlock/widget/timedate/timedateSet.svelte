<script lang="ts">
    import ImageSourceSetting from "../../shared/ImageSourceSetting.svelte";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";

    interface Props {
        plugin: any;
        // 时间样式
        timeType?: string;
        // 时钟配置
        showSeconds?: boolean;
        dateFormat?: string;
        showLunar?: boolean;
        showZodiac?: boolean;
        showSolarTerm?: boolean;
        showWeek?: boolean;
        showDate?: boolean;
        timedateFontSize?: number;
        // 背景图片配置
        morningImageType?: string;
        afternoonImageType?: string;
        nightImageType?: string;
        morningBgUrl?: string;
        afternoonBgUrl?: string;
        nightBgUrl?: string;
        morningBgImage?: string;
        afternoonBgImage?: string;
        nightBgImage?: string;
        // 简单时钟配置
        simple1Size?: number;
        simple1FontWeight?: number;
        simple1ShowSecond?: boolean;
        simple1ShowDate?: boolean;
        // 简单时钟2配置
        simple2BgSelect?: string;
        simple2RemoteBg?: string;
        simple2LocalBg?: string;
        // 表盘时钟配置
        dial1ShowSecond?: boolean;
        dial1ShowMarkers?: boolean;
        dial1ShowDate?: boolean;
        // 表盘2配置
        dial2ShowSecond?: boolean;
        dial2ShowMarkers?: boolean;
        dial2ShowDate?: boolean;
        // 表盘3配置
        dial3ShowSecond?: boolean;
        // 表盘4配置
        dial4ShowSecond?: boolean;
        // 表盘5配置
        dial5ShowSecond?: boolean;
        // 表盘6配置
        dial6ShowSecond?: boolean;
        // 表盘7配置
        dial7ShowSecond?: boolean;
        // 表盘8配置
        dial8ShowSecond?: boolean;
        // 表盘9配置
        dial9ShowSecond?: boolean;
    }

    let {
        plugin,
        timeType = $bindable("classic"),
        showSeconds = $bindable(true),
        dateFormat = $bindable("YYYY年MM月DD日"),
        showLunar = $bindable(true),
        showZodiac = $bindable(true),
        showSolarTerm = $bindable(true),
        showWeek = $bindable(true),
        showDate = $bindable(true),
        timedateFontSize = $bindable(3),
        morningImageType = $bindable("remote"),
        afternoonImageType = $bindable("remote"),
        nightImageType = $bindable("remote"),
        morningBgUrl = $bindable(""),
        afternoonBgUrl = $bindable(""),
        nightBgUrl = $bindable(""),
        morningBgImage = $bindable<string | null>(""),
        afternoonBgImage = $bindable<string | null>(""),
        nightBgImage = $bindable<string | null>(""),
        simple1Size = $bindable(3),
        simple1FontWeight = $bindable(4),
        simple1ShowSecond = $bindable(true),
        simple1ShowDate = $bindable(true),
        simple2BgSelect = $bindable("remote"),
        simple2RemoteBg = $bindable("https://haowallpaper.com/link/common/file/previewFileImg/17882739641666944"),
        simple2LocalBg = $bindable(""),
        dial1ShowSecond = $bindable(true),
        dial1ShowMarkers = $bindable(true),
        dial1ShowDate = $bindable(true),
        dial2ShowSecond = $bindable(true),
        dial2ShowMarkers = $bindable(true),
        dial2ShowDate = $bindable(true),
        dial3ShowSecond = $bindable(true),
        dial4ShowSecond = $bindable(true),
        dial5ShowSecond = $bindable(true),
        dial6ShowSecond = $bindable(true),
        dial7ShowSecond = $bindable(true),
        dial8ShowSecond = $bindable(true),
        dial9ShowSecond = $bindable(true)
    }: Props = $props();

    let advancedEnabled = $derived(Boolean(plugin?.ADVANCED));
</script>

<SettingSection>
    <SettingRow title="时间模式">
        <select bind:value={timeType} class="control-md">
            <option value="classic">经典</option>
            <option value="simple1">简约1</option>
            <option value="simple2">简约2</option>
            <option value="dial1">表盘1</option>
            <option value="dial2">表盘2</option>
            <option value="dial3">表盘3👑</option>
            <option value="dial4">表盘4👑</option>
            <option value="dial5">表盘5👑</option>
            <option value="dial6">表盘6👑</option>
            <option value="dial7">中国风表盘1👑</option>
            <option value="dial8">水墨表盘1👑</option>
            <option value="dial9">卡通熊表盘👑</option>
        </select>
    </SettingRow>
</SettingSection>

{#if timeType === "classic"}
    <SettingSection title="显示选项">
        <SettingRow title="显示秒数">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={showSeconds} />
        </SettingRow>
        <SettingRow title="显示日期">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={showDate} />
        </SettingRow>
        <SettingRow title="显示星期">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={showWeek} />
        </SettingRow>
        <SettingRow title="显示农历">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={showLunar} />
        </SettingRow>
        <SettingRow title="显示生肖">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={showZodiac} />
        </SettingRow>
        <SettingRow title="显示节气">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={showSolarTerm} />
        </SettingRow>
    </SettingSection>

    {#if showDate}
        <SettingSection>
            <SettingRow title="日期格式">
                <select bind:value={dateFormat} class="control-md">
                    <option value="YYYY年MM月DD日">YYYY年MM月DD日</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    <option value="YYYY/MM/DD">YYYY/MM/DD</option>
                    <option value="YYYY.MM.DD">YYYY.MM.DD</option>
                </select>
            </SettingRow>
        </SettingSection>
    {/if}

    <SettingSection>
        <SettingRow title="字体大小">
            <input type="number" min="1" max="10" bind:value={timedateFontSize} class="control-xs" />
        </SettingRow>
    </SettingSection>

    <ImageSourceSetting
        title="早晨背景（6点 ~ 12点）"
        bind:source={morningImageType}
        bind:remoteUrl={morningBgUrl}
        bind:localDataUrl={morningBgImage}
        remotePlaceholder="请输入早晨背景图URL"
        uploadLabel="上传图片"
        previewAlt="早晨背景预览"
    />

    <ImageSourceSetting
        title="中午背景（12点 ~ 18点）"
        bind:source={afternoonImageType}
        bind:remoteUrl={afternoonBgUrl}
        bind:localDataUrl={afternoonBgImage}
        remotePlaceholder="请输入中午背景图URL"
        uploadLabel="上传图片"
        previewAlt="中午背景预览"
    />

    <ImageSourceSetting
        title="晚上背景（18点 ~ 6点）"
        bind:source={nightImageType}
        bind:remoteUrl={nightBgUrl}
        bind:localDataUrl={nightBgImage}
        remotePlaceholder="请输入晚上背景图URL"
        uploadLabel="上传图片"
        previewAlt="晚上背景预览"
    />

{:else if timeType === "simple1"}
    <SettingSection>
        <SettingRow title="时钟大小">
            <input type="number" bind:value={simple1Size} class="control-xs" />
        </SettingRow>
        <SettingRow title="字体粗细">
            <input type="number" bind:value={simple1FontWeight} class="control-xs" />
        </SettingRow>
        <SettingRow title="显示秒">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={simple1ShowSecond} />
        </SettingRow>
        <SettingRow title="显示日期">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={simple1ShowDate} />
        </SettingRow>
    </SettingSection>

{:else if timeType === "simple2"}
    <ImageSourceSetting
        title="背景设置"
        bind:source={simple2BgSelect}
        bind:remoteUrl={simple2RemoteBg}
        bind:localDataUrl={simple2LocalBg}
        remotePlaceholder="输入远程图片URL"
        uploadLabel="上传图片"
        previewAlt="简单时钟2背景预览"
    />

{:else if timeType === "dial1"}
    <SettingSection>
        <SettingRow title="显示秒针">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={dial1ShowSecond} />
        </SettingRow>
        <SettingRow title="显示刻度数字">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={dial1ShowMarkers} />
        </SettingRow>
        <SettingRow title="显示日期">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={dial1ShowDate} />
        </SettingRow>
    </SettingSection>

{:else if timeType === "dial2"}
    <SettingSection>
        <SettingRow title="显示秒针">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={dial2ShowSecond} />
        </SettingRow>
        <SettingRow title="显示刻度数字">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={dial2ShowMarkers} />
        </SettingRow>
        <SettingRow title="显示日期">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={dial2ShowDate} />
        </SettingRow>
    </SettingSection>

{:else if timeType === "dial3"}
    {#if advancedEnabled}
    <SettingSection>
        <SettingRow title="显示秒针">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={dial3ShowSecond} />
        </SettingRow>
    </SettingSection>
    {:else}
    <AdvancedFeatureLock
        title="时钟"
        subtitle="多种风格时钟展示，适合主页装饰。"
        icon="clock"
        features={[
            "多种风格时钟展示",
            "模拟表盘设计",
            "适合主页装饰和时间感知"
        ]}
        highlights={["模拟时钟", "多样式", "主页装饰"]}
    />
    {/if}

{:else if timeType === "dial4"}
    {#if advancedEnabled}
    <SettingSection>
        <SettingRow title="显示秒针">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={dial4ShowSecond} />
        </SettingRow>
    </SettingSection>
    {:else}
    <AdvancedFeatureLock
        title="时钟"
        subtitle="多种风格时钟展示，适合主页装饰。"
        icon="clock"
        features={[
            "多种风格时钟展示",
            "模拟表盘设计",
            "适合主页装饰和时间感知"
        ]}
        highlights={["模拟时钟", "多样式", "主页装饰"]}
    />
    {/if}

{:else if timeType === "dial5"}
    {#if advancedEnabled}
    <SettingSection>
        <SettingRow title="显示秒针">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={dial5ShowSecond} />
        </SettingRow>
    </SettingSection>
    {:else}
    <AdvancedFeatureLock
        title="时钟"
        subtitle="多种风格时钟展示，适合主页装饰。"
        icon="clock"
        features={[
            "多种风格时钟展示",
            "模拟表盘设计",
            "适合主页装饰和时间感知"
        ]}
        highlights={["模拟时钟", "多样式", "主页装饰"]}
    />
    {/if}

{:else if timeType === "dial6"}
    {#if advancedEnabled}
    <SettingSection>
        <SettingRow title="显示秒针">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={dial6ShowSecond} />
        </SettingRow>
    </SettingSection>
    {:else}
    <AdvancedFeatureLock
        title="时钟"
        subtitle="多种风格时钟展示，适合主页装饰。"
        icon="clock"
        features={[
            "多种风格时钟展示",
            "模拟表盘设计",
            "适合主页装饰和时间感知"
        ]}
        highlights={["模拟时钟", "多样式", "主页装饰"]}
    />
    {/if}

{:else if timeType === "dial7"}
    {#if advancedEnabled}
    <SettingSection>
        <SettingRow title="显示秒针">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={dial7ShowSecond} />
        </SettingRow>
    </SettingSection>
    {:else}
    <AdvancedFeatureLock
        title="时钟"
        subtitle="多种风格时钟展示，适合主页装饰。"
        icon="clock"
        features={[
            "多种风格时钟展示",
            "模拟表盘设计",
            "适合主页装饰和时间感知"
        ]}
        highlights={["模拟时钟", "多样式", "主页装饰"]}
    />
    {/if}

{:else if timeType === "dial8"}
    {#if advancedEnabled}
    <SettingSection>
        <SettingRow title="显示秒针">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={dial8ShowSecond} />
        </SettingRow>
    </SettingSection>
    {:else}
    <AdvancedFeatureLock
        title="时钟"
        subtitle="多种风格时钟展示，适合主页装饰。"
        icon="clock"
        features={[
            "多种风格时钟展示",
            "模拟表盘设计",
            "适合主页装饰和时间感知"
        ]}
        highlights={["模拟时钟", "多样式", "主页装饰"]}
    />
    {/if}

{:else if timeType === "dial9"}
    {#if advancedEnabled}
    <SettingSection>
        <SettingRow title="显示秒针">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={dial9ShowSecond} />
        </SettingRow>
    </SettingSection>
    {:else}
    <AdvancedFeatureLock
        title="时钟"
        subtitle="多种风格时钟展示，适合主页装饰。"
        icon="clock"
        features={[
            "多种风格时钟展示",
            "模拟表盘设计",
            "适合主页装饰和时间感知"
        ]}
        highlights={["模拟时钟", "多样式", "主页装饰"]}
    />
    {/if}
{/if}
