<script lang="ts">
    import { resolveSiyuanIconId, type SiyuanIconName } from "@/components/tools/siyuanIcon";

    export type WorkspaceIconName = SiyuanIconName;

    interface Props {
        name: WorkspaceIconName | string;
        size?: number;
        title?: string;
        className?: string;
    }

    let { name, size = 16, title = "", className = "" }: Props = $props();
    const iconId = $derived(resolveSiyuanIconId(name));
</script>

<svg
    class={`workspace-icon ${className}`.trim()}
    style={`width:${size}px;height:${size}px;`}
    aria-hidden={title ? undefined : "true"}
    aria-label={title || undefined}
>
    <use href={`#${iconId}`} xlink:href={`#${iconId}`}></use>
</svg>

<style>
    .workspace-icon {
        display: inline-block;
        flex-shrink: 0;
        fill: currentColor;
        color: currentColor;
        vertical-align: -0.15em;
        pointer-events: none;
    }
</style>
