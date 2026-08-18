import assert from "node:assert/strict";
import { getFileAnnotation, setFileAnnotation } from "../src/api";
import { setSiyuanRuntimePort } from "../src/runtime/siyuan-runtime-port";
import { buildToolPermissionPreview } from "../src/features/kb/services/agent-core/permissions/write-preview-builder";
import {
  isPdfAnnotationAssetPath,
  SIYUAN_FILE_ANNOTATION_LIMITS,
  siyuanAssetManageInputSchema,
} from "../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-asset-manage.contract";
import { siyuanAssetReadInputSchema } from "../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-asset-read.contract";
import { executeSiyuanAssetManage } from "../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-asset-manage.impl";
import { executeSiyuanAssetRead } from "../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-asset-read.impl";

const annotation = {
  "annotation-test-id": {
    pages: [{ index: 0, positions: [[10, 20, 100, 120]] }],
    color: "var(--b3-pdf-background1)",
    type: "text",
    content: "PDF annotation",
    mode: "text",
    ids: [],
  },
};

type PostCall = { path: string; payload: unknown };

function installRuntime(handler: (path: string, payload: unknown) => { code: number; msg?: string; data?: unknown }) {
  const calls: PostCall[] = [];
  setSiyuanRuntimePort({
    post: async (path, payload) => {
      calls.push({ path, payload });
      return handler(path, payload);
    },
  });
  return calls;
}

function assertSchema(value: unknown, expected: boolean) {
  assert.equal(siyuanAssetManageInputSchema.safeParse(value).success, expected, JSON.stringify(value));
}

function assertReadSchema(value: unknown, expected: boolean) {
  assert.equal(siyuanAssetReadInputSchema.safeParse(value).success, expected, JSON.stringify(value));
}

async function main() {
  assert.equal(isPdfAnnotationAssetPath("assets/example.pdf"), true);
  assert.equal(isPdfAnnotationAssetPath("/data/assets/example.pdf.sya"), true);
  assert.equal(isPdfAnnotationAssetPath("assets/example.pdf?box=box-id"), true);
  assert.equal(isPdfAnnotationAssetPath("assets/example.txt"), false);

  assertReadSchema({ action: "file_annotation", path: "assets/example.pdf" }, true);
  assertReadSchema({ action: "file_annotation", path: "assets/example.pdf.sya" }, true);
  assertReadSchema({ action: "file_annotation", path: "/data/assets/example.pdf" }, true);
  assertReadSchema({ action: "file_annotation", path: "assets/example.pdf?box=box-id" }, true);
  assertReadSchema({ action: "file_annotation", path: "assets/example.txt" }, false);
  assertReadSchema({ action: "file_annotation", path: "assets/example.png" }, false);
  assertReadSchema({ action: "file_annotation" }, false);

  assertSchema({ action: "set_annotation", path: "assets/example.pdf", annotation }, true);
  assertSchema({ action: "set_annotation", path: "assets/example.pdf", clear: true }, true);
  assertSchema({ action: "set_annotation", path: "assets/example.pdf" }, false);
  assertSchema({ action: "set_annotation", path: "assets/example.pdf", annotation: null }, false);
  assertSchema({ action: "set_annotation", path: "assets/example.pdf", annotation: "legacy-string" }, false);
  assertSchema({ action: "set_annotation", path: "assets/example.pdf", annotation, clear: true }, false);
  assertSchema({ action: "set_annotation", path: "assets/example.txt", annotation }, false);
  assertSchema({ action: "set_annotation", path: "assets/example.pdf", annotation: {} }, false);
  assertSchema({
    action: "set_annotation",
    path: "assets/example.pdf",
    annotation: { id: { ...annotation["annotation-test-id"], pages: [{ index: "0", positions: [] }] } },
  }, false);
  assertSchema({
    action: "set_annotation",
    path: "assets/example.pdf",
    annotation: {
      multi: {
        ...annotation["annotation-test-id"],
        pages: Array.from({ length: 3 }, (_, index) => ({
          index,
          positions: Array.from({ length: 5 }, () => [10, 20, 100, 120, 140, 160, 180, 200]),
        })),
      },
    },
  }, true);
  assertSchema({
    action: "set_annotation",
    path: "assets/example.pdf",
    annotation: Object.fromEntries(Array.from({ length: SIYUAN_FILE_ANNOTATION_LIMITS.maxAnnotations + 1 }, (_, index) => [
      `annotation-${index}`,
      annotation["annotation-test-id"],
    ])),
  }, false);
  assertSchema({
    action: "set_annotation",
    path: "assets/example.pdf",
    annotation: {
      contentTooLong: { ...annotation["annotation-test-id"], content: "x".repeat(SIYUAN_FILE_ANNOTATION_LIMITS.maxContentChars + 1) },
    },
  }, false);
  assertSchema({
    action: "set_annotation",
    path: "assets/example.pdf",
    annotation: {
      positionsTooLong: {
        ...annotation["annotation-test-id"],
        pages: [{
          index: 0,
          positions: Array.from({ length: SIYUAN_FILE_ANNOTATION_LIMITS.maxPositionsPerPage + 1 }, () => [1, 2, 3, 4]),
        }],
      },
    },
  }, false);
  assertSchema({
    action: "set_annotation",
    path: "assets/example.pdf",
    annotation: { nan: { ...annotation["annotation-test-id"], pages: [{ index: 0, positions: [[Number.NaN]] }] } },
  }, false);
  assertSchema({
    action: "set_annotation",
    path: "assets/example.pdf",
    annotation: { infinity: { ...annotation["annotation-test-id"], pages: [{ index: 0, positions: [[Number.POSITIVE_INFINITY]] }] } },
  }, false);
  assertSchema({ action: "rename", path: "assets/example.txt", newName: "renamed.txt" }, true);
  assertSchema({ action: "set_image_ocr", path: "assets/example.png", text: "OCR" }, true);

  const setCalls = installRuntime(() => ({ code: 0, data: null }));
  await setFileAnnotation("assets/example.pdf", { annotation });
  assert.equal(setCalls[0].path, "/api/asset/setFileAnnotation");
  assert.deepEqual(setCalls[0].payload, {
    path: "assets/example.pdf",
    data: JSON.stringify(annotation),
  });
  await setFileAnnotation("assets/example.pdf", { clear: true });
  assert.deepEqual(setCalls[1].payload, { path: "assets/example.pdf", data: "{}" });
  await assert.rejects(
    () => setFileAnnotation("assets/example.pdf", { annotation: "legacy-string" } as never),
    /非空 annotation 对象/,
  );
  await assert.rejects(
    () => setFileAnnotation("assets/example.pdf", { annotation, clear: true } as never),
    /不能同时传入两者/,
  );

  let getResponse: { code: number; msg?: string; data?: unknown } = { code: 1, msg: "" };
  installRuntime(() => getResponse);
  assert.deepEqual(await getFileAnnotation("assets/example.pdf"), { exists: false, valid: true, annotation: {} });

  getResponse = { code: 0, data: { data: JSON.stringify(annotation) } };
  assert.deepEqual(await getFileAnnotation("assets/example.pdf"), { exists: true, valid: true, annotation });

  getResponse = { code: 0, data: { data: "legacy-string" } };
  assert.deepEqual(await getFileAnnotation("assets/example.pdf"), {
    exists: true,
    valid: false,
    rawData: "legacy-string",
    reason: "legacy_or_invalid_annotation_json",
  });

  const executeCalls = installRuntime(() => ({ code: 0, data: null }));
  await assert.rejects(
    () => executeSiyuanAssetManage({ action: "set_annotation", path: "assets/example.pdf", annotation: "legacy-string" } as never),
    /非空 annotation 对象/,
  );
  assert.equal(executeCalls.length, 0);

  const readCalls = installRuntime(() => ({ code: 1, msg: "" }));
  await assert.rejects(
    () => executeSiyuanAssetRead({ action: "file_annotation", path: "assets/example.txt" } as never),
    /file_annotation 只支持 PDF/,
  );
  assert.equal(readCalls.length, 0);

  const previewTool = { name: "siyuan_asset_manage", title: "管理资源" } as any;
  const clearPreview = buildToolPermissionPreview(previewTool, {
    action: "set_annotation",
    path: "assets/example.pdf",
    clear: true,
  });
  assert.equal(clearPreview.operationLabel, "清除 PDF 标注");
  assert.match(clearPreview.impactSummary ?? "", /清除 PDF 标注/);
  assert.equal((clearPreview.argsPreview as Record<string, unknown>).clear, true);

  const setPreview = buildToolPermissionPreview(previewTool, {
    action: "set_annotation",
    path: "assets/example.pdf",
    annotation,
  });
  assert.equal(setPreview.operationLabel, "设置 PDF 标注");
  assert.match(setPreview.impactSummary ?? "", /设置 PDF 标注/);
  assert.equal((setPreview.argsPreview as Record<string, unknown>).annotationCount, 1);
  assert.equal("annotation" in (setPreview.argsPreview as Record<string, unknown>), false);

  console.log("siyuan asset annotation verification passed");
}

await main();
