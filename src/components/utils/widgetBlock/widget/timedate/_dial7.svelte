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

    let dial7ShowSecond: boolean = $state(true);
    let advancedEnabled: boolean = $state(false);

    let BGImgPath: string = $state("");

    onMount(() => {
        advancedEnabled = plugin.ADVANCED;
        if (!advancedEnabled) {
            return;
        }
        BGImgPath = `/plugins/siyuan-homepage/asset/clockImg/dial7.png`;

        try {
            const config = JSON.parse(contentTypeJson);
            if (config.type === "timedate" && config.data) {
                dial7ShowSecond = config.data?.dial7ShowSecond ?? true;
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

        <!-- 古风时针 -->
        <g transform="rotate({30 * hours + minutes / 2})" class="hour-hand">
            <line y1="0" y2="-20" stroke-width="3" />
            <circle cx="0" cy="-20" r="2" fill="#8B4513" />
            <circle cx="0" cy="0" r="3" fill="#8B4513" />
        </g>

        <!-- 古风分针 -->
        <g transform="rotate({6 * minutes + seconds / 10})" class="minute-hand">
            <line y1="0" y2="-30" stroke-width="2" />
            <circle cx="0" cy="-30" r="1.5" fill="#A0522D" />
            <circle cx="0" cy="0" r="2.5" fill="#A0522D" />
        </g>

        {#if dial7ShowSecond}
            <!-- 古风秒针 -->
            <g transform="rotate({6 * seconds})" class="second-hand">
                <line y1="5" y2="-35" stroke-width="1" />
                <circle cx="0" cy="-35" r="1" fill="#CD5C5C" />
                <circle cx="0" cy="0" r="2" fill="#CD5C5C" />
                <line y1="5" y2="10" stroke-width="2" />
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
        stroke: #8b4513; /* 古铜棕色 */
        stroke-linecap: round;
    }

    .minute-hand line {
        stroke: #a0522d; /* 赭石色 */
        stroke-linecap: round;
    }

    .second-hand line {
        stroke: #cd5c5c; /* 古红色 */
        stroke-linecap: round;
    }
</style>
