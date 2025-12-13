<script lang="ts">
    import { onMount } from "svelte";

    export let contentTypeJson: string = "{}";
    export let plugin: any;

    let time = new Date();

    $: hours = time.getHours();
    $: minutes = time.getMinutes();
    $: seconds = time.getSeconds();

    let dial4ShowSecond: boolean = true;
    let advancedEnabled: boolean = false;

    let BGImgPath: string = "";

    onMount(() => {
        advancedEnabled = plugin.ADVANCED;
        if (!advancedEnabled) {
            return;
        }
        BGImgPath =
            `${plugin.workplacePath}/data/plugins/siyuan-homepage/asset/clockImg/dial4.png`.replace(
                /\\/g,
                "/",
            );

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
        stroke: #2C3E50; /* 英伦深蓝灰，绅士色调 */
        stroke-linecap: round;
        filter: drop-shadow(0 0 1px rgba(255,255,255,0.2));
    }

    .minute-hand line {
        stroke: #34495E; /* 英伦中蓝灰，经典优雅 */
        stroke-linecap: round;
        filter: drop-shadow(0 0 1px rgba(255,255,255,0.2));
    }

    .second-hand line {
        stroke: #E74C3C; /* 英伦绅士红，传统英式 */
        stroke-linecap: round;
        filter: drop-shadow(0 0 1px rgba(0,0,0,0.1));
    }
</style>
