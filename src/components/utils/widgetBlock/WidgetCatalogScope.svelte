<script lang="ts">
    import type { DeviceViewSurface } from "@/homepage/deviceView/deviceViewTypes";

    let { surface }: { surface: DeviceViewSurface } = $props();

    const labels: Record<DeviceViewSurface, string> = {
        "desktop-homepage": "本机桌面主页",
        "desktop-sidebar": "本机侧边栏",
        "mobile-homepage": "移动端共享主页",
    };
</script>

<span class="widget-catalog-scope">当前作用域：{labels[surface]}</span>

<style>
    .widget-catalog-scope {
        display: inline-flex;
        width: max-content;
        max-width: 100%;
        padding: 3px 8px;
        box-sizing: border-box;
        border: 1px solid var(--b3-border-color, ButtonBorder);
        border-radius: 8px;
        color: var(--b3-theme-on-surface, CanvasText);
        background: var(--b3-theme-surface, Canvas);
        font-size: 12px;
        line-height: 1.4;
    }
</style>
