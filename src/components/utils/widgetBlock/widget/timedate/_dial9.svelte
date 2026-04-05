<script lang="ts">
    import { onMount } from "svelte";

    interface Props {
        contentTypeJson?: string;
        plugin: any;
    }

    let { contentTypeJson = "{}", plugin }: Props = $props();

    let time = $state(new Date());

    let hours = $derived(time.getHours());
    let minutes = $derived(time.getMinutes());
    let seconds = $derived(time.getSeconds());

    let dial9ShowSecond: boolean = $state(true);
    let advancedEnabled: boolean = $state(false);

    let BGImgPath: string = $state("");

    onMount(() => {
        advancedEnabled = plugin.ADVANCED;
        if (!advancedEnabled) {
            return;
        }
        BGImgPath = `/plugins/siyuan-homepage/asset/clockImg/dial9.png`;

        try {
            const config = JSON.parse(contentTypeJson);
            if (config.type === "timedate" && config.data) {
                dial9ShowSecond = config.data?.dial9ShowSecond ?? true;
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

        <!-- 卡通时针 - 彩虹糖果风 -->
        <g transform="rotate({30 * hours + minutes / 2})" class="hour-hand">
            <line y1="0" y2="-20" stroke-width="4" />
            <circle cx="0" cy="0" r="4" fill="#FF6B6B" />
            <circle cx="0" cy="-20" r="3" fill="#FF8E8E" />
        </g>

        <!-- 卡通分针 - 清新薄荷风 -->
        <g transform="rotate({6 * minutes + seconds / 10})" class="minute-hand">
            <line y1="0" y2="-30" stroke-width="3" />
            <circle cx="0" cy="0" r="3" fill="#4ECDC4" />
            <circle cx="0" cy="-30" r="2.5" fill="#45B7B8" />
        </g>

        {#if dial9ShowSecond}
            <!-- 卡通秒针 - 阳光柠檬风 -->
            <g transform="rotate({6 * seconds})" class="second-hand">
                <line y1="5" y2="-35" stroke-width="2.5" />
                <circle cx="0" cy="0" r="2.5" fill="#FFE66D" />
                <circle cx="0" cy="-35" r="2" fill="#FFD93D" />
                <line y1="5" y2="12" stroke-width="3" />
            </g>
        {/if}
    </svg>
{:else}
    <div class="content-not-advanced">
        <h2>👑高级会员专属功能👑</h2>
        <h3>请在"主页设置"→"会员服务"中开通高级会员后使用</h3>
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
        stroke: #ff6b6b; /* 糖果红色，活泼可爱 */
        stroke-linecap: round;
        filter: drop-shadow(0 0 3px rgba(255, 107, 107, 0.4));
    }

    .minute-hand line {
        stroke: #4ecdc4; /* 薄荷绿色，清新自然 */
        stroke-linecap: round;
        filter: drop-shadow(0 0 3px rgba(78, 205, 196, 0.4));
    }

    .second-hand line {
        stroke: #ffe66d; /* 柠檬黄色，阳光活力 */
        stroke-linecap: round;
        filter: drop-shadow(0 0 3px rgba(255, 230, 109, 0.4));
    }
</style>
