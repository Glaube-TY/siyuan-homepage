import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  destroyTaskDataRuntime,
  isDatabaseIndexCommit,
  normalizeRootIds,
  parseDatabaseIndexCommitIntent,
  selectChangedTaskDataResult,
  shouldDispatchTaskDataUpdated,
  startTaskDataRuntime,
} from "../src/features/task-data/task-data-runtime";

const pluginMetadata = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8")) as {
  minAppVersion?: string;
};
assert.equal(pluginMetadata.minAppVersion, "3.8.0");

assert.deepEqual(
  normalizeRootIds([" root-a ", "root-a", "", 42, "root-b"]),
  ["root-a", "root-b"],
);
assert.deepEqual(
  parseDatabaseIndexCommitIntent({ cmd: "databaseIndexCommit", data: { rootIDs: [" root-a "], backlinkFull: false } }),
  { rootIds: ["root-a"], broad: false },
);
assert.deepEqual(
  parseDatabaseIndexCommitIntent({ cmd: "databaseIndexCommit", data: { rootIDs: [], backlinkFull: true } }),
  { rootIds: [], broad: true },
);
assert.deepEqual(
  parseDatabaseIndexCommitIntent({ cmd: "databaseIndexCommit", data: { rootIDs: ["root-a"], backlinkFull: true } }),
  { rootIds: ["root-a"], broad: true },
);
assert.deepEqual(
  parseDatabaseIndexCommitIntent({ cmd: "databaseIndexCommit", data: { rootIDs: [" root-a ", "root-a", "", 42] } }),
  { rootIds: ["root-a"], broad: false },
);
assert.deepEqual(
  parseDatabaseIndexCommitIntent({ cmd: "databaseIndexCommit" }),
  { rootIds: [], broad: false },
);
assert.equal(parseDatabaseIndexCommitIntent({ cmd: "other-command" }), null);
assert.equal(isDatabaseIndexCommit({ cmd: "databaseIndexCommit", data: { rootIDs: [] } }), true);
assert.equal(isDatabaseIndexCommit({ cmd: "databaseIndexCommit", data: null }), true);
assert.equal(isDatabaseIndexCommit({ cmd: "databaseIndexCommit", data: 42 }), true);
assert.equal(isDatabaseIndexCommit({ cmd: "other-command" }), false);
assert.equal(isDatabaseIndexCommit(null), false);
assert.equal(shouldDispatchTaskDataUpdated({ lastStatus: "success", changed: true }), true);
assert.equal(shouldDispatchTaskDataUpdated({ lastStatus: "success", changed: false }), false);
assert.equal(shouldDispatchTaskDataUpdated({ lastStatus: "success" }), false);
assert.equal(shouldDispatchTaskDataUpdated({ lastStatus: "error", changed: true }), false);
assert.equal(shouldDispatchTaskDataUpdated({ lastStatus: "success", changed: true }, false, true), false);
assert.equal(shouldDispatchTaskDataUpdated({ lastStatus: "success", changed: true }, true, false), false);
const targetedChangedResult = { source: "targeted", lastStatus: "success" as const, changed: true };
assert.deepEqual(
  selectChangedTaskDataResult([
    { source: "targeted", lastStatus: "success", changed: false },
    targetedChangedResult,
    { source: "broad", lastStatus: "success", changed: true },
  ]),
  targetedChangedResult,
);
assert.equal(
  selectChangedTaskDataResult([
    { source: "targeted", lastStatus: "error", changed: true },
    { source: "broad", lastStatus: "success", changed: false },
  ]),
  undefined,
);

let registeredHandler: ((event: CustomEvent<unknown>) => void) | null = null;
let offCount = 0;
const eventBus = {
  on(name: string, handler: (event: CustomEvent<unknown>) => void) {
    assert.equal(name, "ws-main");
    registeredHandler = handler;
  },
  off(name: string, handler: (event: CustomEvent<unknown>) => void) {
    assert.equal(name, "ws-main");
    assert.equal(handler, registeredHandler);
    offCount += 1;
  },
};
startTaskDataRuntime({ eventBus });
assert.ok(registeredHandler, "runtime 必须监听 ws-main");
destroyTaskDataRuntime();
assert.equal(offCount, 1, "destroy 必须移除 ws-main 监听");

const runtimeSource = readFileSync(new URL("../src/features/task-data/task-data-runtime.ts", import.meta.url), "utf8");
const taskServiceSource = readFileSync(new URL("../src/features/task-data/task-data-service.ts", import.meta.url), "utf8");
const workspaceDataSource = readFileSync(new URL("../src/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceData.ts", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../src/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspacePage.svelte", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../src/components/tools/siyuanComponentDataApi.ts", import.meta.url), "utf8");

assert.match(runtimeSource, /event\??\.detail/);
assert.match(runtimeSource, /parseDatabaseIndexCommitIntent/);
assert.match(runtimeSource, /intent\.rootIds\.forEach/);
assert.match(runtimeSource, /if \(intent\.broad\)/);
assert.match(runtimeSource, /if \(intent\.rootIds\.length === 0 && !intent\.broad\) return/);
assert.match(runtimeSource, /const broadCommit = pendingBroadCommit/);
assert.match(runtimeSource, /refreshTaskIndexByRootIds\(rootIds\)/);
assert.match(runtimeSource, /if \(broadCommit\)/);
assert.match(runtimeSource, /refreshTaskIndexAfterBroadCommit\(\)/);
assert.match(runtimeSource, /selectChangedTaskDataResult\(results\)/);
assert.doesNotMatch(runtimeSource, /rootIds\.length > 0\s*\?\s*await refreshTaskIndexByRootIds[\s\S]*?:\s*await refreshTaskIndexAfterBroadCommit/);
assert.equal((runtimeSource.match(/window\.dispatchEvent\(new CustomEvent\(TASK_DATA_UPDATED_EVENT/g) || []).length, 1);
assert.match(runtimeSource, /eventBus\.on\("ws-main"/);
assert.match(runtimeSource, /off\("ws-main"/);
assert.match(runtimeSource, /shouldDispatchTaskDataUpdated\(changedResult/);
assert.match(taskServiceSource, /preparationFlightForce/);
assert.match(taskServiceSource, /return prepareTaskData\(plugin, true\)/);
assert.match(workspaceDataSource, /forceIndexRefresh: options\.forceTaskIndexRefresh === true/);
assert.match(workspaceSource, /TASK_DATA_UPDATED_EVENT/);
assert.match(workspaceSource, /forceTaskIndexRefresh: true/);
assert.match(workspaceSource, /externalWorkspaceRefreshPending/);
assert.match(workspaceSource, /if \(actionBusy\)/);
assert.match(workspaceSource, /finishWorkspaceAction/);
assert.match(indexSource, /changed: mutation\.changed/);
assert.match(indexSource, /const changed = removedCount > 0/);

console.log("task index live sync verification passed");
