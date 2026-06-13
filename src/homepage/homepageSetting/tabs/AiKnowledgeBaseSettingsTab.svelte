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
        advancedEnabled?: boolean;
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
        advancedEnabled = false,
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
    const statusAiVipFeatures = [
        "可使用已配置的大模型生成主页状态语",
        "可单独选择状态语使用的模型",
        "可开启或关闭状态语思考模式",
        "可自定义生成风格和返回长度",
    ];

    function syncSelectedModelState(options: ChatModelOption[] = modelOptions): void {
        if (!advancedEnabled) {
            selectedStatusAiModelKey = "";
            statusAiModelInvalid = false;
            return;
        }

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
        if (!advancedEnabled) {
            modelOptionsLoading = false;
            selectedStatusAiModelKey = "";
            statusAiModelInvalid = false;
            return;
        }

        modelOptionsLoading = true;
        try {
            const settings = await getKbSettings();
            const options = buildChatModelOptions(settings);
            modelOptions = options;
            syncSelectedModelState(options);

            if (advancedEnabled && !statusAiProviderId.trim() && !statusAiModelId.trim()) {
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
        if (!advancedEnabled) return;
        void refreshStatusAiModels();
    }

    $effect(() => {
        advancedEnabled;
        statusAiProviderId;
        statusAiModelId;
        modelOptions;
        syncSelectedModelState();
    });

    $effect(() => {
        if (!advancedEnabled) {
            modelOptionsLoading = false;
            statusAiModelInvalid = false;
            selectedStatusAiModelKey = "";
            return;
        }

        void refreshStatusAiModels();
    });

    onMount(() => {
        window.addEventListener(KB_SETTINGS_CHANGED_EVENT, handleKbSettingsChanged);
    });

    onDestroy(() => {
        window.removeEventListener(KB_SETTINGS_CHANGED_EVENT, handleKbSettingsChanged);
    });
</script>

<a
    class="tutorial-link-card"
    href="https://blog.glaube-ty.top/archives/019ebc77-d03e-73df-b6ec-10b18545d4a7"
    target="_blank"
    rel="noopener noreferrer"
>
    <svg class="tutorial-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 1C4.134 1 1 4.134 1 8s3.134 7 7 7 7-3.134 7-7-3.134-7-7-7zm.75 3.5h-1.5v1.5h1.5V4.5zm0 3h-1.5v5h1.5v-5z" fill="currentColor"/>
    </svg>
    <span class="tutorial-text">查看 AI 知识库使用教程</span>
    <svg class="tutorial-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M4 1h9v9M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
</a>

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
    {#if !advancedEnabled}
        <div class="status-ai-vip-card">
            <div class="status-ai-vip-title">
                <SiyuanIcon name="vip" size={16} />
                <span>AI 状态语是会员专属功能</span>
            </div>
            <p class="status-ai-vip-desc">
                开通会员后，主页可以根据你的真实统计数据自动生成状态语，例如记录天数、笔记数量、文档数量和任务情况，让每次打开主页都有不同的鼓励与提醒。
            </p>
            <ul class="status-ai-vip-list">
                {#each statusAiVipFeatures as feature}
                    <li>
                        <SiyuanIcon name="confirm" size={13} />
                        <span>{feature}</span>
                    </li>
                {/each}
            </ul>
            <div class="status-ai-vip-cta">请前往「会员服务」开通后使用</div>
        </div>
    {:else}
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
    {/if}
</SettingSection>

<style>
    .tutorial-link-card {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
        padding: 0.65rem 0.75rem;
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 30%, var(--b3-border-color));
        border-radius: 6px;
        background: color-mix(in srgb, var(--b3-theme-primary) 6%, var(--b3-theme-surface));
        font-size: 13px;
        color: var(--b3-theme-primary);
        text-decoration: none;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
    }

    .tutorial-link-card:hover {
        background: color-mix(in srgb, var(--b3-theme-primary) 12%, var(--b3-theme-surface));
        border-color: color-mix(in srgb, var(--b3-theme-primary) 50%, var(--b3-border-color));
    }

    .tutorial-icon {
        flex-shrink: 0;
    }

    .tutorial-text {
        flex: 1;
        line-height: 1.4;
    }

    .tutorial-arrow {
        flex-shrink: 0;
        opacity: 0.6;
    }

    .tutorial-link-card:hover .tutorial-arrow {
        opacity: 1;
    }

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

    .status-ai-vip-card {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        padding: 0.85rem 0.95rem;
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 28%, var(--b3-border-color));
        border-radius: 8px;
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, var(--b3-theme-surface));
        color: var(--b3-theme-on-surface);
    }

    .status-ai-vip-title {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        font-weight: 600;
        color: var(--b3-theme-primary);
    }

    .status-ai-vip-desc {
        margin: 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--b3-theme-on-surface);
    }

    .status-ai-vip-list {
        display: grid;
        gap: 0.35rem;
        margin: 0;
        padding: 0;
        list-style: none;
        font-size: 12px;
        line-height: 1.5;
    }

    .status-ai-vip-list li {
        display: flex;
        align-items: flex-start;
        gap: 0.4rem;
    }

    .status-ai-vip-list :global(svg) {
        margin-top: 2px;
        color: var(--b3-theme-primary);
    }

    .status-ai-vip-cta {
        font-size: 12px;
        font-weight: 600;
        color: var(--b3-theme-primary);
    }
</style>
