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

    let dial8ShowSecond: boolean = $state(true);
    let advancedEnabled: boolean = $state(false);

    let BGImgPath: string = $state("");

    onMount(() => {
        advancedEnabled = plugin.ADVANCED;
        if (!advancedEnabled) {
            return;
        }
        BGImgPath = `/plugins/siyuan-homepage/asset/clockImg/dial8.png`;

        try {
            const config = JSON.parse(contentTypeJson);
            if (config.type === "timedate" && config.data) {
                dial8ShowSecond = config.data?.dial8ShowSecond ?? true;
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

        <!-- 水墨风时针 - 简约雅致 -->
        <g transform="rotate({30 * hours + minutes / 2})" class="hour-hand">
            <line y1="0" y2="-20" stroke-width="4" />
            <circle cx="0" cy="0" r="4" fill="#2C2C2C" opacity="0.9" />
        </g>

        <!-- 水墨风分针 - 流畅自然 -->
        <g transform="rotate({6 * minutes + seconds / 10})" class="minute-hand">
            <line y1="0" y2="-30" stroke-width="3" />
            <circle cx="0" cy="0" r="3" fill="#404040" opacity="0.8" />
        </g>

        {#if dial8ShowSecond}
            <!-- 水墨风秒针 - 轻盈灵动 -->
            <g transform="rotate({6 * seconds})" class="second-hand">
                <line y1="5" y2="-35" stroke-width="2" />
                <circle cx="0" cy="0" r="2.5" fill="#606060" opacity="0.7" />
                <line y1="5" y2="12" stroke-width="2" />
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
        stroke: #2c2c2c; /* 深墨色 */
        stroke-linecap: round;
        filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.3)); /* 水墨晕染效果 */
    }

    .minute-hand line {
        stroke: #404040; /* 中墨色 */
        stroke-linecap: round;
        filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.2));
    }

    .second-hand line {
        stroke: #606060; /* 淡墨色 */
        stroke-linecap: round;
        filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.1));
    }
</style>
