import assert from "node:assert/strict";
import { resolveDocEditBlock, type DocEditBlockResolverDeps } from "../src/features/kb/services/doc-content-edit/doc-content-edit-block-resolver";

const kernelBlockIds = new Set<string>(["root"]);
const resolverDeps: DocEditBlockResolverDeps = {
  sql: async () => [],
  checkBlockExist: async (id) => kernelBlockIds.has(id),
  getBlockInfo: async (id) => ({
    box: "box-verify",
    path: `/verify/${id}.sy`,
    rootID: "doc-verify",
    rootTitle: "insert_block 连续插入验证",
  }),
  getBlockKramdown: async (id) => ({ id, kramdown: `块 ${id}` }),
};

async function insertImmediatelyAfter(referenceBlockId: string, insertedBlockId: string): Promise<void> {
  const reference = await resolveDocEditBlock(referenceBlockId, resolverDeps);
  assert.equal(reference.status, "exists", `${referenceBlockId} 必须能在 SQL miss 时由内核确认存在`);
  kernelBlockIds.add(insertedBlockId);
}

await insertImmediatelyAfter("root", "A");
await insertImmediatelyAfter("A", "B");
await insertImmediatelyAfter("B", "C");
assert.deepEqual([...kernelBlockIds], ["root", "A", "B", "C"]);

const missing = await resolveDocEditBlock("missing", resolverDeps);
assert.equal(missing.status, "missing");

const unknownDeps: DocEditBlockResolverDeps = {
  sql: async () => [],
  checkBlockExist: async () => { throw new Error("temporarily unavailable"); },
  getBlockInfo: async () => { throw new Error("temporarily unavailable"); },
  getBlockKramdown: async () => { throw new Error("temporarily unavailable"); },
};
const unknown = await resolveDocEditBlock("unknown", unknownDeps);
assert.equal(unknown.status, "unknown");

console.log("insert_block resolver race regression: ok");
