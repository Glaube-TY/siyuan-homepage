<script lang="ts">
    import { onMount, tick, onDestroy } from "svelte";
    import Quill from "quill";
    import "quill/dist/quill.snow.css";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
    import type { WidgetRuntimeContext } from "../../widgetMountRegistry";
    import { resolveWidgetRuntimeInstanceId } from "../../utils/widgetRuntimeIdentity";
    import { loadWidgetInstanceConfig, saveWidgetInstanceConfig } from "@/homepage/deviceView/widgetInstanceRepository";
    import {
        getHomepageEntitlementSnapshot,
        subscribeHomepageEntitlement,
    } from "@/features/entitlement/homepage-entitlement";
    import { resolveStikynotStylePreset } from "./stikynotPresets";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
        runtimeContext?: WidgetRuntimeContext;
    }

    let { plugin, contentTypeJson = "{}", runtimeContext = {} }: Props = $props();

    const parsedContent = $derived(JSON.parse(contentTypeJson));
    const stikynotStyle = $derived(parsedContent.data?.stikynotStyle || "default");
    const backgroundPreset = $derived(resolveStikynotStylePreset(stikynotStyle));
    const backgroundImage = $derived(backgroundPreset.image
        ? `/plugins/siyuan-homepage/asset/stikynotimg/${backgroundPreset.image}`
        : "");
    const customColor = $derived(backgroundPreset.color || "");
    const isMobile = $derived(Boolean(
        plugin?.isMobile
        || runtimeContext.placement === "mobile"
        || runtimeContext.deviceViewContext?.surface === "mobile-homepage"
    ));

    let editor: any;
    let editorContainer: HTMLDivElement = $state();
    let errorMessage: string = $state("");
    let editorInitPromise: Promise<void> | null = null;
    let retryEditorAfterInitialization = false;
    let destroyed = false;

    let advancedEnabled = $state(getHomepageEntitlementSnapshot().advanced);

    const STIKYNOT_TOOLBAR_OPTIONS = [
        [{ header: 1 }, { header: 2 }, { header: 3 }],
        ["bold", "italic", "underline", "strike"],
        [{ list: "ordered" }, { list: "bullet" }],
        [{ script: "sub" }, { script: "super" }],
        [{ color: [] }, { background: [] }],
        ["blockquote", "code-block"],
        ["link", "image", "clean"],
    ];

    async function initializeEditor(): Promise<void> {
        if (isMobile || !advancedEnabled || editor || editorInitPromise || destroyed) return;
        editorInitPromise = (async () => {
            errorMessage = "";
            await tick();
            if (destroyed) return;
            if (!editorContainer || typeof Quill === "undefined") {
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
                const toolbar = editor.getModule("toolbar")?.container as HTMLElement | undefined;
                toolbar?.setAttribute("aria-label", "便签格式工具栏");
                const instanceId = resolveWidgetRuntimeInstanceId(runtimeContext.instanceId, parsedContent);
                if (runtimeContext.deviceViewContext && !instanceId) throw new Error("便签缺少运行实例 ID");
                const saved = runtimeContext.deviceViewContext && instanceId
                    ? await loadWidgetInstanceConfig(runtimeContext.deviceViewContext, instanceId)
                    : null;
                if (!destroyed && editor && typeof saved?.html === "string") {
                    editor.root.innerHTML = saved.html;
                }
                if (!destroyed && editor) editor.on("text-change", autoSaveContent);
            } catch (e) {
                editor = null;
                const msg = e instanceof Error ? e.message : String(e);
                const truncated = msg.length > 80 ? msg.slice(0, 80) + "..." : msg;
                errorMessage = `便签编辑器加载失败：${truncated}`;
            }
        })();
        try {
            await editorInitPromise;
        } finally {
            editorInitPromise = null;
            if (retryEditorAfterInitialization && advancedEnabled && !editor && !destroyed) {
                retryEditorAfterInitialization = false;
                void initializeEditor();
            }
        }
    }

    onMount(() => subscribeHomepageEntitlement((snapshot) => {
        advancedEnabled = snapshot.advanced;
        if (snapshot.advanced) {
            if (editorInitPromise) retryEditorAfterInitialization = true;
            else void initializeEditor();
        } else {
            retryEditorAfterInitialization = false;
            teardownEditor();
        }
    }));

    function teardownEditor(): void {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        editor?.off?.("text-change", autoSaveContent);
        editor = null;
    }

    onDestroy(() => {
        destroyed = true;
        teardownEditor();
    });

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
            const instanceId = resolveWidgetRuntimeInstanceId(runtimeContext.instanceId, parsedContent);
            if (!instanceId) return;
            await saveWidgetInstanceConfig(runtimeContext.deviceViewContext, instanceId, saveconf);
        }, 1000);
    }
</script>

<div
    class="stikynot-display"
    style:background-image={backgroundImage ? `url(${backgroundImage})` : undefined}
    style:color={customColor || undefined}
>
    {#if isMobile}
        <div class="stikynot-mobile-disabled" role="status">
            <strong>便签暂不支持移动端编辑</strong>
            <span>当前移动端 WebView 无法可靠唤起富文本输入键盘，请在电脑端使用便签。</span>
        </div>
    {:else if !advancedEnabled}
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
    {:else if errorMessage}
        <div class="stikynot-error">{errorMessage}</div>
    {:else}
        <div class="stikynot-editor-shell" role="group" aria-label="便签编辑器">
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
            overscroll-behavior: contain;
            touch-action: auto;
            -webkit-user-select: text;
            user-select: text;
            -webkit-overflow-scrolling: touch;
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

        .stikynot-mobile-disabled {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 20px;
            box-sizing: border-box;
            color: var(--b3-theme-on-surface, #5f6368);
            text-align: center;

            strong {
                color: var(--b3-theme-on-background, #202124);
                font-size: 15px;
            }

            span {
                max-width: 28rem;
                font-size: 13px;
                line-height: 1.55;
            }
        }

    }
</style>
