<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";

    interface Props {
        customWebUrl?: string;
    }

    let { customWebUrl = $bindable("") }: Props = $props();
</script>

<SettingSection>
    <SettingRow title="网页地址" description="输入要显示的网页地址">
        <input
            type="text"
            bind:value={customWebUrl}
            placeholder="https://example.com"
            class="control-full"
        />
    </SettingRow>
</SettingSection>
