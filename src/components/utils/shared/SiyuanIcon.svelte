<script lang="ts">
    import { resolveSiyuanIconId, type SiyuanIconName } from "@/components/tools/siyuanIcon";

    interface Props {
        name: SiyuanIconName;
        size?: number;
        title?: string;
        className?: string;
    }

    let { name, size = 16, title = "", className = "" }: Props = $props();
    const iconId = $derived(resolveSiyuanIconId(name));
</script>

<svg
    class={`siyuan-icon ${className}`.trim()}
    style={`width:${size}px;height:${size}px;`}
    aria-hidden={title ? undefined : "true"}
    aria-label={title || undefined}
>
    <use href={`#${iconId}`} xlink:href={`#${iconId}`}></use>
</svg>

<style>
    .siyuan-icon {
        display: inline-block;
        flex-shrink: 0;
        fill: currentColor;
        color: currentColor;
        vertical-align: -0.15em;
        pointer-events: none;
    }
</style>
