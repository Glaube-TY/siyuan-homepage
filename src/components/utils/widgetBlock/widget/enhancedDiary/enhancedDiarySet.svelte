<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
    import {
        DEFAULT_ENHANCED_DIARY_CONFIG,
        type EnhancedDiaryConfig,
    } from "./enhancedDiaryTypes";
    import { loadEnhancedDiaryConfig } from "./enhancedDiaryConfig";

    interface Props {
        plugin: any;
        draftConfig?: EnhancedDiaryConfig;
    }

    let {
        plugin,
        draftConfig = $bindable<EnhancedDiaryConfig>({ ...DEFAULT_ENHANCED_DIARY_CONFIG }),
    }: Props = $props();

    let advancedEnabled = $state(false);

    onMount(() => {
        advancedEnabled = Boolean(plugin?.ADVANCED);
        if (advancedEnabled) {
            loadEnhancedDiaryConfig(plugin).then((loaded) => {
                draftConfig = loaded;
            });
        }

        const onReady = () => {
            advancedEnabled = true;
            loadEnhancedDiaryConfig(plugin).then((loaded) => {
                draftConfig = loaded;
            });
        };
        const onUnavailable = () => {
            advancedEnabled = false;
            draftConfig = { ...DEFAULT_ENHANCED_DIARY_CONFIG };
        };
        window.addEventListener("homepage-advanced-ready", onReady);
        window.addEventListener("homepage-advanced-unavailable", onUnavailable);
        return () => {
            window.removeEventListener("homepage-advanced-ready", onReady);
            window.removeEventListener("homepage-advanced-unavailable", onUnavailable);
        };
    });

    function openWorkspace(): void {
        if (!advancedEnabled) {
            showMessage("强化日记工作台为高级会员专属功能，请在「主页设置」→「会员服务」中开通后使用", 3000);
            return;
        }
        if (typeof plugin?.openEnhancedDiaryWorkspace === "function") {
            plugin.openEnhancedDiaryWorkspace("settings");
        }
    }
</script>

<SettingSection title="强化日记">
    {#if advancedEnabled}
    <SettingRow
        title="完整设置已移至工作台"
        description="日记笔记本、复盘规则、任务迁移提醒、日历显示和日/周/月/年模板都在「强化日记工作台 → 设置」中维护。这里保留轻量入口，避免模板在多个地方重复编辑。"
    >
        <button type="button" class="open-workspace-btn" onclick={openWorkspace}>
            打开工作台设置
        </button>
    </SettingRow>
    {:else}
    <div class="lock-wrapper">
        <AdvancedFeatureLock
            title="强化日记设置"
            subtitle="自定义日记笔记本、复盘规则、模板和快速记录分类。"
            icon="settings"
            features={[
                "自定义日记笔记本和周起始日",
                "复盘提醒窗口和自定义模板",
                "快速记录分类候选维护",
                "工作台设置集中管理"
            ]}
            highlights={["模板自定义", "复盘规则", "设置同步"]}
            tutorialUrl="https://blog.glaube-ty.top/archives/019e5f59-4a9c-727b-bd6a-a32c4d604a48"
            compact
        />
    </div>
    {/if}
</SettingSection>

<style>
    .open-workspace-btn {
        border: 1px solid var(--b3-theme-primary);
        border-radius: 6px;
        background: var(--b3-theme-primary);
        color: #fff;
        padding: 6px 12px;
        font-size: 12px;
        cursor: pointer;
        white-space: nowrap;
    }

    .open-workspace-btn:hover {
        opacity: 0.88;
    }

    .lock-wrapper {
        padding: 8px 0;
    }
</style>
