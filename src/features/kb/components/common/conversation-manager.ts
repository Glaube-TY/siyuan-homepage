/**
 * AI 知识库 Dock 会话管理弹窗的纯逻辑与单实例控制器。
 *
 * 只包含展示决策与弹窗生命周期控制，不依赖 Svelte / Dialog / Store，
 * 方便在 node 环境下做纯逻辑测试。
 *
 * Dock 侧边栏用统一 svelteDialog 弹窗管理会话；tab/mobile 仍使用内嵌侧栏。
 * 会话数据、持久化、搜索仍全部由 kbSessionStore / conversation-search 复用。
 */

export type ConversationPanelPlacement = "dock" | "tab" | "mobile";

export type ConversationManagerAction = "create" | "switch" | "rename" | "delete";

/**
 * 新建/切换会话成功后应关闭 Dock 会话管理弹窗；
 * 重命名/删除后保持弹窗打开（列表实时更新）。
 */
export function shouldCloseManagerAfterAction(action: ConversationManagerAction): boolean {
  return action === "create" || action === "switch";
}

/**
 * 会话变更操作（新建/切换/重命名/删除）是否可用：
 * - 回答生成中（asking）禁止；
 * - 会话尚未 hydrate 完成前禁止。
 * 搜索是只读操作，不经过本函数，永远不会随 asking 禁用。
 */
export function canMutateConversations(asking: boolean, hydrationReady: boolean): boolean {
  return !asking && hydrationReady;
}

export interface ConversationPanelViewInput {
  placement: ConversationPanelPlacement;
  sidebarOpen: boolean;
  managerOpen: boolean;
}

export interface ConversationPanelView {
  /** 是否在 kb-main-panel 内部渲染内嵌 ConversationSidebar */
  renderInlineSidebar: boolean;
  /** 是否给 kb-main-panel 加 has-sidebar class（仅实际存在内嵌侧栏时） */
  hasSidebar: boolean;
  /** 顶部"会话历史"按钮 active 状态 */
  toolbarActive: boolean;
  /** 顶部按钮 title */
  buttonTitle: string;
}

/**
 * 由 placement 与内嵌侧栏/弹窗状态推导面板展示决策：
 * - Dock：不渲染内嵌侧栏、不压缩主聊天区，会话管理由弹窗承担；
 * - tab / mobile：保持原内嵌侧栏逻辑。
 */
export function resolveConversationPanelView(input: ConversationPanelViewInput): ConversationPanelView {
  const isDock = input.placement === "dock";
  const open = isDock ? input.managerOpen : input.sidebarOpen;
  return {
    renderInlineSidebar: !isDock && input.sidebarOpen,
    hasSidebar: !isDock && input.sidebarOpen,
    toolbarActive: open,
    buttonTitle: open ? "关闭会话列表" : "打开会话列表",
  };
}

export interface ConversationManagerDialogHandle {
  close: () => void;
}

/**
 * Dock 会话管理弹窗的单实例控制器。
 * - 同一时刻最多存在一个弹窗（快速连续点击不会叠加）；
 * - toggle 关闭、原生关闭按钮、面板销毁三条路径都能正确关闭；
 * - 通过 onChange 通知外部同步工具栏 active 状态。
 * 打开动作通过依赖注入提供，控制器本身不接触 Svelte / Dialog / Store。
 */
export class ConversationManagerController {
  private handle: ConversationManagerDialogHandle | null = null;
  private onChange: (isOpen: boolean) => void = () => {};

  constructor(
    private readonly openDialog: (onClosed: () => void) => ConversationManagerDialogHandle,
  ) {}

  get isOpen(): boolean {
    return this.handle !== null;
  }

  /** 订阅打开状态变化；立即回调一次当前状态。 */
  setOnChange(callback: (isOpen: boolean) => void): void {
    this.onChange = callback;
    callback(this.isOpen);
  }

  toggle(): void {
    if (this.handle) {
      this.close();
      return;
    }
    this.handle = this.openDialog(() => {
      // 弹窗被任何方式关闭（原生关闭按钮 / toggle 关闭 / destroy）时清空引用。
      if (this.handle) {
        this.handle = null;
        this.onChange(false);
      }
    });
    this.onChange(true);
  }

  close(): void {
    if (!this.handle) return;
    const handle = this.handle;
    // 先清引用再 close，防止 svelteDialog callback 重入重复通知。
    this.handle = null;
    handle.close();
    this.onChange(false);
  }

  /** 面板/插件销毁时关闭弹窗并清空引用，不留下孤立组件。 */
  destroy(): void {
    this.close();
  }
}
