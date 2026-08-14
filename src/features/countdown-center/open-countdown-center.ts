import { mount } from "svelte";
import { showMessage } from "siyuan";
import { isSiyuanMobileFrontend, svelteDialog } from "@/libs/dialog";
import CountdownCenterDialog from "./components/CountdownCenterDialog.svelte";
import type { OpenCountdownCenterOptions } from "./types";

export async function openCountdownCenterDialog(
  plugin: any,
  options: OpenCountdownCenterOptions = {},
): Promise<void> {
  if (!plugin?.ADVANCED) {
    showMessage(
      "纪念日中心为高级会员专属功能。已有本地数据会完整保留，续费后可继续使用。",
      5000,
      "info",
    );
    return;
  }
  try {
    const mobile = isSiyuanMobileFrontend();
    let ref: ReturnType<typeof svelteDialog>;
    ref = svelteDialog({
      title: "",
      mobileCloseControl: "content",
      width: "min(1280px, calc(100vw - 32px))",
      height: "min(820px, calc(100vh - 48px))",
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
