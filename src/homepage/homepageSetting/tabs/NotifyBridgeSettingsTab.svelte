<script lang="ts">
  /** @deprecated 保留旧文件名兼容；真实页面为 NotificationCenterSettingsTab。 */
  import NotificationCenterSettingsTab from "./NotificationCenterSettingsTab.svelte";
  interface Props { plugin: any; advancedEnabled: boolean; }
  let { plugin, advancedEnabled }: Props = $props();
</script>

<NotificationCenterSettingsTab {plugin} {advancedEnabled} />
