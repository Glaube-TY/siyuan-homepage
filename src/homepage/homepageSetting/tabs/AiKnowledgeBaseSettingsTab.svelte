<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import { getKbSettings, KB_SETTINGS_CHANGED_EVENT } from "@/features/kb/services/settings/kb-settings-service";
    import { buildChatModelOptions, findDefaultChatModelOption } from "@/features/kb/services/settings/chat-model-options";
    import { buildChatModelKey, type ChatModelOption } from "@/features/kb/types/chat-model-selection";

    interface Props {
        aiKbDockEnabled: boolean;
        aiKbTabEnabled: boolean;
        statusAiProviderId: string;
        statusAiModelId: string;
        statusAiThinkingEnabled: boolean;
        onAiKbDockEnabledChange: (value: boolean) => void;
        onAiKbTabEnabledChange: (value: boolean) => void;
        onStatusAiModelChange: (value: { providerId: string; modelId: string }) => void;
        onStatusAiThinkingEnabledChange: (value: boolean) => void;
    }

    let {
        aiKbDockEnabled,
        aiKbTabEnabled,
        statusAiProviderId,
        statusAiModelId,
        statusAiThinkingEnabled,
        onAiKbDockEnabledChange,
        onAiKbTabEnabledChange,
        onStatusAiModelChange,
        onStatusAiThinkingEnabledChange,
    }: Props = $props();

    let modelOptions: ChatModelOption[] = $state([]);
    let selectedStatusAiModelKey = $state("");
    let statusAiModelInvalid = $state(false);
    let modelOptionsLoading = $state(false);

    function syncSelectedModelState(options: ChatModelOption[] = modelOptions): void {
        const currentKey = buildChatModelKey(statusAiProviderId, statusAiModelId);
        const hasCurrentSelection = Boolean(statusAiProviderId.trim() && statusAiModelId.trim());
        const currentOption = hasCurrentSelection
            ? options.find((option) => option.key === currentKey)
            : undefined;

        if (currentOption) {
            selectedStatusAiModelKey = currentOption.key;
            statusAiModelInvalid = false;
            return;
        }

        if (hasCurrentSelection) {
            selectedStatusAiModelKey = "";
            statusAiModelInvalid = options.length > 0;
            return;
        }

        selectedStatusAiModelKey = "";
        statusAiModelInvalid = false;
    }

    async function refreshStatusAiModels(): Promise<void> {
        modelOptionsLoading = true;
        try {
            const settings = await getKbSettings();
            const options = buildChatModelOptions(settings);
            modelOptions = options;
            syncSelectedModelState(options);

            if (!statusAiProviderId.trim() && !statusAiModelId.trim()) {
                const defaultOption = findDefaultChatModelOption(settings, options);
                if (defaultOption) {
                    selectedStatusAiModelKey = defaultOption.key;
                    statusAiModelInvalid = false;
                    onStatusAiModelChange({
                        providerId: defaultOption.providerId,
                        modelId: defaultOption.modelId,
                    });
                }
            }
        } catch (error) {
            console.warn("[AiKnowledgeBaseSettingsTab] 加载状态语模型选项失败:", error);
            modelOptions = [];
            selectedStatusAiModelKey = "";
            statusAiModelInvalid = false;
        } finally {
            modelOptionsLoading = false;
        }
    }

    function handleStatusAiModelSelect(event: Event): void {
        const key = (event.currentTarget as HTMLSelectElement).value;
        const option = modelOptions.find((item) => item.key === key);
        if (!option) {
            selectedStatusAiModelKey = "";
            return;
        }

        selectedStatusAiModelKey = option.key;
        statusAiModelInvalid = false;
        onStatusAiModelChange({
            providerId: option.providerId,
            modelId: option.modelId,
        });
    }

    function handleKbSettingsChanged(): void {
        void refreshStatusAiModels();
    }

    $effect(() => {
        statusAiProviderId;
        statusAiModelId;
        modelOptions;
        syncSelectedModelState();
    });

    onMount(() => {
        void refreshStatusAiModels();
        window.addEventListener(KB_SETTINGS_CHANGED_EVENT, handleKbSettingsChanged);
    });

    onDestroy(() => {
        window.removeEventListener(KB_SETTINGS_CHANGED_EVENT, handleKbSettingsChanged);
    });
</script>

<SettingSection title="AI 知识库">
    <SettingRow
        title="开启侧边栏对话"
        description="在右侧侧边栏启用 AI 知识库对话入口"
    >
        <div class="switch-with-vip">
            <SiyuanIcon name="vip" size={14} />
            <input
                class="b3-switch"
                type="checkbox"
                checked={aiKbDockEnabled}
                onchange={(e) => onAiKbDockEnabledChange(e.currentTarget.checked)}
            />
        </div>
    </SettingRow>
    <SettingRow
        title="开启标签页对话"
        description="在左上角显示 AI 知识库标签页入口"
    >
        <div class="switch-with-vip">
            <SiyuanIcon name="vip" size={14} />
            <input
                class="b3-switch"
                type="checkbox"
                checked={aiKbTabEnabled}
                onchange={(e) => onAiKbTabEnabledChange(e.currentTarget.checked)}
            />
        </div>
    </SettingRow>
</SettingSection>

<SettingSection title="状态语 AI 生成">
    <SettingRow title="状态语 AI 模型" description="独立选择主页状态语使用的大模型，不影响聊天问答当前模型">
        {#if modelOptionsLoading}
            <span class="model-loading">正在加载模型...</span>
        {:else if modelOptions.length === 0}
            <span class="model-empty">尚未配置可用大模型</span>
        {:else}
            <select
                class="control-lg"
                value={selectedStatusAiModelKey}
                onchange={handleStatusAiModelSelect}
            >
                {#if !selectedStatusAiModelKey}
                    <option value="">请选择状态语模型</option>
                {/if}
                {#each modelOptions as option (option.key)}
                    <option value={option.key}>{option.label}</option>
                {/each}
            </select>
        {/if}
    </SettingRow>

    {#if modelOptions.length === 0 && !modelOptionsLoading}
        <div class="status-ai-panel warning">
            <SiyuanIcon name="warning" size={14} />
            <span>尚未配置可用大模型，请先打开「AI 知识库设置 → 大模型配置」添加提供商和模型。</span>
        </div>
    {:else if statusAiModelInvalid}
        <div class="status-ai-panel warning">
            <SiyuanIcon name="warning" size={14} />
            <span>当前选择不可用，请重新选择。</span>
        </div>
    {/if}

    <SettingRow title="状态语思考模式" description="开启后生成状态语时允许模型使用思考模式，只影响状态语生成">
        <input
            class="b3-switch"
            type="checkbox"
            checked={statusAiThinkingEnabled}
            onchange={(e) => onStatusAiThinkingEnabledChange(e.currentTarget.checked)}
        />
    </SettingRow>
</SettingSection>

<style>
    .switch-with-vip {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--b3-theme-primary);
    }

    .model-loading,
    .model-empty {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
    }

    .status-ai-panel {
        display: flex;
        align-items: flex-start;
        gap: 0.45rem;
        margin: 0.25rem 0 0.75rem;
        padding: 0.55rem 0.65rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
        font-size: 12px;
        line-height: 1.5;
        color: var(--b3-theme-on-surface);
    }

    .status-ai-panel :global(svg) {
        margin-top: 2px;
        color: var(--b3-theme-primary);
    }

    .status-ai-panel.warning {
        border-color: color-mix(in srgb, var(--b3-theme-error) 35%, var(--b3-border-color));
        background: color-mix(in srgb, var(--b3-theme-error) 8%, var(--b3-theme-surface));
    }

    .status-ai-panel.warning :global(svg) {
        color: var(--b3-theme-error);
    }
</style>
