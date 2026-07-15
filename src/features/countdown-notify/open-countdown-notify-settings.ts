import { mount } from "svelte";
import { showMessage } from "siyuan";
import { svelteDialog } from "@/libs/dialog";
import {
  isNotificationCenterFeatureAvailable,
  NOTIFICATION_CENTER_PREMIUM_REQUIRED_MESSAGE,
} from "@/features/notification-center/notification-center-plugin";
import CountdownNotifySettingsDialog from "./components/CountdownNotifySettingsDialog.svelte";

export function openCountdownNotifySettingsDialog(advancedEnabled: boolean): void {
  if (!advancedEnabled || !isNotificationCenterFeatureAvailable()) {
    showMessage(NOTIFICATION_CENTER_PREMIUM_REQUIRED_MESSAGE, 4000, "error");
    return;
  }
  let close = () => undefined;
  const width = window.matchMedia("(max-width: 600px)").matches
    ? "calc(100vw - 24px)"
    : "min(920px, calc(100vw - 32px))";
  const ref = svelteDialog({
    title: "纪念日通知",
    width,
    height: "min(86vh, 900px)",
    constructor: (container) => mount(CountdownNotifySettingsDialog, { target: container, props: { advancedEnabled, onClose: () => close() } }),
  });
  close = ref.close;
}
