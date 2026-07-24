<script lang="ts">
    import { onMount, tick, onDestroy } from "svelte";
    import Quill from "quill";
    import "quill/dist/quill.snow.css";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
    import type { WidgetRuntimeContext } from "../../widgetMountRegistry";
    import { loadWidgetInstanceConfig, saveWidgetInstanceConfig } from "@/homepage/deviceView/widgetInstanceRepository";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
        runtimeContext?: WidgetRuntimeContext;
    }

    let { plugin, contentTypeJson = "{}", runtimeContext = {} }: Props = $props();

    const parsedContent = $derived(JSON.parse(contentTypeJson));
    const stikynotStyle = $derived(parsedContent.data?.stikynotStyle || "default");

    let editor: any;
    let editorContainer: HTMLDivElement = $state();
    let backgroundImage: string = $state("");
    let customColor: string = $state("");
    let errorMessage: string = $state("");

    let advancedEnabled = $state(false);

    const STIKYNOT_TOOLBAR_OPTIONS = [
        [{ header: 1 }, { header: 2 }, { header: 3 }],
        ["bold", "italic", "underline", "strike"],
        [{ list: "ordered" }, { list: "bullet" }],
        [{ script: "sub" }, { script: "super" }],
        [{ color: [] }, { background: [] }],
        ["blockquote", "code-block"],
        ["link", "image", "clean"],
    ];

    onMount(async () => {
        advancedEnabled = Boolean(plugin?.ADVANCED);
        if (!advancedEnabled || plugin?.isMobile) {
            return;
        }

        errorMessage = "";
        await tick();

        if (!editorContainer) {
            errorMessage = "便签编辑器加载失败";
            return;
        }

        if (typeof Quill === "undefined") {
            errorMessage = "便签编辑器加载失败";
            return;
        }

        try {
            editor = new Quill(editorContainer, {
                theme: "snow",
                bounds: editorContainer,
                modules: {
                    toolbar: STIKYNOT_TOOLBAR_OPTIONS,
                },
                placeholder: "输入你的便签内容...",
            });
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const truncated = msg.length > 80 ? msg.slice(0, 80) + "..." : msg;
            errorMessage = `便签编辑器加载失败：${truncated}`;
            return;
        }

        Promise.resolve(runtimeContext.deviceViewContext
            ? loadWidgetInstanceConfig(runtimeContext.deviceViewContext, parsedContent.instanceId ?? parsedContent.blockId)
            : null)
            .then((saved: any) => {
                if (saved && saved.html) {
                    editor.root.innerHTML = saved.html;
                }
            });

        editor.on("text-change", () => {
            autoSaveContent();
        });

        setBackground();
    });

    onDestroy(() => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        editor = null;
    });

    function setBackground() {
        const bgMap: Record<string, { image: string; color: string }> = {
            kraftPaper: { image: "kraftPaper.jpg", color: "black" },
            marble: { image: "marble.jpg", color: "black" },
            BlueSky: { image: "BlueSky.jpg", color: "black" },
            waterDrop: { image: "waterDrop.jpg", color: "black" },
            Stars: { image: "Stars.jpg", color: "white" },
            Ink: { image: "Ink.jpg", color: "black" },
            sunsetHeart: { image: "sunsetHeart.jpg", color: "black" },
            PinkPorcelain: { image: "PinkPorcelain.jpg", color: "black" },
            beach: { image: "beach.jpg", color: "black" },
            wood: { image: "wood.jpg", color: "white" },
        };
        const preset = bgMap[stikynotStyle];
        if (preset) {
            backgroundImage = `/plugins/siyuan-homepage/asset/stikynotimg/${preset.image}`;
            customColor = preset.color;
        }
    }

    let timeoutId: number | null = null;
    async function autoSaveContent() {
        if (!editor) return;
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = window.setTimeout(async () => {
            const html = editor?.root?.innerHTML || "";
            const saveconf = {
                ...parsedContent,
                html,
            };
            if (!runtimeContext.deviceViewContext) return;
            await saveWidgetInstanceConfig(runtimeContext.deviceViewContext, parsedContent.instanceId ?? parsedContent.blockId, saveconf);
        }, 1000);
    }
</script>

<div
    class="stikynot-display"
    style:background-image={backgroundImage ? `url(${backgroundImage})` : undefined}
    style:color={customColor || undefined}
>
    {#if !advancedEnabled}
        <div class="stikynot-lock">
            <AdvancedFeatureLock
                title="便签"
                subtitle="快速记录灵感和备忘，支持富文本编辑。"
                icon="edit"
                features={[
                    "快速记录灵感和备忘",
                    "支持富文本编辑",
                    "适合日常笔记和待办"
                ]}
                highlights={["快速记录", "富文本", "备忘录"]}
                compact
            />
        </div>
    {:else if plugin.isMobile}
        <div class="stikynot-lock">移动端无法使用该功能</div>
    {:else if errorMessage}
        <div class="stikynot-error">{errorMessage}</div>
    {:else}
        <div class="stikynot-editor-shell">
            <div bind:this={editorContainer} class="stikynot-content"></div>
        </div>
    {/if}
</div>

<style lang="scss">
    .stikynot-display {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        background-blend-mode: overlay;
        overflow: hidden;

        .stikynot-lock {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1rem;
        }

        .stikynot-error {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 13px;
            color: var(--b3-theme-on-surface, #5f6368);
            padding: 1rem;
        }

        .stikynot-editor-shell {
            display: flex;
            flex-direction: column;
            height: 100%;
            min-height: 0;
        }

        /* ---- editor area (order:1) ---- */
        :global(.ql-container.ql-snow) {
            order: 1;
            flex: 1;
            min-height: 0;
            overflow: hidden;
            border: none !important;
        }

        :global(.ql-editor) {
            min-height: 0;
            padding: 8px 12px;
            font-size: 14px;
            line-height: 1.6;
        }

        :global(.ql-editor img) {
            max-width: 100%;
            height: auto;
        }

        :global(.ql-editor.ql-blank::before) {
            font-style: italic;
            color: var(--b3-theme-on-surface-light, #9ca3af);
        }

        /* ---- toolbar at bottom (order:2) ---- */
        :global(.ql-toolbar.ql-snow) {
            order: 2;
            border: none !important;
            padding: 2px 4px;
            display: flex;
            align-items: center;
            flex-wrap: nowrap;
            overflow-x: auto;
            overflow-y: visible;
            white-space: nowrap;
            flex-shrink: 0;
            min-height: 32px;
        }

        :global(.ql-toolbar.ql-snow .ql-formats) {
            display: inline-flex;
            align-items: center;
            flex-wrap: nowrap;
            gap: 0;
            margin-right: 6px;
        }

        :global(.ql-toolbar.ql-snow button) {
            width: 26px;
            height: 26px;
            flex-shrink: 0;
        }

        :global(.ql-toolbar.ql-snow button svg) {
            width: 16px;
            height: 16px;
        }

        :global(.ql-toolbar.ql-snow .ql-picker) {
            flex-shrink: 0;
        }

        :global(.ql-toolbar.ql-snow .ql-picker-options) {
            min-width: auto;
            font-size: 12px;
        }
    }
</style>
