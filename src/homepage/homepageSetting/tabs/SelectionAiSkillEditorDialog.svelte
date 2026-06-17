<script lang="ts">
    import { onMount } from "svelte";
    import type {
        SelectionAiSkill,
        SelectionAiSkillPlacement,
    } from "@/features/kb/services/selection-ai/selection-ai-types";
    import { getKbSettings } from "@/features/kb/services/settings/kb-settings-service";
    import { buildChatModelOptions } from "@/features/kb/services/settings/chat-model-options";
    import { buildChatModelKey, type ChatModelOption } from "@/features/kb/types/chat-model-selection";

    interface Props {
        skill: SelectionAiSkill | null; // null = 新建
        onSave: (skill: SelectionAiSkill) => void;
        onClose: () => void;
    }

    let { skill, onSave, onClose }: Props = $props();

    const snapshot = $derived({
        name: skill?.name ?? "",
        promptTemplate: skill?.promptTemplate ?? "",
        placement: (skill?.placement ?? "menu") as SelectionAiSkillPlacement,
        enabled: skill?.enabled ?? true,
        includeDocumentContext: skill?.includeDocumentContext ?? false,
        documentContextMaxChars: skill?.documentContextMaxChars ?? 5000,
        modelProviderId: skill?.modelProviderId ?? "",
        modelId: skill?.modelId ?? "",
        temperature: skill?.temperature ?? 0.3,
        maxSelectedTextChars: skill?.maxSelectedTextChars ?? 6000,
        maxOutputChars: skill?.maxOutputChars ?? 3000,
        stream: skill?.stream ?? true,
    });

    let name = $state("");
    let promptTemplate = $state("");
    let placement = $state<SelectionAiSkillPlacement>("menu");
    let enabled = $state(true);
    let includeDocumentContext = $state(false);
    let documentContextMaxChars = $state(5000);
    let modelProviderId = $state("");
    let modelId = $state("");
    let temperature = $state(0.3);
    let maxSelectedTextChars = $state(6000);
    let maxOutputChars = $state(3000);
    let stream = $state(true);

    $effect(() => {
        name = snapshot.name;
        promptTemplate = snapshot.promptTemplate;
        placement = snapshot.placement;
        enabled = snapshot.enabled;
        includeDocumentContext = snapshot.includeDocumentContext;
        documentContextMaxChars = snapshot.documentContextMaxChars;
        modelProviderId = snapshot.modelProviderId;
        modelId = snapshot.modelId;
        temperature = snapshot.temperature;
        maxSelectedTextChars = snapshot.maxSelectedTextChars;
        maxOutputChars = snapshot.maxOutputChars;
        stream = snapshot.stream;
    });

    let nameError = $state(false);
    let templateError = $state(false);
    let modelOptions = $state<ChatModelOption[]>([]);
    let modelOptionsLoading = $state(true);

    // AI 问答技能不显示模型与生成参数配置
    const isAskSkill = $derived(skill?.builtInAction === "ask");

    $effect(() => {
        const key = buildChatModelKey(modelProviderId, modelId);
        selectedModelKey = modelProviderId && modelId ? key : "";
    });
    let selectedModelKey = $state("");

    function handleModelSelect(e: Event): void {
        const val = (e.target as HTMLSelectElement).value;
        if (!val) {
            modelProviderId = "";
            modelId = "";
        } else {
            const option = modelOptions.find((o) => o.key === val);
            if (option) {
                modelProviderId = option.providerId;
                modelId = option.modelId;
            }
        }
    }

    onMount(async () => {
        try {
            const settings = await getKbSettings();
            modelOptions = buildChatModelOptions(settings);
        } finally {
            modelOptionsLoading = false;
        }
    });

    function handleSave(): void {
        nameError = !name.trim();
        templateError = !promptTemplate.trim();
        if (nameError || templateError) return;

        const nextSkill: SelectionAiSkill = {
            id: skill?.id ?? `custom:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            name: name.trim(),
            promptTemplate: promptTemplate.trim(),
            enabled,
            builtInAction: skill?.builtInAction,
            builtin: skill?.builtin ?? false,
            order: skill?.order ?? Date.now(),
            includeDocumentContext,
            documentContextMaxChars: Math.max(0, Math.round(documentContextMaxChars)),
            placement,
            modelProviderId: modelProviderId || undefined,
            modelId: modelId || undefined,
            temperature,
            maxSelectedTextChars,
            maxOutputChars,
            stream,
        };
        onSave(nextSkill);
    }

    function handleOverlayClick(event: MouseEvent): void {
        if ((event.target as HTMLElement)?.classList.contains("shp-skill-editor-overlay")) {
            onClose();
        }
    }

    function handleKeydown(event: KeyboardEvent): void {
        if (event.key === "Escape") onClose();
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="shp-skill-editor-overlay"
    onclick={handleOverlayClick}
    onkeydown={handleKeydown}
>
    <div class="shp-skill-editor-dialog" role="dialog" aria-label={skill ? "编辑技能" : "添加技能"}>
        <div class="shp-skill-editor-header">
            <span class="shp-skill-editor-title">{skill ? "编辑技能" : "添加技能"}</span>
            <button
                type="button"
                class="shp-skill-editor-close"
                onclick={onClose}
                aria-label="关闭"
            >&times;</button>
        </div>

        <div class="shp-skill-editor-body">
            <label class="shp-skill-editor-field">
                <span class="shp-skill-editor-label">技能名称 <span class="shp-skill-editor-required">*</span></span>
                <input
                    class="b3-text-field shp-skill-editor-input"
                    class:shp-skill-editor-input-error={nameError}
                    type="text"
                    maxlength="20"
                    placeholder="例如：解释、翻译、润色"
                    bind:value={name}
                    oninput={() => nameError = false}
                />
                {#if nameError}
                    <span class="shp-skill-editor-error">请输入技能名称</span>
                {/if}
            </label>

            <label class="shp-skill-editor-field">
                <span class="shp-skill-editor-label">提示词模板 <span class="shp-skill-editor-required">*</span></span>
                <textarea
                    class="b3-text-field shp-skill-editor-textarea"
                    class:shp-skill-editor-input-error={templateError}
                    rows="6"
                    placeholder="输入提示词模板..."
                    bind:value={promptTemplate}
                    oninput={() => templateError = false}
                ></textarea>
                {#if templateError}
                    <span class="shp-skill-editor-error">请输入提示词模板</span>
                {/if}
            </label>

            <div class="shp-skill-editor-vars">
                <span class="shp-skill-editor-vars-title">可用变量：</span>
                <code>{'{{选择文字}}'}</code> 当前选中的文字
                <span class="shp-skill-editor-vars-hint">
                    如果模板不写 <code>{'{{选择文字}}'}</code>，系统会自动在末尾追加选中文字。<br/>
                    开启"附带文档上下文"后，系统会在内部自动附加文档标题和选区附近上下文，不需要写进模板。
                </span>
            </div>

            <label class="shp-skill-editor-field">
                <span class="shp-skill-editor-label">显示位置</span>
                <select
                    class="b3-text-field shp-skill-editor-input"
                    bind:value={placement}
                >
                    <option value="toolbar">直接显示在 AI 菜单中</option>
                    <option value="menu">折叠在更多技能中</option>
                </select>
            </label>

            <label class="shp-skill-editor-field shp-skill-editor-field-row">
                <span class="shp-skill-editor-label">启用</span>
                <input
                    class="b3-switch"
                    type="checkbox"
                    bind:checked={enabled}
                />
            </label>

            <label class="shp-skill-editor-field shp-skill-editor-field-row">
                <span class="shp-skill-editor-label">附带文档上下文</span>
                <input
                    class="b3-switch"
                    type="checkbox"
                    bind:checked={includeDocumentContext}
                />
            </label>

            {#if includeDocumentContext}
                <label class="shp-skill-editor-field">
                    <span class="shp-skill-editor-label">文档上下文最大字符数</span>
                    <input
                        class="b3-text-field shp-skill-editor-input shp-skill-editor-input-sm"
                        type="number"
                        min="0"
                        max="50000"
                        step="500"
                        bind:value={documentContextMaxChars}
                    />
                </label>
            {/if}

            {#if !isAskSkill}
                <div class="shp-skill-editor-section-title">模型与生成参数</div>

                <label class="shp-skill-editor-field">
                    <span class="shp-skill-editor-label">使用模型</span>
                    {#if modelOptionsLoading}
                        <span class="shp-skill-editor-hint">正在加载模型...</span>
                    {:else if modelOptions.length === 0}
                        <span class="shp-skill-editor-hint">尚未配置可用大模型</span>
                    {:else}
                        <select
                            class="b3-text-field shp-skill-editor-input"
                            value={selectedModelKey}
                            onchange={handleModelSelect}
                        >
                            <option value="">使用 AI 知识库默认模型</option>
                            {#each modelOptions as option (option.key)}
                                <option value={option.key}>{option.label}</option>
                            {/each}
                        </select>
                    {/if}
                </label>

                <label class="shp-skill-editor-field">
                    <span class="shp-skill-editor-label">生成温度</span>
                    <input
                        class="b3-text-field shp-skill-editor-input shp-skill-editor-input-sm"
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        bind:value={temperature}
                    />
                </label>

                <label class="shp-skill-editor-field">
                    <span class="shp-skill-editor-label">最大选中文字数</span>
                    <input
                        class="b3-text-field shp-skill-editor-input shp-skill-editor-input-sm"
                        type="number"
                        min="1"
                        max="30000"
                        step="100"
                        bind:value={maxSelectedTextChars}
                    />
                </label>

                <label class="shp-skill-editor-field">
                    <span class="shp-skill-editor-label">最大输出字符数</span>
                    <input
                        class="b3-text-field shp-skill-editor-input shp-skill-editor-input-sm"
                        type="number"
                        min="256"
                        max="20000"
                        step="100"
                        bind:value={maxOutputChars}
                    />
                </label>

                <label class="shp-skill-editor-field shp-skill-editor-field-row">
                    <span class="shp-skill-editor-label">流式输出</span>
                    <input
                        class="b3-switch"
                        type="checkbox"
                        bind:checked={stream}
                    />
                </label>
            {/if}
        </div>

        <div class="shp-skill-editor-footer">
            <button
                type="button"
                class="b3-button b3-button--outline"
                onclick={onClose}
            >取消</button>
            <button
                type="button"
                class="b3-button b3-button--text"
                onclick={handleSave}
            >保存</button>
        </div>
    </div>
</div>

<style>
    .shp-skill-editor-overlay {
        position: fixed;
        inset: 0;
        z-index: 400;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.35);
    }

    .shp-skill-editor-dialog {
        display: flex;
        flex-direction: column;
        width: min(480px, calc(100vw - 2rem));
        max-height: calc(100vh - 4rem);
        background: var(--b3-theme-surface);
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
        overflow: hidden;
    }

    .shp-skill-editor-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--b3-border-color);
    }

    .shp-skill-editor-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
    }

    .shp-skill-editor-close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        background: none;
        font-size: 18px;
        color: var(--b3-theme-on-surface-light);
        cursor: pointer;
        border-radius: 4px;
    }

    .shp-skill-editor-close:hover {
        background: var(--b3-theme-surface-light);
    }

    .shp-skill-editor-body {
        flex: 1;
        overflow-y: auto;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .shp-skill-editor-field {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
    }

    .shp-skill-editor-field-row {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
    }

    .shp-skill-editor-label {
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        font-weight: 500;
    }

    .shp-skill-editor-required {
        color: var(--b3-theme-error);
    }

    .shp-skill-editor-input {
        width: 100%;
    }

    .shp-skill-editor-input-sm {
        max-width: 160px;
    }

    .shp-skill-editor-input-error {
        border-color: var(--b3-theme-error) !important;
    }

    .shp-skill-editor-textarea {
        width: 100%;
        resize: vertical;
        min-height: 80px;
        font-family: inherit;
        font-size: 13px;
        line-height: 1.5;
    }

    .shp-skill-editor-error {
        font-size: 11px;
        color: var(--b3-theme-error);
    }

    .shp-skill-editor-section-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        padding-top: 0.5rem;
        border-top: 1px solid var(--b3-border-color);
        margin-top: 0.25rem;
    }

    .shp-skill-editor-hint {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
    }

    .shp-skill-editor-vars {
        padding: 0.5rem 0.65rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
        font-size: 11px;
        line-height: 1.6;
        color: var(--b3-theme-on-surface-light);
    }

    .shp-skill-editor-vars-title {
        font-weight: 600;
        color: var(--b3-theme-on-surface);
    }

    .shp-skill-editor-vars code {
        padding: 0.1rem 0.3rem;
        background: var(--b3-theme-surface-light);
        border-radius: 3px;
        font-size: 11px;
        color: var(--b3-theme-primary);
    }

    .shp-skill-editor-vars-hint {
        display: block;
        margin-top: 0.3rem;
        font-size: 10px;
        opacity: 0.8;
    }

    .shp-skill-editor-footer {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        padding: 0.65rem 1rem;
        border-top: 1px solid var(--b3-border-color);
    }
</style>
