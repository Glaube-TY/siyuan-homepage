import { mount } from "svelte";
import { showMessage } from "siyuan";
import { svelteDialog } from "@/libs/dialog";
import {
  isNotificationCenterFeatureAvailable,
  NOTIFICATION_CENTER_PREMIUM_REQUIRED_MESSAGE,
} from "@/features/notification-center/notification-center-plugin";
import FocusNotifySettingsDialog from "./components/FocusNotifySettingsDialog.svelte";

export function openFocusNotifySettingsDialog(advancedEnabled: boolean): void {
  if (!advancedEnabled || !isNotificationCenterFeatureAvailable()) {
    showMessage(NOTIFICATION_CENTER_PREMIUM_REQUIRED_MESSAGE, 4000, "error");
    return;
  }
  let close = () => undefined;
  const closeOnEntitlementUnavailable = () => close();
  window.addEventListener("homepage-advanced-unavailable", closeOnEntitlementUnavailable);
  const width = window.matchMedia("(max-width: 600px)").matches
    ? "calc(100vw - 24px)"
    : "min(920px, calc(100vw - 32px))";
  let ref: ReturnType<typeof svelteDialog>;
  try {
    ref = svelteDialog({
      title: "番茄钟通知",
      width,
      height: "min(86vh, 900px)",
      callback: () => window.removeEventListener("homepage-advanced-unavailable", closeOnEntitlementUnavailable),
      constructor: (container) => mount(FocusNotifySettingsDialog, {
        target: container,
        props: { advancedEnabled, onClose: () => close() },
      }),
    });
  } catch (error) {
    window.removeEventListener("homepage-advanced-unavailable", closeOnEntitlementUnavailable);
    throw error;
  }
  close = ref.close;
}
