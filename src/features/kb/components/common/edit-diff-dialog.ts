/**
 * Edit diff preview dialog opener.
 * Uses standard Siyuan Dialog with .b3-dialog__content + .b3-dialog__action.
 * Buttons live in the standard action bar, content scrolls, action is always visible.
 */

import { mount, unmount } from "svelte";
import { Dialog } from "siyuan";
import { constrainDialogToViewport } from "@/libs/dialog";
import type { EditDiffPreview } from "../../services/doc-content-edit/doc-content-edit-types";
import EditDiffDialogContent from "../common/edit-diff-dialog-content.svelte";

export function openEditDiffPreviewDialog(
  editDiffPreview: EditDiffPreview,
): Promise<{ type: "allow" } | { type: "deny"; reason: string }> {
  return new Promise((resolve) => {
    let resolved = false;
    let component: Record<string, any> | null = null;

    function doResolve(result: { type: "allow" } | { type: "deny"; reason: string }) {
      if (resolved) return;
      resolved = true;
      try {
        if (component) unmount(component);
        dialog.destroy();
      } catch {
        // best effort
      }
      resolve(result);
    }

    const dialog = new Dialog({
      title: editDiffPreview.title || "编辑确认",
      content: `<div class="b3-dialog__content" style="max-height: calc(100vh - 160px); overflow: auto; padding: 16px;">
    <div class="diff-mount-point" style="width: 100%; height: 100%; min-height: 200px;"></div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">取消</button>
    <div class="fn__space"></div>
    <button class="b3-button b3-button--text" id="diffConfirmBtn">确认执行</button>
</div>`,
      width: "960px",
    });
    constrainDialogToViewport(dialog);

    // Mount Svelte component into the content area
    const mountPoint: HTMLElement | null = dialog.element.querySelector(".diff-mount-point");
    if (mountPoint) {
      component = mount(EditDiffDialogContent, {
        target: mountPoint,
        props: { editDiffPreview },
      });
    }

    // Wire buttons
    const btns = dialog.element.querySelectorAll(".b3-button");
    const cancelBtn = btns[0] as HTMLButtonElement | undefined;
    const confirmBtn = btns[btns.length - 1] as HTMLButtonElement | undefined;

    let confirming = false;

    cancelBtn?.addEventListener("click", () => {
      doResolve({ type: "deny", reason: "用户取消了操作。" });
    });

    confirmBtn?.addEventListener("click", () => {
      if (confirming) return;
      confirming = true;
      confirmBtn.disabled = true;
      if (cancelBtn) cancelBtn.disabled = true;
      doResolve({ type: "allow" });
    });

    // Destroy callback: treat as cancel (X button / Escape)
    const origDestroy = dialog.destroy.bind(dialog);
    dialog.destroy = () => {
      doResolve({ type: "deny", reason: "用户取消了操作。" });
      origDestroy();
    };
  });
}
