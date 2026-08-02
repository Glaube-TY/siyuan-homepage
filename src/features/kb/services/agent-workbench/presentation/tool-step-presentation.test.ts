import assert from "node:assert/strict";
import test from "node:test";

import { AGGREGATE_TOOL_CATALOG } from "../tools/aggregate/aggregate-tool-metadata";
import {
  formatToolArgsPreview,
  formatToolDisplayName,
  formatToolFailureSummary,
  formatToolResultSummary,
  formatWorkbenchProcessStats,
  resolveWorkbenchFinalStatus,
} from "./tool-step-presentation";

test("聚合工具的每个动作都有不含内部英文名的中文简称", () => {
  for (const tool of AGGREGATE_TOOL_CATALOG) {
    const familyName = formatToolDisplayName(tool.name);
    assert.doesNotMatch(familyName, /[A-Za-z_]/, `${tool.name} 的工具名称不应泄露内部英文名`);

    for (const action of tool.actions) {
      const displayName = formatToolDisplayName(tool.name, { action: action.name });
      assert.doesNotMatch(
        displayName,
        /[A-Za-z_]/,
        `${tool.name}.${action.name} 的动作名称不应泄露内部英文名`,
      );
      assert.notEqual(displayName, "调用扩展工具", `${tool.name}.${action.name} 应有明确中文名称`);
    }
  }
});

test("知识库和文档编辑动作显示准确中文简称", () => {
  assert.equal(formatToolDisplayName("siyuan_kb", { action: "search" }), "搜索知识库");
  assert.equal(formatToolDisplayName("siyuan_kb", { action: "read_docs" }), "读取文档正文");
  assert.equal(formatToolDisplayName("siyuan_doc_edit", { action: "rename_doc" }), "重命名文档");
  assert.equal(formatToolDisplayName("web_fetch", { action: "http_get" }), "读取网络数据");
});

test("未知工具使用中文安全回退，不回显内部名称", () => {
  const displayName = formatToolDisplayName("private_internal_tool_name");
  assert.equal(displayName, "调用扩展工具");
  assert.doesNotMatch(displayName, /private|internal|tool/i);
});

test("参数预览仅保留简短用户信息，不显示动作名、路径、指纹和正文", () => {
  const preview = formatToolArgsPreview({
    action: "replace_doc_content",
    innerAction: "unsafe_internal_action",
    query: "项目复盘",
    docId: "20260802123456-abcdefg",
    path: "private/source/file.ts",
    markdown: "const secret = true;",
    argsDigest: "abcdef123456",
    limit: 5,
  });

  assert.equal(preview, "关键词：“项目复盘”；文档：已指定；数量：5");
  assert.doesNotMatch(preview, /replace_doc_content|unsafe_internal_action|private\/source|secret|abcdef/);
});

test("结果摘要不会回显内部工具名或代码片段", () => {
  assert.equal(
    formatToolResultSummary("搜索知识库", "工具 siyuan_kb 执行成功。", "siyuan_kb"),
    "搜索知识库已完成。",
  );
  assert.equal(
    formatToolResultSummary("编辑文档", "返回 payload_data 与 `rawCode`。", "siyuan_doc_edit"),
    "编辑文档已完成。",
  );
  assert.equal(
    formatToolFailureSummary("编辑文档", "invalid_args: field docId", "siyuan_doc_edit", "invalid_action_args"),
    "编辑文档参数不符合要求。",
  );
  assert.equal(
    formatToolResultSummary("读取文档正文", "已读取 3 篇文档。", "siyuan_kb"),
    "已读取 3 篇文档。",
  );
});

test("处理过程统计显示调用数、成功数、失败数和最终状态", () => {
  const steps = [
    { isToolExecution: true, ok: true, running: false },
    { isToolExecution: true, ok: true, running: false },
    { isToolExecution: true, ok: false, running: false },
    { isToolExecution: false, ok: false, running: false },
  ];

  assert.equal(
    formatWorkbenchProcessStats(steps, { isGenerating: false, isComplete: true, doneStatus: "answer_ready" }),
    "工具 3 次 · 成功 2 · 失败 1 · 最终成功",
  );
  assert.equal(
    formatWorkbenchProcessStats(steps, { isGenerating: false, isComplete: false }),
    "工具 3 次 · 成功 2 · 失败 1 · 已停止",
  );
  assert.equal(
    formatWorkbenchProcessStats(
      [{ isToolExecution: true, running: true }],
      { isGenerating: true, isComplete: false },
    ),
    "工具 1 次 · 成功 0 · 失败 0 · 执行中",
  );
});

test("历史伪工具调用即使误存为 answer_ready 也显示最终失败", () => {
  assert.equal(resolveWorkbenchFinalStatus([
    {
      type: "assistant_final",
      message: "模型输出了伪工具调用格式，已拦截，请重试或更换模型。",
    },
    { type: "done", status: "answer_ready" },
  ]), "failed");

  assert.equal(resolveWorkbenchFinalStatus([
    { type: "error", code: "pseudo_tool_markup_blocked" },
    { type: "done", status: "failed" },
  ]), "failed");
});
