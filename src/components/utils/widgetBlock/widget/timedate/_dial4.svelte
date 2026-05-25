<script lang="ts">
    import { onMount } from "svelte";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";

    interface Props {
        contentTypeJson?: string;
        plugin: any;
    }

    let { contentTypeJson = "{}", plugin }: Props = $props();

    let time = $state(new Date());

    let hours = $derived(time.getHours());
    let minutes = $derived(time.getMinutes());
    let seconds = $derived(time.getSeconds());

    let dial4ShowSecond: boolean = $state(true);
    let advancedEnabled: boolean = $state(false);

    let BGImgPath: string = $state("");

    onMount(() => {
        advancedEnabled = plugin.ADVANCED;
        if (!advancedEnabled) {
            return;
        }
        BGImgPath = `/plugins/siyuan-homepage/asset/clockImg/dial4.png`;

        try {
            const config = JSON.parse(contentTypeJson);
            if (config.type === "timedate" && config.data) {
                dial4ShowSecond = config.data?.dial4ShowSecond ?? true;
            }
        } catch (e) {
            console.warn("无法解析 contentTypeJson", e);
        }

        const interval = setInterval(() => {
            time = new Date();
        }, 500);

        return () => {
            clearInterval(interval);
        };
    });
</script>

{#if advancedEnabled}
    <svg viewBox="-50 -50 100 100">
        <image href={BGImgPath} x="-50" y="-50" width="100" height="100" />

        <!-- 英伦风时针 - 经典优雅 -->
        <g transform="rotate({30 * hours + minutes / 2})" class="hour-hand">
            <line y1="0" y2="-20" stroke-width="2.5" />
            <circle cx="0" cy="0" r="2.5" fill="#2C3E50" />
            <polygon points="0,-22 -1.5,-18 1.5,-18" fill="#34495E" />
        </g>

        <!-- 英伦风分针 - 精致传统 -->
        <g transform="rotate({6 * minutes + seconds / 10})" class="minute-hand">
            <line y1="0" y2="-30" stroke-width="2" />
            <circle cx="0" cy="0" r="2" fill="#34495E" />
            <polygon points="0,-32 -1,-28 1,-28" fill="#2C3E50" />
        </g>

        {#if dial4ShowSecond}
            <!-- 英伦风秒针 - 绅士红调 -->
            <g transform="rotate({6 * seconds})" class="second-hand">
                <line y1="8" y2="-38" stroke-width="1.5" />
                <circle cx="0" cy="0" r="1.8" fill="#C0392B" />
                <circle cx="0" cy="-38" r="1.5" fill="#E74C3C" />
                <line y1="8" y2="15" stroke-width="2.5" />
            </g>
        {/if}
    </svg>
{:else}
    <div class="content-not-advanced">
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
            compact
        />
    </div>
{/if}

<style>
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

    svg {
        width: 100%;
        height: 100%;
    }

    .hour-hand line {
        stroke: #2c3e50; /* 英伦深蓝灰，绅士色调 */
        stroke-linecap: round;
        filter: drop-shadow(0 0 1px rgba(255, 255, 255, 0.2));
    }

    .minute-hand line {
        stroke: #34495e; /* 英伦中蓝灰，经典优雅 */
        stroke-linecap: round;
        filter: drop-shadow(0 0 1px rgba(255, 255, 255, 0.2));
    }

    .second-hand line {
        stroke: #e74c3c; /* 英伦绅士红，传统英式 */
        stroke-linecap: round;
        filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.1));
    }
</style>
