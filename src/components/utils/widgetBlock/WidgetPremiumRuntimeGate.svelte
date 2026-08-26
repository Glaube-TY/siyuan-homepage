<script lang="ts">
    import AdvancedFeatureLock from "./widget/common/AdvancedFeatureLock.svelte";

    interface Props {
        premiumTitle: string;
    }

    let { premiumTitle }: Props = $props();
</script>

<div class="widget-premium-runtime-gate" data-widget-part="root">
    <div class="widget-premium-runtime-gate__body" data-widget-part="body">
        <AdvancedFeatureLock
            title={premiumTitle}
            subtitle="会员失效后已暂停组件运行，原有配置会继续保留。"
            compact={true}
        />
    </div>
</div>

<style>
    .widget-premium-runtime-gate,
    .widget-premium-runtime-gate__body {
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        box-sizing: border-box;
    }

    .widget-premium-runtime-gate__body {
        display: flex;
        flex-direction: column;
    }
</style>
