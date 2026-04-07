<script lang="ts">
    import "emoji-picker-element";
    import { calculateEmojiPickerPosition, bindEmojiPickerEvents } from '../emojiPicker';

    let iconInputEl: HTMLInputElement | null = $state(null);
    let showEmojiPicker = $state(false);
    let emojiPickerPosition = $state({ top: "0px", left: "0px" });
    let emojiPickerElement: HTMLElement | null = $state(null);
    let emojiPickerCleanup: (() => void) | null = $state(null);

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

    function openEmojiPicker(event: Event) {
        const button = event.currentTarget as HTMLElement;
        const position = calculateEmojiPickerPosition(button);
        if (!position) return;
        emojiPickerPosition = position;
        showEmojiPicker = true;
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

    $effect(() => {
        if (showEmojiPicker && emojiPickerElement) {
            emojiPickerCleanup = bindEmojiPickerEvents(emojiPickerElement, (emoji) => {
                onTempTitleEmojiChange(emoji);
                showEmojiPicker = false;
            });
        } else if (!showEmojiPicker && emojiPickerCleanup) {
            emojiPickerCleanup();
            emojiPickerCleanup = null;
        }
    });
</script>

<!-- 标题区域设置 -->
<div class="section-setting titleBlock-setting">
    <div class="title-setting">
        <div class="form-group">
            <label>
                <input
                    type="checkbox"
                    checked={tempShowTitleIcon}
                    onchange={(e) => onTempShowTitleIconChange((e.currentTarget as HTMLInputElement).checked)}
                />
                显示标题图标
            </label>
        </div>

        {#if tempShowTitleIcon === true}
            <!-- 图标选择与自定义标题容器 -->
            <div class="icon-and-title-container">
                <!-- 顶部图标设置 -->
                <div class="icon-selection">
                    <label for="title-icon-type"
                        >标题图标：</label
                    >
                    <select
                        id="title-icon-type"
                        value={tempTitleIconType}
                        onchange={(e) => onTempTitleIconTypeChange((e.currentTarget as HTMLSelectElement).value)}
                    >
                        <option value="emoji">表情</option>
                        <option value="image">图片</option>
                    </select>
                    {#if tempTitleIconType === "emoji"}
                        <button
                            id="emoji-picker-button"
                            type="button"
                            title="选择图标"
                            class="emoji-display"
                            onclick={openEmojiPicker}
                            aria-label="选择表情"
                        >
                            {tempTitleEmoji || "😊"}
                        </button>
                    {:else if tempTitleIconType === "image"}
                        <button
                            onclick={() => iconInputEl?.click()}
                            class="btn-select-file"
                            id="icon-image-input"
                            title="选择图标"
                            >选择图片</button
                        >

                        <input
                            type="file"
                            accept="image/*"
                            bind:this={iconInputEl}
                            onchange={handleIconImageSelect}
                            style="display:none;"
                        />
                    {/if}

                    {#if tempTitleIconType === "image" && tempTitleImage}
                        <img
                            src={tempTitleImage}
                            alt="图标预览"
                            title="图标预览"
                            class="title-icon-preview"
                            style="width: 32px; height: 32px; border-radius: {tempTitleIconStyle === 'square' ? '0%' : tempTitleIconStyle === 'round' ? '20%' : '50%'};"
                        />
                        <select
                            class="iconstyle"
                            value={tempTitleIconStyle}
                            onchange={(e) => onTempTitleIconStyleChange((e.currentTarget as HTMLSelectElement).value)}
                        >
                            <option value="square"
                                >方形</option
                            >
                            <option value="round"
                                >圆角</option
                            >
                            <option value="circle"
                                >圆形</option
                            >
                        </select>
                    {/if}
                </div>
                <!-- 底部标题输入 -->
                <div class="custom-title-input">
                    <label for="custom-title-input"
                        >标题文字：</label
                    >
                    <input
                        id="custom-title-input"
                        type="text"
                        value={tempCustomTitleText}
                        oninput={(e) => onTempCustomTitleTextChange((e.currentTarget as HTMLInputElement).value)}
                        placeholder="例如：我的主页"
                    />
                </div>
            </div>

            <!-- 表情弹窗 -->
            {#if showEmojiPicker}
                <button
                    class="emoji-picker-overlay-bg"
                    tabindex="0"
                    onclick={() => (showEmojiPicker = false)}
                    onkeydown={(e) => {
                        if (e.key === "Enter" || e.key === " ")
                            showEmojiPicker = false;
                    }}
                    aria-label="关闭表情选择器"
                ></button>

                <div
                    class="emoji-picker-modal"
                    style="top: {emojiPickerPosition.top}; left: {emojiPickerPosition.left};"
                    role="dialog"
                    aria-modal="true"
                >
                    <div class="emoji-picker-content">
                        <emoji-picker
                            bind:this={emojiPickerElement}
                        ></emoji-picker>
                    </div>
                </div>
            {/if}
        {/if}
    </div>

    <div class="stats-info-setting">
        <div>
            自定义状态语：<a
                href="https://blog.glaube-ty.top/archives/019d2484-7d4f-7573-89dd-772a2c600e2b"
                target="_blank"
                >查看可用变量（展开标题记快捷区）</a
            >
        </div>
        <textarea
            class="stats-info-text"
            value={tempStatsText}
            oninput={(e) => onTempStatsTextChange((e.currentTarget as HTMLTextAreaElement).value)}
            placeholder="输入自定义状态语句"
        ></textarea>
    </div>
</div>