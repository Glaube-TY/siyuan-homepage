import { mount } from "svelte";
import { showMessage } from "siyuan";
import { isSiyuanMobileFrontend, svelteDialog } from "@/libs/dialog";
import CountdownCenterDialog from "./components/CountdownCenterDialog.svelte";
import type { OpenCountdownCenterOptions } from "./types";
import {
  ensureHomepageEntitlementGranted,
  resolveHomepageEntitlementMessage,
} from "@/features/entitlement/homepage-entitlement";

export async function openCountdownCenterDialog(
  plugin: any,
  options: OpenCountdownCenterOptions = {},
): Promise<void> {
  if (!await ensureHomepageEntitlementGranted(plugin)) {
    showMessage(resolveHomepageEntitlementMessage("纪念日中心"), 5000, "error");
    return;
  }
  try {
    const mobile = isSiyuanMobileFrontend();
    let ref: ReturnType<typeof svelteDialog>;
    const closeOnEntitlementUnavailable = () => ref?.close();
    window.addEventListener("homepage-advanced-unavailable", closeOnEntitlementUnavailable);
    try {
      ref = svelteDialog({
        title: "",
        mobileCloseControl: "content",
        width: "min(1280px, calc(100vw - 32px))",
        height: "min(820px, calc(100vh - 48px))",
        callback: () => window.removeEventListener("homepage-advanced-unavailable", closeOnEntitlementUnavailable),
        constructor: (container) =>
          mount(CountdownCenterDialog, {
            target: container,
            props: {
              plugin,
              mobile,
              initialTab: options.initialTab ?? "overview",
              initialEventId: options.eventId,
              createNew: options.createNew === true,
              onClose: () => ref.close(),
            },
          }),
      });
    } catch (error) {
      window.removeEventListener("homepage-advanced-unavailable", closeOnEntitlementUnavailable);
      throw error;
    }
    ref.dialog.element.classList.add("countdown-center-dialog-host");
    if (mobile)
      ref.dialog.element.classList.add("countdown-center-dialog-host--mobile");
  } catch (error) {
    console.warn("[countdown-center] 打开失败", error);
    showMessage(
      error instanceof Error ? error.message : "纪念日中心打开失败",
      5000,
      "error",
    );
  }
}
