<script lang="ts">
    import { run } from 'svelte/legacy';

    import { onMount } from "svelte";
    import { getImage } from "@/components/tools/getImage";


    

    

    

    

    

    

    

    

    

    

    

    

    

    
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

    let simple2BgImageData: string = $state("");
    let getSimple2BgImage: () => Promise<void> = $state();
    // 获取简单时钟2背景图片
    getSimple2BgImage = async () => {
        if (simple2BgSelect === "remote") {
            simple2BgImageData = await getImage(simple2RemoteBg);
        } else {
            simple2BgImageData = simple2LocalBg;
        }
    };
    let handleSimple2Upload: () => void = $state();
    let simple2BgInput: HTMLInputElement = $state();
    // 处理图片上传
    handleSimple2Upload = () => {
        const file = simple2BgInput?.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = () => {
                simple2LocalBg = reader.result as string;
            };
            reader.readAsDataURL(file);
        }
    };

    let morningBgImageData: string = $state("");
    let afternoonBgImageData: string = $state("");
    let nightBgImageData: string = $state("");

    onMount(async () => {
        advancedEnabled = plugin.ADVANCED;

        await initializeImages();

        // 初始化背景图片
        if (!simple2BgImageData && simple2BgSelect === "remote") {
            await getSimple2BgImage();
        }
    });

    // 监听图片类型和地址变化
    run(() => {
        if (morningImageType === "remote" && morningBgUrl) {
            (async () => {
                if (
                    !window.navigator.userAgent.includes("Electron") ||
                    typeof window.require !== "function"
                ) {
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
                if (
                    !window.navigator.userAgent.includes("Electron") ||
                    typeof window.require !== "function"
                ) {
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
                if (
                    !window.navigator.userAgent.includes("Electron") ||
                    typeof window.require !== "function"
                ) {
                    nightBgImageData = await getImage(nightBgUrl);
                } else {
                    nightBgImageData = nightBgUrl;
                }
            })();
        }
    });
</script>

<div class="content-panel timedate">
    <div class="time-type-select">
        <label for="timeType"
            >时间模式：
            <select id="timeType" bind:value={timeType}>
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
        </label>
    </div>

    {#if timeType === "classic"}
        <div>
            <div
                class="form-group"
                style="display: flex; flex-wrap: wrap; gap: 1rem; align-items: center;"
            >
                <label
                    ><input type="checkbox" bind:checked={showSeconds} /> 显示秒数</label
                >
                <label
                    ><input type="checkbox" bind:checked={showDate} /> 显示日期</label
                >
                <label
                    ><input type="checkbox" bind:checked={showWeek} /> 显示星期</label
                >
                <label
                    ><input type="checkbox" bind:checked={showLunar} /> 显示农历</label
                >
                <label
                    ><input type="checkbox" bind:checked={showZodiac} /> 显示生肖</label
                >
                <label
                    ><input type="checkbox" bind:checked={showSolarTerm} /> 显示节气</label
                >
            </div>

            <div class="form-group">
                {#if showDate}
                    <label for="dateFormat">日期格式：</label>
                    <select id="dateFormat" bind:value={dateFormat}>
                        <option value="YYYY年MM月DD日">YYYY年MM月DD日</option>
                        <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                        <option value="YYYY/MM/DD">YYYY/MM/DD</option>
                        <option value="YYYY.MM.DD">YYYY.MM.DD</option>
                    </select>
                {/if}
                <label for="timedate-fontSize">
                    字体大小：
                    <input
                        type="number"
                        min="1"
                        max="10"
                        bind:value={timedateFontSize}
                        placeholder="例如：3"
                    />
                </label>
            </div>

            <!-- 隐藏的文件输入 -->
            <input
                type="file"
                bind:this={morningBgInput}
                accept="image/*"
                onchange={handleMorningUpload}
                style="display: none;"
            />
            <input
                type="file"
                bind:this={afternoonBgInput}
                accept="image/*"
                onchange={handleAfternoonUpload}
                style="display: none;"
            />
            <input
                type="file"
                bind:this={nightBgInput}
                accept="image/*"
                onchange={handleNightUpload}
                style="display: none;"
            />

            <div class="form-group">
                <h5>背景图片设置</h5>

                <!-- 早晨 -->
                <div class="background-option">
                    <div class="background-row">
                        <!-- 左侧配置 -->
                        <div class="type-select-and-input">
                            <label for="morning-bg-select"
                                >早晨：（6点 ~ 12点）</label
                            >
                            <div class="type-select">
                                <select
                                    id="morning-bg-select"
                                    bind:value={morningImageType}
                                >
                                    <option value="remote">远程图片</option>
                                    <option value="local">本地图片</option>
                                </select>
                            </div>

                            {#if morningImageType === "remote"}
                                <input
                                    type="text"
                                    bind:value={morningBgUrl}
                                    placeholder="请输入早晨背景图URL"
                                />
                            {:else}
                                <button onclick={() => morningBgInput?.click()}
                                    >上传图片</button
                                >
                            {/if}
                        </div>

                        <!-- 右侧预览 -->
                        <div class="image-preview">
                            {#if morningImageType === "remote" && morningBgUrl}
                                <img src={morningBgImageData} alt="早晨预览" />
                            {:else if morningImageType === "local" && morningBgImage}
                                <img src={morningBgImage} alt="早晨预览" />
                            {/if}
                        </div>
                    </div>
                </div>

                <!-- 中午 -->
                <div class="background-option">
                    <div class="background-row">
                        <!-- 左侧配置 -->
                        <div class="type-select-and-input">
                            <label for="afternoon-bg-select"
                                >中午：（12点 ~ 18点）</label
                            >
                            <div class="type-select">
                                <select
                                    id="afternoon-bg-select"
                                    bind:value={afternoonImageType}
                                >
                                    <option value="remote">远程图片</option>
                                    <option value="local">本地图片</option>
                                </select>
                            </div>

                            {#if afternoonImageType === "remote"}
                                <input
                                    type="text"
                                    bind:value={afternoonBgUrl}
                                    placeholder="请输入中午背景图URL"
                                />
                            {:else}
                                <button
                                    onclick={() => afternoonBgInput?.click()}
                                    >上传图片</button
                                >
                            {/if}
                        </div>

                        <!-- 右侧预览 -->
                        <div class="image-preview">
                            {#if afternoonImageType === "remote" && afternoonBgUrl}
                                <img
                                    src={afternoonBgImageData}
                                    alt="中午预览"
                                />
                            {:else if afternoonImageType === "local" && afternoonBgImage}
                                <img src={afternoonBgImage} alt="中午预览" />
                            {/if}
                        </div>
                    </div>
                </div>

                <!-- 晚上 -->
                <div class="background-option">
                    <div class="background-row">
                        <!-- 左侧配置 -->
                        <div class="type-select-and-input">
                            <label for="night-bg-select"
                                >晚上：（18点 ~ 6点）</label
                            >
                            <div class="type-select">
                                <select
                                    id="night-bg-select"
                                    bind:value={nightImageType}
                                >
                                    <option value="remote">远程图片</option>
                                    <option value="local">本地图片</option>
                                </select>
                            </div>

                            {#if nightImageType === "remote"}
                                <input
                                    type="text"
                                    bind:value={nightBgUrl}
                                    placeholder="请输入晚上背景图URL"
                                />
                            {:else}
                                <button onclick={() => nightBgInput?.click()}
                                    >上传图片</button
                                >
                            {/if}
                        </div>

                        <!-- 右侧预览 -->
                        <div class="image-preview">
                            {#if nightImageType === "remote" && nightBgUrl}
                                <img src={nightBgImageData} alt="晚上预览" />
                            {:else if nightImageType === "local" && nightBgImage}
                                <img src={nightBgImage} alt="晚上预览" />
                            {/if}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    {:else if timeType === "simple1"}
        <div class="form-group">
            <label for=""
                >时钟大小：
                <input type="number" bind:value={simple1Size} />
            </label>
            <label for=""
                >字体粗细：
                <input type="number" bind:value={simple1FontWeight} />
            </label>
        </div>
        <div class="form-group">
            <label for="">
                <input type="checkbox" bind:checked={simple1ShowSecond} />
                显示秒
            </label>
            <label for="">
                <input type="checkbox" bind:checked={simple1ShowDate} />
                显示日期
            </label>
        </div>
    {:else if timeType === "simple2"}
        <div class="form-group simple2BackgroundImg">
            <div class="type-select-and-input">
                <label>
                    背景设置：
                    <select
                        bind:value={simple2BgSelect}
                        onchange={() => {
                            if (simple2BgSelect === "remote") {
                                simple2LocalBg = "";
                            } else {
                                simple2RemoteBg = "";
                            }
                        }}
                    >
                        <option value="remote">远程图片</option>
                        <option value="local">本地图片</option>
                    </select>
                </label>
                {#if simple2BgSelect === "remote"}
                    <input
                        type="text"
                        bind:value={simple2RemoteBg}
                        onchange={getSimple2BgImage}
                        placeholder="输入远程图片URL"
                    />
                {:else}
                    <button onclick={() => simple2BgInput?.click()}>
                        上传图片
                    </button>

                    <input
                        type="file"
                        bind:this={simple2BgInput}
                        accept="image/*"
                        onchange={handleSimple2Upload}
                        style="display: none;"
                    />
                {/if}
            </div>
            <div class="image-preview">
                {#if simple2BgSelect === "remote" && simple2BgImageData}
                    <img src={simple2BgImageData} alt="简单时钟2背景预览" />
                {:else if simple2BgSelect === "local" && simple2LocalBg}
                    <img src={simple2LocalBg} alt="简单时钟2背景预览" />
                {/if}
            </div>
        </div>
    {:else if timeType === "dial1"}
        <div class="form-group form-group-dial1">
            <label for="">
                <input type="checkbox" bind:checked={dial1ShowSecond} />
                显示秒针
            </label>
            <label for="">
                <input type="checkbox" bind:checked={dial1ShowMarkers} />
                显示刻度数字
            </label>
            <label for="">
                <input type="checkbox" bind:checked={dial1ShowDate} />
                显示日期
            </label>
        </div>
    {:else if timeType === "dial2"}
        <div class="form-group form-group-dial2">
            <label for="">
                <input type="checkbox" bind:checked={dial2ShowSecond} />
                显示秒针
            </label>
            <label for="">
                <input type="checkbox" bind:checked={dial2ShowMarkers} />
                显示刻度数字
            </label>
            <label for="">
                <input type="checkbox" bind:checked={dial2ShowDate} />
                显示日期
            </label>
        </div>
    {:else if timeType === "dial3" && advancedEnabled}
        <div class="form-group form-group-dial3">
            <label for="">
                <input type="checkbox" bind:checked={dial3ShowSecond} />
                显示秒针
            </label>
        </div>
    {:else if timeType === "dial4" && advancedEnabled}
        <div class="form-group form-group-dial4">
            <label for="">
                <input type="checkbox" bind:checked={dial4ShowSecond} />
                显示秒针
            </label>
        </div>
    {:else if timeType === "dial5" && advancedEnabled}
        <div class="form-group form-group-dial5">
            <label for="">
                <input type="checkbox" bind:checked={dial5ShowSecond} />
                显示秒针
            </label>
        </div>
    {:else if timeType === "dial6" && advancedEnabled}
        <div class="form-group form-group-dial6">
            <label for="">
                <input type="checkbox" bind:checked={dial6ShowSecond} />
                显示秒针
            </label>
        </div>
    {:else if timeType === "dial7" && advancedEnabled}
        <div class="form-group form-group-dial7">
            <label for="">
                <input type="checkbox" bind:checked={dial7ShowSecond} />
                显示秒针
            </label>
        </div>
    {:else if timeType === "dial8" && advancedEnabled}
        <div class="form-group form-group-dial8">
            <label for="">
                <input type="checkbox" bind:checked={dial8ShowSecond} />
                显示秒针
            </label>
        </div>
    {:else if timeType === "dial9" && advancedEnabled}
        <div class="form-group form-group-dial9">
            <label for="">
                <input type="checkbox" bind:checked={dial9ShowSecond} />
                显示秒针
            </label>
        </div>
    {/if}

    <hr />
    <div>
        组件说明：<a
            href="https://ttl8ygt82u.feishu.cn/wiki/NlvZweO3LiUA2XkC2escjktKnXg?from=from_copylink"
            target="_blank">时钟</a
        >
    </div>
</div>

<style lang="scss">
    .timedate {
        .background-option {
            margin-bottom: 1rem;

            .background-row {
                display: flex;
                align-items: flex-start;
                gap: 1rem;
                flex-wrap: wrap;
            }

            .type-select-and-input {
                flex: 1 1 auto;
                max-width: 200px;
                display: flex;
                flex-direction: column;
                gap: 0.5rem;

                label {
                    font-size: 14px;
                    font-weight: 500;
                }

                select,
                input[type="text"] {
                    padding: 0.4rem;
                    box-sizing: border-box;
                    font-size: 14px;
                    border-radius: 6px;
                    border: 1px solid var(--b3-theme-primary-lighter);
                    width: 100%;
                    background-color: var(--b3-theme-background);
                    transition: all 0.2s ease;

                    &:focus {
                        outline: none;
                        border-color: var(--b3-theme-primary);
                        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
                    }

                    &:hover {
                        border-color: var(--b3-theme-primary-light);
                    }
                }

                button {
                    padding: 0.4rem 0.6rem;
                    font-size: 14px;
                    background-color: var(--b3-theme-surface);
                    color: var(--b3-theme-on-surface);
                    border: 1px solid var(--b3-border-color);
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    width: 100%;
                    align-self: flex-start;

                    &:hover {
                        background-color: var(--b3-theme-primary-light);
                        color: var(--b3-theme-primary);
                        border-color: var(--b3-theme-primary);
                    }

                    &:focus {
                        outline: none;
                        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
                    }
                }
            }

            .image-preview {
                flex: 0 0 auto;
                display: flex;
                align-items: center;
                justify-content: center;
                width: auto; // 固定宽度为 200px
                background-color: rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
                border: 1px solid #ccc;
                transition: box-shadow 0.3s ease;
                padding: 0.5rem;

                img {
                    width: 150px; // 宽度填满容器（200px）
                    height: auto; // 高度自适应，保持图片比例
                    max-height: 100px;
                    object-fit: contain;
                    border-radius: 6px;
                }

                &:hover {
                    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
                }
            }
        }
    }

    .simple2BackgroundImg {
        display: flex;
        align-items: flex-start;
        gap: 1rem;
        flex-wrap: wrap;
        border-top: 1px solid var(--b3-border-color);
        padding: 1rem 0;

        .type-select-and-input {
            flex: 1 1 auto;
            max-width: 200px;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;

            label {
                font-size: 14px;
                font-weight: 500;
            }

            select,
            input[type="text"] {
                padding: 0.4rem;
                box-sizing: border-box;
                font-size: 14px;
                border-radius: 6px;
                width: 100%;
                transition: all 0.2s ease;

                &:focus {
                    outline: none;
                    border-color: var(--b3-theme-primary);
                    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
                }

                &:hover {
                    border-color: var(--b3-theme-primary-light);
                }
            }

            button {
                padding: 0.4rem 0.6rem;
                font-size: 14px;
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.2s ease;
                width: 100%;
                align-self: flex-start;

                &:hover {
                    background-color: var(--b3-theme-primary-light);
                    border-color: var(--b3-theme-primary);
                }

                &:focus {
                    outline: none;
                    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
                }
            }
        }

        .image-preview {
            flex: 0 0 auto;
            display: flex;
            align-items: center;
            justify-content: center;
            width: auto; // 固定宽度为 200px
            background-color: rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
            border: 1px solid #ccc;
            transition: box-shadow 0.3s ease;
            padding: 0.5rem;

            img {
                width: 150px; // 宽度填满容器（200px）
                height: auto; // 高度自适应，保持图片比例
                max-height: 100px;
                object-fit: contain;
                border-radius: 6px;
            }

            &:hover {
                box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
            }
        }
    }
</style>
