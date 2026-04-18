<script lang="ts">
    import { onMount } from "svelte";
    import Quill from "quill";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
    }

    let { plugin, contentTypeJson = "{}" }: Props = $props();

    const parsedContent = $derived(JSON.parse(contentTypeJson));
    const stikynotStyle = $derived(parsedContent.data?.stikynotStyle || "default");

    let editor: any;
    let editorContainer: HTMLDivElement = $state();
    let toolbarContainer: HTMLDivElement = $state();
    let backgroundImage: string = $state("");
    let customColor: string = $state("");

    let advancedEnabled = $state(false);

    onMount(() => {
        advancedEnabled = plugin.ADVANCED;

        if (advancedEnabled && !plugin.isMobile) {
            if (!editorContainer || !toolbarContainer) {
                console.error("编辑器或工具栏容器未找到");
                return;
            }

            if (typeof Quill === "undefined") {
                console.error("Quill 未正确加载");
                return;
            }

            // 初始化 Quill 编辑器
            editor = new Quill(editorContainer, {
                theme: "snow",
                bounds: editorContainer,
                modules: {
                    toolbar: {
                        container: toolbarContainer,
                    },
                },
                placeholder: "输入你的便签内容...",
            });

            // 加载保存的内容
            plugin
                .loadData(`widget-${parsedContent.blockId}.json`)
                .then((saved) => {
                    if (saved && saved.html) {
                        editor.root.innerHTML = saved.html;
                    }
                });

            // 自动保存逻辑
            editor.on("text-change", () => {
                autoSaveContent();
            });

            setBackground();

            (window as any).stikynot = { getContent };
        }

        return () => {
            // 清理自动保存 timeout
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }

            // 移除 window.stikynot（只移除自己挂载的）
            if ((window as any).stikynot?.getContent === getContent) {
                delete (window as any).stikynot;
            }

            // 释放 editor 引用
            editor = null;
        };
    });

    function setBackground() {
        if (stikynotStyle === "kraftPaper") {
            backgroundImage = `/plugins/siyuan-homepage/asset/stikynotimg/kraftPaper.jpg`;
            customColor = "black";
        } else if (stikynotStyle === "marble") {
            backgroundImage = `/plugins/siyuan-homepage/asset/stikynotimg/marble.jpg`;
            customColor = "black";
        } else if (stikynotStyle === "BlueSky") {
            backgroundImage = `/plugins/siyuan-homepage/asset/stikynotimg/BlueSky.jpg`;
            customColor = "black";
        } else if (stikynotStyle === "waterDrop") {
            backgroundImage = `/plugins/siyuan-homepage/asset/stikynotimg/waterDrop.jpg`;
            customColor = "black";
        } else if (stikynotStyle === "Stars") {
            backgroundImage = `/plugins/siyuan-homepage/asset/stikynotimg/Stars.jpg`;
            customColor = "white";
        } else if (stikynotStyle === "Ink") {
            backgroundImage = `/plugins/siyuan-homepage/asset/stikynotimg/Ink.jpg`;
            customColor = "black";
        } else if (stikynotStyle === "sunsetHeart") {
            backgroundImage = `/plugins/siyuan-homepage/asset/stikynotimg/sunsetHeart.jpg`;
            customColor = "black";
        } else if (stikynotStyle === "PinkPorcelain") {
            backgroundImage = `/plugins/siyuan-homepage/asset/stikynotimg/PinkPorcelain.jpg`;
            customColor = "black";
        } else if (stikynotStyle === "beach") {
            backgroundImage = `/plugins/siyuan-homepage/asset/stikynotimg/beach.jpg`;
            customColor = "black";
        } else if (stikynotStyle === "wood") {
            backgroundImage = `/plugins/siyuan-homepage/asset/stikynotimg/wood.jpg`;
            customColor = "white";
        }
    }

    function getContent() {
        return editor?.root?.innerHTML || "";
    }

    let timeoutId: number | null = null;
    async function autoSaveContent() {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = window.setTimeout(async () => {
            const html = editor.root.innerHTML;
            const saveconf = {
                ...parsedContent,
                html,
            };
            await plugin.saveData(
                `widget-${parsedContent.blockId}.json`,
                saveconf,
            );
        }, 1000);
    }
</script>

<div
    class="content-display"
    style="background-image: url({backgroundImage}); color: {customColor};"
>
    <div bind:this={editorContainer} class="stikynot-content"></div>
    <div bind:this={toolbarContainer} class="stikynot-toolbar">
        <span class="ql-formats">
            <button class="ql-header" value="1">H1</button>
            <button class="ql-header" value="2">H2</button>
            <button class="ql-header" value="3">H3</button>
            <button class="ql-header" value="4">H4</button>
            <button class="ql-header" value="5">H5</button>
            <button class="ql-header" value="6">H6</button>
            <button class="ql-size" value="small">小</button>
            <button class="ql-size" value="large">中</button>
            <button class="ql-size" value="huge">大</button>
            <button class="ql-bold" title="粗体"></button>
            <button class="ql-italic" title="斜体"></button>
            <button class="ql-underline" title="下划线"></button>
            <button class="ql-strike" title="删除线"></button>
            <button class="ql-list" value="ordered" title="有序列表"></button>
            <button class="ql-script" value="sub" title="下标"></button>
            <button class="ql-script" value="super" title="上标"></button>
            <select class="ql-color" title="文字颜色"></select>
            <select class="ql-background" title="背景颜色"></select>
            <button class="ql-blockquote" title="引用"></button>
            <button class="ql-code-block" title="代码块"></button>
            <button class="ql-indent" value="+1" title="增加缩进"></button>
            <button class="ql-indent" value="-1" title="减少缩进"></button>
            <button class="ql-direction" value="rtl" title="文字方向"></button>
            <button class="ql-link" title="链接"></button>
            <button class="ql-image" title="图片"></button>
            <button class="ql-video" title="视频"></button>
            <button class="ql-formula" title="公式"></button>
            <button class="ql-clean" title="清除格式"></button>
        </span>
    </div>
    {#if !advancedEnabled}
        <div class="content-not-advanced">
            <h2>👑高级会员专属功能👑</h2>
            <h3>请在“主页设置”→“会员服务”中开通高级会员后使用</h3>
        </div>
    {:else if plugin.isMobile}
        <div>移动端无法使用该功能</div>
    {/if}
</div>

<style lang="scss">
    .content-display {
        width: 100%;
        height: calc(100%);
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
        overflow-y: auto;
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        background-blend-mode: overlay;

        .stikynot-toolbar {
            display: none !important;

            &:hover {
                display: block !important;
            }
        }

        .stikynot-content:focus-within + .stikynot-toolbar {
            display: block !important;
        }

        .content-not-advanced {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1rem;
        }
    }
</style>
