import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const path = "/data/storage/petal/siyuan-homepage/recent-doc-snapshot.json";
const id = "20261020000000-doc0001";
const otherId = "20261020000000-doc0002";
const consumers = ["task", "enhanced-diary", "enhanced-diary-project", "enhanced-diary-project-record", "statistical", "heatmap"];
const doc = (extra = {}) => ({ id, rootID: id, box: "20261020000000-box0001", path: "/fixture.sy", hpath: "/fixture", created: "20261020000000", updated: "20261020010000", content: "fixture", ial: "", ...extra });
const payload = (docs = [doc()], extra = {}) => ({ version: 1, updatedAt: "2026-10-20T00:00:00.000Z", docs: Object.fromEntries(docs.map(d => [d.id, d])), consumers: Object.fromEntries(consumers.map(c => [c, Object.fromEntries(docs.map(d => [d.id, d.updated]))])), ...extra });
const stubs = {
    "favorites-store": ["addFavoriteItem", "removeFavoriteItem", "removeFavoriteItemsByIds", "reorderFavoriteItems", "readFavoritesIndexStrict", "doesFavoritesIndexExist"],
    "notification-center-mobile-plan-manager": ["requestMobilePlanRefresh"],
    "notification-center-locks": ["withNotificationLock"],
    "enhancedDiaryIndex": ["getDiaryIndexEntriesForDisplay", "resolveEnhancedDiaryDateFromMetadata"],
};
const bundle = await build({
    stdin: { contents: 'export {prepareChangedRecentDocsForIndex} from "./src/components/tools/siyuanComponentDataApi"; export {setSiyuanRuntimePort} from "./src/runtime/siyuan-runtime-port";', loader: "ts", resolveDir: root },
    bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
    plugins: [{ name: "unrelated-side-effects", setup(api) {
        api.onResolve({ filter: /favorites-store$|notification-center-mobile-plan-manager$|notification-center-locks$|enhancedDiaryIndex$/ }, ({path}) => ({ path: path.split("/").at(-1), namespace: "fixture" }));
        api.onLoad({ filter: /.*/, namespace: "fixture" }, ({path}) => ({ contents: stubs[path].map(name => `export const ${name}=()=>{};`).join("\n"), loader: "js" }));
    } }],
});
let sequence = 0;
async function fixture(initial = payload(), docs = [doc()]) {
    const app = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}#${sequence++}`);
    const state = { text: initial === null ? null : JSON.stringify(initial), docs, reads: 0, writes: 0, directories: 0, writeFailures: 0, calls: [] };
    app.setSiyuanRuntimePort({
        async getFile(target) {
            assert.equal(target, path, "only the fixture snapshot may be read");
            state.reads++;
            if (state.readError || (state.readbackError && state.writes)) throw Error("fixture read unavailable");
            if ("readResponse" in state) return state.readResponse;
            return state.text === null ? { code: 404 } : state.text;
        },
        async putFile(target, directory, blob) {
            if (directory) { state.directories++; return {code: 0}; }
            assert.equal(target, path, "only the fixture snapshot may be written");
            if (state.writeError) return {code: -1, msg: "fixture write failed"};
            if (state.writeFailures > 0) { state.writeFailures--; return {code: -1, msg: "fixture write failed"}; }
            state.writes++;
            if (!state.dropWrite) state.text = await blob.text();
            state.afterWrite?.();
            return {code: 0};
        },
        async post(target, data) {
            state.calls.push(target);
            if (target === "/api/storage/getRecentDocs") return {code: 0, data: state.docs};
            assert.equal(target, "/api/query/sql", "no business write API is permitted");
            assert.match(data.stmt, /WHERE id IN/);
            return {code: 0, data: state.docs};
        },
    });
    return { state, prepare: app.prepareChangedRecentDocsForIndex, saved: () => JSON.parse(state.text) };
}
let passed = 0, failed = 0;
async function test(name, run) {
    try { await run(); passed++; console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}: ${error.name}: ${error.message}`); }
}
if (process.argv.includes("--measure")) {
    const f = await fixture();
    for (let i = 0; i < 5; i++) await (await f.prepare("task")).commit();
    console.log(JSON.stringify({ repeatedUnchangedCommits: 5, fileWrites: f.state.writes, directoryWrites: f.state.directories, updatedAtUnchanged: f.saved().updatedAt === payload().updatedAt }));
} else {
    await test("confirmed missing file initializes once and verifies disk", async () => {
        const f = await fixture(null);
        const p = await f.prepare("task"); assert.equal(p.changedDocs.length, 1);
        await p.commit(); assert.equal(f.state.writes, 1); assert.deepEqual(f.saved().docs[id], doc());
        assert.equal(f.saved().consumers.task[id], doc().updated); assert(f.state.reads >= 3);
    });
    await test("five unchanged commits skip file and directory writes and retain updatedAt", async () => {
        const f = await fixture(); const before = f.state.text;
        for (let i = 0; i < 5; i++) { const p = await f.prepare("task"); assert.equal(p.changedDocs.length, 0); await p.commit(); }
        assert.equal(f.state.writes, 0); assert.equal(f.state.directories, 0); assert.equal(f.state.text, before);
    });
    await test("object key order alone is not a change", async () => {
        const reverse = value => Array.isArray(value) ? value.map(reverse) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([k,v]) => [k,reverse(v)])) : value;
        const f = await fixture(reverse(payload())); await (await f.prepare("task")).commit(); assert.equal(f.state.writes, 0);
    });
    for (const [name, changed] of [["new document", doc({id: otherId, rootID: otherId})], ["document timestamp", doc({updated: "20261020020000"})], ["document path", doc({path: "/changed.sy"})], ["document content", doc({content: "changed fixture"})], ["document attributes", doc({ial: 'custom-fixture="yes"'})]]) {
        await test(`${name} writes once; repeated commit skips`, async () => {
            const f = await fixture(payload(), [changed]); const p = await f.prepare("task");
            assert.equal(p.changedDocs.length, name === "new document" || name === "document timestamp" ? 1 : 0, "existing cursor-based changedDocs contract remains unchanged");
            await p.commit(); await p.commit(); assert.equal(f.state.writes, 1); assert.deepEqual(f.saved().docs[changed.id], changed);
        });
    }
    await test("cursor update preserves every other consumer and unknown semantic fields", async () => {
        const initial = payload(); initial.consumers.task[id] = "20261020000000";
        initial.consumers.external = {[otherId]: "20261020030000"}; initial.extension = {nested: [1, {a: true}]}; initial.docs[id].extension = {preserved: true};
        const f = await fixture(initial); const p = await f.prepare("task"); assert.equal(p.changedDocs.length, 1);
        await p.commit(); assert.equal(f.state.writes, 1);
        const saved = f.saved(); assert.deepEqual(saved.extension, initial.extension); assert.deepEqual(saved.docs[id].extension, initial.docs[id].extension);
        for (const c of Object.keys(initial.consumers).filter(c => c !== "task")) assert.deepEqual(saved.consumers[c], initial.consumers[c]);
        assert.equal(saved.consumers.task[id], doc().updated);
    });
    await test("all six consumers retain changedDocs and idempotent commit semantics", async () => {
        const f = await fixture(payload([], {consumers: {}}));
        for (const c of consumers) { const p = await f.prepare(c); assert.equal(p.changedDocs.length, 1); await p.commit(); }
        assert.equal(f.state.writes, 6);
        for (const c of consumers) { const p = await f.prepare(c); assert.equal(p.changedDocs.length, 0); await p.commit(); }
        assert.equal(f.state.writes, 6); assert.equal(Object.keys(f.saved().consumers).length, 6);
    });
    await test("concurrent consumers merge latest disk cursors", async () => {
        const f = await fixture(payload([], {consumers: {}})); const a = await f.prepare("task"), b = await f.prepare("heatmap");
        await Promise.all([b.commit(), a.commit()]); assert.equal(f.state.writes, 2);
        assert.equal(f.saved().consumers.task[id], doc().updated); assert.equal(f.saved().consumers.heatmap[id], doc().updated);
    });
    await test("same consumer concurrent duplicate commits write only once", async () => {
        const f = await fixture(null); const a = await f.prepare("task"), b = await f.prepare("task");
        await Promise.all([a.commit(), b.commit()]); assert.equal(f.state.writes, 1);
    });
    await test("stale prepare cannot overwrite another consumer's newer document", async () => {
        const f = await fixture(); const a = await f.prepare("task"); f.state.docs = [doc({updated: "20261020020000", path: "/newer.sy"})];
        await (await f.prepare("heatmap")).commit(); const before = f.state.text;
        await assert.rejects(a.commit()); assert.equal(f.state.text, before); assert.equal(f.state.writes, 1);
        assert.equal(f.saved().consumers.heatmap[id], "20261020020000");
    });
    await test("same-timestamp external metadata change is not overwritten", async () => {
        const f = await fixture(); const p = await f.prepare("task"); const external = payload(); external.docs[id].path = "/external.sy"; f.state.text = JSON.stringify(external);
        await assert.rejects(p.commit()); assert.equal(f.state.writes, 0); assert.equal(f.saved().docs[id].path, "/external.sy");
    });
    await test("external consumer-only update is preserved", async () => {
        const f = await fixture(); const p = await f.prepare("task"); const external = payload(); external.consumers.heatmap[id] = "20261020030000"; f.state.text = JSON.stringify(external);
        await p.commit(); assert.equal(f.state.writes, 0); assert.equal(f.saved().consumers.heatmap[id], "20261020030000");
    });
    await test("external deletion after prepare cannot initialize over lost snapshot", async () => {
        const f = await fixture(); const p = await f.prepare("task"); f.state.text = null;
        await assert.rejects(p.commit()); assert.equal(f.state.writes, 0);
    });
    for (const field of ["document", "cursor"]) await test(`external ${field} deletion after prepare is not silently restored`, async () => {
        const f = await fixture(); const p = await f.prepare("task"); const external = payload();
        if (field === "document") delete external.docs[id]; else delete external.consumers.task[id];
        f.state.text = JSON.stringify(external); const before = f.state.text;
        await assert.rejects(p.commit()); assert.equal(f.state.writes, 0); assert.equal(f.state.text, before);
    });
    await test("unknown JSON keys and nested timestamps survive a real write", async () => {
        const initial = JSON.parse(JSON.stringify(payload()).replace('"version":1', '"__proto__":{"updatedAt":"nested"},"version":1'));
        const f = await fixture(initial, [doc({path: "/changed.sy"})]); await (await f.prepare("task")).commit();
        assert.equal(f.state.writes, 1); assert.deepEqual(f.saved()["__proto__"], initial["__proto__"]);
    });
    await test("network read failure stops prepare and commit without writes; queue recovers", async () => {
        const f = await fixture(); f.state.readError = true; await assert.rejects(f.prepare("task"));
        f.state.readError = false; const p = await f.prepare("task"); f.state.readError = true; await assert.rejects(p.commit());
        assert.equal(f.state.writes, 0); f.state.readError = false; await (await f.prepare("task")).commit(); assert.equal(f.state.writes, 0);
    });
    const invalid = [
        ["malformed JSON", "{"], ["null JSON", "null"], ["empty file", ""], ["wrong version", {...payload(), version: 2}],
        ["missing version", {updatedAt: "fixture", docs: {}, consumers: {}}], ["missing updatedAt", {version: 1, docs: {}, consumers: {}}],
        ["missing docs", {version: 1, updatedAt: "fixture", consumers: {}}], ["missing consumers", {version: 1, updatedAt: "fixture", docs: {}}],
        ["null docs", {...payload(), docs: null}], ["array docs", {...payload(), docs: []}], ["array consumers", {...payload(), consumers: []}],
        ["invalid document ID", {...payload(), docs: {invalid: doc()}}], ["mismatched document key", {...payload(), docs: {[otherId]: doc()}}],
        ["non-string document field", {...payload(), docs: {[id]: doc({path: 7})}}], ["invalid cursor", {...payload(), consumers: {task: {[id]: 7}}}],
        ["null consumer", {...payload(), consumers: {task: null}}],
    ];
    for (const [name, value] of invalid) await test(`${name} is rejected at prepare and queued commit`, async () => {
        const f = await fixture(); const p = await f.prepare("task"); f.state.text = typeof value === "string" ? value : JSON.stringify(value); const before = f.state.text;
        await assert.rejects(f.prepare("task")); await assert.rejects(p.commit()); assert.equal(f.state.writes, 0); assert.equal(f.state.text, before);
    });
    await test("write failure rejects; later queued commit can recover", async () => {
        const f = await fixture(null); const p = await f.prepare("task"); f.state.writeError = true;
        await assert.rejects(p.commit()); f.state.writeError = false; await p.commit(); assert.equal(f.state.writes, 1);
    });
    await test("a failed concurrent commit does not discard the next consumer", async () => {
        const f = await fixture(null); const a = await f.prepare("task"), b = await f.prepare("heatmap"); f.state.writeFailures = 1;
        const results = await Promise.allSettled([a.commit(), b.commit()]);
        assert.equal(results[0].status, "rejected"); assert.equal(results[1].status, "fulfilled");
        assert.equal(f.state.writes, 1); assert.equal(f.saved().consumers.heatmap[id], doc().updated);
    });
    for (const [name, response] of [["permission denied", {code: 403, msg: "fixture forbidden"}], ["API error", {code: -1, msg: "fixture error"}], ["unknown null response", null], ["unknown undefined response", undefined]]) {
        await test(`${name} cannot initialize or overwrite a snapshot`, async () => {
            const f = await fixture(); const p = await f.prepare("task"); f.state.readResponse = response;
            await assert.rejects(f.prepare("task")); await assert.rejects(p.commit()); assert.equal(f.state.writes, 0);
        });
    }
    await test("timestamp-only external update does not force another save", async () => {
        const f = await fixture(); const p = await f.prepare("task"); const external = payload(); external.updatedAt = "2026-10-20T01:00:00.000Z";
        f.state.text = JSON.stringify(external); await p.commit(); assert.equal(f.state.writes, 0); assert.equal(f.saved().updatedAt, external.updatedAt);
    });
    await test("disk readback failure never reports confirmed save", async () => {
        const f = await fixture(null); f.state.readbackError = true; await assert.rejects((await f.prepare("task")).commit()); assert.equal(f.state.writes, 1);
    });
    await test("lost write and readback mismatch reject", async () => {
        const f = await fixture(null); f.state.dropWrite = true; await assert.rejects((await f.prepare("task")).commit());
        const g = await fixture(null); g.state.afterWrite = () => { const saved = g.saved(); saved.consumers.task[id] = "20261020030000"; g.state.text = JSON.stringify(saved); };
        await assert.rejects((await g.prepare("task")).commit());
    });
    for (const changed of ["nested timestamp", "array order", "unknown JSON key"]) await test(`readback includes ${changed}; only top-level updatedAt may be ignored for no-ops`, async () => {
        const initial = payload(); initial.docs[id].updatedAt = "nested-old"; initial.extension = [1, 2];
        Object.defineProperty(initial, "__proto__", {value: {preserved: true}, enumerable: true});
        const f = await fixture(initial, [doc({path: "/changed.sy"})]);
        f.state.afterWrite = () => {
            const saved = f.saved();
            if (changed === "nested timestamp") saved.docs[id].updatedAt = "nested-new";
            if (changed === "array order") saved.extension.reverse();
            if (changed === "unknown JSON key") saved["__proto__"].preserved = false;
            f.state.text = JSON.stringify(saved);
        };
        await assert.rejects((await f.prepare("task")).commit()); assert.equal(f.state.writes, 1);
    });
    await test("empty recent collection initializes valid snapshot without deleting historical docs", async () => {
        const f = await fixture(null, []); const p = await f.prepare("task"); assert.deepEqual(p.changedDocs, []); await p.commit(); await p.commit();
        assert.equal(f.state.writes, 1); assert.deepEqual(f.saved().docs, {}); assert.deepEqual(f.saved().consumers.task, {});
        const g = await fixture(payload(), []); await (await g.prepare("task")).commit(); assert.equal(g.state.writes, 0); assert.deepEqual(g.saved(), payload());
    });
    console.log(`recent-doc snapshot: ${passed} passed, ${failed} failed (production prepare/commit; fixture-only file API)`);
    if (failed) process.exitCode = 1;
}
