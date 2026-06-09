<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        aiKbDockEnabled: boolean;
        aiKbTabEnabled: boolean;
        onAiKbDockEnabledChange: (value: boolean) => void;
        onAiKbTabEnabledChange: (value: boolean) => void;
    }

    let {
        aiKbDockEnabled,
        aiKbTabEnabled,
        onAiKbDockEnabledChange,
        onAiKbTabEnabledChange,
    }: Props = $props();
</script>

<SettingSection title="AI 知识库">
    <SettingRow
        title="开启侧边栏对话👑"
        description="在右侧侧边栏启用 AI 知识库对话入口"
    >
        <input
            class="b3-switch"
            type="checkbox"
            checked={aiKbDockEnabled}
            onchange={(e) => onAiKbDockEnabledChange(e.currentTarget.checked)}
        />
    </SettingRow>
    <SettingRow
        title="开启标签页对话👑"
        description="在左上角显示 AI 知识库标签页入口"
    >
        <input
            class="b3-switch"
            type="checkbox"
            checked={aiKbTabEnabled}
            onchange={(e) => onAiKbTabEnabledChange(e.currentTarget.checked)}
        />
    </SettingRow>
</SettingSection>
