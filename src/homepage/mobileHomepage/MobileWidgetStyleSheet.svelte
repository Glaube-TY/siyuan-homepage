<script lang="ts">
    import { onMount } from "svelte";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import { setBlockSize } from "../../components/utils/widgetBlock/utils/block-size-handler";
    import { getMobileWidgetLabel } from "./mobile-widget-categories";
    import type { MobileHomepageSection } from "./mobileSectionLayout";

    interface Props {
        blockElement: HTMLElement;
        widgetType?: string;
        sections: MobileHomepageSection[];
        sectionId: string;
        onClose: () => void;
        onDelete: () => void | Promise<void>;
        onStyleChanged: () => boolean | Promise<boolean>;
        onSectionChanged: (sectionId: string) => void | Promise<void>;
    }

    let {
        blockElement,
        widgetType = "",
        sections,
        sectionId,
        onClose,
        onDelete,
        onStyleChanged,
        onSectionChanged,
    }: Props = $props();

    let backgroundColor = $state("#ffffff");
    let backgroundOpacity = $state(0.72);
    let borderEnabled = $state(true);
    let borderColor = $state("#e5e7eb");
    let borderWidth = $state(1);
    let sizeSaving = $state(false);

    const sizeOptions = [
        { label: "小卡片", detail: "1x1", value: 11, cells: [0] },
        { label: "横向", detail: "2x1", value: 12, cells: [0, 1] },
        { label: "竖向", detail: "1x2", value: 21, cells: [0, 2] },
        { label: "大卡片", detail: "2x2", value: 22, cells: [0, 1, 2, 3] },
        { label: "高卡片", detail: "2x3", value: 32, cells: [0, 1, 2, 3, 4, 5] },
        { label: "满幅", detail: "2x4", value: 42, cells: [0, 1, 2, 3, 4, 5, 6, 7] },
    ];

    function hexToRgba(hex: string, opacity: number): string {
        const normalized = hex.replace("#", "");
        const value = parseInt(normalized.length === 3
            ? normalized.split("").map((char) => char + char).join("")
            : normalized, 16);
        const r = (value >> 16) & 255;
        const g = (value >> 8) & 255;
        const b = value & 255;
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }

    function toHex(color: string): string | null {
        const values = color.match(/(\d+(\.\d+)?)/g)?.map(Number);
        if (!values || values.length < 3) return null;
        const [r, g, b] = values;
        const toPair = (value: number) => Math.min(255, Math.max(0, Math.round(value)))
            .toString(16)
            .padStart(2, "0");
        return `#${toPair(r)}${toPair(g)}${toPair(b)}`;
    }

    async function commitStyle(): Promise<void> {
        blockElement.style.backgroundColor = hexToRgba(backgroundColor, backgroundOpacity);
        blockElement.style.borderStyle = borderEnabled && borderWidth > 0 ? "solid" : "none";
        blockElement.style.borderColor = borderColor;
        blockElement.style.borderWidth = borderEnabled ? `${borderWidth}px` : "0";
        await onStyleChanged();
    }

    async function applySize(size: number): Promise<void> {
        if (sizeSaving) return;
        sizeSaving = true;
        try {
            await setBlockSize(blockElement, size, 2);
            if (await onStyleChanged()) onClose();
        } finally {
            sizeSaving = false;
        }
    }

    onMount(() => {
        const computed = window.getComputedStyle(blockElement);
        const bgHex = toHex(computed.backgroundColor);
        if (bgHex) backgroundColor = bgHex;
        const rgba = computed.backgroundColor.match(/rgba?\(([^)]+)\)/i);
        if (rgba) {
            const parts = rgba[1].split(",").map((part) => Number(part.trim()));
            if (parts.length >= 4 && !Number.isNaN(parts[3])) {
                backgroundOpacity = Math.round(parts[3] * 100) / 100;
            }
        }
        const nextBorderWidth = parseInt(computed.borderWidth || "1", 10);
        borderWidth = Number.isFinite(nextBorderWidth)
            ? Math.min(4, Math.max(0, nextBorderWidth))
            : 1;
        borderEnabled = borderWidth > 0 && computed.borderStyle !== "none";
        const borderHex = toHex(computed.borderColor);
        if (borderHex) borderColor = borderHex;
    });
</script>

<button class="mobile-widget-sheet-backdrop" type="button" aria-label="关闭样式设置" onclick={onClose}></button>
<div class="mobile-widget-sheet mobile-widget-style-sheet" role="dialog" aria-modal="true" aria-label="组件样式设置">
    <header class="mobile-widget-sheet-header">
        <div>
            <div class="mobile-widget-sheet-eyebrow">样式设置</div>
            <h3>{getMobileWidgetLabel(widgetType)}</h3>
        </div>
        <button class="mobile-widget-sheet-close" type="button" aria-label="关闭" onclick={onClose}>
            <SiyuanIcon name="cancel" size={16} />
        </button>
    </header>

    <div class="mobile-widget-sheet-body">
        <section class="mobile-style-section">
            <h4>主页分区</h4>
            <label class="mobile-field-row mobile-field-row-wide">
                <span>显示位置</span>
                <select value={sectionId} onchange={(event) => void onSectionChanged(
                    (event.currentTarget as HTMLSelectElement).value,
                )}>
                    {#each sections as section}
                        <option value={section.id}>{section.name}</option>
                    {/each}
                </select>
            </label>
        </section>

        <section class="mobile-style-section">
            <h4>卡片尺寸</h4>
            <div class="mobile-size-grid">
                {#each sizeOptions as option}
                    <button type="button" class="mobile-size-option" disabled={sizeSaving} onclick={() => applySize(option.value)}>
                        <span class="mobile-size-preview" aria-hidden="true">
                            {#each [0, 1, 2, 3, 4, 5, 6, 7] as cell}
                                <span class:active={option.cells.includes(cell)}></span>
                            {/each}
                        </span>
                        <strong>{option.label}</strong>
                        <small>{option.detail}</small>
                    </button>
                {/each}
            </div>
        </section>

        <section class="mobile-style-section">
            <h4>背景</h4>
            <label class="mobile-field-row">
                <span>颜色</span>
                <input type="color" bind:value={backgroundColor} onchange={() => void commitStyle()} />
            </label>
            <label class="mobile-field-row">
                <span>透明度</span>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    bind:value={backgroundOpacity}
                    oninput={() => void commitStyle()}
                />
                <em>{Math.round(backgroundOpacity * 100)}%</em>
            </label>
        </section>

        <section class="mobile-style-section">
            <h4>边框</h4>
            <label class="mobile-field-row">
                <span>显示边框</span>
                <input
                    type="checkbox"
                    class="b3-switch fn__flex-center"
                    bind:checked={borderEnabled}
                    onchange={() => void commitStyle()}
                />
            </label>
            <label class="mobile-field-row">
                <span>颜色</span>
                <input type="color" bind:value={borderColor} onchange={() => void commitStyle()} />
            </label>
            <label class="mobile-field-row">
                <span>粗细</span>
                <select bind:value={borderWidth} onchange={() => void commitStyle()}>
                    {#each [0, 1, 2, 3, 4] as width}
                        <option value={width}>{width}px</option>
                    {/each}
                </select>
            </label>
        </section>

        <section class="mobile-style-section mobile-danger-section">
            <h4>危险操作</h4>
            <p>从移动端主页移除此组件。</p>
            <button type="button" class="mobile-danger-button" onclick={onDelete}>
                <SiyuanIcon name="delete" size={16} />
                <span>删除组件</span>
            </button>
        </section>
    </div>
</div>
