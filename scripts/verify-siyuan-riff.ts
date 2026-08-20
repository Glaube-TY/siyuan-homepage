import assert from "node:assert/strict";
import { siyuanRiffCardInputSchema } from "@/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-riff-card.contract";
import { executeSiyuanRiffCard } from "@/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-riff-card.impl";
import { createSiyuanRiffCardTool } from "@/features/kb/services/agent-workbench/tools/siyuan/siyuan-riff-card.tool";
import { buildToolPermissionPreview } from "@/features/kb/services/agent-core/permissions/write-preview-builder";
import { setSiyuanRuntimePort } from "@/runtime/siyuan-runtime-port";

console.log("==================================================");
console.log("Running siyuan_riff Card Contract Verifier");
console.log("==================================================");

let runtimePostCalls: Array<{ path: string; payload: unknown }> = [];

setSiyuanRuntimePort({
  post: async (path: string, payload: unknown) => {
    runtimePostCalls.push({ path, payload });
    if (path.includes("/api/riff/resetRiffCards")) {
      return { code: 0, msg: "", data: null };
    }
    if (path.includes("/api/riff/batchSetRiffCardsDueTime")) {
      return { code: 0, msg: "", data: null };
    }
    if (path.includes("/api/riff/getRiffCards")) {
      // Mock returning cards where due does not match requested due (simulating custom deck silent skip)
      return {
        code: 0,
        msg: "",
        data: {
          cards: [
            {
              id: "20260703221339-at4oz7a",
              due: "20260701000000",
            },
          ],
        },
      };
    }
    return { code: 0, msg: "", data: {} };
  },
});

const tool = createSiyuanRiffCardTool({
  executeSiyuanRiffCard: async (args) => executeSiyuanRiffCard(args),
});

// ==================================================
// Case 1: resetType=deck, id=deck-A, deckID 未传 -> 内部规范化 deckID=deck-A
// ==================================================
console.log("\n[Case 1] resetType=deck, id=deck-A, deckID 未传");
runtimePostCalls = [];
const parsedCase1 = siyuanRiffCardInputSchema.safeParse({
  action: "reset",
  resetType: "deck",
  id: "deck-test-A",
});
assert.equal(parsedCase1.success, true, "Case 1: Schema 校验必须通过");

const resultCase1 = await executeSiyuanRiffCard(parsedCase1.data);
assert.equal(resultCase1.output.action, "reset", "Case 1: 执行 action 必须为 reset");
assert.equal(runtimePostCalls.length, 1, "Case 1: 必须调用 1 次 resetRiffCards API");
assert.deepEqual(
  runtimePostCalls[0],
  {
    path: "/api/riff/resetRiffCards",
    payload: {
      type: "deck",
      id: "deck-test-A",
      deckID: "deck-test-A",
    },
  },
  "Case 1: Kernel Payload 必须是 type=deck, id=deck-test-A, deckID=deck-test-A",
);
console.log("Case 1 通过：deckID 成功自动派生为 id");

// ==================================================
// Case 2: resetType=deck, id=deck-A, deckID=deck-A -> 合法
// ==================================================
console.log("\n[Case 2] resetType=deck, id=deck-A, deckID=deck-A");
runtimePostCalls = [];
const parsedCase2 = siyuanRiffCardInputSchema.safeParse({
  action: "reset",
  resetType: "deck",
  id: "deck-test-A",
  deckID: "deck-test-A",
  blockIDs: ["20260703221339-block01"],
});
assert.equal(parsedCase2.success, true, "Case 2: Schema 校验必须通过");

const resultCase2 = await executeSiyuanRiffCard(parsedCase2.data);
assert.equal(resultCase2.output.action, "reset", "Case 2: 执行 action 必须为 reset");
assert.equal(runtimePostCalls.length, 1, "Case 2: 必须调用 1 次 resetRiffCards API");
assert.deepEqual(
  runtimePostCalls[0],
  {
    path: "/api/riff/resetRiffCards",
    payload: {
      type: "deck",
      id: "deck-test-A",
      deckID: "deck-test-A",
      blockIDs: ["20260703221339-block01"],
    },
  },
  "Case 2: Kernel Payload 保持一致",
);
console.log("Case 2 通过：显式一致的 deckID 正确传递");

// ==================================================
// Case 3: resetType=deck, id=deck-A, deckID=deck-B -> 调用前拒绝
// ==================================================
console.log("\n[Case 3] resetType=deck, id=deck-A, deckID=deck-B (mismatch)");
const parsedCase3 = siyuanRiffCardInputSchema.safeParse({
  action: "reset",
  resetType: "deck",
  id: "deck-test-A",
  deckID: "deck-test-B",
});
assert.equal(parsedCase3.success, false, "Case 3: Schema 校验必须拒绝 deckID 不一致");
const issues = parsedCase3.error?.issues ?? [];
assert.ok(
  issues.some((i) => i.message.includes("deckID 与 id 必须一致")),
  "Case 3: 必须返回明确的 mismatch 错误信息",
);

let implErrorCaught = false;
try {
  await executeSiyuanRiffCard({
    action: "reset",
    resetType: "deck",
    id: "deck-test-A",
    deckID: "deck-test-B",
  });
} catch (err: any) {
  implErrorCaught = true;
  assert.ok(err.message.includes("deckID 与 id 必须一致"), "Case 3: 执行层同样拒绝 mismatch");
}
assert.equal(implErrorCaught, true, "Case 3: 执行层必须拦截 mismatch");
console.log("Case 3 通过：mismatch 成功在 Kernel 调用前拦截");

// ==================================================
// Case 4: Confirmation Preview 检查
// ==================================================
console.log("\n[Case 4] Confirmation Preview 检查");
const previewEmptyBlocks = buildToolPermissionPreview(tool, {
  action: "reset",
  resetType: "deck",
  id: "deck-test-A",
});
assert.ok(!previewEmptyBlocks.impactSummary?.includes('Deck ""'), "Case 4: Preview 不得包含 Deck \"\"");
assert.ok(previewEmptyBlocks.impactSummary?.includes("Deck deck-test-A"), "Case 4: Preview 必须显示目标 Deck ID");
assert.ok(previewEmptyBlocks.impactSummary?.includes("重置该目标全部卡片"), "Case 4: blockIDs 为空时应明确表示重置全部卡片");

const previewWithBlocks = buildToolPermissionPreview(tool, {
  action: "reset",
  resetType: "deck",
  id: "deck-test-A",
  blockIDs: ["20260703221339-block01", "20260703221339-block02"],
});
assert.ok(previewWithBlocks.impactSummary?.includes("共 2 张卡片"), "Case 4: 有 blockIDs 时应显示数量");
console.log("Case 4 通过：Preview deckID 与卡片范围展示准确清晰");

// ==================================================
// Case 5: set_due_time Tool Help 明确 Kernel builtin-only 边界
// ==================================================
console.log("\n[Case 5] set_due_time Tool Help / Notes 边界声明检查");
assert.ok(
  tool.description.includes("仅在 builtin deck 中按 riffCardID 修改 Due"),
  "Case 5: description 必须明确 builtin deck 边界",
);
assert.ok(
  tool.description.includes("对自定义 Deck 中的 cardID 会静默跳过"),
  "Case 5: description 必须明确自定义 Deck 静默跳过机制",
);
assert.ok(
  tool.boundary?.includes("当前 SiYuan Kernel 的 batchSetRiffCardsDueTime 仅支持 builtin deck"),
  "Case 5: boundary 必须明确 batchSetRiffCardsDueTime 仅支持 builtin deck",
);
console.log("Case 5 通过：Tool Help / boundary 明确声明了能力边界");

// ==================================================
// Case 6: set_due_time verification=false 时不能宣称成功
// ==================================================
console.log("\n[Case 6] set_due_time verification 校验");
runtimePostCalls = [];
const resultDue = await executeSiyuanRiffCard({
  action: "set_due_time",
  cardDues: [
    {
      id: "20260703221339-at4oz7a",
      due: "20260710080000",
    },
  ],
});
assert.equal(resultDue.output.action, "set_due_time", "Case 6: 执行包装层成功完成回读");
const dueData = resultDue.output.data as Record<string, any>;
assert.equal(dueData.needsVerification, true, "Case 6: needsVerification 必须为 true");
assert.equal(dueData.verification.applied, false, "Case 6: 当回读 due 未变化时 applied 必须为 false");
assert.equal(dueData.verification.appliedCount, 0, "Case 6: appliedCount 必须为 0");
assert.ok(
  dueData.warning?.includes("仅在 builtin deck 中按 riffCardID 修改 Due"),
  "Case 6: warning 必须明确提示 builtin deck 边界及无需重试建议",
);
console.log("Case 6 通过：未生效时 verification.applied=false 并产生明确 warning");

console.log("\n==================================================");
console.log("siyuan_riff Card Contract Verifier 全部测试通过！");
console.log("==================================================");
