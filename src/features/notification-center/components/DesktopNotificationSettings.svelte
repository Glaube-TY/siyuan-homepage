<script lang="ts">
  import { onMount } from "svelte";
  import SettingRow from "@/libs/components/SettingRow.svelte";
  import SettingSection from "@/libs/components/SettingSection.svelte";
  import type { NotificationCenterSettings } from "../types";
  import { getNotificationDeviceId, getDesktopNotificationPermission, isDesktopNotificationRuntime, type DesktopNotificationPermission } from "../notification-center-device";
  interface Props { value: NotificationCenterSettings["desktop"]; disabled?: boolean; onChange: (value: NotificationCenterSettings["desktop"]) => void; onTest: () => void | Promise<void>; }
  let { value, disabled = false, onChange, onTest }: Props = $props();
  const patch = (next: Partial<NotificationCenterSettings["desktop"]>) => onChange({ ...value, ...next });
  function permissionLabel(p: DesktopNotificationPermission): string {
    switch (p) {
      case "unsupported": return "不支持";
      case "default": return "未授权";
      case "granted": return "已授权";
      case "denied": return "已拒绝";
      default: return "未知";
    }
  }
  let permission = $state<DesktopNotificationPermission>("unknown");
  let runtimeAvailable = $state(false);
  const permissionStatus = $derived(permissionLabel(permission));
  function refreshPermission(): void {
    permission = getDesktopNotificationPermission();
    runtimeAvailable = isDesktopNotificationRuntime();
  }
  async function testDesktop(): Promise<void> {
    try {
      await onTest();
    } finally {
      refreshPermission();
    }
  }
  onMount(() => {
    refreshPermission();
    window.addEventListener("focus", refreshPermission);
    return () => window.removeEventListener("focus", refreshPermission);
  });
</script>
<SettingSection title="桌面系统通知">
  <SettingRow title="开启桌面系统通知" description="通过 Windows、macOS 或 Linux 的操作系统通知中心显示">
    <input type="checkbox" class="b3-switch fn__flex-center" checked={value.enabled} {disabled} onchange={(e) => patch({ enabled: e.currentTarget.checked })} />
  </SettingRow>
  <SettingRow title="通知权限" description="显示当前系统通知授权状态">
    <div class="shp-notification-inline">
      <span class="shp-notification-status">{runtimeAvailable ? permissionStatus : "当前前端不可用"}</span>
      <button type="button" class="b3-button b3-button--text" disabled={disabled || !value.enabled || !runtimeAvailable} onclick={testDesktop}>测试桌面通知</button>
    </div>
  </SettingRow>
  <SettingRow title="显示时长" description="通知自动关闭时间，单位为毫秒">
    <input type="number" class="b3-text-field control-sm" min="1000" max="60000" value={value.timeoutMs} {disabled} onchange={(e) => patch({ timeoutMs: Number(e.currentTarget.value) })} />
  </SettingRow>
  <SettingRow title="最大正文字数" description="超过限制的正文会自动截断">
    <input type="number" class="b3-text-field control-sm" min="50" max="5000" value={value.maxContentChars} {disabled} onchange={(e) => patch({ maxContentChars: Number(e.currentTarget.value) })} />
  </SettingRow>
  <SettingRow title="错误和紧急通知样式" description="为错误和紧急级别增加醒目的警示标识">
    <input type="checkbox" class="b3-switch fn__flex-center" checked={value.errorStyleForErrorLevel} {disabled} onchange={(e) => patch({ errorStyleForErrorLevel: e.currentTarget.checked })} />
  </SettingRow>
  <SettingRow title="当前设备" description="用于区分不同设备的通知运行环境">
    <span class="shp-notification-device-id">{getNotificationDeviceId().slice(0, 20)}</span>
  </SettingRow>
</SettingSection>

<style>
  .shp-notification-inline { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
  .shp-notification-status, .shp-notification-device-id { color: var(--b3-theme-on-surface); font-size: 12px; overflow-wrap: anywhere; }
</style>
