<script lang="ts">
    import { openSiyuanEmojiPicker } from '../emojiPicker';
    import { normalizeSiyuanDocIcon } from '@/components/tools/docIcon';
    import SettingSection from '@/libs/components/SettingSection.svelte';
    import SettingRow from '@/libs/components/SettingRow.svelte';
    import SiyuanIcon from '@/components/utils/shared/SiyuanIcon.svelte';
    import {
        MAX_STATUS_AI_MAX_CHARS,
        MIN_STATUS_AI_MAX_CHARS,
        normalizeStatusAiMaxChars,
        type HomepageStatusTextMode,
    } from '@/homepage/status-text-config';

    let iconInputEl: HTMLInputElement | null = $state(null);
    let emojiButtonRef: HTMLButtonElement | null = $state(null);

    interface Props {
        tempShowTitleIcon: boolean;
        tempTitleIconType: string;
        tempTitleEmoji: string;
        tempTitleImage: string | null;
        tempTitleIconStyle: string;
        tempCustomTitleText: string;
        tempStatsText: string;
        tempStatusTextMode: HomepageStatusTextMode;
        tempStatusAiPrompt: string;
        tempStatusAiMaxChars: number;
        statusAiAvailableModelCount?: number;
        statusAiSelectedModelLabel?: string;
        advancedEnabled?: boolean;
        onTempShowTitleIconChange: (value: boolean) => void;
        onTempTitleIconTypeChange: (value: string) => void;
        onTempTitleEmojiChange: (value: string) => void;
        onTempTitleImageChange: (value: string | null) => void;
        onTempTitleIconStyleChange: (value: string) => void;
        onTempCustomTitleTextChange: (value: string) => void;
        onTempStatsTextChange: (value: string) => void;
        onTempStatusTextModeChange: (value: HomepageStatusTextMode) => void;
        onTempStatusAiPromptChange: (value: string) => void;
        onTempStatusAiMaxCharsChange: (value: number) => void;
    }

    let {
        tempShowTitleIcon,
        tempTitleIconType,
        tempTitleEmoji,
        tempTitleImage,
        tempTitleIconStyle,
        tempCustomTitleText,
        tempStatsText,
        tempStatusTextMode,
        tempStatusAiPrompt,
        tempStatusAiMaxChars,
        statusAiAvailableModelCount = 0,
        statusAiSelectedModelLabel = "",
        advancedEnabled = false,
        onTempShowTitleIconChange,
        onTempTitleIconTypeChange,
        onTempTitleEmojiChange,
        onTempTitleImageChange,
        onTempTitleIconStyleChange,
        onTempCustomTitleTextChange,
        onTempStatsTextChange,
        onTempStatusTextModeChange,
        onTempStatusAiPromptChange,
        onTempStatusAiMaxCharsChange
    }: Props = $props();

    function selectStatusTextMode(mode: HomepageStatusTextMode) {
        if (mode === "ai" && !advancedEnabled) return;
        onTempStatusTextModeChange(mode);
    }

    function handleStatusAiMaxCharsInput(event: Event) {
        const value = Number((event.currentTarget as HTMLInputElement).value);
        onTempStatusAiMaxCharsChange(normalizeStatusAiMaxChars(value));
    }

    function handleEmojiSelect() {
        if (emojiButtonRef) {
            openSiyuanEmojiPicker(emojiButtonRef, (emoji) => {
                onTempTitleEmojiChange(emoji);
            });
        }
    }

    function handleIconImageSelect(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            const file = input.files[0];
            const reader = new FileReader();

            reader.onload = function (e) {
                onTempTitleImageChange(e.target?.result as string);
            };

            reader.readAsDataURL(file);
        }
    }
</script>

<SettingSection title="标题图标">
    <SettingRow title="显示标题图标" description="在主页标题前显示图标">
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={tempShowTitleIcon}
            onchange={(e) => onTempShowTitleIconChange((e.currentTarget as HTMLInputElement).checked)}
        />
    </SettingRow>

    {#if tempShowTitleIcon}
        <SettingRow title="图标类型" description="选择使用表情或自定义图片">
            <select
                class="control-sm"
                value={tempTitleIconType}
                onchange={(e) => onTempTitleIconTypeChange((e.currentTarget as HTMLSelectElement).value)}
            >
                <option value="emoji">表情</option>
                <option value="image">图片</option>
            </select>
        </SettingRow>

        {#if tempTitleIconType === "emoji"}
            <SettingRow title="选择表情" description="点击选择标题图标">
                <button
                    type="button"
                    class="emoji-display-btn"
                    bind:this={emojiButtonRef}
                    onclick={handleEmojiSelect}
                    aria-label="选择表情"
                >
                    {normalizeSiyuanDocIcon(tempTitleEmoji) || "😊"}
                </button>
            </SettingRow>
        {:else if tempTitleIconType === "image"}
            <SettingRow title="选择图片" description="从本地选择图标图片">
                <button
                    onclick={() => iconInputEl?.click()}
                    class="file-action-btn"
                >
                    <SiyuanIcon name="folder" size={14} />
                </button>
                <input
                    type="file"
                    accept="image/*"
                    bind:this={iconInputEl}
                    onchange={handleIconImageSelect}
                    style="display:none;"
                />
            </SettingRow>

            {#if tempTitleImage}
                <SettingRow title="图标样式" description="设置图标形状">
                    <img
                        src={tempTitleImage}
                        alt="预览"
                        class="icon-preview-small"
                        style="border-radius: {tempTitleIconStyle === 'square' ? '0%' : tempTitleIconStyle === 'round' ? '20%' : '50%'};"
                    />
                    <select
                        class="control-sm"
                        value={tempTitleIconStyle}
                        onchange={(e) => onTempTitleIconStyleChange((e.currentTarget as HTMLSelectElement).value)}
                    >
                        <option value="square">方形</option>
                        <option value="round">圆角</option>
                        <option value="circle">圆形</option>
                    </select>
                </SettingRow>
            {/if}
        {/if}
    {/if}
</SettingSection>

<SettingSection title="标题文字">
    <SettingRow title="自定义标题" description="设置主页标题文字">
        <input
            type="text"
            class="control-full"
            value={tempCustomTitleText}
            oninput={(e) => onTempCustomTitleTextChange((e.currentTarget as HTMLInputElement).value)}
            placeholder="例如：我的主页"
        />
    </SettingRow>
</SettingSection>

<SettingSection title="状态语">
    <SettingRow title="状态语来源" description="选择主页标题下方状态语的生成方式">
        <div class="status-mode-switch">
            <button
                type="button"
                class:selected={tempStatusTextMode === "custom"}
                onclick={() => selectStatusTextMode("custom")}
            >
                自定义
            </button>
            <button
                type="button"
                class:selected={tempStatusTextMode === "ai"}
                disabled={!advancedEnabled}
                onclick={() => selectStatusTextMode("ai")}
            >
                <span>AI 智能生成</span>
                <span class="vip-label"><SiyuanIcon name="vip" size={12} />会员专属</span>
            </button>
        </div>
    </SettingRow>

    {#if tempStatusTextMode === "custom"}
        <SettingRow title="自定义状态语" description="支持变量，点击查看可用变量">
            <a
                href="https://blog.glaube-ty.top/archives/019d2484-7d4f-7573-89dd-772a2c600e2b"
                target="_blank"
                class="help-link"
            >查看变量</a>
        </SettingRow>
        <textarea
            class="stats-textarea"
            rows="4"
            value={tempStatsText}
            oninput={(e) => onTempStatsTextChange((e.currentTarget as HTMLTextAreaElement).value)}
            placeholder="输入自定义状态语句"
        ></textarea>
    {:else if !advancedEnabled}
        <div class="status-ai-vip-card">
            <div class="status-ai-vip-title">
                <SiyuanIcon name="vip" size={16} />
                <span>AI 智能生成状态语是会员专属功能</span>
            </div>
            <p class="status-ai-vip-desc">
                开通后可根据记录天数、笔记数量和任务情况自动生成主页状态语，并支持自定义风格和长度。你已保存的 AI 状态语设置会保留，重新开通会员后可继续使用。
            </p>
            <div class="status-ai-vip-cta">请前往「会员服务」开通后使用</div>
        </div>
    {:else}
        <SettingRow title="生成提示语" description="控制 AI 状态语的风格和格式">
            <textarea
                class="ai-prompt-textarea control-full"
                rows="4"
                value={tempStatusAiPrompt}
                oninput={(e) => onTempStatusAiPromptChange((e.currentTarget as HTMLTextAreaElement).value)}
                placeholder="例如：简短、温和，像给自己的提醒"
            ></textarea>
        </SettingRow>
        <SettingRow title="返回字符上限" description={`限制最终显示长度，范围 ${MIN_STATUS_AI_MAX_CHARS}-${MAX_STATUS_AI_MAX_CHARS} 个字符`}>
            <input
                type="number"
                class="control-sm"
                min={MIN_STATUS_AI_MAX_CHARS}
                max={MAX_STATUS_AI_MAX_CHARS}
                value={tempStatusAiMaxChars}
                oninput={handleStatusAiMaxCharsInput}
                onblur={handleStatusAiMaxCharsInput}
            />
        </SettingRow>

        <div class="status-ai-notes">
            {#if statusAiAvailableModelCount <= 0}
                <div class="status-ai-note warning">
                    <SiyuanIcon name="warning" size={14} />
                    <span>尚未配置可用大模型。请先到「AI 知识库设置 → 大模型配置」添加模型，再到「AI 知识库」标签选择状态语模型。</span>
                </div>
            {:else if statusAiSelectedModelLabel}
                <div class="status-ai-note">
                    <SiyuanIcon name="settings" size={14} />
                    <span>当前状态语模型：{statusAiSelectedModelLabel}</span>
                </div>
            {:else}
                <div class="status-ai-note">
                    <SiyuanIcon name="settings" size={14} />
                    <span>使用的模型请在「AI 知识库」标签中选择。</span>
                </div>
            {/if}
            <div class="status-ai-note">
                <SiyuanIcon name="overview" size={14} />
                <span>AI 会使用当前统计数据生成状态语，不会读取正文内容。</span>
            </div>
        </div>
    {/if}
</SettingSection>

<style>
    .emoji-display-btn {
        width: 40px;
        height: 40px;
        font-size: 24px;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
    }
    .emoji-display-btn:hover {
        background: var(--b3-theme-hover);
        border-color: var(--b3-theme-primary);
    }
    .icon-preview-small {
        width: 32px;
        height: 32px;
        object-fit: cover;
    }
    .help-link {
        font-size: 12px;
        color: var(--b3-theme-primary);
        text-decoration: none;
    }
    .help-link:hover {
        text-decoration: underline;
    }
    .stats-textarea {
        width: 100%;
        margin-top: 0.5rem;
        padding: 0.75rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-surface);
        font-size: 14px;
        resize: vertical;
    }
    .status-mode-switch {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 0.5rem;
        width: 100%;
    }
    .status-mode-switch button {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        min-height: 32px;
        padding: 0 0.75rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        cursor: pointer;
        font-size: 13px;
        transition: all 0.2s ease;
    }
    .status-mode-switch button:hover:not(:disabled),
    .status-mode-switch button.selected {
        border-color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, var(--b3-theme-surface));
        color: var(--b3-theme-primary);
    }
    .status-mode-switch button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
    }
    .vip-label {
        display: inline-flex;
        align-items: center;
        gap: 0.2rem;
        font-size: 11px;
        line-height: 1;
        color: var(--b3-theme-primary);
    }
    .ai-prompt-textarea {
        min-height: 96px;
        padding: 0.65rem 0.75rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-surface);
        font-size: 14px;
        line-height: 1.5;
        resize: vertical;
        box-sizing: border-box;
    }
    .status-ai-notes {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-top: 0.75rem;
    }
    .status-ai-note {
        display: flex;
        align-items: flex-start;
        gap: 0.45rem;
        padding: 0.55rem 0.65rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        font-size: 12px;
        line-height: 1.5;
    }
    .status-ai-note :global(svg) {
        margin-top: 2px;
        color: var(--b3-theme-primary);
    }
    .status-ai-note.warning {
        border-color: color-mix(in srgb, var(--b3-theme-error) 35%, var(--b3-border-color));
        background: color-mix(in srgb, var(--b3-theme-error) 8%, var(--b3-theme-surface));
    }
    .status-ai-note.warning :global(svg) {
        color: var(--b3-theme-error);
    }
    .status-ai-vip-card {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        margin-top: 0.75rem;
        padding: 0.8rem 0.9rem;
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
    .status-ai-vip-cta {
        font-size: 12px;
        font-weight: 600;
        color: var(--b3-theme-primary);
    }
</style>
