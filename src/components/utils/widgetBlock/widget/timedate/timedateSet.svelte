<script lang="ts">
    import { run } from 'svelte/legacy';
    import { onMount } from "svelte";
    import { getImage } from "@/components/tools/getImage";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

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
        morningBgImage = $bindable(""),
        afternoonBgImage = $bindable(""),
        nightBgImage = $bindable(""),
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

    let advancedEnabled = $state(false);

    let morningBgInput: HTMLInputElement = $state();
    let afternoonBgInput: HTMLInputElement = $state();
    let nightBgInput: HTMLInputElement = $state();

    let morningBgImageData: string = $state("");
    let afternoonBgImageData: string = $state("");
    let nightBgImageData: string = $state("");

    let simple2BgImageData: string = $state("");
    let simple2BgInput: HTMLInputElement = $state();

    // 初始化图片数据
    async function initializeImages() {
        if (
            !window.navigator.userAgent.includes("Electron") ||
            typeof window.require !== "function"
        ) {
            if (morningImageType === "remote" && morningBgUrl) {
                morningBgImageData = await getImage(morningBgUrl);
            }
            if (afternoonImageType === "remote" && afternoonBgUrl) {
                afternoonBgImageData = await getImage(afternoonBgUrl);
            }
            if (nightImageType === "remote" && nightBgUrl) {
                nightBgImageData = await getImage(nightBgUrl);
            }
        } else {
            if (morningImageType === "remote" && morningBgUrl) {
                morningBgImageData = morningBgUrl;
            }
            if (afternoonImageType === "remote" && afternoonBgUrl) {
                afternoonBgImageData = afternoonBgUrl;
            }
            if (nightImageType === "remote" && nightBgUrl) {
                nightBgImageData = nightBgUrl;
            }
        }
    }

    // 处理早晨背景上传
    function handleMorningUpload() {
        const file = morningBgInput?.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (reader.result && typeof reader.result === "string") {
                morningBgImage = reader.result;
            }
        };
        reader.readAsDataURL(file);
    }

    // 处理下午背景上传
    function handleAfternoonUpload() {
        const file = afternoonBgInput?.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (reader.result && typeof reader.result === "string") {
                afternoonBgImage = reader.result;
            }
        };
        reader.readAsDataURL(file);
    }

    // 处理晚上背景上传
    function handleNightUpload() {
        const file = nightBgInput?.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (reader.result && typeof reader.result === "string") {
                nightBgImage = reader.result;
            }
        };
        reader.readAsDataURL(file);
    }

    // 获取简单时钟2背景图片
    async function getSimple2BgImage() {
        if (simple2BgSelect === "remote") {
            simple2BgImageData = await getImage(simple2RemoteBg);
        } else {
            simple2BgImageData = simple2LocalBg;
        }
    }

    // 处理简单时钟2图片上传
    function handleSimple2Upload() {
        const file = simple2BgInput?.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = () => {
                simple2LocalBg = reader.result as string;
            };
            reader.readAsDataURL(file);
        }
    }

    onMount(async () => {
        advancedEnabled = plugin.ADVANCED;
        await initializeImages();
        if (!simple2BgImageData && simple2BgSelect === "remote") {
            await getSimple2BgImage();
        }
    });

    // 监听图片类型和地址变化
    run(() => {
        if (morningImageType === "remote" && morningBgUrl) {
            (async () => {
                if (!window.navigator.userAgent.includes("Electron") || typeof window.require !== "function") {
                    morningBgImageData = await getImage(morningBgUrl);
                } else {
                    morningBgImageData = morningBgUrl;
                }
            })();
        }
    });
    run(() => {
        if (afternoonImageType === "remote" && afternoonBgUrl) {
            (async () => {
                if (!window.navigator.userAgent.includes("Electron") || typeof window.require !== "function") {
                    afternoonBgImageData = await getImage(afternoonBgUrl);
                } else {
                    afternoonBgImageData = afternoonBgUrl;
                }
            })();
        }
    });
    run(() => {
        if (nightImageType === "remote" && nightBgUrl) {
            (async () => {
                if (!window.navigator.userAgent.includes("Electron") || typeof window.require !== "function") {
                    nightBgImageData = await getImage(nightBgUrl);
                } else {
                    nightBgImageData = nightBgUrl;
                }
            })();
        }
    });
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

    <!-- 隐藏的文件输入 -->
    <input type="file" bind:this={morningBgInput} accept="image/*" onchange={handleMorningUpload} style="display: none;" />
    <input type="file" bind:this={afternoonBgInput} accept="image/*" onchange={handleAfternoonUpload} style="display: none;" />
    <input type="file" bind:this={nightBgInput} accept="image/*" onchange={handleNightUpload} style="display: none;" />

    <SettingSection title="早晨背景（6点 ~ 12点）">
        <SettingRow title="图片来源">
            <select bind:value={morningImageType} class="control-sm">
                <option value="remote">远程图片</option>
                <option value="local">本地图片</option>
            </select>
        </SettingRow>
        {#if morningImageType === "remote"}
            <SettingRow title="图片URL">
                <input type="text" bind:value={morningBgUrl} placeholder="请输入早晨背景图URL" class="control-full" />
            </SettingRow>
        {:else}
            <SettingRow title="上传图片">
                <button onclick={() => morningBgInput?.click()} class="file-action-btn">📁</button>
            </SettingRow>
        {/if}
        {#if (morningImageType === "remote" && morningBgUrl) || (morningImageType === "local" && morningBgImage)}
            <div class="preview-block">
                {#if morningImageType === "remote" && morningBgUrl}
                    <img src={morningBgImageData} alt="早晨预览" />
                {:else if morningImageType === "local" && morningBgImage}
                    <img src={morningBgImage} alt="早晨预览" />
                {/if}
            </div>
        {/if}
    </SettingSection>

    <SettingSection title="中午背景（12点 ~ 18点）">
        <SettingRow title="图片来源">
            <select bind:value={afternoonImageType} class="control-sm">
                <option value="remote">远程图片</option>
                <option value="local">本地图片</option>
            </select>
        </SettingRow>
        {#if afternoonImageType === "remote"}
            <SettingRow title="图片URL">
                <input type="text" bind:value={afternoonBgUrl} placeholder="请输入中午背景图URL" class="control-full" />
            </SettingRow>
        {:else}
            <SettingRow title="上传图片">
                <button onclick={() => afternoonBgInput?.click()} class="file-action-btn">📁</button>
            </SettingRow>
        {/if}
        {#if (afternoonImageType === "remote" && afternoonBgUrl) || (afternoonImageType === "local" && afternoonBgImage)}
            <div class="preview-block">
                {#if afternoonImageType === "remote" && afternoonBgUrl}
                    <img src={afternoonBgImageData} alt="中午预览" />
                {:else if afternoonImageType === "local" && afternoonBgImage}
                    <img src={afternoonBgImage} alt="中午预览" />
                {/if}
            </div>
        {/if}
    </SettingSection>

    <SettingSection title="晚上背景（18点 ~ 6点）">
        <SettingRow title="图片来源">
            <select bind:value={nightImageType} class="control-sm">
                <option value="remote">远程图片</option>
                <option value="local">本地图片</option>
            </select>
        </SettingRow>
        {#if nightImageType === "remote"}
            <SettingRow title="图片URL">
                <input type="text" bind:value={nightBgUrl} placeholder="请输入晚上背景图URL" class="control-full" />
            </SettingRow>
        {:else}
            <SettingRow title="上传图片">
                <button onclick={() => nightBgInput?.click()} class="file-action-btn">📁</button>
            </SettingRow>
        {/if}
        {#if (nightImageType === "remote" && nightBgUrl) || (nightImageType === "local" && nightBgImage)}
            <div class="preview-block">
                {#if nightImageType === "remote" && nightBgUrl}
                    <img src={nightBgImageData} alt="晚上预览" />
                {:else if nightImageType === "local" && nightBgImage}
                    <img src={nightBgImage} alt="晚上预览" />
                {/if}
            </div>
        {/if}
    </SettingSection>

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
    <SettingSection title="背景设置">
        <SettingRow title="图片来源">
            <select bind:value={simple2BgSelect} onchange={() => { if (simple2BgSelect === "remote") { simple2LocalBg = ""; } else { simple2RemoteBg = ""; } }} class="control-sm">
                <option value="remote">远程图片</option>
                <option value="local">本地图片</option>
            </select>
        </SettingRow>
        {#if simple2BgSelect === "remote"}
            <SettingRow title="图片URL">
                <input type="text" bind:value={simple2RemoteBg} onchange={getSimple2BgImage} placeholder="输入远程图片URL" class="control-full" />
            </SettingRow>
        {:else}
            <SettingRow title="上传图片">
                <button onclick={() => simple2BgInput?.click()} class="file-action-btn">📁</button>
                <input type="file" bind:this={simple2BgInput} accept="image/*" onchange={handleSimple2Upload} style="display: none;" />
            </SettingRow>
        {/if}
        {#if (simple2BgSelect === "remote" && simple2BgImageData) || (simple2BgSelect === "local" && simple2LocalBg)}
            <div class="preview-block">
                {#if simple2BgSelect === "remote" && simple2BgImageData}
                    <img src={simple2BgImageData} alt="简单时钟2背景预览" />
                {:else if simple2BgSelect === "local" && simple2LocalBg}
                    <img src={simple2LocalBg} alt="简单时钟2背景预览" />
                {/if}
            </div>
        {/if}
    </SettingSection>

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

{:else if timeType === "dial3" && advancedEnabled}
    <SettingSection>
        <SettingRow title="显示秒针">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={dial3ShowSecond} />
        </SettingRow>
    </SettingSection>

{:else if timeType === "dial4" && advancedEnabled}
    <SettingSection>
        <SettingRow title="显示秒针">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={dial4ShowSecond} />
        </SettingRow>
    </SettingSection>

{:else if timeType === "dial5" && advancedEnabled}
    <SettingSection>
        <SettingRow title="显示秒针">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={dial5ShowSecond} />
        </SettingRow>
    </SettingSection>

{:else if timeType === "dial6" && advancedEnabled}
    <SettingSection>
        <SettingRow title="显示秒针">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={dial6ShowSecond} />
        </SettingRow>
    </SettingSection>

{:else if timeType === "dial7" && advancedEnabled}
    <SettingSection>
        <SettingRow title="显示秒针">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={dial7ShowSecond} />
        </SettingRow>
    </SettingSection>

{:else if timeType === "dial8" && advancedEnabled}
    <SettingSection>
        <SettingRow title="显示秒针">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={dial8ShowSecond} />
        </SettingRow>
    </SettingSection>

{:else if timeType === "dial9" && advancedEnabled}
    <SettingSection>
        <SettingRow title="显示秒针">
            <input type="checkbox" class="b3-switch fn__flex-center" bind:checked={dial9ShowSecond} />
        </SettingRow>
    </SettingSection>
{/if}

<style lang="scss">
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
            max-height: 120px;
            border-radius: 6px;
            object-fit: contain;
        }
    }
</style>
