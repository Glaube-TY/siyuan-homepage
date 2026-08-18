import assert from "node:assert/strict";
import { getAssetContentByPath, type SiyuanAssetContent } from "../src/api";
import { setSiyuanRuntimePort } from "../src/runtime/siyuan-runtime-port";
import {
  MAX_RAW_ASSET_TEXT_BYTES,
  readAssetTextContentByPath,
} from "../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-asset-content.impl";
import { executeSiyuanAssetRead } from "../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-asset-read.impl";
import { executeSiyuanSearchExtra } from "../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-search-extra.impl";

type MockAssetRuntime = {
  assetContent?: unknown;
  stat?: unknown;
  file?: unknown;
  fullText?: unknown;
};

function makeAssetContent(content: string, overrides: Partial<SiyuanAssetContent> = {}): SiyuanAssetContent {
  return {
    id: "20260818000000-asset-test",
    name: "test.txt",
    ext: "txt",
    path: "assets/test.txt",
    size: content.length,
    hSize: `${content.length} B`,
    updated: 1787000000000,
    content,
    ...overrides,
  };
}

function installMockRuntime(mock: MockAssetRuntime) {
  const postCalls: Array<{ path: string; payload: unknown }> = [];
  const fileCalls: string[] = [];
  setSiyuanRuntimePort({
    post: async (path, payload) => {
      postCalls.push({ path, payload });
      if (path === "/api/search/getAssetContentByPath") {
        return { code: 0, data: { assetContent: mock.assetContent } };
      }
      if (path === "/api/asset/statAsset") return { code: 0, data: mock.stat };
      if (path === "/api/search/fullTextSearchAssetContent") return { code: 0, data: mock.fullText ?? [] };
      throw new Error(`unexpected API call: ${path}`);
    },
    getFile: async (path) => {
      fileCalls.push(path);
      return mock.file;
    },
  });
  return { postCalls, fileCalls };
}

function textStat(contentLen: number) {
  return { fileType: "file", contentType: "text/plain", contentLen };
}

async function main() {
  {
    const indexedAsset = makeAssetContent("INDEXED_ASSET_CONTENT");
    const mock = installMockRuntime({ assetContent: indexedAsset });
    const result = await getAssetContentByPath("assets/test.txt");
    assert.deepEqual(result, indexedAsset);
    assert.equal(result?.content, "INDEXED_ASSET_CONTENT");
    assert.deepEqual(mock.postCalls[0], {
      path: "/api/search/getAssetContentByPath",
      payload: { path: "assets/test.txt" },
    });
  }

  {
    const mock = installMockRuntime({ assetContent: makeAssetContent("INDEXED_ASSET_CONTENT") });
    const result = await readAssetTextContentByPath("/data/assets/test.txt");
    assert.equal(result.source, "indexed");
    assert.equal(result.content, "INDEXED_ASSET_CONTENT");
    assert.equal(mock.fileCalls.length, 0);
    assert.equal(mock.postCalls.some((call) => call.path === "/api/asset/statAsset"), false);
  }

  {
    const mock = installMockRuntime({ assetContent: makeAssetContent("") });
    const result = await readAssetTextContentByPath("assets/empty.txt");
    assert.equal(result.source, "indexed");
    assert.equal(result.contentAvailable, true);
    assert.equal(result.content, "");
    assert.equal(mock.fileCalls.length, 0);
    assert.equal(mock.postCalls.some((call) => call.path === "/api/asset/statAsset"), false);
  }

  {
    const mock = installMockRuntime({
      assetContent: makeAssetContent("PDF_EXTRACTED_TEXT", { name: "paper.pdf", ext: "pdf", path: "assets/paper.pdf" }),
      stat: { fileType: "file", contentType: "application/pdf", contentLen: 500000 },
      file: "must-not-be-read",
    });
    const result = await readAssetTextContentByPath("assets/paper.pdf");
    assert.equal(result.source, "indexed");
    assert.equal(result.content, "PDF_EXTRACTED_TEXT");
    assert.equal(mock.fileCalls.length, 0);
    assert.equal(mock.postCalls.some((call) => call.path === "/api/asset/statAsset"), false);
  }

  {
    const mock = installMockRuntime({
      assetContent: null,
      stat: textStat(18),
      file: "HELLO_ASSET_CONTENT",
    });
    const result = await readAssetTextContentByPath("/data/assets/test.txt");
    assert.equal(result.source, "raw_text");
    assert.equal(result.content, "HELLO_ASSET_CONTENT");
    assert.deepEqual(mock.fileCalls, ["/data/assets/test.txt"]);
  }

  {
    const blobMock = installMockRuntime({
      assetContent: null,
      stat: textStat(10),
      file: new Blob(["BLOB_ASSET_CONTENT"], { type: "text/plain" }),
    });
    assert.equal((await readAssetTextContentByPath("assets/blob.txt")).content, "BLOB_ASSET_CONTENT");
    assert.deepEqual(blobMock.fileCalls, ["/data/assets/blob.txt"]);

    const arrayBufferMock = installMockRuntime({
      assetContent: null,
      stat: textStat(18),
      file: new TextEncoder().encode("ARRAY_BUFFER_CONTENT").buffer,
    });
    assert.equal((await readAssetTextContentByPath("assets/array.txt")).content, "ARRAY_BUFFER_CONTENT");
    assert.deepEqual(arrayBufferMock.fileCalls, ["/data/assets/array.txt"]);
  }

  {
    const mock = installMockRuntime({
      assetContent: null,
      stat: { fileType: "file", contentType: "image/png", contentLen: 128 },
      file: "must-not-be-read",
    });
    const result = await readAssetTextContentByPath("assets/image.png");
    assert.equal(result.source, "unavailable");
    assert.equal(result.content, null);
    assert.equal(result.reason, "indexed_content_unavailable");
    assert.equal(mock.fileCalls.length, 0);
  }

  {
    const mock = installMockRuntime({
      assetContent: null,
      stat: textStat(MAX_RAW_ASSET_TEXT_BYTES + 1),
      file: "must-not-be-read",
    });
    const result = await readAssetTextContentByPath("assets/large.txt");
    assert.equal(result.source, "unavailable");
    assert.equal(result.reason, "text_file_too_large");
    assert.equal(mock.fileCalls.length, 0);
  }

  {
    installMockRuntime({ assetContent: null, stat: textStat(400), file: "A".repeat(400) });
    const result = await executeSiyuanAssetRead({ action: "asset_content", path: "assets/limited.txt", maxChars: 100 });
    assert.equal(result.output.truncated, true);
    assert.equal(typeof result.output.data, "string");
  }

  {
    const pathMock = installMockRuntime({ assetContent: null, stat: textStat(18), file: "EXTRA_PATH_CONTENT" });
    const pathResult = await executeSiyuanSearchExtra({ action: "asset_content", path: "assets/test.txt" });
    assert.equal((pathResult.output.data as { source: string }).source, "raw_text");
    assert.deepEqual(pathMock.fileCalls, ["/data/assets/test.txt"]);

    const keywordMock = installMockRuntime({ fullText: [{ path: "assets/test.txt" }] });
    await executeSiyuanSearchExtra({ action: "asset_content", keyword: "hello" });
    assert.deepEqual(keywordMock.postCalls[0], {
      path: "/api/search/fullTextSearchAssetContent",
      payload: { query: "hello", k: "hello" },
    });
  }

  {
    installMockRuntime({ assetContent: "plain string" });
    await assert.rejects(
      () => getAssetContentByPath("assets/invalid.txt"),
      /无效资源内容/,
    );

    installMockRuntime({ assetContent: {} });
    await assert.rejects(
      () => getAssetContentByPath("assets/invalid.txt"),
      /无效资源内容/,
    );
  }

  console.log("siyuan asset content verification passed");
}

await main();
