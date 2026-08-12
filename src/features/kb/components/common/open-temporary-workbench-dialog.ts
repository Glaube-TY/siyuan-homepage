import { mount } from "svelte";
import { showMessage } from "siyuan";
import { svelteDialog } from "@/libs/dialog";
import { getTemporaryWorkbench } from "../../services/agent-workbench/tools/homepage/temporary-workbench-store";
import TemporaryWorkbenchView from "./temporary-workbench-view.svelte";

export async function openTemporaryWorkbenchDialog(id: string): Promise<void> {
  try {
    const workbench = await getTemporaryWorkbench(id);
    if (!workbench) {
      showMessage("该临时工作台已被删除或无法读取。", 3000, "error");
      return;
    }
    const result = svelteDialog({
      title: workbench.title,
      width: "min(960px, calc(100vw - 32px))",
      height: "min(760px, calc(100vh - 64px))",
      constructor: (container) => mount(TemporaryWorkbenchView, {
        target: container,
        props: { workbench },
      }),
    });
    result.dialog.element.classList.add("kb-temporary-workbench-dialog-host");
  } catch (error) {
    showMessage(`打开临时工作台失败：${error instanceof Error ? error.message : String(error)}`, 4000, "error");
  }
}
