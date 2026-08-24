import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SiyuanBlockTreeInfo } from "../src/api";
import {
  extractOperationBlockIds,
  resolveTaskListTailCandidate,
  validateTaskListTreeShape,
  type EnhancedDiaryTaskListBlock,
} from "../src/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryBlockLocator";
import { validateTaskMoveTargetShape } from "../src/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceTaskService";

const block = (id: string, type: string, subtype?: string, markdown?: string): EnhancedDiaryTaskListBlock => ({
  id,
  type,
  subtype,
  markdown,
});

assert.deepEqual(
  resolveTaskListTailCandidate([], []),
  { kind: "bootstrap", reason: "section_empty" },
);
assert.deepEqual(
  resolveTaskListTailCandidate([block("heading", "h")], []),
  { kind: "bootstrap", reason: "section_tail_not_list" },
);
assert.deepEqual(
  resolveTaskListTailCandidate(
    [block("list", "l")],
    [block("task-a", "i", "t"), block("task-b", "NodeListItem", "task")],
  ),
  { kind: "existing", targetListId: "list", previousTaskItemId: "task-b" },
);
assert.deepEqual(
  resolveTaskListTailCandidate(
    [block("list", "l")],
    [block("task-a", "i", undefined, "- [ ] fallback task")],
  ),
  { kind: "existing", targetListId: "list", previousTaskItemId: "task-a" },
);
assert.deepEqual(
  resolveTaskListTailCandidate(
    [block("old-list", "l"), block("paragraph", "p")],
    [block("task-a", "i", undefined, "- [ ] old")],
  ),
  { kind: "bootstrap", reason: "section_tail_not_list" },
);
assert.deepEqual(
  resolveTaskListTailCandidate(
    [block("bullet-list", "l")],
    [block("bullet", "i", undefined, "- ordinary bullet")],
  ),
  { kind: "bootstrap", reason: "list_not_task_list" },
);
assert.deepEqual(
  resolveTaskListTailCandidate(
    [block("list", "l")],
    [block("empty-list-item", "i", undefined, "plain text")],
  ),
  { kind: "bootstrap", reason: "list_not_task_list" },
);
assert.deepEqual(
  resolveTaskListTailCandidate([block("not-list", "p")], [block("task", "i", "t")]),
  { kind: "bootstrap", reason: "section_tail_not_list" },
);

const treeInfo = (id: string, type: string, parentID: string, parentType: string): SiyuanBlockTreeInfo => ({
  id,
  type,
  parentID,
  parentType,
  previousID: "",
  previousType: "",
  nextID: "",
  nextType: "",
});
const existingListInfo = treeInfo("list", "NodeList", "today-doc", "NodeDocument");
const existingPreviousInfo = treeInfo("previous", "NodeListItem", "list", "NodeList");
const bootstrapListInfo = treeInfo("list-id", "l", "today-doc", "d");
const bootstrapPlaceholderInfo = treeInfo("placeholder-id", "i", "list-id", "l");
assert.deepEqual(Object.keys(existingListInfo), [
  "id", "type", "parentID", "parentType", "previousID", "previousType", "nextID", "nextType",
]);
assert.equal("rootID" in existingListInfo, false);
assert.deepEqual(
  validateTaskListTreeShape({
    docId: "today-doc",
    targetListId: existingListInfo.id,
    targetListType: existingListInfo.type,
    targetListParentId: existingListInfo.parentID,
    targetListParentType: existingListInfo.parentType,
    previousTaskItemId: existingPreviousInfo.id,
    previousType: existingPreviousInfo.type,
    previousParentId: existingPreviousInfo.parentID,
    previousParentType: existingPreviousInfo.parentType,
  }),
  { ok: true },
);
assert.deepEqual(
  validateTaskListTreeShape({
    docId: "today-doc",
    targetListId: bootstrapListInfo.id,
    targetListType: bootstrapListInfo.type,
    targetListParentId: bootstrapListInfo.parentID,
    targetListParentType: bootstrapListInfo.parentType,
    previousTaskItemId: bootstrapPlaceholderInfo.id,
    previousType: bootstrapPlaceholderInfo.type,
    previousParentId: bootstrapPlaceholderInfo.parentID,
    previousParentType: bootstrapPlaceholderInfo.parentType,
  }),
  { ok: true },
);

const validShape = {
  sourceType: "NodeListItem",
  sourceRootId: "source-doc",
  expectedSourceRootId: "source-doc",
  todayDocId: "today-doc",
  targetListId: "target-list",
  targetListType: "NodeList",
  targetListParentId: "today-doc",
  targetListParentType: "NodeDocument",
  previousTaskItemId: "previous-item",
  previousType: "NodeListItem",
  previousParentId: "target-list",
  previousParentType: "NodeList",
};
assert.equal(validateTaskMoveTargetShape(validShape).ok, true);
assert.equal(validateTaskMoveTargetShape({ ...validShape, previousParentId: "other-list" }).ok, false);
assert.equal(validateTaskMoveTargetShape({ ...validShape, targetListType: "p" }).ok, false);
assert.deepEqual({ id: "unresolved" } satisfies SiyuanBlockTreeInfo, { id: "unresolved" });

const operationIds = [
  "20240101000000-aaaaaaa",
  "20240101000001-bbbbbbb",
  "20240101000002-ccccccc",
];
assert.deepEqual(
  extractOperationBlockIds([{
    doOperations: [
      { action: "insert", id: operationIds[0] },
      { action: "appendInsert", id: operationIds[1] },
      { action: "prependInsert", id: operationIds[2] },
      { action: "update", id: "20240101000003-ddddddd" },
      { action: "delete", id: "20240101000004-eeeeeee" },
      { action: "appendInsert", id: operationIds[1] },
      { action: "appendInsert", id: "invalid-id" },
    ],
  }]),
  operationIds,
);

const apiSource = readFileSync(new URL("../src/api.ts", import.meta.url), "utf8");
assert.doesNotMatch(apiSource, /moveBlockTransactionChecked/);
assert.match(apiSource, /export async function moveBlockChecked/);
assert.match(apiSource, /export async function performTransactionsChecked/);
assert.match(apiSource, /export interface SiyuanBlockTreeInfo/);
assert.match(apiSource, /getBlockTreeInfos\(ids: string\[\]\): Promise<Partial<Record<string, SiyuanBlockTreeInfo>>>/);
const treeInfoTypeStart = apiSource.indexOf("export interface SiyuanBlockTreeInfo");
const treeInfoTypeEnd = apiSource.indexOf("export async function getBlockTreeInfos", treeInfoTypeStart);
assert.ok(treeInfoTypeStart >= 0 && treeInfoTypeEnd > treeInfoTypeStart);
assert.doesNotMatch(apiSource.slice(treeInfoTypeStart, treeInfoTypeEnd), /rootID|root_id/);

const locatorSource = readFileSync(new URL("../src/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryBlockLocator.ts", import.meta.url), "utf8");
assert.match(locatorSource, /resolveDayWorkspaceTaskMoveTarget/);
assert.match(locatorSource, /resolveTaskListTailCandidate/);
assert.match(locatorSource, /appendMarkdownToDaySection/);
assert.match(locatorSource, /locateInsertedBlock/);
assert.match(locatorSource, /getBlockTreeInfos/);
assert.match(locatorSource, /parentType/);
assert.match(locatorSource, /deleteTaskMovePlaceholder/);
assert.match(locatorSource, /validateTaskListTreeShape/);
assert.match(locatorSource, /appendInsert/);
assert.match(locatorSource, /prependInsert/);
const safeInfoStart = locatorSource.indexOf("async function getExistingBlockInfo");
const safeInfoEnd = locatorSource.indexOf("export function isEnhancedDiaryTaskListItemType", safeInfoStart);
assert.ok(safeInfoStart >= 0 && safeInfoEnd > safeInfoStart, "候选安全读取 helper 必须存在");
const safeInfoSource = locatorSource.slice(safeInfoStart, safeInfoEnd);
assert.match(safeInfoSource, /checkBlockExist\(id\)/);
assert.match(safeInfoSource, /getBlockInfo\(id\)/);
assert.match(locatorSource, /getExistingBlockInfo\(id\)/);
assert.match(locatorSource, /getExistingBlockInfo\(candidateId\)/);
const locatorWithoutSafeInfo = locatorSource.slice(0, safeInfoStart) + locatorSource.slice(safeInfoEnd);
assert.doesNotMatch(locatorWithoutSafeInfo, /getBlockInfo\(id\)|getBlockInfo\(candidateId\)/);
assert.doesNotMatch(locatorSource, /getDayWorkspaceSectionEndAnchor/);
assert.doesNotMatch(locatorSource, /treeInfoRootId/);
assert.doesNotMatch(locatorSource, /(?:treeInfo|placeholderInfo|targetListInfo|previousInfo)\?\.(?:rootID|root_id)/);

const taskSource = readFileSync(new URL("../src/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceTaskService.ts", import.meta.url), "utf8");
const migrationStart = taskSource.indexOf("export async function migrateWorkspaceTaskToToday");
assert.ok(migrationStart >= 0, "任务迁移函数必须存在");
const migrationSource = taskSource.slice(migrationStart);
assert.doesNotMatch(migrationSource, /moveBlockTransactionChecked/);
assert.match(migrationSource, /resolveDayWorkspaceTaskMoveTarget/);
assert.match(migrationSource, /validateTaskMoveTarget/);
assert.match(migrationSource, /moveBlockChecked\(task\.blockId, target\.previousTaskItemId, target\.targetListId\)/);
assert.match(migrationSource, /verifyTaskMovePlacement/);
assert.match(migrationSource, /sourceRootId/);
assert.match(migrationSource, /targetListId/);
assert.match(migrationSource, /previousTaskItemId/);
assert.match(migrationSource, /placeholderTaskItemId/);
assert.match(migrationSource, /finally/);
assert.match(migrationSource, /deleteTaskMovePlaceholder/);
assert.match(migrationSource, /appendMarkdownToDaySection/);
assert.match(migrationSource, /refreshTaskIndexByRootIds\(/);
assert.match(migrationSource, /normalizeMigrationRootIds\(sourceRootId, todayDoc\.docId\)/);
assert.doesNotMatch(migrationSource, /updateTaskIndexItem/);
assert.doesNotMatch(migrationSource, /(?:window\.)?location\.reload|protyle\.reload|reloadUI/);
const ensureTaskIndex = migrationSource.indexOf("ensureTaskBlockExists(task.blockId)");
const resolveSourceRootIndex = migrationSource.indexOf("resolveTaskSourceRootId(task)");
assert.ok(
  ensureTaskIndex >= 0 && resolveSourceRootIndex > ensureTaskIndex,
  "必须先确认任务块存在，再解析任务来源根文档",
);
const earlyAlreadyTodayStart = migrationSource.indexOf("if (task.isTodayTask || task.sourceKind === \"migrated\")");
const earlyAlreadyTodayEnd = migrationSource.indexOf("if (!sourceRootId)", earlyAlreadyTodayStart);
assert.ok(earlyAlreadyTodayStart >= 0 && earlyAlreadyTodayEnd > earlyAlreadyTodayStart);
assert.doesNotMatch(migrationSource.slice(earlyAlreadyTodayStart, earlyAlreadyTodayEnd), /logTaskMigrationFailure/);
const sameRootStart = migrationSource.indexOf("if (sourceRootId === todayDoc.docId)");
const sameRootEnd = migrationSource.indexOf("let sourceParentId", sameRootStart);
assert.ok(sameRootStart >= 0 && sameRootEnd > sameRootStart);
assert.doesNotMatch(migrationSource.slice(sameRootStart, sameRootEnd), /logTaskMigrationFailure/);
assert.match(taskSource, /async function validateTaskMoveTarget/);
assert.match(taskSource, /validateTaskMoveTargetShape/);
assert.match(taskSource, /async function verifyTaskMovePlacement/);
assert.match(taskSource, /getBlockTreeInfos/);
assert.match(taskSource, /getBlockInfo\(taskBlockId\)/);
assert.match(taskSource, /\[enhancedDiary:migrateTask\]/);
assert.match(taskSource, /observedRootId/);
assert.match(taskSource, /observedParentId/);
assert.match(taskSource, /sourceParentId/);
assert.match(taskSource, /sourceParentType/);
assert.match(taskSource, /targetListParentId/);
assert.match(taskSource, /targetListParentType/);
assert.match(taskSource, /previousParentId/);
assert.match(taskSource, /previousParentType/);
assert.match(taskSource, /placeholderParentId/);
assert.doesNotMatch(taskSource, /treeInfoRootId/);
assert.doesNotMatch(taskSource, /(?:treeInfo|placeholderInfo|targetListInfo|previousInfo)\?\.(?:rootID|root_id)/);

const projectMoveSource = readFileSync(new URL("../src/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceProjectMove.ts", import.meta.url), "utf8");
assert.match(projectMoveSource, /moveBlockChecked/);
assert.doesNotMatch(projectMoveSource, /moveBlockTransactionChecked/);

const quickPromptSource = readFileSync(new URL("../src/features/kb/services/quick-prompts/quick-prompts-doc.ts", import.meta.url), "utf8");
assert.match(quickPromptSource, /moveBlockChecked/);
assert.doesNotMatch(quickPromptSource, /moveBlockTransactionChecked/);

console.log("enhanced diary task migration verification passed");
