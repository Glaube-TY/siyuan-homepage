import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const diaryDir = "src/components/utils/widgetBlock/widget/enhancedDiary";
const ui = await readFile(resolve(root, "src/homepage/homepageSetting/tabs/IndexManagementSettingsTab.svelte"), "utf8");
const formatter = ui.slice(ui.indexOf("    function formatStatus("), ui.indexOf("    function dispatchEnhancedDiaryIndexesUpdated("));
assert(formatter.includes("return"));
const unused = `const unused = () => { throw new Error("unused UI/write dependency was called"); };`;
const stubs = {
    enhancedDiaryActions: ["addQuickRecordToDiary", "getOrCreateTodayDiaryDocument"],
    enhancedDiaryUtils: ["renderEnhancedDiaryTemplate", "scanDiaryContentForPeriod", "getSkipMarker", "formatDiaryDate"],
    openDocs: ["openDocs"],
    enhancedDiaryWorkspaceProjectLifecycle: ["extractProjectWriteTargetErrorCode", "validateEnhancedDiaryProjectWriteTarget"],
};
const bundled = await build({
    stdin: { contents: `
        export { setSiyuanRuntimePort } from "./src/runtime/siyuan-runtime-port";
        export { normalizeEnhancedDiaryConfig } from "./${diaryDir}/enhancedDiaryConfig";
        export { DEFAULT_ENHANCED_DIARY_TEMPLATES } from "./${diaryDir}/enhancedDiaryTypes";
        export { getEnhancedDiaryIndexEntriesStrict } from "./${diaryDir}/enhancedDiaryIndex";
        export { readDiaryMarkdownResult } from "./${diaryDir}/enhancedDiaryDoc";
        export { queryTodayQuickRecordsDetailed } from "./${diaryDir}/workspace/enhancedDiaryWorkspaceRecordService";
        export { appendRecordProjectReference } from "./src/features/task-data/task-project-reference";
        export { rebuildEnhancedDiaryProjectRecordIndex, refreshEnhancedDiaryProjectRecordIndex,
            readEnhancedDiaryProjectRecordIndex, getEnhancedDiaryProjectRecordIndexStatus,
            formatEnhancedDiaryProjectRecordDiagnostics } from "./${diaryDir}/enhancedDiaryProjectRecordIndex";
        ${formatter.replace("    function", "export function")}
    `, loader: "ts", resolveDir: root },
    bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
    plugins: [{ name: "isolate-unused-ui-and-write-paths", setup(buildApi) {
        buildApi.onResolve({ filter: /enhancedDiaryActions$|enhancedDiaryUtils$|openDocs$|enhancedDiaryWorkspaceProjectLifecycle$|siyuanComponentDataApi$/ }, ({ path }) => ({ path: path.split("/").at(-1), namespace: "verifier-stub" }));
        buildApi.onLoad({ filter: /.*/, namespace: "verifier-stub" }, ({ path }) => ({ loader: "js", contents: path === "siyuanComponentDataApi"
            ? "export const prepareChangedRecentDocsForIndex = (...args) => globalThis.__projectRecordVerifier.prepare(...args);"
            : `${unused}\n${stubs[path].map((name) => `export const ${name} = unused;`).join("\n")}` }));
    } }],
});
let sequence = 0;
async function newRuntime() {
    return import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}#fixture-${sequence++}`);
}
const BASE = "/data/storage/petal/siyuan-homepage/";
const DIARY = `${BASE}enhanced-diary-index.json`;
const RECORD = `${BASE}enhanced-diary-project-record-index.json`;
const PROJECT = `${BASE}enhanced-diary-project-index.json`;
const NOTEBOOK = "20261008000000-nnnnnnn";
const PROJECT_ID = "20261008000001-ppppppp";
const ids = Array.from({ length: 4 }, (_, index) => `2026100800000${index + 2}-ddddddd`);
function blockId(docId, kind) {
    return `${docId.slice(0, 15)}${{ root: "rootaaa", quick: "quickaa", category: "categaa", record: "recorda", body: "bodyaaa", old: "oldreca" }[kind]}`;
}
// Mock official block API shape from synthetic template Markdown; assertions run the real parser.
function templateBlocks(docId, template) {
    return template.split(/\n\s*\n/).filter((part) => part.trim()).map((markdown, index) => {
        const level = /^(#{1,6})\s/.exec(markdown)?.[1].length;
        return { id: `${docId.slice(0, 15)}${index.toString(36).padStart(7, "0")}`, type: level ? "h" : "p", subType: level ? `h${level}` : "", markdown };
    });
}
// Published v5.0.0 DEFAULT_DAY_TEMPLATE, captured from that tag (no user diary data).
const RELEASED_DAY_TEMPLATE = ["# 今日日记", "## 任务管理", "### 新建任务", "### 迁移任务", "### 任务动态", "## 快速记录",
    "## 今日复盘", "### 今日总结", "### 情绪状态", "### 收获与问题", "### 明日关注"].join("\n\n");
function blocks(docId, { rootTitle = "今日日记", quickTitle = "快速记录", rootLevel = 1, quickLevel = 2, missingRoot = false, missingQuick = false, empty = false, unsupported = false, template, body = "fixture record body" } = {}) {
    if (template !== undefined) return templateBlocks(docId, template);
    const heading = (suffix, level, title) => ({ id: blockId(docId, suffix), type: "h", subType: `h${level}`, markdown: `${"#".repeat(level)} ${title}` });
    if (missingRoot) return [{ id: blockId(docId, "body"), type: "p", markdown: "fixture body" }];
    const result = [heading("root", rootLevel, rootTitle)];
    if (missingQuick) return result;
    result.push(heading("quick", quickLevel, quickTitle));
    if (unsupported) result.push({ id: blockId(docId, "body"), type: "p", markdown: "unrecognized fixture content" });
    else if (!empty) result.push(heading("category", quickLevel + 1, "随手记录"), heading("record", quickLevel + 2, "09:00 #fixture#"), { id: blockId(docId, "body"), type: "p", markdown: body });
    return result;
}
function oldItem(docId, date = "2026-10-01") {
    const id = blockId(docId, "old");
    return { id, headingBlockId: id, diaryDocId: docId, date, category: "fixture", tags: [], projectTargetId: PROJECT_ID,
        isKeyRecord: false, preview: "fixture previous record", updatedAt: "2026-10-01T00:00:00Z", relationStatus: "normal" };
}
async function fixture({ count = 1, shapes = {}, old = false, complete = true } = {}) {
    const runtime = await newRuntime();
    const config = runtime.normalizeEnhancedDiaryConfig({ dailyNotebookId: NOTEBOOK, projectStorage: { mode: "parentDoc", parentDocId: PROJECT_ID } });
    const docs = Object.fromEntries(ids.slice(0, count).map((id, index) => [`2026100${index + 1}`, { id, date: `2026100${index + 1}`, box: NOTEBOOK }]));
    const state = { files: new Map([
        [DIARY, { version: 4, updatedAt: "2026-10-01T00:00:00Z", notebookId: NOTEBOOK, complete: true, docs }],
        [PROJECT, { version: 1, updatedAt: "2026-10-01T00:00:00Z", containerSignature: `parentDoc:${PROJECT_ID}`, complete: true,
            roots: { [PROJECT_ID]: { id: PROJECT_ID, kind: "root", title: "fixture project", notebookId: NOTEBOOK,
                path: "/fixture.sy", hpath: "/fixture", order: 0, updated: "20261008000000", status: "active", archivedAt: "" } }, nodes: {} }],
    ]), shapes, writes: [], calls: [], markdownFailures: new Set(), blockFailures: new Set(), blockResponses: new Map(),
        markdownResponses: new Map(), unlinked: false, attrFailure: false, attrResponse: undefined,
        writeFailure: false, readbackFailure: false, changedDocs: [], commits: 0 };
    if (old) state.files.set(RECORD, { version: 1, updatedAt: "2026-10-01T00:00:00Z", notebookId: NOTEBOOK, complete,
        items: Object.fromEntries(ids.slice(0, count).map((id) => { const item = oldItem(id); return [item.id, item]; })) });
    globalThis.__projectRecordVerifier = { async prepare() { return { changedDocs: state.changedDocs, async commit() { state.commits += 1; } }; } };
    runtime.setSiyuanRuntimePort({
        async getFile(path) {
            state.calls.push({ path });
            if (state.readbackFailure && path === RECORD && state.writes.length) return "{}";
            return state.files.has(path) ? structuredClone(state.files.get(path)) : { code: 404, msg: "not found" };
        },
        async putFile(path, isDir, file) {
            if (isDir) return { code: 0 };
            assert.equal(path, RECORD, "only this derived index may be written");
            if (state.writeFailure) return { code: 500 };
            const next = JSON.parse(await file.text());
            state.writes.push(next);
            state.files.set(path, next);
            return { code: 0 };
        },
        async post(path, payload) {
            state.calls.push({ path, payload });
            if (path === "/api/export/exportMdContent") return state.markdownFailures.has(payload.id) ? { code: 403 } : { code: 0, data: {
                content: state.markdownResponses.has(payload.id) ? state.markdownResponses.get(payload.id) : blocks(payload.id, state.shapes[payload.id]).map((block) => block.markdown).join("\n\n"),
            } };
            if (path === "/api/block/getChildBlocks") return state.blockFailures.has(payload.id) ? { code: 500 } : {
                code: 0, data: state.blockResponses.has(payload.id) ? state.blockResponses.get(payload.id) : blocks(payload.id, state.shapes[payload.id]),
            };
            if (path === "/api/attr/batchGetBlockAttrs") return { code: state.attrFailure ? 403 : 0, data: state.attrResponse === undefined ?
                Object.fromEntries(payload.ids.map((id) => [id, { id, ...(state.unlinked ? {} : { "custom-homepage-enhanced-diary-project-target": PROJECT_ID }) }])) : state.attrResponse };
            throw new Error(`unexpected API call ${path}`);
        },
    });
    return { runtime, config, state };
}

{
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args);
    try {
        const all = await fixture({ count: 4 });
        const success = await all.runtime.rebuildEnhancedDiaryProjectRecordIndex(all.config);
        assert.equal(success.lastStatus, "success");
        assert.equal(success.migratedCount, 4);
        assert.equal(success.skippedCount, 0);
        const readSuccess = await all.runtime.getEnhancedDiaryProjectRecordIndexStatus(NOTEBOOK);
        assert.equal(readSuccess.lastStatus, "success");
        assert.match(all.runtime.formatStatus(readSuccess), /^成功/);
        assert(Object.values(all.state.files.get(RECORD).items).every((item) => item.projectTargetId === PROJECT_ID && item.relationStatus === "missing_visible_reference"));
        const linked = await fixture({ shapes: { [ids[0]]: { body: all.runtime.appendRecordProjectReference("fixture record body", PROJECT_ID, "fixture project") } } });
        assert.equal((await linked.runtime.rebuildEnhancedDiaryProjectRecordIndex(linked.config)).lastStatus, "success");
        assert.equal(Object.values(linked.state.files.get(RECORD).items)[0].relationStatus, "normal");

        const currentTemplate = all.runtime.DEFAULT_ENHANCED_DIARY_TEMPLATES.day;
        assert.equal(currentTemplate, RELEASED_DAY_TEMPLATE, "the captured v5.0.0 default matches the current empty template");
        for (const template of [currentTemplate, RELEASED_DAY_TEMPLATE]) {
            const emptyTemplate = await fixture({ old: true, shapes: { [ids[0]]: { template } } });
            assert.equal((await emptyTemplate.runtime.rebuildEnhancedDiaryProjectRecordIndex(emptyTemplate.config)).lastStatus, "success");
            assert.deepEqual(emptyTemplate.state.files.get(RECORD).items, {});
            const withRecord = template.replace("## 快速记录", "## 快速记录\n\n### 随手记录\n\n#### 09:00 #fixture#\n\nfixture record body");
            const normalTemplate = await fixture({ shapes: { [ids[0]]: { template: withRecord } } });
            assert.equal((await normalTemplate.runtime.rebuildEnhancedDiaryProjectRecordIndex(normalTemplate.config)).migratedCount, 1);
        }
        const unlinked = await fixture({ old: true });
        unlinked.state.unlinked = true;
        assert.equal((await unlinked.runtime.rebuildEnhancedDiaryProjectRecordIndex(unlinked.config)).lastStatus, "success");
        assert.deepEqual(unlinked.state.files.get(RECORD).items, {}, "a successfully parsed unlinked record is not an API failure");

        const failedShapes = Object.fromEntries(ids.map((id) => [id, { missingQuick: true }]));
        const firstBuildFailed = await fixture({ count: 4, shapes: failedShapes });
        const zeroWritten = await firstBuildFailed.runtime.rebuildEnhancedDiaryProjectRecordIndex(firstBuildFailed.config);
        assert.equal(zeroWritten.migratedCount, 0);
        assert.equal(zeroWritten.skippedCount, 4);
        assert.equal(zeroWritten.lastStatus, "error", "written 0/skipped 4 must never report complete success");
        assert.equal(firstBuildFailed.state.files.get(RECORD).complete, false);
        const failed = await fixture({ count: 4, old: true, shapes: failedShapes });
        const before = structuredClone(failed.state.files.get(RECORD).items);
        const partial = await failed.runtime.rebuildEnhancedDiaryProjectRecordIndex(failed.config);
        assert.equal(partial.lastStatus, "error");
        assert.equal(partial.skippedCount, 4);
        assert.deepEqual(failed.state.files.get(RECORD).items, before);
        assert.equal(failed.state.files.get(RECORD).complete, false);
        assert.equal(failed.state.files.get(RECORD).failures.length, 4);
        assert(failed.state.files.get(RECORD).failures.every((failure) => failure.reason === "quick_record_heading_missing" && failure.docId && failure.date && failure.stage && failure.missingPath));
        const reread = await failed.runtime.getEnhancedDiaryProjectRecordIndexStatus(NOTEBOOK);
        assert.equal(reread.lastStatus, partial.lastStatus);
        assert.equal(reread.skippedCount, 4);
        assert.match(failed.runtime.formatStatus(reread), /^重建未完整/);
        assert.doesNotMatch(failed.runtime.formatStatus(reread), /未执行|成功/);
        const diagnostic = failed.runtime.formatEnhancedDiaryProjectRecordDiagnostics({ ...failed.state.files.get(RECORD),
            token: "private-config", body: "private-body", project: "private-project" });
        assert.equal(JSON.parse(diagnostic).failures.length, 4);
        assert.doesNotMatch(diagnostic, /private-|fixture previous record|fixture project|items|notebookId/);
        const sanitized = failed.runtime.formatEnhancedDiaryProjectRecordDiagnostics({ ...failed.state.files.get(RECORD), updatedAt: "private-timestamp",
            failures: [{ ...failed.state.files.get(RECORD).failures[0], stage: "private-stage", reason: "private-reason", missingPath: ["private-heading"] }] });
        assert.doesNotMatch(sanitized, /private-/);
        const privateAliases = await fixture({ old: true });
        privateAliases.config.templateFieldMapping.rootHeadings.day = ["private-heading-alias"];
        await privateAliases.runtime.rebuildEnhancedDiaryProjectRecordIndex(privateAliases.config);
        assert.doesNotMatch(privateAliases.runtime.formatEnhancedDiaryProjectRecordDiagnostics(privateAliases.state.files.get(RECORD)), /private-heading-alias/);
        assert(warnings.every(([, details]) => !JSON.stringify(details).includes("fixture record body")));

        const mixed = await fixture({ count: 2, old: true, shapes: { [ids[1]]: { missingRoot: true } } });
        await mixed.runtime.rebuildEnhancedDiaryProjectRecordIndex(mixed.config);
        assert(mixed.state.files.get(RECORD).items[blockId(ids[0], "record")]);
        assert(!mixed.state.files.get(RECORD).items[blockId(ids[0], "old")]);
        assert(mixed.state.files.get(RECORD).items[blockId(ids[1], "old")]);
        assert.equal(mixed.state.files.get(RECORD).failures[0].reason, "diary_root_missing");

        const alias = await fixture({ shapes: { [ids[0]]: { rootTitle: "旧日记", quickTitle: "随手记录区", quickLevel: 4 } } });
        alias.config.templateFieldMapping.rootHeadings.day = ["今日日记", "旧日记"];
        alias.config.templateFieldMapping.dayWorkspaceSections.quickRecords = ["快速记录", "随手记录区"];
        assert.equal((await alias.runtime.rebuildEnhancedDiaryProjectRecordIndex(alias.config)).lastStatus, "success");
        assert.equal(Object.keys(alias.state.files.get(RECORD).items).length, 1);
        const wrongLevel = await fixture({ old: true, shapes: { [ids[0]]: { rootLevel: 2, quickLevel: 3 } } });
        assert.equal((await wrongLevel.runtime.rebuildEnhancedDiaryProjectRecordIndex(wrongLevel.config)).skippedCount, 1);
        assert.equal(wrongLevel.state.files.get(RECORD).failures[0].reason, "heading_mapping_mismatch");
        const empty = await fixture({ old: true, shapes: { [ids[0]]: { empty: true } } });
        assert.equal((await empty.runtime.rebuildEnhancedDiaryProjectRecordIndex(empty.config)).lastStatus, "success");
        assert.deepEqual(empty.state.files.get(RECORD).items, {}, "a proven empty record section may replace stale relations");
        const unsupported = await fixture({ old: true, shapes: { [ids[0]]: { unsupported: true } } });
        const unsupportedOld = structuredClone(unsupported.state.files.get(RECORD).items);
        assert.equal((await unsupported.runtime.rebuildEnhancedDiaryProjectRecordIndex(unsupported.config)).lastStatus, "error");
        assert.equal(unsupported.state.files.get(RECORD).failures[0].reason, "quick_record_structure_unsupported");
        assert.deepEqual(unsupported.state.files.get(RECORD).items, unsupportedOld);
        const emptyDocument = await fixture({ old: true });
        emptyDocument.state.markdownResponses.set(ids[0], "");
        emptyDocument.state.blockResponses.set(ids[0], []);
        assert.deepEqual(await emptyDocument.runtime.readDiaryMarkdownResult(ids[0]), { ok: true, content: "" });
        await emptyDocument.runtime.rebuildEnhancedDiaryProjectRecordIndex(emptyDocument.config);
        assert.equal(emptyDocument.state.files.get(RECORD).failures[0].reason, "diary_root_missing");
        for (const response of [null, {}, [null]]) {
            const malformedBlocks = await fixture({ old: true });
            malformedBlocks.state.blockResponses.set(ids[0], response);
            await malformedBlocks.runtime.rebuildEnhancedDiaryProjectRecordIndex(malformedBlocks.config);
            assert.equal(malformedBlocks.state.files.get(RECORD).failures[0].reason, "block_structure_read_failed");
            assert(malformedBlocks.state.files.get(RECORD).items[blockId(ids[0], "old")]);
        }
        for (const damage of ["invalidId", "duplicateId"]) {
            const malformedBlocks = await fixture({ old: true });
            const response = blocks(ids[0]);
            response.at(-1).id = damage === "invalidId" ? 123 : response[0].id;
            malformedBlocks.state.blockResponses.set(ids[0], response);
            await malformedBlocks.runtime.rebuildEnhancedDiaryProjectRecordIndex(malformedBlocks.config);
            assert.equal(malformedBlocks.state.files.get(RECORD).failures[0].reason, "block_structure_read_failed");
            assert(malformedBlocks.state.files.get(RECORD).items[blockId(ids[0], "old")]);
        }
        const malformedAttrs = await fixture({ old: true });
        malformedAttrs.state.attrResponse = {};
        await malformedAttrs.runtime.rebuildEnhancedDiaryProjectRecordIndex(malformedAttrs.config);
        assert.equal(malformedAttrs.state.files.get(RECORD).failures[0].reason, "block_attributes_read_failed");
        const relationFailure = await fixture({ old: true });
        const malformedProject = relationFailure.state.files.get(PROJECT);
        malformedProject.roots = {};
        malformedProject.nodes[PROJECT_ID] = { id: PROJECT_ID, kind: "node", rootProjectId: PROJECT_ID, title: "fixture node" };
        await relationFailure.runtime.rebuildEnhancedDiaryProjectRecordIndex(relationFailure.config);
        assert.equal(relationFailure.state.files.get(RECORD).failures[0].reason, "project_relation_read_failed");
        assert(relationFailure.state.files.get(RECORD).items[blockId(ids[0], "old")]);
        const missingTargetIdentity = await fixture({ old: true });
        missingTargetIdentity.state.files.get(PROJECT).roots[PROJECT_ID] = {};
        await missingTargetIdentity.runtime.rebuildEnhancedDiaryProjectRecordIndex(missingTargetIdentity.config);
        assert.equal(missingTargetIdentity.state.files.get(RECORD).failures[0].reason, "project_relation_read_failed");
        assert(missingTargetIdentity.state.files.get(RECORD).items[blockId(ids[0], "old")], "unknown target data must not be treated as a removed relation");

        for (const kind of ["markdown", "blocks", "attributes", "project"]) {
            const test = await fixture({ old: true });
            if (kind === "markdown") test.state.markdownFailures.add(ids[0]);
            if (kind === "blocks") test.state.blockFailures.add(ids[0]);
            if (kind === "attributes") test.state.attrFailure = true;
            if (kind === "project") test.state.files.set(PROJECT, "damaged");
            const old = structuredClone(test.state.files.get(RECORD).items);
            const result = await test.runtime.rebuildEnhancedDiaryProjectRecordIndex(test.config);
            assert.equal(result.lastStatus, "error");
            assert.equal(result.skippedCount, 1);
            assert.deepEqual(test.state.files.get(RECORD).items, old);
            assert.equal(test.state.files.get(RECORD).failures[0].reason, { markdown: "markdown_read_failed", blocks: "block_structure_read_failed", attributes: "block_attributes_read_failed", project: "project_relation_read_failed" }[kind]);
        }
        for (const invalid of ["damaged", { version: 4 }, { version: 4, updatedAt: "", notebookId: NOTEBOOK, complete: false, docs: {} },
            { version: 4, updatedAt: "", notebookId: NOTEBOOK, complete: true, docs: { "20261001": {} } }, { code: 403 }]) {
            const test = await fixture({ old: true });
            test.state.files.set(DIARY, invalid);
            const old = structuredClone(test.state.files.get(RECORD));
            assert.equal((await test.runtime.rebuildEnhancedDiaryProjectRecordIndex(test.config)).lastStatus, "error");
            assert.equal(test.state.writes.length, 0);
            assert.deepEqual(test.state.files.get(RECORD), old);
        }
        const missingUpstream = await fixture({ old: true });
        missingUpstream.state.files.delete(DIARY);
        assert.equal((await missingUpstream.runtime.rebuildEnhancedDiaryProjectRecordIndex(missingUpstream.config)).lastStatus, "error");
        assert.equal(missingUpstream.state.writes.length, 0);
        const damagedCurrent = await fixture({ old: true });
        await damagedCurrent.runtime.readEnhancedDiaryProjectRecordIndex(NOTEBOOK);
        damagedCurrent.state.files.set(RECORD, "damaged after cache");
        assert.equal((await damagedCurrent.runtime.rebuildEnhancedDiaryProjectRecordIndex(damagedCurrent.config)).lastStatus, "error");
        assert.equal(damagedCurrent.state.writes.length, 0);

        const idle = await fixture();
        assert.equal((await idle.runtime.getEnhancedDiaryProjectRecordIndexStatus(NOTEBOOK)).lastStatus, "idle");
        assert.equal(idle.runtime.formatStatus(await idle.runtime.getEnhancedDiaryProjectRecordIndexStatus(NOTEBOOK)), "尚未执行");
        idle.state.files.set(RECORD, { code: 403 });
        assert.equal((await idle.runtime.getEnhancedDiaryProjectRecordIndexStatus(NOTEBOOK)).lastStatus, "error");
        const legacyIncomplete = await fixture({ old: true, complete: false });
        assert.match(legacyIncomplete.runtime.formatStatus(await legacyIncomplete.runtime.getEnhancedDiaryProjectRecordIndexStatus(NOTEBOOK)), /^重建未完整/);
        for (const kind of ["writeFailure", "readbackFailure"]) {
            const test = await fixture({ old: true });
            test.state[kind] = true;
            const result = await test.runtime.rebuildEnhancedDiaryProjectRecordIndex(test.config);
            assert.equal(result.lastStatus, "error");
            assert.equal(result.changed, undefined);
            assert.match(test.runtime.formatStatus(result), /^写入失败/);
        }
        const incremental = await fixture({ old: true });
        incremental.state.changedDocs = [{ id: ids[0] }];
        incremental.state.markdownFailures.add(ids[0]);
        assert.equal((await incremental.runtime.refreshEnhancedDiaryProjectRecordIndex(incremental.config)).lastStatus, "error");
        assert(incremental.state.files.get(RECORD).items[blockId(ids[0], "old")]);
        assert.equal(incremental.state.commits, 0, "failed parses must remain retryable");
        incremental.state.markdownFailures.clear();
        assert.equal((await incremental.runtime.rebuildEnhancedDiaryProjectRecordIndex(incremental.config)).lastStatus, "success");
        assert.equal(incremental.state.files.get(RECORD).failures.length, 0);
        assert(warnings.every(([, details]) => typeof details === "object" && !Object.hasOwn(details, "content")), "diagnostics must exclude private record bodies");
    } finally { console.warn = originalWarn; }
    console.log("PASS enhanced diary: actual parsers, four failures, partial/empty/legacy headings, I/O failures, relation preservation, strict upstream, status reload, write verification, retryable refresh");
}
