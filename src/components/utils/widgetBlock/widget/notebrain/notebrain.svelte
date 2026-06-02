<script lang="ts">
    import { showMessage } from "siyuan";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";

    interface Props {
        plugin: any;
    }

    let { plugin }: Props = $props();

    function callPluginAction(methodName: string, fallbackMessage: string): void {
        const action = plugin?.[methodName];
        if (typeof action !== "function") {
            showMessage(fallbackMessage, 3000);
            return;
        }
        action.call(plugin);
    }
</script>

<div class="notebrain-widget">
    <div class="notebrain-header">
        <div>
            <div class="notebrain-title">AI 知识库</div>
            <div class="notebrain-subtitle">基于当前知识库进行问答与检索</div>
        </div>
        <div class="notebrain-badge"><SiyuanIcon name="iconSparkles" size={18} /></div>
    </div>

    <div class="notebrain-actions">
        <button
            type="button"
            class="notebrain-action primary"
            onclick={() => callPluginAction("openKbDock", "AI 知识库侧边栏尚未初始化")}
        >
            <SiyuanIcon name="iconDock" size={13} />
            打开侧边栏
        </button>
        <button
            type="button"
            class="notebrain-action"
            onclick={() => callPluginAction("openKbChatTab", "AI 知识库标签页尚未初始化")}
        >
            <SiyuanIcon name="iconOpen" size={13} />
            打开标签页
        </button>
        <button
            type="button"
            class="notebrain-action"
            onclick={() => callPluginAction("openKbSettingsDialog", "AI 知识库设置尚未初始化")}
        >
            <SiyuanIcon name="iconSettings" size={13} />
            设置
        </button>
    </div>
</div>

<style lang="scss">
    .notebrain-widget {
        width: 100%;
        height: 100%;
        min-height: 0;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 14px;
        padding: 16px;
        box-sizing: border-box;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
    }

    .notebrain-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        min-width: 0;
    }

    .notebrain-title {
        font-size: 18px;
        font-weight: 650;
        line-height: 1.25;
    }

    .notebrain-subtitle {
        margin-top: 6px;
        color: var(--b3-theme-on-surface);
        font-size: 12px;
        line-height: 1.5;
    }

    .notebrain-badge {
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: 8px;
        background: var(--b3-theme-primary-lightest);
        color: var(--b3-theme-primary);
        font-weight: 700;
        font-size: 13px;
    }

    .notebrain-actions {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
    }

    .notebrain-action {
        min-width: 0;
        height: 32px;
        padding: 0 8px;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        cursor: pointer;
        font-size: 12px;
        white-space: nowrap;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;

        &:hover {
            background: var(--b3-list-hover);
        }

        &.primary {
            border-color: var(--b3-theme-primary);
            background: var(--b3-theme-primary);
            color: var(--b3-theme-on-primary);
        }
    }
</style>
