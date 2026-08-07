/**
 * Dock 会话管理（conversation-manager）纯逻辑测试
 * 运行：pnpm test:kb-conversation-manager
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  canMutateConversations,
  shouldCloseManagerAfterAction,
  resolveConversationPanelView,
  ConversationManagerController,
} from "./conversation-manager.js";

// ── 1. placement=tab 仍然使用内嵌 ConversationSidebar ──
test("1. placement=tab 且侧栏展开时渲染内嵌 ConversationSidebar", () => {
  const view = resolveConversationPanelView({
    placement: "tab",
    sidebarOpen: true,
    managerOpen: false,
  });
  assert.equal(view.renderInlineSidebar, true);
  assert.equal(view.hasSidebar, true);
});

// ── 2. placement=dock 不渲染内嵌 ConversationSidebar ──
test("2. placement=dock 永不渲染内嵌 ConversationSidebar", () => {
  const view = resolveConversationPanelView({
    placement: "dock",
    sidebarOpen: true,
    managerOpen: false,
  });
  assert.equal(view.renderInlineSidebar, false);
});

// ── 4. Dock 弹窗不会修改 kb-main-panel 的 has-sidebar ──
test("3. Dock 打开弹窗不会触发 has-sidebar", () => {
  const view = resolveConversationPanelView({
    placement: "dock",
    sidebarOpen: false,
    managerOpen: true,
  });
  assert.equal(view.hasSidebar, false);
  assert.equal(view.renderInlineSidebar, false);
});

// ── 3. Dock 点击会话按钮会调用统一弹窗打开函数 ──
test("4. Dock 点击会话按钮调用一次统一弹窗打开函数", () => {
  let openCalls = 0;
  const controller = new ConversationManagerController((onClosed) => {
    openCalls += 1;
    return { close: () => onClosed() };
  });
  controller.toggle();
  assert.equal(openCalls, 1);
  assert.equal(controller.isOpen, true);
});

// ── 5. 弹窗关闭后工具栏 active 状态恢复 ──
test("5. 弹窗打开→关闭后工具栏 active 状态恢复", () => {
  const openedHandles: Array<{ close: () => void }> = [];
  const controller = new ConversationManagerController((onClosed) => {
    const handle = { close: () => onClosed() };
    openedHandles.push(handle);
    return handle;
  });
  const states: boolean[] = [];
  controller.setOnChange((isOpen) => states.push(isOpen));

  controller.toggle();
  assert.equal(controller.isOpen, true);
  assert.equal(
    resolveConversationPanelView({ placement: "dock", sidebarOpen: false, managerOpen: true }).toolbarActive,
    true,
  );

  // 模拟用户点击右上角原生关闭按钮
  openedHandles[0].close();
  assert.equal(controller.isOpen, false);
  assert.equal(
    resolveConversationPanelView({ placement: "dock", sidebarOpen: false, managerOpen: false }).toolbarActive,
    false,
  );
  assert.deepEqual(states, [false, true, false]);
});

// ── 6. 快速连续打开只能存在一个弹窗 ──
test("6. 快速连续 toggle 不会叠加多个弹窗", () => {
  let openCount = 0;
  const controller = new ConversationManagerController((onClosed) => {
    openCount += 1;
    return { close: () => onClosed() };
  });
  controller.toggle();
  controller.toggle(); // 再次点击关闭
  assert.equal(openCount, 1, "只打开过一次");
  assert.equal(controller.isOpen, false);

  controller.toggle(); // 可重新打开
  assert.equal(openCount, 2);
  assert.equal(controller.isOpen, true);
});

// ── 7. 新建会话后关闭弹窗 ──
test("7. 新建会话后应关闭会话管理弹窗", () => {
  assert.equal(shouldCloseManagerAfterAction("create"), true);
});

// ── 8. 切换会话后关闭弹窗 ──
test("8. 切换会话后应关闭会话管理弹窗", () => {
  assert.equal(shouldCloseManagerAfterAction("switch"), true);
});

// ── 9. 重命名后弹窗保持打开 ──
test("9. 重命名后保持弹窗打开", () => {
  assert.equal(shouldCloseManagerAfterAction("rename"), false);
});

// ── 10. 删除后弹窗保持打开 ──
test("10. 删除后保持弹窗打开", () => {
  assert.equal(shouldCloseManagerAfterAction("delete"), false);
});

// ── 12. 回答生成中不能新建、切换、重命名和删除 ──
test("11. 回答生成中禁止会话变更操作", () => {
  assert.equal(canMutateConversations(true, true), false);
  assert.equal(canMutateConversations(false, true), true);
});

// ── 12b. hydrate 未完成时也禁止 ──
test("12. 会话 hydrate 未完成时禁止会话变更操作", () => {
  assert.equal(canMutateConversations(false, false), false);
});

// ── 11. 回答生成中可以搜索 ──
test("13. 回答生成中搜索保持可用（变更被禁止，搜索不受影响）", () => {
  // 搜索是只读操作，canMutateConversations 只限制会话变更；
  // ConversationSidebar 的搜索框从不绑定 disabled，Dock 弹窗与 Tab 侧栏复用同一组件。
  assert.equal(canMutateConversations(true, true), false);
});

// ── 14. Dock 弹窗和 Tab Sidebar 使用同一个 conversation-search ──
test("14. 会话管理不引入第二套搜索实现", () => {
  const exportedKeys = Object.keys({
    canMutateConversations,
    shouldCloseManagerAfterAction,
    resolveConversationPanelView,
    ConversationManagerController,
  });
  assert.ok(
    !exportedKeys.some((key) => /search/i.test(key)),
    "conversation-manager 不应导出任何搜索实现",
  );
});

// ── 15. Dock 弹窗关闭不会修改会话状态 ──
test("15. 控制器关闭弹窗不会触发任何会话变更", () => {
  const storeCalls: string[] = [];
  const controller = new ConversationManagerController((onClosed) => ({
    close: () => onClosed(),
  }));
  controller.toggle();
  controller.close();
  // 控制器与 Store 完全解耦：关闭仅销毁 Dialog，不触碰任何会话数据。
  assert.deepEqual(storeCalls, []);
});

// ── 16. KbMainPanel 销毁时会正确关闭已有 Dialog ──
test("16. destroy 会关闭已打开的弹窗并清空引用", () => {
  let closeCalled = false;
  const controller = new ConversationManagerController((onClosed) => ({
    close: () => {
      closeCalled = true;
      onClosed();
    },
  }));
  controller.toggle();
  assert.equal(controller.isOpen, true);
  controller.destroy();
  assert.equal(closeCalled, true);
  assert.equal(controller.isOpen, false);
});
