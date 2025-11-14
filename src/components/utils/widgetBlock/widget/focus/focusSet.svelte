<script lang="ts">
    import { onMount } from "svelte";

    // 专注设置相关变量
    export let focusImageType: string = "remote";
    export let breakImageType: string = "remote";
    export let focusBgImage: string =
        "https://haowallpaper.com/link/common/file/previewFileImg/15063728140422464";
    export let breakBgImage: string =
        "https://haowallpaper.com/link/common/file/previewFileImg/019ba092d7bb53bcacfdb5a626cbff0d019ba092d7bb53bcacfdb5a626cbff0d";
    export let focusLocalImage: string | null = null;
    export let breakLocalImage: string | null = null;

    // 预览图片数据
    export let focusBgImageData: string = "";
    export let breakBgImageData: string = "";

    // 文件输入引用
    let focusBgInput: HTMLInputElement | null = null;
    let breakBgInput: HTMLInputElement | null = null;

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

    // 监听图片类型和地址变化
    $: if (focusImageType === "remote" && focusBgImage) {
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

    $: if (breakImageType === "remote" && breakBgImage) {
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
</script>

<div class="content-panel focus">
    <!-- 隐藏输入框 -->
    <input
        type="file"
        bind:this={focusBgInput}
        accept="image/*"
        on:change={handleFocusUpload}
        style="display: none;"
    />
    <input
        type="file"
        bind:this={breakBgInput}
        accept="image/*"
        on:change={handleBreakUpload}
        style="display: none;"
    />
    <div class="form-group">
        <h5>背景图片设置</h5>
        <!-- 专注背景 -->
        <div class="background-option">
            <div class="background-row">
                <!-- 左侧配置 -->
                <div class="type-select-and-input">
                    <label for="focus-bg-select">专注背景：</label>
                    <div class="type-select">
                        <select
                            id="focus-bg-select"
                            bind:value={focusImageType}
                        >
                            <option value="remote">远程图片</option>
                            <option value="local">本地图片</option>
                        </select>
                    </div>

                    {#if focusImageType === "remote"}
                        <input
                            type="text"
                            bind:value={focusBgImage}
                            placeholder="请输入专注背景图URL"
                        />
                    {:else}
                        <button on:click={() => focusBgInput.click()}
                            >上传图片</button
                        >
                    {/if}
                </div>

                <!-- 右侧预览 -->
                <div class="image-preview">
                    {#if focusImageType === "remote" && focusBgImage}
                        <img src={focusBgImageData} alt="专注背景预览" />
                    {:else if focusImageType === "local" && focusLocalImage}
                        <img src={focusLocalImage} alt="专注背景预览" />
                    {/if}
                </div>
            </div>
        </div>

        <!-- 休息背景 -->
        <div class="background-option">
            <div class="background-row">
                <!-- 左侧配置 -->
                <div class="type-select-and-input">
                    <label for="break-bg-select">休息背景：</label>
                    <div class="type-select">
                        <select
                            id="break-bg-select"
                            bind:value={breakImageType}
                        >
                            <option value="remote">远程图片</option>
                            <option value="local">本地图片</option>
                        </select>
                    </div>

                    {#if breakImageType === "remote"}
                        <input
                            type="text"
                            bind:value={breakBgImage}
                            placeholder="请输入休息背景图URL"
                        />
                    {:else}
                        <button on:click={() => breakBgInput.click()}
                            >上传图片</button
                        >
                    {/if}
                </div>

                <!-- 右侧预览 -->
                <div class="image-preview">
                    {#if breakImageType === "remote" && breakBgImage}
                        <img src={breakBgImageData} alt="休息背景预览" />
                    {:else if breakImageType === "local" && breakLocalImage}
                        <img src={breakLocalImage} alt="休息背景预览" />
                    {/if}
                </div>
            </div>
        </div>
    </div>

    <hr />
    <div>
        组件说明：<a
            href="https://ttl8ygt82u.feishu.cn/wiki/R1KPw7ZqNi4iVJkjGdhcVYmtnkd?from=from_copylink"
            target="_blank">番茄钟</a
        >
    </div>
</div>

<style lang="scss">
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
