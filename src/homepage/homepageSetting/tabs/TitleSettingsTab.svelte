<script lang="ts">
    import { openSiyuanEmojiPicker } from '../emojiPicker';
    import { normalizeSiyuanDocIcon } from '@/components/tools/docIcon';
    import SettingSection from '@/libs/components/SettingSection.svelte';
    import SettingRow from '@/libs/components/SettingRow.svelte';

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
        onTempShowTitleIconChange: (value: boolean) => void;
        onTempTitleIconTypeChange: (value: string) => void;
        onTempTitleEmojiChange: (value: string) => void;
        onTempTitleImageChange: (value: string | null) => void;
        onTempTitleIconStyleChange: (value: string) => void;
        onTempCustomTitleTextChange: (value: string) => void;
        onTempStatsTextChange: (value: string) => void;
    }

    let {
        tempShowTitleIcon,
        tempTitleIconType,
        tempTitleEmoji,
        tempTitleImage,
        tempTitleIconStyle,
        tempCustomTitleText,
        tempStatsText,
        onTempShowTitleIconChange,
        onTempTitleIconTypeChange,
        onTempTitleEmojiChange,
        onTempTitleImageChange,
        onTempTitleIconStyleChange,
        onTempCustomTitleTextChange,
        onTempStatsTextChange
    }: Props = $props();

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
                >📁</button>
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
</style>