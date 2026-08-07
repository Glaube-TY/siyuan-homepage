import assert from "node:assert/strict";
import test from "node:test";

import { canSaveLayoutFromRestoreState } from "./layout-save-guard.ts";

test("完整恢复或没有状态标记时允许保存布局", () => {
    assert.equal(canSaveLayoutFromRestoreState(undefined), true);
    assert.equal(canSaveLayoutFromRestoreState("ready"), true);
});

test("存在无法恢复的历史组件时仍允许保存已恢复的布局", () => {
    assert.equal(canSaveLayoutFromRestoreState("degraded"), true);
});

test("恢复尚未完成或失败时拒绝保存布局", () => {
    assert.equal(canSaveLayoutFromRestoreState("incomplete"), false);
    assert.equal(canSaveLayoutFromRestoreState("fatal"), false);
    assert.equal(canSaveLayoutFromRestoreState("failed"), false);
});
