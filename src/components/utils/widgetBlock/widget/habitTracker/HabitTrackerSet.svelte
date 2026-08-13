<script lang="ts">
  import SettingSection from "@/libs/components/SettingSection.svelte";
  import SettingRow from "@/libs/components/SettingRow.svelte";

  interface Props { title?: string; maxVisible?: number }
  let { title = $bindable("习惯打卡"), maxVisible = $bindable(5) }: Props = $props();
</script>

<SettingSection title="组件显示">
  <SettingRow title="组件标题">
    <input class="control-lg" type="text" bind:value={title} maxlength="40" />
  </SettingRow>
  <SettingRow title="首页显示数量">
    <input class="control-sm" type="number" min="2" max="10" bind:value={maxVisible} />
  </SettingRow>
</SettingSection>
