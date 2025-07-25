<script lang="ts">
    import { onMount } from "svelte";
    import { saveLayout } from "./utils/layout-handler";
    import { saveLayout as saveSidebarLayout } from "@/components/utils/sidebar/widget_layout";
    import { saveLayout as saveMobileLayout } from "@/components/utils/mobileHomepage/mobileHomepage_layout";

    // 弹窗接收的 props
    export let plugin: any;
    export let onClose: () => void;
    export let onDelete: () => void;
    export let onSetSize: (size: number) => void;

    // 新增：接收当前区块的ID
    export let currentBlockId: string = "";

    // 新增：背景颜色和透明度
    export let backgroundColor: string = "#ffffff";
    export let backgroundOpacity: number = 0.5;

    // 新增：边框颜色和粗细
    export let borderColor: string = "#000000";
    export let borderWidth: number = 1;

    // 更新背景的方法
    function updateBackground() {
        const rgbaColor = hexToRgba(backgroundColor, backgroundOpacity);
        const blockElement = document.getElementById(currentBlockId);

        if (blockElement) {
            blockElement.style.backgroundColor = rgbaColor;
        }
    }

    // 更新边框的方法
    function updateBorder() {
        const blockElement = document.getElementById(currentBlockId);

        if (blockElement) {
            blockElement.style.borderColor = borderColor;
            blockElement.style.borderWidth = `${borderWidth}px`;
            blockElement.style.borderStyle = "solid";
        }
    }

    // 将 hex 转换为 rgba
    function hexToRgba(hex: string, opacity: number): string {
        const bigint = parseInt(hex.slice(1), 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }

    // 从元素获取当前样式并赋值给变量
    function loadCurrentStyles() {
        const blockElement = document.getElementById(currentBlockId);
        if (!blockElement) return;

        const computedStyle = window.getComputedStyle(blockElement);

        // 设置背景颜色和透明度
        const bgColor = computedStyle.backgroundColor;
        const rgbaMatch = bgColor.match(
            /rgba?\((\d+[\d.]*),\s*(\d+[\d.]*),\s*(\d+[\d.]*)[\s,]*(\d*\.?\d*)?\)/i,
        );
        if (rgbaMatch) {
            const r = parseFloat(rgbaMatch[1]);
            const g = parseFloat(rgbaMatch[2]);
            const b = parseFloat(rgbaMatch[3]);
            const a = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1;

            backgroundColor = convertToHex(`rgb(${r},${g},${b})`) || "#ffffff";
            backgroundOpacity = a;
        }

        // 设置边框颜色
        const currentBorderColor = computedStyle.borderColor;
        if (currentBorderColor && currentBorderColor !== "transparent") {
            borderColor = convertToHex(currentBorderColor) || borderColor;
        }

        // 设置边框宽度
        const currentBorderWidth = computedStyle.borderWidth;
        if (currentBorderWidth) {
            const widthValue = parseFloat(currentBorderWidth);
            if (!isNaN(widthValue)) {
                borderWidth = widthValue;
            }
        }
    }

    // 统一颜色转换器
    function convertToHex(color: string): string | null {
        const matches = color.match(/(\d+(\.\d+)?)/g);
        if (!matches) return null;

        const values = matches.map(Number);

        // 辅助函数：十进制转两位十六进制
        function toHex(value: number): string {
            const hex = Math.min(255, Math.max(0, Math.round(value))).toString(
                16,
            );
            return hex.length === 1 ? "0" + hex : hex;
        }

        // 处理 RGB
        if (values.length === 3) {
            const [r, g, b] = values;
            return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        }

        // 处理 RGBA（混合到白色背景）
        if (values.length === 4) {
            const [r, g, b, a] = values;
            const blend = (c: number) => Math.round((1 - a) * 255 + a * c);
            const blendedR = blend(r);
            const blendedG = blend(g);
            const blendedB = blend(b);
            return `#${toHex(blendedR)}${toHex(blendedG)}${toHex(blendedB)}`;
        }

        return null;
    }

    onMount(() => {
        loadCurrentStyles();
        updateBackground();
        updateBorder();
    });
</script>

<div class="settings-group">
    <div class="setting-item">
        <div class="size-options-row">
            <h4 style="margin-bottom: 0.5rem;">改变尺寸</h4>

            <div class="size-options-row-one">
                <!-- 1x1 -->
                <button
                    type="button"
                    class="size-option"
                    on:click={() => {
                        onSetSize(11);
                        saveLayout(plugin);
                        saveSidebarLayout(plugin);
                        saveMobileLayout(plugin);
                    }}
                >
                    <svg
                        width="30"
                        height="30"
                        viewBox="0 0 100 100"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <rect x="5" y="5" width="40" height="40" fill="black" />
                        <rect
                            x="55"
                            y="5"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="5"
                            y="55"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="55"
                            y="55"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                    </svg>
                </button>

                <!-- 1x2 -->
                <button
                    type="button"
                    class="size-option"
                    on:click={() => {
                        onSetSize(12);
                        saveLayout(plugin);
                        saveSidebarLayout(plugin);
                        saveMobileLayout(plugin);
                    }}
                >
                    <svg
                        width="30"
                        height="30"
                        viewBox="0 0 100 100"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <rect x="5" y="5" width="40" height="40" fill="black" />
                        <rect
                            x="55"
                            y="5"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="5"
                            y="55"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="55"
                            y="55"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                    </svg>
                </button>

                <!-- 2x1 -->
                <button
                    type="button"
                    class="size-option"
                    on:click={() => {
                        onSetSize(21);
                        saveLayout(plugin);
                        saveSidebarLayout(plugin);
                        saveMobileLayout(plugin);
                    }}
                >
                    <svg
                        width="30"
                        height="30"
                        viewBox="0 0 100 100"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <rect x="5" y="5" width="40" height="40" fill="black" />
                        <rect
                            x="55"
                            y="5"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="5"
                            y="55"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="55"
                            y="55"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                    </svg>
                </button>

                <!-- 2x2 -->
                <button
                    type="button"
                    class="size-option"
                    on:click={() => {
                        onSetSize(22);
                        saveLayout(plugin);
                        saveSidebarLayout(plugin);
                        saveMobileLayout(plugin);
                    }}
                >
                    <svg
                        width="30"
                        height="30"
                        viewBox="0 0 100 100"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <rect x="5" y="5" width="40" height="40" fill="black" />
                        <rect
                            x="55"
                            y="5"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="5"
                            y="55"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="55"
                            y="55"
                            width="40"
                            height="40"
                            fill="black"
                        />
                    </svg>
                </button>
            </div>

            <div class="size-options-row-two">
                <!-- 1x3 -->
                <button
                    type="button"
                    class="size-option"
                    on:click={() => {
                        onSetSize(13);
                        saveLayout(plugin);
                        saveSidebarLayout(plugin);
                        saveMobileLayout(plugin);
                    }}
                >
                    <svg
                        width="30"
                        height="30"
                        viewBox="0 0 100 100"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <!-- 第一行 - 黑色 -->
                        <rect x="5" y="5" width="28" height="28" fill="black" />
                        <rect
                            x="38"
                            y="5"
                            width="28"
                            height="28"
                            fill="black"
                        />
                        <rect
                            x="71"
                            y="5"
                            width="28"
                            height="28"
                            fill="black"
                        />

                        <!-- 第二行 - 灰色 -->
                        <rect
                            x="5"
                            y="38"
                            width="28"
                            height="28"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="38"
                            y="38"
                            width="28"
                            height="28"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="71"
                            y="38"
                            width="28"
                            height="28"
                            fill="#CCCCCC"
                        />

                        <!-- 第三行 - 灰色 -->
                        <rect
                            x="5"
                            y="71"
                            width="28"
                            height="28"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="38"
                            y="71"
                            width="28"
                            height="28"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="71"
                            y="71"
                            width="28"
                            height="28"
                            fill="#CCCCCC"
                        />
                    </svg>
                </button>

                <!-- 3x1 -->
                <button
                    type="button"
                    class="size-option"
                    on:click={() => {
                        onSetSize(31);
                        saveLayout(plugin);
                        saveSidebarLayout(plugin);
                        saveMobileLayout(plugin);
                    }}
                >
                    <svg
                        width="30"
                        height="30"
                        viewBox="0 0 100 100"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <!-- 第一列 - 黑色 -->
                        <rect x="5" y="5" width="28" height="28" fill="black" />
                        <rect
                            x="5"
                            y="38"
                            width="28"
                            height="28"
                            fill="black"
                        />
                        <rect
                            x="5"
                            y="71"
                            width="28"
                            height="28"
                            fill="black"
                        />

                        <!-- 第二列 - 灰色 -->
                        <rect
                            x="38"
                            y="5"
                            width="28"
                            height="28"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="38"
                            y="38"
                            width="28"
                            height="28"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="38"
                            y="71"
                            width="28"
                            height="28"
                            fill="#CCCCCC"
                        />

                        <!-- 第三列 - 灰色 -->
                        <rect
                            x="71"
                            y="5"
                            width="28"
                            height="28"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="71"
                            y="38"
                            width="28"
                            height="28"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="71"
                            y="71"
                            width="28"
                            height="28"
                            fill="#CCCCCC"
                        />
                    </svg>
                </button>

                <!-- 2x3 -->
                <button
                    type="button"
                    class="size-option"
                    on:click={() => {
                        onSetSize(23);
                        saveLayout(plugin);
                        saveSidebarLayout(plugin);
                        saveMobileLayout(plugin);
                    }}
                >
                    <svg
                        width="30"
                        height="30"
                        viewBox="0 0 100 100"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <!-- 第一行 - 黑色 -->
                        <rect x="5" y="5" width="28" height="28" fill="black" />
                        <rect
                            x="38"
                            y="5"
                            width="28"
                            height="28"
                            fill="black"
                        />
                        <rect
                            x="71"
                            y="5"
                            width="28"
                            height="28"
                            fill="black"
                        />

                        <!-- 第二行 - 黑色 -->
                        <rect
                            x="5"
                            y="38"
                            width="28"
                            height="28"
                            fill="black"
                        />
                        <rect
                            x="38"
                            y="38"
                            width="28"
                            height="28"
                            fill="black"
                        />
                        <rect
                            x="71"
                            y="38"
                            width="28"
                            height="28"
                            fill="black"
                        />

                        <!-- 第三行 - 灰色 -->
                        <rect
                            x="5"
                            y="71"
                            width="28"
                            height="28"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="38"
                            y="71"
                            width="28"
                            height="28"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="71"
                            y="71"
                            width="28"
                            height="28"
                            fill="#CCCCCC"
                        />
                    </svg>
                </button>

                <!-- 3x2 -->
                <button
                    type="button"
                    class="size-option"
                    on:click={() => {
                        onSetSize(32);
                        saveLayout(plugin);
                        saveSidebarLayout(plugin);
                        saveMobileLayout(plugin);
                    }}
                >
                    <svg
                        width="30"
                        height="30"
                        viewBox="0 0 100 100"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <!-- 第一列 - 黑色 -->
                        <rect x="5" y="5" width="28" height="28" fill="black" />
                        <rect
                            x="5"
                            y="38"
                            width="28"
                            height="28"
                            fill="black"
                        />
                        <rect
                            x="5"
                            y="71"
                            width="28"
                            height="28"
                            fill="black"
                        />

                        <!-- 第二列 - 黑色 -->
                        <rect
                            x="38"
                            y="5"
                            width="28"
                            height="28"
                            fill="black"
                        />
                        <rect
                            x="38"
                            y="38"
                            width="28"
                            height="28"
                            fill="black"
                        />
                        <rect
                            x="38"
                            y="71"
                            width="28"
                            height="28"
                            fill="black"
                        />

                        <!-- 第三列 - 灰色 -->
                        <rect
                            x="71"
                            y="5"
                            width="28"
                            height="28"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="71"
                            y="38"
                            width="28"
                            height="28"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="71"
                            y="71"
                            width="28"
                            height="28"
                            fill="#CCCCCC"
                        />
                    </svg>
                </button>

                <!-- 3x3 -->
                <button
                    type="button"
                    class="size-option"
                    on:click={() => {
                        onSetSize(33);
                        saveLayout(plugin);
                        saveSidebarLayout(plugin);
                        saveMobileLayout(plugin);
                    }}
                >
                    <svg
                        width="30"
                        height="30"
                        viewBox="0 0 100 100"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <!-- 第一行 -->
                        <rect x="5" y="5" width="28" height="28" fill="black" />
                        <rect
                            x="38"
                            y="5"
                            width="28"
                            height="28"
                            fill="black"
                        />
                        <rect
                            x="71"
                            y="5"
                            width="28"
                            height="28"
                            fill="black"
                        />

                        <!-- 第二行 -->
                        <rect
                            x="5"
                            y="38"
                            width="28"
                            height="28"
                            fill="black"
                        />
                        <rect
                            x="38"
                            y="38"
                            width="28"
                            height="28"
                            fill="black"
                        />
                        <rect
                            x="71"
                            y="38"
                            width="28"
                            height="28"
                            fill="black"
                        />

                        <!-- 第三行 -->
                        <rect
                            x="5"
                            y="71"
                            width="28"
                            height="28"
                            fill="black"
                        />
                        <rect
                            x="38"
                            y="71"
                            width="28"
                            height="28"
                            fill="black"
                        />
                        <rect
                            x="71"
                            y="71"
                            width="28"
                            height="28"
                            fill="black"
                        />
                    </svg>
                </button>
            </div>

            <div class="size-options-row-three">
                <!-- 1x4 -->
                <button
                    type="button"
                    class="size-option"
                    on:click={() => {
                        onSetSize(14);
                        saveLayout(plugin);
                        saveSidebarLayout(plugin);
                        saveMobileLayout(plugin);
                    }}
                >
                    <svg
                        width="30"
                        height="30"
                        viewBox="0 0 200 200"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <!-- 第一行 - 黑色 -->
                        <rect x="5" y="5" width="40" height="40" fill="black" />
                        <rect
                            x="55"
                            y="5"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="105"
                            y="5"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="155"
                            y="5"
                            width="40"
                            height="40"
                            fill="black"
                        />

                        <!-- 其他行 - 灰色 -->
                        <rect
                            x="5"
                            y="55"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="55"
                            y="55"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="105"
                            y="55"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="155"
                            y="55"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />

                        <rect
                            x="5"
                            y="105"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="55"
                            y="105"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="105"
                            y="105"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="155"
                            y="105"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />

                        <rect
                            x="5"
                            y="155"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="55"
                            y="155"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="105"
                            y="155"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="155"
                            y="155"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                    </svg>
                </button>

                <!-- 2x4 -->
                <button
                    type="button"
                    class="size-option"
                    on:click={() => {
                        onSetSize(24);
                        saveLayout(plugin);
                        saveSidebarLayout(plugin);
                        saveMobileLayout(plugin);
                    }}
                >
                    <svg
                        width="30"
                        height="30"
                        viewBox="0 0 200 200"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <!-- 第一行 - 黑色 -->
                        <rect x="5" y="5" width="40" height="40" fill="black" />
                        <rect
                            x="55"
                            y="5"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="105"
                            y="5"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="155"
                            y="5"
                            width="40"
                            height="40"
                            fill="black"
                        />

                        <!-- 第二行 - 黑色 -->
                        <rect
                            x="5"
                            y="55"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="55"
                            y="55"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="105"
                            y="55"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="155"
                            y="55"
                            width="40"
                            height="40"
                            fill="black"
                        />

                        <!-- 第三行 - 灰色 -->
                        <rect
                            x="5"
                            y="105"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="55"
                            y="105"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="105"
                            y="105"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="155"
                            y="105"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />

                        <!-- 第四行 - 灰色 -->
                        <rect
                            x="5"
                            y="155"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="55"
                            y="155"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="105"
                            y="155"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="155"
                            y="155"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                    </svg>
                </button>

                <!-- 4x1 -->
                <button
                    type="button"
                    class="size-option"
                    on:click={() => {
                        onSetSize(41);
                        saveLayout(plugin);
                        saveSidebarLayout(plugin);
                        saveMobileLayout(plugin);
                    }}
                >
                    <svg
                        width="30"
                        height="30"
                        viewBox="0 0 200 200"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <!-- 第一列 - 黑色 -->
                        <rect x="5" y="5" width="40" height="40" fill="black" />
                        <rect
                            x="5"
                            y="55"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="5"
                            y="105"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="5"
                            y="155"
                            width="40"
                            height="40"
                            fill="black"
                        />

                        <!-- 其他列 - 灰色 -->
                        <rect
                            x="55"
                            y="5"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="105"
                            y="5"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="155"
                            y="5"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />

                        <rect
                            x="55"
                            y="55"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="105"
                            y="55"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="155"
                            y="55"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />

                        <rect
                            x="55"
                            y="105"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="105"
                            y="105"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="155"
                            y="105"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />

                        <rect
                            x="55"
                            y="155"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="105"
                            y="155"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="155"
                            y="155"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                    </svg>
                </button>

                <!-- 4x2 -->
                <button
                    type="button"
                    class="size-option"
                    on:click={() => {
                        onSetSize(42);
                        saveLayout(plugin);
                        saveSidebarLayout(plugin);
                        saveMobileLayout(plugin);
                    }}
                >
                    <svg
                        width="30"
                        height="30"
                        viewBox="0 0 200 200"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <!-- 第一列 - 黑色 -->
                        <rect x="5" y="5" width="40" height="40" fill="black" />
                        <rect
                            x="5"
                            y="55"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="5"
                            y="105"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="5"
                            y="155"
                            width="40"
                            height="40"
                            fill="black"
                        />

                        <!-- 第二列 - 黑色 -->
                        <rect
                            x="55"
                            y="5"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="55"
                            y="55"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="55"
                            y="105"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="55"
                            y="155"
                            width="40"
                            height="40"
                            fill="black"
                        />

                        <!-- 第三列 - 灰色 -->
                        <rect
                            x="105"
                            y="5"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="105"
                            y="55"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="105"
                            y="105"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="105"
                            y="155"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />

                        <!-- 第四列 - 灰色 -->
                        <rect
                            x="155"
                            y="5"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="155"
                            y="55"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="155"
                            y="105"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                        <rect
                            x="155"
                            y="155"
                            width="40"
                            height="40"
                            fill="#CCCCCC"
                        />
                    </svg>
                </button>

                <!-- 4x4 -->
                <button
                    type="button"
                    class="size-option"
                    on:click={() => {
                        onSetSize(44);
                        saveLayout(plugin);
                        saveSidebarLayout(plugin);
                        saveMobileLayout(plugin);
                    }}
                >
                    <svg
                        width="30"
                        height="30"
                        viewBox="0 0 200 200"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <!-- 第一行 -->
                        <rect x="5" y="5" width="40" height="40" fill="black" />
                        <rect
                            x="55"
                            y="5"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="105"
                            y="5"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="155"
                            y="5"
                            width="40"
                            height="40"
                            fill="black"
                        />

                        <!-- 第二行 -->
                        <rect
                            x="5"
                            y="55"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="55"
                            y="55"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="105"
                            y="55"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="155"
                            y="55"
                            width="40"
                            height="40"
                            fill="black"
                        />

                        <!-- 第三行 -->
                        <rect
                            x="5"
                            y="105"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="55"
                            y="105"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="105"
                            y="105"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="155"
                            y="105"
                            width="40"
                            height="40"
                            fill="black"
                        />

                        <!-- 第四行 -->
                        <rect
                            x="5"
                            y="155"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="55"
                            y="155"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="105"
                            y="155"
                            width="40"
                            height="40"
                            fill="black"
                        />
                        <rect
                            x="155"
                            y="155"
                            width="40"
                            height="40"
                            fill="black"
                        />
                    </svg>
                </button>
            </div>
        </div>
    </div>

    <div class="setting-item">
        <div class="style-controls-row">
            <h4 style="margin-bottom: 0.5rem;">自定义样式</h4>

            <!-- 第一行：背景颜色 + 背景透明度 -->
            <div class="style-subgroup" style="margin-bottom: 0.5rem; ">
                <!-- 颜色选择器 -->
                <div class="color-picker-group">
                    <label for="bg-color">背景颜色:</label>
                    <input
                        id="bg-color"
                        type="color"
                        bind:value={backgroundColor}
                        on:change={() => {
                            updateBackground();
                            saveLayout(plugin);
                            saveSidebarLayout(plugin);
                            saveMobileLayout(plugin);
                        }}
                    />
                </div>

                <!-- 透明度滑块 -->
                <div class="opacity-slider-group">
                    <label for="bg-opacity">背景透明度:</label>
                    <input
                        id="bg-opacity"
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        bind:value={backgroundOpacity}
                        on:input={() => {
                            updateBackground();
                            saveLayout(plugin);
                            saveSidebarLayout(plugin);
                            saveMobileLayout(plugin);
                        }}
                    />
                    <span>{Math.round(backgroundOpacity * 100)}%</span>
                </div>
            </div>

            <!-- 第二行：边框颜色 + 边框粗细 -->
            <div class="style-subgroup">
                <!-- 边框颜色选择器 -->
                <div class="border-color-picker-group">
                    <label for="border-color">边框颜色:</label>
                    <input
                        id="border-color"
                        type="color"
                        bind:value={borderColor}
                        on:change={() => {
                            updateBorder();
                            saveLayout(plugin);
                            saveSidebarLayout(plugin);
                            saveMobileLayout(plugin);
                        }}
                    />
                </div>

                <!-- 边框粗细滑块 -->
                <div class="border-width-slider-group">
                    <label for="border-width">边框粗细:</label>
                    <input
                        id="border-width"
                        type="range"
                        min="0"
                        max="10"
                        step="1"
                        bind:value={borderWidth}
                        on:input={() => {
                            updateBorder();
                            saveLayout(plugin);
                            saveSidebarLayout(plugin);
                            saveMobileLayout(plugin);
                        }}
                    />
                    <span>{borderWidth}px</span>
                </div>
            </div>
        </div>
    </div>

    <!-- 操作按钮：删除和取消在一行 -->
    <div class="action-buttons-row">
        <button class="delete-button" on:click={onDelete}>🗑 删除组件</button>
        <button class="cancel-button" on:click={onClose}>❌ 取消</button>
    </div>
</div>

<style>
    .settings-group {
        display: inline-flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1rem;
        border-bottom: 1px solid var(--b3-border-color);
    }

    .style-controls-row,
    .size-options-row {
        display: flex;
        gap: 0.5rem;
        flex-direction: column;
        align-items: center;
    }

    .size-options-row-one,
    .size-options-row-two,
    .size-options-row-three {
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
        align-items: center;
    }

    .size-option {
        background: var(--b3-theme-background);
        border-radius: 10px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .size-option:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
        border-color: var(--b3-theme-primary);
    }

    .color-picker-group label,
    .opacity-slider-group label,
    .border-color-picker-group label,
    .border-width-slider-group label {
        font-size: 13px;
        margin-bottom: 4px;
        font-weight: 500;
    }

    input[type="color"] {
        width: 32px;
        height: 32px;
        border-radius: 6px;
        padding: 3px;
        border: 2px solid var(--b3-border-color);
    }

    input[type="range"] {
        accent-color: var(--b3-theme-primary);
        height: 4px;
    }

    .opacity-slider-group span,
    .border-width-slider-group span {
        min-width: 40px;
        background: var(--b3-theme-background);
        padding: 2px 8px;
        border-radius: 4px;
        margin-left: 12px;
    }

    .action-buttons-row {
        display: flex;
        justify-content: space-between;
        margin-top: 1rem;
    }

    .delete-button {
        background: linear-gradient(45deg, #ef4444 0%, #dc2626 100%);
        box-shadow: 0 2px 4px rgba(220, 38, 38, 0.2);
        color: white;
        border: none;
        padding: 0.4rem 0.8rem;
        border-radius: 6px;
        cursor: pointer;
    }

    .cancel-button {
        background: linear-gradient(45deg, #f1f5f9 0%, #e2e8f0 100%);
        color: #475569;
        border: none;
        padding: 0.4rem 0.8rem;
        border-radius: 6px;
        cursor: pointer;
    }

    .style-controls-row > .style-subgroup {
        display: flex;
        gap: 1rem;
        border: #000000 1px dashed;
        width: 100%;
        box-sizing: border-box;
        padding-left: 1rem;
        align-items: center;
    }
</style>
