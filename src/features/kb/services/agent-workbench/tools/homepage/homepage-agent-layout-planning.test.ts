import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSectionLayoutInvariants,
  mergeRemovedSectionRangesIntoAdjacentSections,
  rearrangeGlobalOrderBySections,
} from "../../../../../../components/utils/widgetBlock/utils/layout-section-ops";

function item(id: string, index: number) {
  return { id, index, style: null };
}

test("分栏模式新增组件后保持全局顺序连续且没有孤儿", () => {
  const globalOrder = [item("a", 0), item("new", 1), item("b", 2), item("c", 3)];
  const arranged = rearrangeGlobalOrderBySections(globalOrder, {
    work: { widgetIds: ["a", "b"] },
    life: { widgetIds: ["c", "new"] },
  }, ["work", "life"], { assignOrphansToFirstSection: true });
  assert.deepEqual(arranged.nextGlobalOrder.map((row) => row.id), ["a", "b", "new", "c"]);
  assert.deepEqual(arranged.nextSections.work.widgetIds, ["a", "b"]);
  assert.deepEqual(arranged.nextSections.life.widgetIds, ["new", "c"]);
  assert.doesNotThrow(() => assertSectionLayoutInvariants(arranged.nextGlobalOrder, arranged.nextSections, ["work", "life"], { requireAllAssigned: true }));
});

test("跨分栏移动后去除重复归属并保留目标栏内相对位置", () => {
  const globalOrder = [item("a", 0), item("c", 1), item("b", 2), item("d", 3)];
  const arranged = rearrangeGlobalOrderBySections(globalOrder, {
    work: { widgetIds: ["a"] },
    life: { widgetIds: ["c", "d", "b"] },
  }, ["work", "life"], { assignOrphansToFirstSection: true });
  assert.deepEqual(arranged.nextGlobalOrder.map((row) => row.id), ["a", "c", "b", "d"]);
  assert.deepEqual(arranged.nextSections.life.widgetIds, ["c", "b", "d"]);
  assert.equal(new Set(arranged.nextGlobalOrder.map((row) => row.id)).size, 4);
});

test("删除分栏只合并组件，不会丢失或删除组件 ID", () => {
  const globalOrder = [item("a", 0), item("b", 1), item("c", 2), item("d", 3)];
  const merged = mergeRemovedSectionRangesIntoAdjacentSections(globalOrder, {
    first: { widgetIds: ["a"] },
    middle: { widgetIds: ["b", "c"] },
    last: { widgetIds: ["d"] },
  }, ["first", "middle", "last"], ["middle"]);
  assert.deepEqual(new Set(merged.nextGlobalOrder.map((row) => row.id)), new Set(["a", "b", "c", "d"]));
  assert.equal(merged.receivingSectionByRemoved.get("middle"), "first");
  assert.deepEqual(merged.nextSections.first.widgetIds, ["a", "b", "c"]);
});
