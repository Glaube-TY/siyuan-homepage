<script lang="ts">
    import { onMount } from "svelte";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        customTextInputValue?: string;
    }

    let { customTextInputValue = $bindable("") }: Props = $props();

    onMount(async () => {
        // 组件挂载时的初始化逻辑
        if (!customTextInputValue) {
            customTextInputValue = "";
        }
    });
</script>

<SettingSection>
    <SettingRow title="自定义文字内容" description="支持 Markdown 格式">
        <textarea
            placeholder="在这里输入你想要显示的自定义文字内容..."
            bind:value={customTextInputValue}
        ></textarea>
    </SettingRow>
</SettingSection>

<style lang="scss">
    textarea {
        width: 100%;
        max-width: 100%;
        min-height: 150px;
        padding: 0.6rem 0.8rem;
        border: 1px solid var(--b3-theme-border-color);
        border-radius: 6px;
        background-color: var(--b3-theme-background);
        font-size: 0.95rem;
        resize: vertical;
        font-family: inherit;
        box-sizing: border-box;
        transition: all 0.2s ease-in-out;

        &:focus {
            outline: none;
            border-color: var(--b3-theme-border-color);
            box-shadow: 0 1px 3px var(--b3-theme-primary);
        }

        &:hover {
            border-color: var(--b3-theme-border-color);
            box-shadow: 0 1px 3px var(--b3-theme-primary);
        }
    }
</style>
