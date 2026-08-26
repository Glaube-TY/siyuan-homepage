<script lang="ts">
    import SiyuanIcon from "./SiyuanIcon.svelte";

    interface Props {
        size?: number;
        className?: string;
    }

    let { size = 12, className = "" }: Props = $props();
</script>

<span class={`premium-mark ${className}`.trim()} aria-label="高级会员专属">
    <SiyuanIcon name="vip" {size} />
</span>

<style>
    .premium-mark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        color: currentColor;
        line-height: 1;
    }
</style>
