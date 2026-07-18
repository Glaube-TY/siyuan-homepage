<script lang="ts">
  import type { KbChatAvatarSettings } from "../../types/settings";
  import { parseDocIcon } from "@/components/tools/docIcon";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";

  export let role: "user" | "assistant" | "error" | "loading";
  export let avatar: KbChatAvatarSettings | undefined = undefined;

  $: effectiveAvatar =
    role === "user" || role === "assistant" ? avatar ?? { kind: "default" as const } : { kind: "default" as const };
  $: parsedEmoji = effectiveAvatar.kind === "emoji" ? parseDocIcon(effectiveAvatar.emoji) : null;
  $: imageSrc =
    effectiveAvatar.kind === "image" && effectiveAvatar.imageDataUrl?.startsWith("data:image/")
      ? effectiveAvatar.imageDataUrl
      : "";

  function getDefaultIconName(): string {
    if (role === "user") return "iconAccount";
    if (role === "assistant") return "iconNotebrain";
    if (role === "error") return "iconInfo";
    return "iconClock";
  }
</script>

<span class="chat-avatar" class:custom={effectiveAvatar.kind !== "default"} aria-hidden="true">
  {#if imageSrc}
    <img src={imageSrc} alt="" />
  {:else if parsedEmoji?.type === "image"}
    <img src={parsedEmoji.value} alt="" />
  {:else if parsedEmoji?.type === "text"}
    <span class="chat-avatar-text">{parsedEmoji.value}</span>
  {:else}
    <SiyuanIcon name={getDefaultIconName()} size={16} />
  {/if}
</span>

<style lang="scss">
  .chat-avatar {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: 50%;
    color: var(--b3-theme-on-surface-light, #6b7280);
    overflow: hidden;
  }

  .chat-avatar.custom {
    background: var(--b3-theme-background-light, rgba(0, 0, 0, 0.04));
  }

  .chat-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
    display: block;
  }

  .chat-avatar-text {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    font-size: 17px;
    line-height: 1;
  }
</style>
