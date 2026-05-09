<script lang="ts">
    import { openSiyuanEmojiPicker } from "@/homepage/homepageSetting/emojiPicker";
    import DocIconPreview from "@/components/utils/widgetBlock/shared/DocIconPreview.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        title?: string;
        description?: string;
        value?: string;
        fallback?: string;
        buttonTitle?: string;
    }

    let {
        title = "图标选择",
        description = "",
        value = $bindable(""),
        fallback = "📄",
        buttonTitle = "点击选择图标"
    }: Props = $props();

    let buttonRef: HTMLButtonElement | null = $state(null);

    function handleSelect() {
        if (buttonRef) {
            openSiyuanEmojiPicker(buttonRef, (emoji) => {
                value = emoji;
            });
        }
    }
</script>

<SettingRow {title} {description}>
    <button
        type="button"
        class="emoji-btn"
        bind:this={buttonRef}
        onclick={handleSelect}
        title={buttonTitle}
    >
        <DocIconPreview {value} {fallback} />
    </button>
</SettingRow>
