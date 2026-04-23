<script lang="ts">
    import { run } from 'svelte/legacy';
    import { onMount } from "svelte";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        // 专注设置相关变量
        focusImageType?: string;
        breakImageType?: string;
        focusBgImage?: string;
        breakBgImage?: string;
        focusLocalImage?: string | null;
        breakLocalImage?: string | null;
        // 预览图片数据
        focusBgImageData?: string;
        breakBgImageData?: string;
    }

    let {
        focusImageType = $bindable("remote"),
        breakImageType = $bindable("remote"),
        focusBgImage = $bindable("https://haowallpaper.com/link/common/file/previewFileImg/15063728140422464"),
        breakBgImage = $bindable("https://haowallpaper.com/link/common/file/previewFileImg/019ba092d7bb53bcacfdb5a626cbff0d019ba092d7bb53bcacfdb5a626cbff0d"),
        focusLocalImage = $bindable(null),
        breakLocalImage = $bindable(null),
        focusBgImageData = $bindable(""),
        breakBgImageData = $bindable("")
    }: Props = $props();

    // 文件输入引用
    let focusBgInput: HTMLInputElement | null = $state(null);
    let breakBgInput: HTMLInputElement | null = $state(null);

    // 初始化图片数据
    async function initializeImages() {
        if (
            !window.navigator.userAgent.includes("Electron") ||
            typeof window.require !== "function"
        ) {
            if (focusImageType === "remote" && focusBgImage) {
                focusBgImageData = await getImage(focusBgImage);
            }
            if (breakImageType === "remote" && breakBgImage) {
                breakBgImageData = await getImage(breakBgImage);
            }
        } else {
            if (focusImageType === "remote" && focusBgImage) {
                focusBgImageData = focusBgImage;
            }
            if (breakImageType === "remote" && breakBgImage) {
                breakBgImageData = breakBgImage;
            }
        }
    }

    // 组件挂载时初始化
    onMount(() => {
        initializeImages();
    });

    // 处理专注背景上传
    function handleFocusUpload() {
        const file = focusBgInput?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            if (reader.result && typeof reader.result === "string") {
                focusLocalImage = reader.result;
            }
        };
        reader.readAsDataURL(file);
    }

    // 处理休息背景上传
    function handleBreakUpload() {
        const file = breakBgInput?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            if (reader.result && typeof reader.result === "string") {
                breakLocalImage = reader.result;
            }
        };
        reader.readAsDataURL(file);
    }

    // 获取图片函数（假设存在）
    async function getImage(url: string): Promise<string> {
        // 这里应该是实际的图片获取逻辑
        return url;
    }

    // 监听图片类型和地址变化
    run(() => {
        if (focusImageType === "remote" && focusBgImage) {
            (async () => {
                if (
                    !window.navigator.userAgent.includes("Electron") ||
                    typeof window.require !== "function"
                ) {
                    focusBgImageData = await getImage(focusBgImage);
                } else {
                    focusBgImageData = focusBgImage;
                }
            })();
        }
    });
    run(() => {
        if (breakImageType === "remote" && breakBgImage) {
            (async () => {
                if (
                    !window.navigator.userAgent.includes("Electron") ||
                    typeof window.require !== "function"
                ) {
                    breakBgImageData = await getImage(breakBgImage);
                } else {
                    breakBgImageData = breakBgImage;
                }
            })();
        }
    });
</script>

<!-- 隐藏输入框 -->
<input
    type="file"
    bind:this={focusBgInput}
    accept="image/*"
    onchange={handleFocusUpload}
    style="display: none;"
/>
<input
    type="file"
    bind:this={breakBgInput}
    accept="image/*"
    onchange={handleBreakUpload}
    style="display: none;"
/>

<SettingSection title="专注背景">
    <SettingRow title="图片来源">
        <select bind:value={focusImageType} class="control-sm">
            <option value="remote">远程图片</option>
            <option value="local">本地图片</option>
        </select>
    </SettingRow>

    {#if focusImageType === "remote"}
        <SettingRow title="图片URL">
            <input
                type="text"
                bind:value={focusBgImage}
                placeholder="请输入专注背景图URL"
                class="control-full"
            />
        </SettingRow>
    {:else}
        <SettingRow title="上传图片">
            <button onclick={() => focusBgInput.click()} class="file-action-btn">📁</button>
        </SettingRow>
    {/if}

    {#if (focusImageType === "remote" && focusBgImage) || (focusImageType === "local" && focusLocalImage)}
        <div class="preview-block">
            {#if focusImageType === "remote" && focusBgImage}
                <img src={focusBgImageData} alt="专注背景预览" />
            {:else if focusImageType === "local" && focusLocalImage}
                <img src={focusLocalImage} alt="专注背景预览" />
            {/if}
        </div>
    {/if}
</SettingSection>

<SettingSection title="休息背景">
    <SettingRow title="图片来源">
        <select bind:value={breakImageType} class="control-sm">
            <option value="remote">远程图片</option>
            <option value="local">本地图片</option>
        </select>
    </SettingRow>

    {#if breakImageType === "remote"}
        <SettingRow title="图片URL">
            <input
                type="text"
                bind:value={breakBgImage}
                placeholder="请输入休息背景图URL"
                class="control-full"
            />
        </SettingRow>
    {:else}
        <SettingRow title="上传图片">
            <button onclick={() => breakBgInput.click()} class="file-action-btn">📁</button>
        </SettingRow>
    {/if}

    {#if (breakImageType === "remote" && breakBgImage) || (breakImageType === "local" && breakLocalImage)}
        <div class="preview-block">
            {#if breakImageType === "remote" && breakBgImage}
                <img src={breakBgImageData} alt="休息背景预览" />
            {:else if breakImageType === "local" && breakLocalImage}
                <img src={breakLocalImage} alt="休息背景预览" />
            {/if}
        </div>
    {/if}
</SettingSection>

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
