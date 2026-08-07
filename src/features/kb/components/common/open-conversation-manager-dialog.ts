import { svelteDialog } from "@/libs/dialog";
import { mount } from "svelte";
import ConversationManagerDialog from "./ConversationManagerDialog.svelte";
import type { ConversationManagerDialogHandle } from "./conversation-manager";

/**
 * 打开 Dock "会话历史"管理弹窗（统一 svelteDialog 封装）。
 * - 标题"会话历史"，统一宽高，经 constrainDialogToViewport 限制在视口内；
 * - 弹窗被任意方式关闭（含右上角原生关闭按钮）时触发 onClosed；
 * - 只允许通过本函数创建，禁止自行 new Dialog 或手动 overlay。
 */
export function openConversationManagerDialog(options: {
  onClosed?: () => void;
} = {}): ConversationManagerDialogHandle {
  const result = svelteDialog({
    title: "会话历史",
    width: "min(560px, calc(100vw - 32px))",
    height: "min(680px, calc(100vh - 64px))",
    constructor: (container: HTMLElement) => {
      return mount(ConversationManagerDialog, {
        target: container,
        props: {
          onRequestClose: () => result.close(),
        },
      });
    },
    callback: () => {
      options.onClosed?.();
    },
  });
  result.dialog.element.classList.add("kb-conversation-manager-dialog-host");
  return { close: result.close };
}
