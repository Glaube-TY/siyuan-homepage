<script lang="ts">
    import { openSiyuanEmojiPicker } from '../emojiPicker';
    import { normalizeSiyuanDocIcon } from '@/components/tools/docIcon';
    import SettingSection from '@/libs/components/SettingSection.svelte';
    import SettingRow from '@/libs/components/SettingRow.svelte';
    import SiyuanIcon from '@/components/utils/shared/SiyuanIcon.svelte';
    import StatusVariableReferenceDialog from './StatusVariableReferenceDialog.svelte';
    import {
        DEFAULT_STATS_INFO_TEXT,
        DEFAULT_STATUS_AI_PROMPT,
        MAX_STATUS_AI_MAX_CHARS,
        MIN_STATUS_AI_MAX_CHARS,
        DEFAULT_STATUS_AI_STAT_KEYS,
        HOMEPAGE_STATUS_STAT_DEFINITIONS,
        normalizeStatusAiMaxChars,
        type HomepageStatusTextMode,
        type HomepageStatusStatKey,
    } from '@/homepage/status-text-config';
    import type { BannerGlassColorMode, HomepageTitleAlign, QuickButtonStyle } from '../config';

    let iconInputEl: HTMLInputElement | null = $state(null);
    let emojiButtonRef: HTMLButtonElement | null = $state(null);
    let showStatusVariableReference = $state(false);

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
        tempStatusAiStatKeys: HomepageStatusStatKey[];
        tempBannerEnabled: boolean;
        tempBannerTitleIntegrated: boolean;
        tempHomepageTitleAlign: HomepageTitleAlign;
        tempQuickButtonStyle: QuickButtonStyle;
        tempBannerTitleColor: string;
        tempBannerStatusColor: string;
        tempBannerButtonColor: string;
        tempBannerGlassEnabled: boolean;
        tempBannerGlassColorMode: BannerGlassColorMode;
        tempBannerGlassColor: string;
        tempBannerGlassOpacity: number;
        tempBannerGlassBlur: number;
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
        onTempStatusAiStatKeysChange: (value: HomepageStatusStatKey[]) => void;
        onTempBannerTitleIntegratedChange: (value: boolean) => void;
        onTempHomepageTitleAlignChange: (value: HomepageTitleAlign) => void;
        onTempQuickButtonStyleChange: (value: QuickButtonStyle) => void;
        onTempBannerTitleColorChange: (value: string) => void;
        onTempBannerStatusColorChange: (value: string) => void;
        onTempBannerButtonColorChange: (value: string) => void;
        onTempBannerGlassEnabledChange: (value: boolean) => void;
        onTempBannerGlassColorModeChange: (value: BannerGlassColorMode) => void;
        onTempBannerGlassColorChange: (value: string) => void;
        onTempBannerGlassOpacityChange: (value: number) => void;
        onTempBannerGlassBlurChange: (value: number) => void;
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
        tempStatusAiStatKeys,
        tempBannerEnabled,
        tempBannerTitleIntegrated,
        tempHomepageTitleAlign,
        tempQuickButtonStyle,
        tempBannerTitleColor,
        tempBannerStatusColor,
        tempBannerButtonColor,
        tempBannerGlassEnabled,
        tempBannerGlassColorMode,
        tempBannerGlassColor,
        tempBannerGlassOpacity,
        tempBannerGlassBlur,
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
        onTempStatusAiMaxCharsChange,
        onTempStatusAiStatKeysChange,
        onTempBannerTitleIntegratedChange,
        onTempHomepageTitleAlignChange,
        onTempQuickButtonStyleChange,
        onTempBannerTitleColorChange,
        onTempBannerStatusColorChange,
        onTempBannerButtonColorChange,
        onTempBannerGlassEnabledChange,
        onTempBannerGlassColorModeChange,
        onTempBannerGlassColorChange,
        onTempBannerGlassOpacityChange,
        onTempBannerGlassBlurChange
    }: Props = $props();

    const statusStatGroups = [
        { key: "time_notes", label: "时间与笔记" },
        { key: "structure", label: "内容结构" },
        { key: "tasks", label: "任务情况" },
    ] as const;

    function setStatusStatSelected(key: HomepageStatusStatKey, selected: boolean): void {
        const next = new Set(tempStatusAiStatKeys);
        selected ? next.add(key) : next.delete(key);
        onTempStatusAiStatKeysChange(HOMEPAGE_STATUS_STAT_DEFINITIONS.map((item) => item.key).filter((item) => next.has(item)));
    }

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

<SettingSection title="标题区域外观">
    {#if !advancedEnabled}
        <div class="title-appearance-vip-note">
            <SiyuanIcon name="vip" size={14} />
            <span>标题融入横幅、标题对齐、快捷按钮样式和横幅毛玻璃为会员专属。会员过期后会按默认主页样式显示，已保存的设置会保留。</span>
        </div>
    {/if}

    <SettingRow
        title="标题融入横幅"
        description={!advancedEnabled ? "会员专属，当前按默认样式显示" : tempBannerEnabled ? "开启后，主页标题、状态语和快捷按钮会显示在横幅图片内" : "开启横幅后可用"}
    >
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={tempBannerEnabled && tempBannerTitleIntegrated}
            disabled={!advancedEnabled || !tempBannerEnabled}
            onchange={(e) => onTempBannerTitleIntegratedChange((e.currentTarget as HTMLInputElement).checked)}
        />
    </SettingRow>

    <SettingRow title="标题对齐方式" description={!advancedEnabled ? "会员专属，当前按居中显示" : "同时影响标题、状态语和快捷按钮组"}>
        <select
            class="control-sm"
            value={tempHomepageTitleAlign}
            disabled={!advancedEnabled}
            onchange={(e) => onTempHomepageTitleAlignChange((e.currentTarget as HTMLSelectElement).value as HomepageTitleAlign)}
        >
            <option value="left">左对齐</option>
            <option value="center">居中</option>
            <option value="right">右对齐</option>
        </select>
    </SettingRow>

    <SettingRow title="快捷按钮样式" description={!advancedEnabled ? "会员专属，当前按默认按钮样式显示" : "仅影响主页标题区域的快捷按钮"}>
        <select
            class="control-sm"
            value={tempQuickButtonStyle}
            disabled={!advancedEnabled}
            onchange={(e) => onTempQuickButtonStyleChange((e.currentTarget as HTMLSelectElement).value as QuickButtonStyle)}
        >
            <option value="default">默认</option>
            <option value="flat">扁平</option>
            <option value="glass">毛玻璃</option>
        </select>
    </SettingRow>

    {#if tempBannerEnabled && tempBannerTitleIntegrated}
        <SettingRow title="横幅内标题颜色" description="标题融入横幅时使用">
            <input
                type="color"
                class="banner-color-input"
                value={tempBannerTitleColor}
                disabled={!advancedEnabled}
                oninput={(e) => onTempBannerTitleColorChange((e.currentTarget as HTMLInputElement).value)}
            />
        </SettingRow>

        <SettingRow title="横幅内状态语颜色" description="状态语融入横幅时使用">
            <input
                type="color"
                class="banner-color-input"
                value={tempBannerStatusColor}
                disabled={!advancedEnabled}
                oninput={(e) => onTempBannerStatusColorChange((e.currentTarget as HTMLInputElement).value)}
            />
        </SettingRow>

        <SettingRow title="横幅内按钮颜色" description="快捷按钮文字和边框颜色">
            <input
                type="color"
                class="banner-color-input"
                value={tempBannerButtonColor}
                disabled={!advancedEnabled}
                oninput={(e) => onTempBannerButtonColorChange((e.currentTarget as HTMLInputElement).value)}
            />
        </SettingRow>

        <SettingRow title="横幅毛玻璃层" description={!advancedEnabled ? "会员专属，当前不显示毛玻璃层" : "在横幅图片和标题内容之间增加可调毛玻璃层"}>
            <input
                type="checkbox"
                class="b3-switch fn__flex-center"
                checked={tempBannerGlassEnabled}
                disabled={!advancedEnabled}
                onchange={(e) => onTempBannerGlassEnabledChange((e.currentTarget as HTMLInputElement).checked)}
            />
        </SettingRow>

        {#if tempBannerGlassEnabled}
            <SettingRow title="毛玻璃颜色来源" description="可随思源主题，也可使用自定义颜色">
                <select
                    class="control-sm"
                    value={tempBannerGlassColorMode}
                    disabled={!advancedEnabled}
                    onchange={(e) => onTempBannerGlassColorModeChange((e.currentTarget as HTMLSelectElement).value as BannerGlassColorMode)}
                >
                    <option value="theme">随思源主题</option>
                    <option value="custom">自定义颜色</option>
                </select>
            </SettingRow>

            {#if tempBannerGlassColorMode === "custom"}
                <SettingRow title="毛玻璃颜色" description="自定义毛玻璃层底色">
                    <input
                        type="color"
                        class="banner-color-input"
                        value={tempBannerGlassColor}
                        disabled={!advancedEnabled}
                        oninput={(e) => onTempBannerGlassColorChange((e.currentTarget as HTMLInputElement).value)}
                    />
                </SettingRow>
            {/if}

            <SettingRow title="毛玻璃浓度" description={`${tempBannerGlassOpacity}%`}>
                <input
                    type="range"
                    class="banner-range-input"
                    min="0"
                    max="80"
                    step="1"
                    value={tempBannerGlassOpacity}
                    disabled={!advancedEnabled}
                    oninput={(e) => onTempBannerGlassOpacityChange(Number((e.currentTarget as HTMLInputElement).value))}
                />
            </SettingRow>

            <SettingRow title="模糊强度" description={`${tempBannerGlassBlur}px`}>
                <input
                    type="range"
                    class="banner-range-input"
                    min="0"
                    max="40"
                    step="1"
                    value={tempBannerGlassBlur}
                    disabled={!advancedEnabled}
                    oninput={(e) => onTempBannerGlassBlurChange(Number((e.currentTarget as HTMLInputElement).value))}
                />
            </SettingRow>
        {/if}
    {/if}
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
            <div class="status-secondary-actions">
                <button type="button" title="查看状态语可用变量" aria-label="查看状态语可用变量" onclick={() => showStatusVariableReference = true}>查看变量</button>
                <button type="button" title="恢复默认状态语" aria-label="恢复默认状态语" onclick={() => onTempStatsTextChange(DEFAULT_STATS_INFO_TEXT)}>恢复默认</button>
            </div>
        </SettingRow>
        <textarea
            class="stats-textarea"
            rows="4"
            value={tempStatsText}
            oninput={(e) => onTempStatsTextChange((e.currentTarget as HTMLTextAreaElement).value)}
            placeholder="输入自定义状态语句"
        ></textarea>
        <p class="stats-index-hint">文档、内容块、字数和内容结构变量需要先在「检索管理」中建立统计索引；任务变量使用强化日记任务索引。</p>
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
            <div class="ai-prompt-control">
                <textarea
                    class="ai-prompt-textarea control-full"
                    rows="4"
                    value={tempStatusAiPrompt}
                    oninput={(e) => onTempStatusAiPromptChange((e.currentTarget as HTMLTextAreaElement).value)}
                    placeholder="例如：简短、温和，像给自己的提醒"
                ></textarea>
                <button type="button" class="status-secondary-button" title="恢复默认 AI 提示语" aria-label="恢复默认 AI 提示语" onclick={() => onTempStatusAiPromptChange(DEFAULT_STATUS_AI_PROMPT)}>恢复默认提示语</button>
            </div>
        </SettingRow>
        <div class="status-stat-selector">
            <div class="status-stat-selector-header">
                <div>
                    <strong>发送给 AI 的统计数据</strong>
                    <span>已选择 {tempStatusAiStatKeys.length} 项</span>
                </div>
                <div class="status-stat-actions">
                    <button type="button" onclick={() => onTempStatusAiStatKeysChange(HOMEPAGE_STATUS_STAT_DEFINITIONS.map((item) => item.key))}>全选</button>
                    <button type="button" onclick={() => onTempStatusAiStatKeysChange([])}>清空</button>
                    <button type="button" onclick={() => onTempStatusAiStatKeysChange([...DEFAULT_STATUS_AI_STAT_KEYS])}>恢复默认</button>
                </div>
            </div>
            <div class="status-stat-groups">
                {#each statusStatGroups as group}
                    <fieldset>
                        <legend>{group.label}</legend>
                        <div class="status-stat-options">
                            {#each HOMEPAGE_STATUS_STAT_DEFINITIONS.filter((item) => item.group === group.key) as item}
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={tempStatusAiStatKeys.includes(item.key)}
                                        onchange={(event) => setStatusStatSelected(item.key, (event.currentTarget as HTMLInputElement).checked)}
                                    />
                                    <span>{item.label}</span>
                                </label>
                            {/each}
                        </div>
                    </fieldset>
                {/each}
            </div>
            <p>只会读取并发送已勾选的统计数字，不读取笔记正文。未勾选的数据不会进入 AI 请求。</p>
        </div>
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

{#if showStatusVariableReference}
    <StatusVariableReferenceDialog onClose={() => showStatusVariableReference = false} />
{/if}

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
        background: var(--b3-list-hover);
        border-color: var(--b3-theme-primary);
    }
    .icon-preview-small {
        width: 32px;
        height: 32px;
        object-fit: cover;
    }
    .banner-color-input {
        width: 40px;
        height: 28px;
        padding: 0;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: transparent;
        cursor: pointer;
    }
    .banner-range-input {
        width: min(220px, 100%);
        accent-color: var(--b3-theme-primary);
    }
    .title-appearance-vip-note {
        display: flex;
        align-items: flex-start;
        gap: 0.45rem;
        margin-bottom: 0.75rem;
        padding: 0.6rem 0.7rem;
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 28%, var(--b3-border-color));
        border-radius: 6px;
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, var(--b3-theme-surface));
        color: var(--b3-theme-on-surface);
        font-size: 12px;
        line-height: 1.5;
    }
    .title-appearance-vip-note :global(svg) {
        flex: 0 0 auto;
        margin-top: 2px;
        color: var(--b3-theme-primary);
    }
    .status-secondary-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.45rem; }
    .status-secondary-actions button, .status-secondary-button { padding: 0.35rem 0.65rem; border: 1px solid var(--b3-border-color); border-radius: 5px; background: var(--b3-theme-surface); color: var(--b3-theme-on-surface); font-size: 12px; cursor: pointer; }
    .status-secondary-actions button:hover, .status-secondary-button:hover { border-color: var(--b3-theme-primary); color: var(--b3-theme-primary); background: var(--b3-list-hover); }
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
    .stats-index-hint { margin: 0.4rem 0 0; color: var(--b3-theme-on-surface-light); font-size: 11px; line-height: 1.5; }
    .ai-prompt-control { display: flex; width: 100%; flex-direction: column; align-items: flex-end; gap: 0.45rem; }
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
    .status-stat-selector { margin-top: 0.75rem; padding: 0.75rem; border: 1px solid var(--b3-border-color); border-radius: 8px; }
    .status-stat-selector-header, .status-stat-selector-header > div, .status-stat-actions { display: flex; align-items: center; gap: 0.5rem; }
    .status-stat-selector-header { justify-content: space-between; flex-wrap: wrap; }
    .status-stat-selector-header span, .status-stat-selector p { font-size: 12px; color: var(--b3-theme-on-surface-light); }
    .status-stat-actions button { border: 1px solid var(--b3-border-color); border-radius: 5px; padding: 0.25rem 0.5rem; background: var(--b3-theme-surface); color: var(--b3-theme-on-surface); cursor: pointer; }
    .status-stat-groups { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.65rem; margin-top: 0.75rem; }
    .status-stat-groups fieldset { min-width: 0; margin: 0; padding: 0.5rem; border: 1px solid var(--b3-border-color); border-radius: 6px; }
    .status-stat-groups legend { padding: 0 0.25rem; font-size: 12px; font-weight: 600; }
    .status-stat-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.35rem; }
    .status-stat-options label { display: flex; align-items: center; gap: 0.3rem; min-width: 0; font-size: 12px; cursor: pointer; }
    .status-stat-options input { accent-color: var(--b3-theme-primary); }
    @media (max-width: 760px) { .status-stat-groups { grid-template-columns: 1fr; } }
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
