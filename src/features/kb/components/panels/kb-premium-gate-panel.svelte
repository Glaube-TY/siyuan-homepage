<script lang="ts">
    import { onMount } from "svelte";
    import KbMainPanel from "./kb-main-panel.svelte";
    import AdvancedFeatureLock from "@/components/utils/widgetBlock/widget/common/AdvancedFeatureLock.svelte";

    interface Props {
        plugin: any;
        placement?: "tab" | "dock" | "mobile";
        onOpenSettings?: () => void;
    }

    let { plugin, placement = "tab", onOpenSettings }: Props = $props();

    let advanced = $state(false);

    onMount(() => {
        advanced = !!plugin.ADVANCED;

        const handleAdvancedReady = () => {
            advanced = true;
        };
        const handleAdvancedUnavailable = () => {
            advanced = false;
        };

        window.addEventListener("homepage-advanced-ready", handleAdvancedReady);
        window.addEventListener("homepage-advanced-unavailable", handleAdvancedUnavailable);

        return () => {
            window.removeEventListener("homepage-advanced-ready", handleAdvancedReady);
            window.removeEventListener("homepage-advanced-unavailable", handleAdvancedUnavailable);
        };
    });
</script>

{#if advanced}
    <KbMainPanel {placement} {onOpenSettings} />
{:else}
    <div class="kb-premium-gate" class:dock={placement === "dock"} class:mobile={placement === "mobile"}>
        <div class="kb-premium-lock-shell">
            <AdvancedFeatureLock
                title="AI 知识库对话"
                subtitle="把你的思源资料、网页正文和日常记录变成可追问、可引用、可持续管理的个人知识助手。"
                icon="notebrain"
                features={[
                    "围绕本地知识库进行问答、整理和总结",
                    "结合网页正文与已选资料生成更可靠回答",
                    "支持任务、日记、快速记录等知识管理场景",
                    "保留来源意识，减少凭空编造",
                ]}
                highlights={[
                    "知识库问答",
                    "网页阅读",
                    "来源引用",
                    "上下文管理",
                ]}
                note="开启高级会员后即可使用 AI 知识库对话能力。"
                compact={placement === "dock" || placement === "mobile"}
            />
        </div>
    </div>
{/if}

<style>
    .kb-premium-gate {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 32px;
        box-sizing: border-box;
        background: transparent;
        overflow: auto;
    }

    :global(.mobile-kb-chat-dialog .dialog-content) {
        padding: 0;
        overflow: hidden;
    }

    .kb-premium-gate.dock {
        padding: 12px;
        overflow: auto;
    }

    .kb-premium-gate.mobile {
        align-items: stretch;
        padding: 12px;
        overflow: auto;
    }

    .kb-premium-lock-shell {
        width: min(560px, calc(100% - 48px));
        max-width: 560px;
        min-width: 320px;
        box-sizing: border-box;
    }

    .kb-premium-lock-shell :global(.feature-lock) {
        width: 100%;
        box-sizing: border-box;
    }

    .kb-premium-gate.dock .kb-premium-lock-shell {
        width: 100%;
        min-width: 0;
        max-width: none;
    }

    .kb-premium-gate.mobile .kb-premium-lock-shell {
        width: 100%;
        min-width: 0;
        max-width: none;
    }

    .kb-premium-gate.dock :global(.feature-lock),
    .kb-premium-gate.mobile :global(.feature-lock) {
        width: 100%;
    }

    @media (max-width: 520px) {
        .kb-premium-lock-shell {
            width: 100%;
            min-width: 0;
        }
    }
</style>
