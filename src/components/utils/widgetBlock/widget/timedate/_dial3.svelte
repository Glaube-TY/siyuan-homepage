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

    let dial3ShowSecond: boolean = $state(true);
    let advancedEnabled: boolean = $state(false);

    let BGImgPath: string = $state("");

    onMount(() => {
        advancedEnabled = plugin.ADVANCED;
        if (!advancedEnabled) {
            return;
        }
        BGImgPath = `/plugins/siyuan-homepage/asset/clockImg/dial3.png`;

        try {
            const config = JSON.parse(contentTypeJson);
            if (config.type === "timedate" && config.data) {
                dial3ShowSecond = config.data?.dial3ShowSecond ?? true;
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

        <!-- hour hand -->
        <line
            class="hour"
            y1="2"
            y2="-20"
            transform="rotate({30 * hours + minutes / 2})"
        />

        <!-- minute hand -->
        <line
            class="minute"
            y1="4"
            y2="-30"
            transform="rotate({6 * minutes + seconds / 10})"
        />

        {#if dial3ShowSecond}
            <!-- second hand -->
            <g transform="rotate({6 * seconds})">
                <line class="second" y1="10" y2="-38" />
                <line class="second-counterweight" y1="10" y2="2" />
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

    .hour {
        stroke: #333;
    }

    .minute {
        stroke: #666;
    }

    .second,
    .second-counterweight {
        stroke: rgb(180, 0, 0);
    }

    .second-counterweight {
        stroke-width: 3;
    }
</style>
