import assert from "node:assert/strict";
import { setSiyuanRuntimePort } from "../src/runtime/siyuan-runtime-port";
import { buildToolPermissionPreview } from "../src/features/kb/services/agent-core/permissions/write-preview-builder";
import {
  getSiyuanAssetDisplayName,
  getSiyuanAssetExtension,
  getSiyuanAssetRenameNameError,
  siyuanAssetManageInputSchema,
} from "../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-asset-manage.contract";
import { executeSiyuanAssetManage } from "../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-asset-manage.impl";

const physicalPath = "assets/photo-20260818161603-11j7uqa.jpeg";

function assertRenameSchema(newName: string, expected: boolean, expectedMessage?: RegExp) {
  const result = siyuanAssetManageInputSchema.safeParse({ action: "rename", path: physicalPath, newName });
  assert.equal(result.success, expected, newName);
  if (!result.success && expectedMessage) {
    assert.match(result.error.issues.map((issue) => issue.message).join(";"), expectedMessage);
  }
}

async function main() {
  assert.equal(getSiyuanAssetDisplayName(physicalPath), "photo");
  assert.equal(getSiyuanAssetExtension(physicalPath), ".jpeg");
  assert.equal(getSiyuanAssetDisplayName(`${physicalPath}?box=test`), "photo");
  assert.equal(getSiyuanAssetExtension(`${physicalPath}?box=test`), ".jpeg");
  assert.equal(getSiyuanAssetDisplayName("/data/assets/photo-20260818161603-11j7uqa.jpeg?box=test"), "photo");

  assert.equal(getSiyuanAssetRenameNameError(physicalPath, "renamed"), undefined);
  assert.equal(getSiyuanAssetRenameNameError(physicalPath, "paper.v2"), undefined);
  assert.match(getSiyuanAssetRenameNameError(physicalPath, "renamed.jpeg") ?? "", /不要包含原扩展名/);
  assert.match(getSiyuanAssetRenameNameError(physicalPath, "renamed-20260818164024-abcdefg") ?? "", /内部资源唯一后缀/);

  assertRenameSchema("renamed", true);
  assertRenameSchema("paper.v2", true);
  assertRenameSchema("renamed.jpeg", false, /不要包含原扩展名/);
  assertRenameSchema("renamed-20260818164024-abcdefg", false, /内部资源唯一后缀/);
  assertRenameSchema("folder/renamed", false, /不能包含目录路径/);

  const executeCalls: Array<{ path: string; payload: unknown }> = [];
  setSiyuanRuntimePort({
    post: async (path, payload) => {
      executeCalls.push({ path, payload });
      return { code: 0, data: { newPath: "assets/renamed-20260818170000-newid.jpeg" } };
    },
  });
  await assert.rejects(
    () => executeSiyuanAssetManage({ action: "rename", path: physicalPath, newName: "renamed.jpeg" } as never),
    /不要包含原扩展名/,
  );
  assert.equal(executeCalls.length, 0);

  const preview = buildToolPermissionPreview({ name: "siyuan_asset_manage", title: "管理资源" } as any, {
    action: "rename",
    path: `${physicalPath}?box=test`,
    newName: "renamed",
  });
  assert.equal(preview.operationLabel, "rename");
  assert.match(preview.impactSummary ?? "", /photo/);
  assert.match(preview.impactSummary ?? "", /renamed/);
  assert.match(preview.impactSummary ?? "", /\.jpeg/);
  assert.match(preview.impactSummary ?? "", /Kernel/);
  assert.equal((preview.argsPreview as Record<string, unknown>).newName, "renamed");

  console.log("siyuan asset rename verification passed");
}

await main();
