<script lang="ts">
    import { onMount } from "svelte";

    export let contentTypeJson: string = "{}";
    export let plugin: any;

    const parsedContent = JSON.parse(contentTypeJson);
    const CMKnockSound = parsedContent.data?.CMKnockSound || "普通";

    let advancedEnabled: boolean = false;
    let MOKImgPath: string = "";
    let isKnocking: boolean = false;
    let knockSoundPath: string = "";
    let showMeritText: boolean = false;
    let meritTextY: number = 25;

    onMount(async () => {
        advancedEnabled = plugin.ADVANCED;

        MOKImgPath = `/plugins/siyuan-homepage/asset/Icon/木鱼.svg`;

        knockSoundPath = `/plugins/siyuan-homepage/asset/music/CYBMOK/${CMKnockSound}.mp3`;
    });

    async function handleKnock() {
        // 播放音效
        playKnockSound();

        // 显示功德文字
        showMeritText = true;
        meritTextY = 25;

        // 文字漂浮动画
        const floatAnimation = setInterval(() => {
            meritTextY -= 1;
            if (meritTextY <= 10) {
                clearInterval(floatAnimation);
                showMeritText = false;
            }
        }, 50);

        // 记录敲击次数 - 立即执行，不等待
        recordKnock();

        // 敲击动画
        isKnocking = true;
        setTimeout(() => {
            isKnocking = false;
        }, 200);
    }

    function playKnockSound() {
        try {
            // 创建音频对象
            const audio = new Audio(knockSoundPath);
            audio.volume = 0.7; // 设置音量
            audio.play().catch((error) => {
                console.log("音效播放失败:", error);
            });
        } catch (error) {
            console.log("音效创建失败:", error);
        }
    }

    async function recordKnock() {
        try {
            const today = new Date()
                .toISOString()
                .slice(0, 10)
                .replace(/-/g, ""); // 获取YYYYMMDD格式日期

            // 初始化数据对象
            let knockData = {};

            // 尝试读取现有数据
            try {
                const existingData = await plugin.loadData("CYBMOKData.json");

                if (existingData) {
                    knockData = existingData;
                } else {
                }
            } catch (e) {
                knockData = {};
            }

            // 更新敲击次数
            const currentCount = knockData[today] || 0;
            knockData[today] = currentCount + 1;

            // 保存数据
            await plugin.saveData("CYBMOKData.json", JSON.stringify(knockData));
        } catch (error) {
            console.error("记录敲击次数失败:", error);
        }
    }
</script>

{#if advancedEnabled}
    <svg viewBox="0 0 100 100">
        <!-- 背景渐变定义 -->
        <defs>
            <linearGradient id="topGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#4A4A4A" />
                <stop offset="100%" stop-color="#535353" />
            </linearGradient>
            <linearGradient
                id="bottomGradient"
                x1="0%"
                y1="0%"
                x2="0%"
                y2="100%"
            >
                <stop offset="0%" stop-color="#2A2A2A" />
                <stop offset="100%" stop-color="#1A1A1A" />
            </linearGradient>
        </defs>

        <!-- 渐变背景 -->
        <rect width="100" height="50" fill="url(#topGradient)" />
        <rect
            x="0"
            y="50"
            width="100"
            height="50"
            fill="url(#bottomGradient)"
        />

        <!-- 渐变定义 -->
        <defs>
            <radialGradient id="haloGradient" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#FFD700" stop-opacity="0.8" />
                <stop offset="50%" stop-color="#FFA500" stop-opacity="0.4" />
                <stop offset="100%" stop-color="#FF8C00" stop-opacity="0" />
            </radialGradient>
        </defs>

        <!-- 渐变半圆环背景 -->
        <path
            d="M 25 50 A 25 25 0 0 1 75 50"
            fill="none"
            stroke="url(#haloGradient)"
            stroke-width="8"
            opacity={isKnocking ? "1" : "0.6"}
            style="transition: opacity 0.2s ease-in-out;"
        />

        <!-- 木鱼 -->
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <image
            href={MOKImgPath}
            x={isKnocking ? "25" : "20"}
            y={isKnocking ? "27.5" : "25"}
            width={isKnocking ? "45" : "50"}
            height={isKnocking ? "45" : "50"}
            on:click={handleKnock}
            style="cursor: pointer; transition: all 0.2s ease-in-out;"
        />

        <!-- 功德+1漂浮文字 -->
        {#if showMeritText}
            <text
                x="50"
                y={meritTextY}
                text-anchor="middle"
                font-size="8"
                font-family="Courier New, monospace"
                fill="#e6e6e6"
                font-weight="bold"
                opacity={meritTextY > 15 ? "1" : "0"}
                style="transition: opacity 0.1s ease-in-out;"
            >
                功德+1
            </text>
        {/if}

        <!-- 功德数 -->
        <text
            x="50"
            y="85"
            text-anchor="middle"
            font-size="12"
            font-family="Courier New, monospace"
            fill="#e6e6e6"
            font-weight="bold"
        >
            功德无量
        </text>

        <!-- 木鱼棒 -->
        <g transform="translate(75, 35)">
            <rect
                x="-2"
                y="-15"
                width="4"
                height="30"
                fill="#e6e6e6"
                rx="2"
                transform={isKnocking ? "rotate(-70)" : "rotate(5)"}
                style="transition: transform 0.2s ease-in-out;"
            />
            <circle
                cx="0"
                cy="-15"
                r="3"
                fill="#e6e6e6"
                transform={isKnocking ? "rotate(-70)" : "rotate(5)"}
                style="transition: transform 0.2s ease-in-out;"
            />
        </g>
    </svg>
{:else}
    <div class="content-not-advanced">
        <h2>👑高级会员专属功能👑</h2>
        <h3>请在"主页设置"→"会员服务"中开通高级会员后使用</h3>
    </div>
{/if}

<style lang="scss">
    .content-not-advanced {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        text-align: center;
        color: #666;
    }
</style>
