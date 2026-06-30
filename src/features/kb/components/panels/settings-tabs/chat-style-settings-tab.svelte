<script lang="ts">
  import type {
    KbChatAppearanceStyle,
    KbChatAvatarSettings,
    KbSettings,
  } from "../../../types/settings";
  import { DEFAULT_CHAT_APPEARANCE_SETTINGS } from "../../../constants/default-settings";
  import { openSiyuanEmojiPicker } from "@/homepage/homepageSetting/emojiPicker";
  import { parseDocIcon } from "@/components/tools/docIcon";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";

  export let settings: KbSettings;

  type AvatarTarget = "userAvatar" | "assistantAvatar";

  const MAX_AVATAR_DATA_URL_LENGTH = 1_572_864;

  const styleOptions: Array<{
    value: KbChatAppearanceStyle;
    label: string;
    desc: string;
    icon: string;
  }> = [
    { value: "default", label: "默认", desc: "气泡聊天界面。", icon: "iconFeedback" },
    { value: "minimal", label: "极简", desc: "居中窄栏，无头像，工具入口收进加号菜单。", icon: "iconAlignCenter" },
    { value: "prose", label: "正文极简", desc: "回答更接近正文排版，用户消息保留浅色小气泡。", icon: "iconFile" },
    { value: "card", label: "卡片风格", desc: "中性卡片视觉，边框和阴影更突出。", icon: "iconTheme" },
  ];
  const avatarTargets: AvatarTarget[] = ["userAvatar", "assistantAvatar"];

  let userImageInput: HTMLInputElement;
  let assistantImageInput: HTMLInputElement;
  let avatarError = "";

  $: chatAppearance = settings.chatAppearance ?? DEFAULT_CHAT_APPEARANCE_SETTINGS;

  function setStyle(style: KbChatAppearanceStyle): void {
    settings = {
      ...settings,
      chatAppearance: {
        ...chatAppearance,
        style,
      },
    };
  }

  function updateAvatar(target: AvatarTarget, avatar: KbChatAvatarSettings): void {
    avatarError = "";
    settings = {
      ...settings,
      chatAppearance: {
        ...chatAppearance,
        [target]: avatar,
      },
    };
  }

  function resetAppearance(): void {
    avatarError = "";
    settings = {
      ...settings,
      chatAppearance: {
        style: DEFAULT_CHAT_APPEARANCE_SETTINGS.style,
        userAvatar: { ...DEFAULT_CHAT_APPEARANCE_SETTINGS.userAvatar },
        assistantAvatar: { ...DEFAULT_CHAT_APPEARANCE_SETTINGS.assistantAvatar },
      },
    };
  }

  function openEmojiPicker(target: AvatarTarget, event: MouseEvent): void {
    const trigger = event.currentTarget as HTMLElement | null;
    if (!trigger) return;
    openSiyuanEmojiPicker(trigger, (emoji) => {
      const value = emoji.trim();
      if (!value) return;
      updateAvatar(target, { kind: "emoji", emoji: value });
    });
  }

  function openImagePicker(target: AvatarTarget): void {
    if (target === "userAvatar") {
      userImageInput?.click();
    } else {
      assistantImageInput?.click();
    }
  }

  function handleImageSelected(target: AvatarTarget, event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      avatarError = "请选择图片文件。";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl.startsWith("data:image/")) {
        avatarError = "图片格式无法识别。";
        return;
      }
      if (dataUrl.length > MAX_AVATAR_DATA_URL_LENGTH) {
        avatarError = "图片过大，请选择约 1.5MB 以内的图片。";
        return;
      }
      updateAvatar(target, { kind: "image", imageDataUrl: dataUrl });
    };
    reader.onerror = () => {
      avatarError = "读取图片失败，请重新选择。";
    };
    reader.readAsDataURL(file);
  }

  function avatarLabel(target: AvatarTarget): string {
    return target === "userAvatar" ? "自己头像" : "AI 头像";
  }

  function getAvatarPreview(avatar: KbChatAvatarSettings | undefined): {
    type: "default" | "text" | "image";
    value: string;
  } {
    if (!avatar || avatar.kind === "default") {
      return { type: "default", value: "" };
    }
    if (avatar.kind === "image" && avatar.imageDataUrl?.startsWith("data:image/")) {
      return { type: "image", value: avatar.imageDataUrl };
    }
    if (avatar.kind === "emoji") {
      const parsed = parseDocIcon(avatar.emoji);
      if (parsed) return parsed;
    }
    return { type: "default", value: "" };
  }
</script>

<div class="chat-style-settings-tab">
  <section class="settings-group">
    <div class="group-heading">
      <div>
        <h3 class="group-title">对话样式</h3>
        <p class="group-desc">切换聊天区和输入框的视觉风格。默认样式保持现有界面。</p>
      </div>
      <button type="button" class="reset-btn" on:click={resetAppearance}>恢复默认</button>
    </div>

    <div class="style-grid" role="radiogroup" aria-label="对话样式">
      {#each styleOptions as option}
        <button
          type="button"
          class="style-option"
          class:active={chatAppearance.style === option.value}
          on:click={() => setStyle(option.value)}
        >
          <span class="style-option-icon"><SiyuanIcon name={option.icon} size={16} /></span>
          <span class="style-option-copy">
            <span class="style-option-title">{option.label}</span>
            <span class="style-option-desc">{option.desc}</span>
          </span>
        </button>
      {/each}
    </div>
  </section>

  <section class="settings-group">
    <h3 class="group-title">头像</h3>
    <div class="avatar-grid">
      {#each avatarTargets as target}
        {@const avatar = chatAppearance[target]}
        {@const preview = getAvatarPreview(avatar)}
        <div class="avatar-card">
          <div class="avatar-card-header">
            <div class="avatar-preview">
              {#if preview.type === "image"}
                <img src={preview.value} alt="" />
              {:else if preview.type === "text"}
                <span>{preview.value}</span>
              {:else}
                <SiyuanIcon name={target === "userAvatar" ? "iconAccount" : "iconSparkles"} size={18} />
              {/if}
            </div>
            <div>
              <div class="avatar-title">{avatarLabel(target)}</div>
              <div class="avatar-desc">默认、表情或本地图片。</div>
            </div>
          </div>

          <div class="avatar-actions" role="group" aria-label={avatarLabel(target)}>
            <button
              type="button"
              class:active={avatar?.kind === "default"}
              on:click={() => updateAvatar(target, { kind: "default" })}
            >
              默认
            </button>
            <button
              type="button"
              class:active={avatar?.kind === "emoji"}
              on:click={(event) => openEmojiPicker(target, event)}
            >
              表情
            </button>
            <button
              type="button"
              class:active={avatar?.kind === "image"}
              on:click={() => openImagePicker(target)}
            >
              图片
            </button>
          </div>
        </div>
      {/each}
    </div>

    {#if avatarError}
      <div class="avatar-error">{avatarError}</div>
    {/if}

    <input
      class="hidden-file-input"
      bind:this={userImageInput}
      type="file"
      accept="image/*"
      on:change={(event) => handleImageSelected("userAvatar", event)}
    />
    <input
      class="hidden-file-input"
      bind:this={assistantImageInput}
      type="file"
      accept="image/*"
      on:change={(event) => handleImageSelected("assistantAvatar", event)}
    />
  </section>
</div>

<style lang="scss">
  @use '../_kb-tokens' as *;

  .chat-style-settings-tab {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: $kb-space-3xl;
  }

  .settings-group {
    display: flex;
    flex-direction: column;
    gap: $kb-space-md;
  }

  .group-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: $kb-space-md;
    padding-bottom: $kb-space-sm;
    border-bottom: 1px solid var(--b3-border-color, rgba(0, 0, 0, 0.12));
  }

  .group-title {
    margin: 0;
    font-size: $kb-fs-lg;
    font-weight: 600;
    color: var(--b3-theme-on-surface, #1f2329);
  }

  .group-desc {
    margin: 5px 0 0;
    color: var(--b3-theme-on-surface-light, #6b7280);
    font-size: $kb-fs-md;
    line-height: 1.5;
  }

  .reset-btn {
    flex-shrink: 0;
    min-height: 32px;
    padding: 0 12px;
    border: 1px solid var(--b3-border-color, rgba(0, 0, 0, 0.12));
    border-radius: $kb-radius-md;
    background: var(--b3-theme-background, #fff);
    color: var(--b3-theme-on-surface, #1f2329);
    cursor: pointer;
    font: inherit;
    font-size: $kb-fs-sm;
  }

  .style-grid,
  .avatar-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: $kb-space-md;
  }

  .style-option,
  .avatar-card {
    border: 1px solid var(--b3-border-color, rgba(0, 0, 0, 0.12));
    border-radius: $kb-radius-lg;
    background: var(--b3-theme-background, #fff);
    box-shadow: $kb-shadow-none;
  }

  .style-option {
    display: flex;
    align-items: flex-start;
    gap: $kb-space-sm;
    padding: 13px;
    text-align: left;
    color: var(--b3-theme-on-surface, #1f2329);
    cursor: pointer;
    font: inherit;
    transition:
      border-color $kb-dur-fast $kb-ease-out,
      background $kb-dur-fast $kb-ease-out,
      box-shadow $kb-dur-fast $kb-ease-out;

    &:hover,
    &.active {
      border-color: var(--b3-theme-primary, #3577f0);
      background: color-mix(in srgb, var(--b3-theme-primary, #3577f0) 8%, var(--b3-theme-background, #fff));
    }

    &.active {
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--b3-theme-primary, #3577f0) 35%, transparent);
    }
  }

  .style-option-icon {
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: 8px;
    background: var(--b3-theme-background-light, rgba(0, 0, 0, 0.04));
    color: var(--b3-theme-primary, #3577f0);
  }

  .style-option-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .style-option-title,
  .avatar-title {
    font-size: $kb-fs-md;
    font-weight: 650;
    color: var(--b3-theme-on-surface, #1f2329);
  }

  .style-option-desc,
  .avatar-desc {
    font-size: $kb-fs-sm;
    line-height: 1.45;
    color: var(--b3-theme-on-surface-light, #6b7280);
  }

  .avatar-card {
    padding: 13px;
    display: flex;
    flex-direction: column;
    gap: $kb-space-md;
  }

  .avatar-card-header {
    display: flex;
    align-items: center;
    gap: $kb-space-md;
  }

  .avatar-preview {
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--b3-theme-background-light, rgba(0, 0, 0, 0.04));
    color: var(--b3-theme-on-surface-light, #6b7280);
    overflow: hidden;
    font-size: 23px;
    line-height: 1;
  }

  .avatar-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
    display: block;
  }

  .avatar-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }

  .avatar-actions button {
    min-height: 32px;
    border: 1px solid var(--b3-border-color, rgba(0, 0, 0, 0.12));
    border-radius: $kb-radius-md;
    background: var(--b3-theme-background, #fff);
    color: var(--b3-theme-on-surface, #1f2329);
    cursor: pointer;
    font: inherit;
    font-size: $kb-fs-sm;

    &:hover,
    &.active {
      border-color: var(--b3-theme-primary, #3577f0);
      background: color-mix(in srgb, var(--b3-theme-primary, #3577f0) 9%, var(--b3-theme-background, #fff));
      color: var(--b3-theme-primary, #3577f0);
    }
  }

  .avatar-error {
    padding: 8px 10px;
    border-radius: $kb-radius-md;
    background: color-mix(in srgb, var(--b3-theme-error, #d23f31) 10%, transparent);
    color: var(--b3-theme-error, #d23f31);
    font-size: $kb-fs-sm;
    line-height: 1.45;
  }

  .hidden-file-input {
    display: none;
  }
</style>
