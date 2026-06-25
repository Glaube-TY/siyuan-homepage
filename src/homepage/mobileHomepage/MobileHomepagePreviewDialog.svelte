<script lang="ts">
    import MobileHomepage from "./mobileHomepage.svelte";

    interface Props {
        plugin: any;
        close: () => void;
    }

    let { plugin, close }: Props = $props();

    const presets = [
        { id: "small", label: "小屏 16:9", width: 360, height: 640 },
        { id: "android", label: "常规安卓", width: 390, height: 844 },
        { id: "androidLarge", label: "大屏安卓", width: 412, height: 915 },
        { id: "iphone", label: "iPhone 类", width: 393, height: 852 },
        { id: "tablet", label: "平板窄屏", width: 768, height: 1024 },
        { id: "custom", label: "自定义", width: 390, height: 844 },
    ];

    let selectedPresetId = $state("android");
    let customWidth = $state(390);
    let customHeight = $state(844);
    let scale = $state(0.9);

    const selectedPreset = $derived(presets.find((preset) => preset.id === selectedPresetId) || presets[1]);
    const previewWidth = $derived(selectedPresetId === "custom" ? customWidth : selectedPreset.width);
    const previewHeight = $derived(selectedPresetId === "custom" ? customHeight : selectedPreset.height);
</script>

<div class="mobile-homepage-preview">
    <aside class="mobile-homepage-preview-controls">
        <div class="mobile-preview-control-group">
            <label for="mobile-preview-device">设备尺寸</label>
            <select id="mobile-preview-device" bind:value={selectedPresetId}>
                {#each presets as preset}
                    <option value={preset.id}>{preset.label}</option>
                {/each}
            </select>
        </div>

        {#if selectedPresetId === "custom"}
            <div class="mobile-preview-custom-size">
                <label>
                    <span>宽度</span>
                    <input type="number" min="320" max="900" bind:value={customWidth} />
                </label>
                <label>
                    <span>高度</span>
                    <input type="number" min="480" max="1200" bind:value={customHeight} />
                </label>
            </div>
        {/if}

        <div class="mobile-preview-control-group">
            <label for="mobile-preview-scale">缩放</label>
            <select id="mobile-preview-scale" bind:value={scale}>
                <option value={0.75}>75%</option>
                <option value={0.9}>90%</option>
                <option value={1}>100%</option>
            </select>
        </div>

        <div class="mobile-preview-size-readout">{previewWidth} × {previewHeight}</div>
    </aside>

    <main class="mobile-homepage-preview-stage">
        <div
            class="mobile-homepage-device-frame"
            style={`width: ${previewWidth}px; height: ${previewHeight}px; transform: scale(${scale});`}
        >
            <div class="mobile-homepage-device-screen">
                <MobileHomepage {plugin} {close} previewMode={true} />
            </div>
        </div>
    </main>
</div>

<style lang="scss">
    .mobile-homepage-preview {
        width: 100%;
        height: 100%;
        min-height: 0;
        display: grid;
        grid-template-columns: 220px minmax(0, 1fr);
        gap: 16px;
        padding: 16px;
        box-sizing: border-box;
        background: var(--b3-theme-background);
    }

    .mobile-homepage-preview-controls {
        border-right: 1px solid var(--b3-border-color);
        padding-right: 16px;
        display: flex;
        flex-direction: column;
        gap: 14px;
    }

    .mobile-preview-control-group,
    .mobile-preview-custom-size label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        color: var(--b3-theme-on-surface);
        font-size: 13px;
    }

    .mobile-preview-control-group select,
    .mobile-preview-custom-size input {
        height: 34px;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        padding: 0 8px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
    }

    .mobile-preview-custom-size {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
    }

    .mobile-preview-size-readout {
        padding: 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        color: var(--b3-theme-secondary);
        text-align: center;
        font-size: 13px;
    }

    .mobile-homepage-preview-stage {
        min-width: 0;
        min-height: 0;
        overflow: auto;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 18px;
        background:
            linear-gradient(45deg, rgba(120, 120, 120, 0.08) 25%, transparent 25%),
            linear-gradient(-45deg, rgba(120, 120, 120, 0.08) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, rgba(120, 120, 120, 0.08) 75%),
            linear-gradient(-45deg, transparent 75%, rgba(120, 120, 120, 0.08) 75%);
        background-size: 24px 24px;
        background-position: 0 0, 0 12px, 12px -12px, -12px 0;
        border-radius: 8px;
    }

    .mobile-homepage-device-frame {
        transform-origin: top center;
        padding: 10px;
        overflow: hidden;
        box-sizing: content-box;
        border: none;
        border-radius: 30px;
        background: #111827;
        box-shadow: 0 18px 48px rgba(15, 23, 42, 0.28);
    }

    .mobile-homepage-device-screen {
        width: 100%;
        height: 100%;
        overflow: hidden;
        border-radius: 20px;
        background: var(--b3-theme-background);
        clip-path: inset(0 round 20px);
        contain: paint;
        -webkit-mask-image: -webkit-radial-gradient(white, black);
        isolation: isolate;
    }

    .mobile-homepage-device-screen :global(.mobile-homepage) {
        width: 100%;
        height: 100%;
        min-height: 100%;
        border-radius: inherit;
        overflow: hidden;
    }

    @media (max-width: 760px) {
        .mobile-homepage-preview {
            grid-template-columns: 1fr;
        }

        .mobile-homepage-preview-controls {
            border-right: none;
            border-bottom: 1px solid var(--b3-border-color);
            padding-right: 0;
            padding-bottom: 12px;
        }
    }
</style>
