/**
 * Edit diff preview dialog opener.
 * 桌面端沿用思源 Dialog，移动端由项目全屏 Portal 承载。
 */

import { mount, unmount } from "svelte";
import { simpleDialog } from "@/libs/dialog";
import type { EditDiffPreview } from "../../services/doc-content-edit/doc-content-edit-types";
import EditDiffDialogContent from "../common/edit-diff-dialog-content.svelte";

export function openEditDiffPreviewDialog(
  editDiffPreview: EditDiffPreview,
): Promise<{ type: "allow" } | { type: "deny"; reason: string }> {
  return new Promise((resolve) => {
    let resolved = false;
    let component: Record<string, any> | null = null;
    let closeDialog = () => undefined;

    function doResolve(result: { type: "allow" } | { type: "deny"; reason: string }) {
      if (resolved) return;
      resolved = true;
      closeDialog();
      resolve(result);
    }

    const content = document.createElement("div");
    content.innerHTML = `<div class="b3-dialog__content" style="max-height: calc(100vh - 160px); overflow: auto; padding: 16px;">
    <div class="diff-mount-point" style="width: 100%; height: 100%; min-height: 200px;"></div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">取消</button>
    <div class="fn__space"></div>
    <button class="b3-button b3-button--text" id="diffConfirmBtn">确认执行</button>
</div>`;
    const result = simpleDialog({
      title: editDiffPreview.title || "编辑确认",
      ele: content,
      width: "960px",
      mobilePresentation: "workspace",
      callback: () => {
        if (component) unmount(component);
        if (!resolved) {
          resolved = true;
          resolve({ type: "deny", reason: "用户取消了操作。" });
        }
      },
    });
    closeDialog = result.close;

    // Mount Svelte component into the content area
    const mountPoint: HTMLElement | null = content.querySelector(".diff-mount-point");
    if (mountPoint) {
      component = mount(EditDiffDialogContent, {
        target: mountPoint,
        props: { editDiffPreview },
      });
    }

    // Wire buttons
    const btns = content.querySelectorAll(".b3-button");
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

  });
}
