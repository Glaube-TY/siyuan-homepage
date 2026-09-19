import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const bundled = await build({
  stdin: {
    contents: `
      export { setSiyuanRuntimePort } from "./src/runtime/siyuan-runtime-port";
      export { resolveQuickNoteRuntimeConfig } from "./src/features/quick-note/quick-note-runtime-config";
      export {
        getQuickNoteStatus,
        setQuickNoteConfigLoader,
        setQuickNoteWritePlugin,
        writeQuickNote,
      } from "./src/features/quick-note/quick-note-write-service";
    `,
    loader: "ts",
    resolveDir: root,
    sourcefile: "verify-robot-quick-note.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  write: false,
  logLevel: "silent",
});
const runtime = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);

const SHARED_SCHEMA = "siyuan-homepage-shared-settings";
const SHARED_PATH = "/data/storage/petal/siyuan-homepage/homepageSharedSettings.json";
const MISSING = Symbol("missing shared settings");

function sharedSettings(config, revision = 1) {
  return JSON.stringify({
    schema: SHARED_SCHEMA,
    version: 1,
    revision,
    updatedAt: "2026-09-19T00:00:00.000Z",
    config,
  });
}

function createFixture({ shared = MISSING, legacy = null, post = () => ({ code: 0, data: [] }) } = {}) {
  let sharedFile = shared;
  const calls = [];
  const storage = {
    name: "siyuan-homepage",
    async loadData(name) {
      calls.push({ kind: "loadData", name });
      return legacy;
    },
    async saveData() {},
    async removeData() {},
  };
  runtime.setSiyuanRuntimePort({
    async getFile(path) {
      assert.equal(path, SHARED_PATH);
      calls.push({ kind: "getFile", path });
      if (sharedFile === MISSING) return { code: 404, msg: "not found" };
      return sharedFile;
    },
    async post(path, payload) {
      calls.push({ kind: "post", path, payload });
      return await post(path, payload);
    },
  });
  return {
    storage,
    calls,
    setShared(next) {
      sharedFile = next;
    },
  };
}

function appendPayload(calls) {
  return calls.find((call) => call.kind === "post" && call.path === "/api/block/appendBlock");
}

function assertQuickNoteWriteFailure(result, message) {
  assert.equal(result.ok, false, message);
  assert.equal(result.changed, false, message);
  assert.equal(result.errorCode, "quick_note_write_failed", message);
}

const source = await readFile(resolve(root, "src/features/quick-note/quick-note-write-service.ts"), "utf8");
assert.match(source, /appendBlockChecked/);
assert.match(source, /getChildBlocksChecked/);
assert.match(source, /insertBlockChecked/);

{
  const fixture = createFixture({
    shared: sharedSettings({ quickNotesPosition: "  shared-doc  ", quickNotesTimestampEnabled: true, quickNotesAddPosition: "bottom" }),
    legacy: { quickNotesPosition: "" },
  });
  const result = await runtime.resolveQuickNoteRuntimeConfig(fixture.storage);
  assert.equal(result.quickNotesPosition, "shared-doc", "shared settings must beat an empty legacy snapshot");
  assert.equal(fixture.calls.filter((call) => call.kind === "loadData").length, 0);
}

{
  const fixture = createFixture({
    shared: sharedSettings({ quickNotesPosition: "new-doc", quickNotesTimestampEnabled: true, quickNotesAddPosition: "bottom" }),
    legacy: { quickNotesPosition: "old-doc", quickNotesTimestampEnabled: false, quickNotesAddPosition: "top" },
  });
  const result = await runtime.resolveQuickNoteRuntimeConfig(fixture.storage);
  assert.equal(result.quickNotesPosition, "new-doc", "shared settings must beat a stale legacy snapshot");
}

{
  const fixture = createFixture({
    shared: sharedSettings({ quickNotesPosition: "old-doc", quickNotesTimestampEnabled: true, quickNotesAddPosition: "bottom" }),
    legacy: { quickNotesPosition: "legacy-doc", quickNotesTimestampEnabled: false, quickNotesAddPosition: "top" },
    post: (path) => path === "/api/block/appendBlock"
      ? { code: 0, data: [{ id: "runtime-block" }] }
      : { code: 0, data: [] },
  });
  runtime.setQuickNoteWritePlugin(fixture.storage);
  runtime.setQuickNoteConfigLoader(async () => runtime.resolveQuickNoteRuntimeConfig(fixture.storage));
  assert.equal((await runtime.getQuickNoteStatus()).configured, true);
  const first = await runtime.writeQuickNote({ content: "old target" });
  assert.equal(first.ok, true);
  assert.equal(appendPayload(fixture.calls).payload.parentID, "old-doc");
  fixture.setShared(sharedSettings({ quickNotesPosition: "new-doc" }, 2));
  assert.equal((await runtime.getQuickNoteStatus()).configured, true);
  const second = await runtime.writeQuickNote({ content: "new target" });
  assert.equal(second.ok, true);
  const appendCalls = fixture.calls.filter((call) => call.kind === "post" && call.path === "/api/block/appendBlock");
  assert.equal(appendCalls.at(-1).payload.parentID, "new-doc", "the same runtime must read the updated target");
}

{
  const fixture = createFixture({
    shared: sharedSettings({ mobileAutoOpenEnabled: true }),
    legacy: { quickNotesPosition: "legacy-doc", quickNotesTimestampEnabled: false, quickNotesAddPosition: "top" },
  });
  const result = await runtime.resolveQuickNoteRuntimeConfig(fixture.storage);
  assert.deepEqual(result, {
    quickNotesPosition: "legacy-doc",
    quickNotesTimestampEnabled: false,
    quickNotesAddPosition: "top",
  }, "a valid shared file with no quick note fields must use all legacy fields");
}

{
  const fixture = createFixture({
    shared: sharedSettings({ quickNotesPosition: "shared-doc" }),
    legacy: { quickNotesPosition: "legacy-doc", quickNotesTimestampEnabled: false, quickNotesAddPosition: "top" },
  });
  const result = await runtime.resolveQuickNoteRuntimeConfig(fixture.storage);
  assert.deepEqual(result, {
    quickNotesPosition: "shared-doc",
    quickNotesTimestampEnabled: false,
    quickNotesAddPosition: "top",
  }, "missing shared fields must be filled one field at a time");
}

{
  const fixture = createFixture({
    shared: sharedSettings({ quickNotesPosition: "" }),
    legacy: { quickNotesPosition: "old-doc" },
  });
  const result = await runtime.resolveQuickNoteRuntimeConfig(fixture.storage);
  assert.equal(result.quickNotesPosition, "", "an explicit empty shared position must not restore legacy");
}

{
  const fixture = createFixture({
    shared: sharedSettings({ quickNotesTimestampEnabled: false }),
    legacy: { quickNotesTimestampEnabled: true },
  });
  const result = await runtime.resolveQuickNoteRuntimeConfig(fixture.storage);
  assert.equal(result.quickNotesTimestampEnabled, false, "an explicit false shared timestamp setting must win");
}

{
  const fixture = createFixture({
    shared: sharedSettings({ quickNotesPosition: "shared-doc", quickNotesTimestampEnabled: false, quickNotesAddPosition: "top" }),
    legacy: { quickNotesPosition: "legacy-doc", quickNotesTimestampEnabled: true, quickNotesAddPosition: "bottom" },
  });
  const result = await runtime.resolveQuickNoteRuntimeConfig(fixture.storage);
  assert.deepEqual(result, {
    quickNotesPosition: "shared-doc",
    quickNotesTimestampEnabled: false,
    quickNotesAddPosition: "top",
  });
  assert.equal(fixture.calls.filter((call) => call.kind === "loadData").length, 0, "complete shared config must not read legacy");
}

{
  const fixture = createFixture({ legacy: { quickNotesPosition: "legacy-doc", quickNotesTimestampEnabled: false } });
  const result = await runtime.resolveQuickNoteRuntimeConfig(fixture.storage);
  assert.deepEqual(result, {
    quickNotesPosition: "legacy-doc",
    quickNotesTimestampEnabled: false,
    quickNotesAddPosition: "bottom",
  });
}

for (const shared of [
  "{broken json",
  JSON.stringify({ schema: SHARED_SCHEMA, version: 99, revision: 1, updatedAt: "now", config: { quickNotesPosition: "shared-doc" } }),
]) {
  const fixture = createFixture({ shared, legacy: { quickNotesPosition: "legacy-doc" } });
  await assert.rejects(
    runtime.resolveQuickNoteRuntimeConfig(fixture.storage),
    /共享主页设置/,
    "a corrupt shared file must fail closed instead of using the legacy snapshot",
  );
  assert.equal(fixture.calls.filter((call) => call.kind === "loadData").length, 0);
}

{
  const fixture = createFixture({
    post: (path) => path === "/api/block/appendBlock"
      ? { code: 0, data: [{ id: "local-block" }] }
      : { code: 0, data: [] },
  });
  runtime.setQuickNoteWritePlugin(fixture.storage);
  runtime.setQuickNoteConfigLoader(async () => { throw new Error("local options must bypass the config loader"); });
  const result = await runtime.writeQuickNote({
    content: "local shortcut",
    source: "local",
    options: { quickNotesPosition: "local-doc", quickNotesTimestampEnabled: false, quickNotesAddPosition: "bottom" },
  });
  assert.equal(result.ok, true, "explicit local quick note options must keep working");
  assert.equal(appendPayload(fixture.calls).payload.parentID, "local-doc");
}

{
  const fixture = createFixture({ post: () => ({ code: 1, msg: "append failed" }) });
  runtime.setQuickNoteWritePlugin(fixture.storage);
  const result = await runtime.writeQuickNote({
    content: "append failure",
    options: { quickNotesPosition: "target-doc", quickNotesTimestampEnabled: false, quickNotesAddPosition: "bottom" },
  });
  assertQuickNoteWriteFailure(result, "checked append failures must not be reported as success");
}

{
  let appendCount = 0;
  const fixture = createFixture({
    post: (path) => {
      if (path === "/api/block/getChildBlocks") return { code: 1, msg: "child read failed" };
      if (path === "/api/block/appendBlock") appendCount += 1;
      return { code: 0, data: [] };
    },
  });
  runtime.setQuickNoteWritePlugin(fixture.storage);
  const result = await runtime.writeQuickNote({
    content: "top read failure",
    options: { quickNotesPosition: "target-doc", quickNotesTimestampEnabled: false, quickNotesAddPosition: "top" },
  });
  assertQuickNoteWriteFailure(result, "top child read failures must fail the write");
  assert.equal(appendCount, 0, "top child read failures must not fall back to append");
}

{
  const fixture = createFixture({ post: (path) => path === "/api/block/appendBlock"
    ? { code: 0, data: [{ id: "bottom-block" }] }
    : { code: 0, data: [] } });
  runtime.setQuickNoteWritePlugin(fixture.storage);
  const result = await runtime.writeQuickNote({
    content: "bottom success",
    options: { quickNotesPosition: "target-doc", quickNotesTimestampEnabled: false, quickNotesAddPosition: "bottom" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(result.blockId, "bottom-block");
}

{
  let appendCount = 0;
  const fixture = createFixture({
    post: (path) => {
      if (path === "/api/block/getChildBlocks") return { code: 0, data: [{ id: "first-child" }] };
      if (path === "/api/block/insertBlock") return { code: 0, data: [{ id: "top-block" }] };
      if (path === "/api/block/appendBlock") appendCount += 1;
      return { code: 0, data: [] };
    },
  });
  runtime.setQuickNoteWritePlugin(fixture.storage);
  const result = await runtime.writeQuickNote({
    content: "top success",
    options: { quickNotesPosition: "target-doc", quickNotesTimestampEnabled: false, quickNotesAddPosition: "top" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(result.blockId, "top-block");
  assert.equal(fixture.calls.filter((call) => call.kind === "post" && call.path === "/api/block/insertBlock").length, 1);
  assert.equal(appendCount, 0, "top writes with a first child must use insert only");
}

console.log("robot quick note verification passed");
