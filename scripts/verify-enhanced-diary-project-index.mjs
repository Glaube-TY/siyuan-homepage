import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "svelte/compiler";
import * as echarts from "echarts";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const diaryDir = "src/components/utils/widgetBlock/widget/enhancedDiary";
const ui = await readFile(resolve(root, "src/homepage/homepageSetting/tabs/IndexManagementSettingsTab.svelte"), "utf8");
const formatter = ui.slice(ui.indexOf("    function formatStatus("), ui.indexOf("    function dispatchEnhancedDiaryIndexesUpdated("));
const uiAst = parse(ui.slice(0, ui.lastIndexOf("<style")), { modern: true });
const notifyIndexes = uiAst.instance.content.body.find((node)=>node.type === "FunctionDeclaration"&&node.id.name === "anyEnhancedDiaryIndexSucceeded");
assert(notifyIndexes);
const calendarSource = await readFile(resolve(root, "src/components/utils/widgetBlock/widget/latestDailyNotes/latestDailyNotes.svelte"), "utf8");
const calendarAst = parse(calendarSource.slice(0, calendarSource.lastIndexOf("<style")), { modern: true });
const calendarFunction = calendarAst.instance.content.body.find((node) => node.type === "FunctionDeclaration" && node.id.name === "buildCustomCalendarData");
const iconFunction = calendarAst.instance.content.body.find((node) => node.type === "FunctionDeclaration" && node.id.name === "getDocIcon");
const calendarMethods=["getMonthRange","goToPreviousMonth","goToNextMonth","updateCalendar","applyChartTheme"].map((name)=>{
    const node=calendarAst.instance.content.body.find((node)=>node.type==="FunctionDeclaration"&&node.id.name===name);assert(node);return calendarSource.slice(node.start,node.end);
}).join("\n");
let calendarClick, calendarMount, calendarHover;
function visit(value) {
    if (!value || typeof value !== "object") return;
    if (value.type === "CallExpression" && value.callee?.object?.name === "myChart" && value.callee.property?.name === "on" && value.arguments[0]?.value === "click") calendarClick = value.arguments[1];
    if (value.type === "CallExpression" && value.callee?.object?.name === "myChart" && value.callee.property?.name === "on" && value.arguments[0]?.value === "mouseover") calendarHover = value.arguments[1];
    if (value.type === "CallExpression" && value.callee?.name === "onMount") calendarMount = value.arguments[0];
    Object.values(value).forEach((child) => Array.isArray(child) ? child.forEach(visit) : visit(child));
}
visit(calendarAst.instance);
assert(calendarFunction && calendarClick && calendarMount && calendarHover);
assert(formatter.includes("return"));
const unused = `const unused = () => { throw new Error("unused UI/write dependency was called"); };`;
const stubs = {
    enhancedDiaryActions: ["addQuickRecordToDiary", "getOrCreateTodayDiaryDocument"],
    enhancedDiaryUtils: ["renderEnhancedDiaryTemplate", "scanDiaryContentForPeriod", "getSkipMarker", "formatDiaryDate", "getPeriodContext", "getPreviousPeriodContext"],
    enhancedDiaryWorkspaceProjectLifecycle: ["extractProjectWriteTargetErrorCode", "validateEnhancedDiaryProjectWriteTarget"],
};
const bundled = await build({
    stdin: { contents: `
        export { setSiyuanRuntimePort } from "./src/runtime/siyuan-runtime-port";
        export { normalizeEnhancedDiaryConfig } from "./${diaryDir}/enhancedDiaryConfig";
        export { DEFAULT_ENHANCED_DIARY_TEMPLATES } from "./${diaryDir}/enhancedDiaryTypes";
        export { getEnhancedDiaryIndexEntriesStrict } from "./${diaryDir}/enhancedDiaryIndex";
        export { rebuildEnhancedDiaryIndex, refreshEnhancedDiaryIndex, resolveEnhancedDiaryDateFromMetadata } from "./${diaryDir}/enhancedDiaryIndex";
        export {getLatestDailyNotesResult} from "./src/components/tools/siyuanComponentDataApi.ts";
        export {getLatestDailyNotesWithStatus, getDailyNoteDate} from "./${diaryDir}/../latestDailyNotes/latestDailyNotes";
        import {getLatestDailyNotesWithStatus, getDailyNoteDate} from "./${diaryDir}/../latestDailyNotes/latestDailyNotes";
        import {openDocs} from "./src/components/tools/openDocs";
        import {resolveBuiltinDocIcon,resolveConfiguredDocIcon} from "./src/components/tools/docIcon";
        export function diaryIcon(doc,useBuiltinDocIcon=false){const recentJournalsCalendarIcon='📝';return (${calendarSource.slice(iconFunction.start,iconFunction.end)})(doc);}
        export ${calendarSource.slice(calendarFunction.start, calendarFunction.end)}
        export function clickCalendar(calendarDates, params) {
            const plugin = {isMobile: true}, recentJournalsShowType = "calendar";
            return (${calendarSource.slice(calendarClick.start, calendarClick.end)})(params);
        }
        export function calendarRenderer(calendarDates, {cursor=new Date(2026,0,31),builtin=true,defaultIcon='📝'}={}) {
            let currentDate=cursor,option,resizes=0;
            const recentJournalsCalendarIcon=defaultIcon,recentJournalsCalendarIconSize=16,useBuiltinDocIcon=builtin;
            const getThemeColors=()=>({themeColor1:'#fff',themeTextColor:'#222',themeColor5:'#3578cc'});
            const chartContainer={},myChart={setOption(value){option=value;},resize(){resizes++;}},echarts={getInstanceByDom(){return myChart;}};
            ${calendarSource.slice(iconFunction.start,iconFunction.end)}
            ${calendarMethods}
            updateCalendar();
            return {previous:goToPreviousMonth,next:goToNextMonth,get snapshot(){return {date:currentDate,option,resizes};},
                render(timestamp,id){return option.series.renderItem({coordSys:{cellWidth:100,cellHeight:60}},
                    {coord:()=>[50,30],value:(index)=>index===0?timestamp:id,font:()=>''});}};
        }
        export function hoverCalendar(calendarDates,params){
            const plugin={isMobile:false},showLatestDailyNotesFloatDoc=true,latestDailyNotesFloatDocShowTime=0.1,chartContainer={},previews=[];
            let calendarFloatDocTimeout=null,calendarMouseLeaveTimeout=null;
            const window={setTimeout(callback){callback();return 1;}},clearTimeout=()=>{},createFloatingDocPopupWithPosition=(...args)=>previews.push(args);
            (${calendarSource.slice(calendarHover.start,calendarHover.end)})(params);return previews;
        }
        export function mountDiaryComponent(plugin, {limit=5,useBuiltinDocIcon=false}={}) {
            let isDestroyed=false,calendarDates={},dailyNotesReadFailed=false,dailyNotesLimited=false,dailyNotesModeLabel='',dailyNotesStatusMessage='',displayedDocs=[],chartInitTimeout=null,scheduled=0;
            const window={setTimeout(){scheduled++;return 1;}}, initCalendarChart=()=>{};
            const pending=(${calendarSource.slice(calendarMount.start,calendarMount.end)})();
            return {pending,destroy(){isDestroyed=true;},get snapshot(){return {calendarDates,displayedDocs,dailyNotesReadFailed,dailyNotesLimited,scheduled};}};
        }
        export { readDiaryMarkdownResult, openOrCreateDiaryForDate } from "./${diaryDir}/enhancedDiaryDoc";
        export { queryTodayQuickRecordsDetailed } from "./${diaryDir}/workspace/enhancedDiaryWorkspaceRecordService";
        export {loadEnhancedDiaryNotifySnapshot} from "./src/features/enhanced-diary-notify/enhanced-diary-notify-snapshot";
        export {rebuildAllHomepageIndexes} from "./src/components/tools/homepageIndexManagement";
        export { appendRecordProjectReference } from "./src/features/task-data/task-project-reference";
        export { rebuildEnhancedDiaryProjectRecordIndex, refreshEnhancedDiaryProjectRecordIndex,
            readEnhancedDiaryProjectRecordIndex, readEnhancedDiaryProjectRecordIndexStrict, getEnhancedDiaryProjectRecordIndexStatus,
            formatEnhancedDiaryProjectRecordDiagnostics } from "./${diaryDir}/enhancedDiaryProjectRecordIndex";
        ${formatter.replace("    function", "export function")}
        export ${ui.slice(notifyIndexes.start,notifyIndexes.end)}
    `, loader: "ts", resolveDir: root },
    bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
    plugins: [{ name: "isolate-unused-ui-and-write-paths", setup(buildApi) {
        buildApi.onResolve({ filter: /enhancedDiaryProjectIndex$|statisticalAPI$/ }, ({path,importer})=>importer.endsWith("homepageIndexManagement.ts")?{path:path.split("/").at(-1),namespace:"verifier-stub"}:undefined);
        buildApi.onResolve({ filter: /siyuanComponentDataApi\.ts$/, namespace: "verifier-stub" }, () => ({ path: resolve(root, "src/components/tools/siyuanComponentDataApi.ts"), namespace: "file" }));
        buildApi.onResolve({ filter: /enhancedDiaryActions$|enhancedDiaryUtils$|openDocs$|enhancedDiaryWorkspaceProjectLifecycle$|siyuanComponentDataApi$|enhanced-diary-notify-rules$|enhancedDiaryWorkspaceTaskService$|enhancedDiaryWorkspaceViewModel$/ }, ({ path }) => ({ path: path.split("/").at(-1), namespace: "verifier-stub" }));
        buildApi.onLoad({ filter: /.*/, namespace: "verifier-stub" }, ({ path }) => ({ loader: "js", contents: path === "siyuanComponentDataApi"
            ? `export const prepareChangedRecentDocsForIndex = (...args) => globalThis.__projectRecordVerifier.prepare(...args); export {getLatestDailyNotesResult, getRecentDailyNotesApi} from ${JSON.stringify(resolve(root, "src/components/tools/siyuanComponentDataApi.ts"))};
                export const refreshFavoritesIndex=async()=>{throw Error('synthetic unrelated favorites failure');};
                const success=async()=>({lastStatus:'success'});
                export const rebuildTaskIndexFromGlobalSql=success, rebuildHeatmapDailyIndexFromGlobalSql=success, refreshReviewIndex=success,
                    refreshTaskIndexFromRecentDocuments=success, refreshHeatmapIndexFromRecentDocuments=success;`
            : path === "enhancedDiaryProjectIndex" ? "export const rebuildEnhancedDiaryProjectIndex=async()=>({lastStatus:'success'}), refreshEnhancedDiaryProjectIndex=rebuildEnhancedDiaryProjectIndex;"
            : path === "statisticalAPI" ? "export const rebuildStatIndexFromGlobalSql=async()=>({lastStatus:'success'}), refreshStatIndexFromRecentDocuments=rebuildStatIndexFromGlobalSql;"
            : path === "openDocs" ? "export const openDocs = (...args) => globalThis.__projectRecordVerifier.open(...args);"
            : path === "enhanced-diary-notify-rules" ? "export const loadDiaryConfig = async () => globalThis.__projectRecordVerifier.config; export const getEnhancedDiaryNotifyRulesPlugin = () => ({});"
            : path === "enhancedDiaryWorkspaceTaskService" ? "export const queryWorkspaceTasks = async () => [];"
            : path === "enhancedDiaryWorkspaceViewModel" ? `${unused} export const buildWorkspaceReviewCards = async () => []; export const buildEnhancedDiaryWorkspaceSummary = unused; export const buildWorkspaceNotifications = unused; export const buildReviewCardForContext = unused;`
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
const ids = Array.from({ length: 5 }, (_, index) => `2026100800000${index + 2}-ddddddd`);
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
function blocks(docId, { rootTitle = "今日日记", quickTitle = "快速记录", rootLevel = 1, quickLevel = 2, missingRoot = false, missingQuick = false, orphanRecord = false, empty = false, unsupported = false, template, body = "fixture record body" } = {}) {
    if (template !== undefined) return templateBlocks(docId, template);
    const heading = (suffix, level, title) => ({ id: blockId(docId, suffix), type: "h", subType: `h${level}`, markdown: `${"#".repeat(level)} ${title}` });
    if (missingRoot) return [{ id: blockId(docId, "body"), type: "p", markdown: "fixture body" }];
    const result = [heading("root", rootLevel, rootTitle)];
    if (missingQuick) return orphanRecord ? [...result, heading("category", 3, "随手记录"), heading("record", 4, "09:00 记录"), { id: blockId(docId, "body"), type: "p", markdown: body }] : result;
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
    ]), shapes, writes: [], calls: [], metadata: new Map(), opened: [], baseWrites: [], markdownFailures: new Set(), blockFailures: new Set(), blockResponses: new Map(),
        markdownResponses: new Map(), kramdownResponses:new Map(), unlinked: false, attrFailure: false, attrResponse: undefined,
        writeFailure: false, readbackFailure: false, changedDocs: [], commits: 0 };
    if (old) state.files.set(RECORD, { version: 1, updatedAt: "2026-10-01T00:00:00Z", notebookId: NOTEBOOK, complete,
        items: Object.fromEntries(ids.slice(0, count).map((id) => { const item = oldItem(id); return [item.id, item]; })) });
    globalThis.__projectRecordVerifier = { config, open(...args) { state.opened.push(args); }, async prepare() { return { changedDocs: state.changedDocs, async commit() { state.commits += 1; } }; } };
    runtime.setSiyuanRuntimePort({
        async getFile(path) {
            state.calls.push({ path });
            if(path===DIARY&&state.readBarrier)await state.readBarrier;
            if (state.readbackFailure && path === RECORD && state.writes.length) return "{}";
            return state.files.has(path) ? structuredClone(state.files.get(path)) : { code: 404, msg: "not found" };
        },
        async putFile(path, isDir, file) {
            if (isDir) { assert.equal(path, BASE.slice(0, -1)); return { code: 0 }; }
            assert([RECORD, DIARY].includes(path), "only these derived indexes may be written");
            if (state.writeFailure) return { code: 500 };
            const next = JSON.parse(await file.text());
            (path === RECORD ? state.writes : state.baseWrites).push(next);
            state.files.set(path, next);
            return { code: 0 };
        },
        async post(path, payload) {
            state.calls.push({ path, payload });
            if (path === "/api/filetree/listDocsByPath") return { code: 0, data: { files: [...state.metadata.values()].map((row) => ({id:row.id,name:row.content,path:row.path,subFileCount:0})) } };
            if (path === "/api/query/sql") {
                assert(!/\bLIKE\b/i.test(payload.stmt), "no full body or metadata guessing scan");
                const selected = [...state.metadata.values()].filter((row) => payload.stmt.includes(`'${row.id}'`));
                return { code: 0, data: selected };
            }
            if (path === "/api/export/exportMdContent") return state.markdownFailures.has(payload.id) ? { code: 403 } : { code: 0, data: {
                content: state.markdownResponses.has(payload.id) ? state.markdownResponses.get(payload.id) : blocks(payload.id, state.shapes[payload.id]).map((block) => block.markdown).join("\n\n"),
            } };
            if (path === "/api/block/getChildBlocks") return state.blockFailures.has(payload.id) ? { code: 500 } : {
                code: 0, data: state.blockResponses.has(payload.id) ? state.blockResponses.get(payload.id) : blocks(payload.id, state.shapes[payload.id]),
            };
            if(path === "/api/block/getBlockKramdown")return {code:0,data:{id:payload.id,kramdown:state.kramdownResponses.get(payload.id)}};
            if(path === "/api/block/getBlockInfo")return {code:0,data:{rootID:payload.id,rootTitle:state.metadata.get(payload.id)?.content,rootIcon:"1f4d4"}};
            if (path === "/api/attr/batchGetBlockAttrs") return { code: state.attrFailure ? 403 : 0, data: state.attrResponse === undefined ?
                Object.fromEntries(payload.ids.map((id) => [id, { id, ...(state.unlinked || !ids.some((docId) =>
                    blocks(docId, state.shapes[docId]).some((block) => block.id === id && /^#{3,6} 09:00/.test(block.markdown)))
                    ? {} : { "custom-homepage-enhanced-diary-project-target": PROJECT_ID }) }])) : state.attrResponse };
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

        // ChildBlock content and markdown use omitempty: do not add markdown: "" here.
        for (const empty of [true, false]) {
            for (const content of ["", undefined]) {
                for (const position of ["before", "inside", "body", "after"]) {
                    const blank = await fixture({ old: true, shapes: { [ids[0]]: { empty } } });
                    const response = blocks(ids[0], { empty });
                    response.push({ id: ids[0].slice(0, 15) + "nextaaa", type: "h", subType: "h2", markdown: "## 今日复盘" });
                    const paragraph = { id: ids[0].slice(0, 15) + "empty01", type: "p", ...(content === undefined ? {} : { content }) };
                    assert.equal(Object.hasOwn(paragraph, "markdown"), false);
                    const index = position === "before" ? 1 : position === "inside" ? 2 : position === "body" ? response.length - 1 : response.length;
                    response.splice(index, 0, paragraph);
                    blank.state.blockResponses.set(ids[0], response);
                    const detail = await blank.runtime.queryTodayQuickRecordsDetailed(ids[0], response.map((block) => block.markdown || "").join("\n\n"),
                        "2026-10-01", blank.config.headingStructure, blank.config.templateFieldMapping, blank.config);
                    assert.equal(detail.structureComplete, true, position);
                    assert.equal(detail.relationComplete, true);
                    assert.equal(detail.records.length, empty ? 0 : 1);
                    const result = await blank.runtime.rebuildEnhancedDiaryProjectRecordIndex(blank.config);
                    assert.equal(result.lastStatus, "success");
                    assert.equal(result.skippedCount, 0);
                    const payload = blank.state.files.get(RECORD);
                    assert.equal(payload.complete, true);
                    assert.deepEqual(payload.failures, []);
                    assert.equal(Object.keys(payload.items).length, empty ? 0 : 1);
                    if (!empty) assert.equal(payload.items[blockId(ids[0], "record")].projectTargetId, PROJECT_ID);
                    assert(!payload.items[blockId(ids[0], "old")], "only reliably parsed diaries replace old relations");
                    assert(blank.state.calls.every(({ path }) => [DIARY, RECORD, PROJECT, "/api/export/exportMdContent", "/api/block/getChildBlocks", "/api/attr/batchGetBlockAttrs"].includes(path)),
                        "ordinary omitted blank paragraphs need no extra API requests");
                }
            }
        }
        for (const markdown of [123, [], {}, null]) {
            const damaged = await fixture({ old: true });
            const response = blocks(ids[0]);
            response.at(-1).markdown = markdown;
            damaged.state.blockResponses.set(ids[0], response);
            const old = structuredClone(damaged.state.files.get(RECORD).items);
            assert.equal((await damaged.runtime.rebuildEnhancedDiaryProjectRecordIndex(damaged.config)).skippedCount, 1);
            assert.equal(damaged.state.files.get(RECORD).complete, false);
            assert.equal(damaged.state.files.get(RECORD).failures[0].reason, "block_structure_read_failed");
            assert.deepEqual(damaged.state.files.get(RECORD).items, old);
        }
        for (const extra of [{ type: "p", content: "nonempty fixture" }, { type: "p", content: null },
            { type: "l", content: "" }, { type: "unknown" }, { type: "" }, { type: null }, { type: 123 }, {}]) {
            const damaged = await fixture({ count: 2, old: true });
            const good = blocks(ids[0]);
            good.splice(2, 0, { id: ids[0].slice(0, 15) + "empty01", type: "p" });
            const bad = blocks(ids[1]);
            bad.push({ id: ids[1].slice(0, 15) + "extraaa", ...extra });
            damaged.state.blockResponses.set(ids[0], good);
            damaged.state.blockResponses.set(ids[1], bad);
            const old = structuredClone(damaged.state.files.get(RECORD).items[blockId(ids[1], "old")]);
            const result = await damaged.runtime.rebuildEnhancedDiaryProjectRecordIndex(damaged.config);
            assert.equal(result.lastStatus, "error");
            assert.equal(result.migratedCount, 2, "index count includes the retained historical relation");
            assert.equal(result.skippedCount, 1);
            const payload = damaged.state.files.get(RECORD);
            assert.equal(payload.complete, false);
            assert.equal(payload.failures.length, 1);
            assert.deepEqual(payload.failures[0], { docId: ids[1], date: "2026-10-02", stage: "structure", reason: "block_structure_read_failed" });
            assert.deepEqual(payload.items[blockId(ids[1], "old")], old);
            assert(payload.items[blockId(ids[0], "record")]);
            assert(!payload.items[blockId(ids[0], "old")]);
        }

        const failedShapes = Object.fromEntries(ids.map((id) => [id, { missingQuick: true, orphanRecord: true }]));
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
        assert.equal(mixed.state.files.get(RECORD).failures[0].reason, "historical_relations_unconfirmed");

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
        assert.equal(emptyDocument.state.files.get(RECORD).failures[0].reason, "historical_relations_unconfirmed");
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

        // The five reported dates are synthetic official diaries, with titles deliberately unrelated to dates.
        const dates = ["2026-09-13", "2026-09-14", "2026-09-29", "2026-10-02", "2026-10-12"];
        const ordinary = await fixture({ count: 5 });
        const bodies = ["普通生活记录", "# 生活随笔\n\n普通正文", "", "普通正文，没有任何标题", "# 今日日记\n\n## 任务管理"];
        for (let i = 0; i < dates.length; i++) {
            const id = ids[i], compact = dates[i].replaceAll("-", "");
            ordinary.state.shapes[id] = { template: bodies[i] };
            ordinary.state.metadata.set(id, { id, type:"d", box:NOTEBOOK, content:`生活随笔 ${i}`, path:`/${id}.sy`, hpath:`/生活随笔 ${i}`,
                ial:`{: custom-dailynote-${compact}="${id}"}`, updated:"20261013000000" });
        }
        ordinary.state.blockResponses.set(ids[2], [{id:blockId(ids[2],"body"),type:"p"}]);
        const nonDiary = "20261013000000-xxxxxxx";
        ordinary.state.metadata.set(nonDiary, {id:nonDiary,type:"d",box:NOTEBOOK,content:"2026-10-13 日记",path:`/${nonDiary}.sy`,ial:""});
        assert.equal((await ordinary.runtime.rebuildEnhancedDiaryIndex(NOTEBOOK)).migratedCount,5);
        const base = structuredClone(ordinary.state.files.get(DIARY));
        assert.equal(base.version,4);
        assert.deepEqual(Object.keys(base.docs).sort(),dates.map((date)=>date.replaceAll("-","")).sort());
        assert.equal(ordinary.state.calls.some((call)=>/exportMdContent|getChildBlocks|batchGetBlockAttrs/.test(call.path)),false,"basic discovery reads metadata only");
        assert.equal(ordinary.runtime.resolveEnhancedDiaryDateFromMetadata({title:"2026-10-13 日记"}),null);
        assert.equal(ordinary.runtime.resolveEnhancedDiaryDateFromMetadata({ial:'{: custom-dailynote-20260230="x"}'}),null);
        const baselineWrites = ordinary.state.baseWrites.length;
        const status = await ordinary.runtime.rebuildEnhancedDiaryProjectRecordIndex(ordinary.config);
        assert.equal(status.lastStatus,"success");assert.equal(status.skippedCount,0);assert.equal(status.migratedCount,0);
        assert.match(status.lastMessage,/无适用/);
        assert.equal(ordinary.state.files.get(RECORD).complete,true);
        assert.deepEqual(ordinary.state.files.get(DIARY),base,"ordinary diaries stay in the independent base index");
        const domains=await ordinary.runtime.rebuildAllHomepageIndexes({loadData:async()=>ordinary.config});
        assert.equal(domains.favorites.lastStatus,"error");assert.equal(domains.enhancedDiary.lastStatus,"success");
        assert.equal(domains.enhancedDiaryProjectRecord.lastStatus,"success");
        assert.equal(ordinary.runtime.anyEnhancedDiaryIndexSucceeded([{lastStatus:"success"},{lastStatus:"error"}]),true,"base success is announced even if a downstream optional domain fails");
        assert.equal(ordinary.runtime.anyEnhancedDiaryIndexSucceeded([{lastStatus:"error"}]),false);
        const writesAfterRebuild=ordinary.state.baseWrites.length;
        const recent = await ordinary.runtime.getLatestDailyNotesWithStatus({loadData:async()=>ordinary.config},false);
        assert.equal(recent.mode,"index");assert.equal(recent.status,"ok");assert.equal(recent.items.length,5);
        assert(recent.items.every((note)=>note.content.startsWith("生活随笔")&&dates.includes(note.diaryDate)));
        for (let i=0;i<dates.length;i++) {
            const date = dates[i], note = recent.items.find((item)=>item.id===ids[i]);
            assert.equal(ordinary.runtime.getDailyNoteDate(note),date);
            const cells = ordinary.runtime.buildCustomCalendarData(recent.calendarDates,date.slice(0,7));
            assert.equal(cells.find((cell)=>cell.name===date).value[1],ids[i]);
            ordinary.runtime.clickCalendar(recent.calendarDates,{componentType:"series",seriesType:"custom",name:date});
            assert.equal(ordinary.state.opened.at(-1)[1],ids[i]);
            const [year,month,day]=date.split("-").map(Number);
            assert.deepEqual(await ordinary.runtime.openOrCreateDiaryForDate({},new Date(year,month-1,day),NOTEBOOK),{id:ids[i],created:false});
        }
        assert.equal(ordinary.state.baseWrites.length,writesAfterRebuild,"opening indexed ordinary diaries does not initialize/refresh/write");
        assert.equal(baselineWrites+1,writesAfterRebuild,"only the explicitly requested all-index rebuild wrote the base index");
        assert.deepEqual(ordinary.state.files.get(DIARY).docs,base.docs);
        assert.equal(ordinary.runtime.getDailyNoteDate({content:"2026-10-12"}),"2026-10-12","legacy finite fallback still supports a date title");
        assert.equal(ordinary.runtime.getDailyNoteDate({content:"生活随笔"}),"");
        const snapshot = await ordinary.runtime.loadEnhancedDiaryNotifySnapshot(["today_diary_missing","project_weekly_digest"],new Date(2026,9,13));
        assert(snapshot.review&&snapshot.projects);assert.deepEqual(snapshot.errors,{});
        assert.equal((await ordinary.runtime.readEnhancedDiaryProjectRecordIndexStrict(NOTEBOOK)).complete,true);
        ordinary.state.files.get(RECORD).complete=false;
        await assert.rejects(()=>ordinary.runtime.readEnhancedDiaryProjectRecordIndexStrict(NOTEBOOK),/尚未完整/);
        const failedSnapshot = await ordinary.runtime.loadEnhancedDiaryNotifySnapshot(["today_diary_missing","project_weekly_digest"],new Date(2026,9,13));
        assert(failedSnapshot.review);assert.equal(failedSnapshot.projects,null);assert.match(failedSnapshot.errors.projects.message,/尚未完整/);
        assert.equal((await ordinary.runtime.rebuildEnhancedDiaryProjectRecordIndex(ordinary.config)).lastStatus,"success","full verification repairs a legacy incomplete state");
        ordinary.state.changedDocs=[{id:ids[0]}];ordinary.state.commits=0;
        assert.equal((await ordinary.runtime.refreshEnhancedDiaryProjectRecordIndex(ordinary.config)).lastStatus,"success");
        assert.equal(ordinary.state.commits,1,"proven non-applicable diaries advance the incremental watermark");
        ordinary.state.files.get(RECORD).complete=false;
        assert.equal((await ordinary.runtime.refreshEnhancedDiaryProjectRecordIndex(ordinary.config)).lastStatus,"error","incremental success alone cannot certify historical incomplete coverage");
        assert.equal((await ordinary.runtime.rebuildEnhancedDiaryProjectRecordIndex(ordinary.config)).lastStatus,"success");
        for (const invalid of ["corrupt",{...base,complete:false},{...base,notebookId:"another-notebook"},{code:403}]) {
            ordinary.state.files.set(DIARY,invalid);
            const calls=ordinary.state.calls.length;
            const read=await ordinary.runtime.getLatestDailyNotesResult(false,NOTEBOOK);
            assert.equal(read.status,"error");assert.match(read.message,/读取失败/);
            assert.equal(ordinary.state.calls.slice(calls).some((call)=>call.path.startsWith("/api/")),false,"unreadable index does not become an empty or guessed fallback");
        }
        assert.equal((await ordinary.runtime.getLatestDailyNotesWithStatus({loadData:async()=>{throw Error("config unreadable");}})).status,"error");
        ordinary.state.files.set(DIARY,base);
        ordinary.state.files.delete(DIARY);
        const fallback=await ordinary.runtime.getLatestDailyNotesResult(false,NOTEBOOK);
        assert.equal(fallback.status,"limited");assert.match(fallback.message,/有限/);

        for (const shape of [{missingRoot:true},{missingQuick:true},{template:""},{template:"# 普通标题\n\n正文"}]) {
            const plain=await fixture({shapes:{[ids[0]]:shape}});
            assert.equal((await plain.runtime.rebuildEnhancedDiaryProjectRecordIndex(plain.config)).lastStatus,"success");
            assert.equal(plain.state.files.get(RECORD).failures.length,0);
        }
        const orphan=await fixture({shapes:{[ids[0]]:{template:"## 快速记录\n\n### 随手记录\n\n#### 09:00 记录\n\n正文"}}});
        assert.equal((await orphan.runtime.rebuildEnhancedDiaryProjectRecordIndex(orphan.config)).lastStatus,"error");
        assert.equal(orphan.state.files.get(RECORD).failures[0].reason,"diary_root_missing");
        const hidden=await fixture({shapes:{[ids[0]]:{template:"# 普通标题"}}});
        const candidate=blocks(ids[0],hidden.state.shapes[ids[0]])[0].id;
        hidden.state.attrResponse={[candidate]:{id:candidate,"custom-homepage-enhanced-diary-project-target":PROJECT_ID}};
        assert.equal((await hidden.runtime.rebuildEnhancedDiaryProjectRecordIndex(hidden.config)).lastStatus,"error","hidden relationship evidence is not a plain diary");
        const exportedTitle=await fixture({shapes:{[ids[0]]:{missingRoot:true}}});
        exportedTitle.state.markdownResponses.set(ids[0],"# 快速记录\n\nfixture body");
        assert.equal((await exportedTitle.runtime.rebuildEnhancedDiaryProjectRecordIndex(exportedTitle.config)).lastStatus,"success","official export addTitle cannot turn the document name into record structure");
        const attrsUnavailable=await fixture({shapes:{[ids[0]]:{template:"# 普通标题"}}});attrsUnavailable.state.attrFailure=true;
        assert.equal((await attrsUnavailable.runtime.rebuildEnhancedDiaryProjectRecordIndex(attrsUnavailable.config)).lastStatus,"error");
        assert.equal(attrsUnavailable.state.files.get(RECORD).failures[0].reason,"block_attributes_read_failed");
        for (const value of [null, {}, 123]) {
            const invalidAttrs=await fixture({shapes:{[ids[0]]:{template:"# 普通标题"}}});
            const candidate=blocks(ids[0],invalidAttrs.state.shapes[ids[0]])[0].id;
            invalidAttrs.state.attrResponse={[candidate]:{"custom-homepage-enhanced-diary-project-target":value}};
            assert.equal((await invalidAttrs.runtime.rebuildEnhancedDiaryProjectRecordIndex(invalidAttrs.config)).lastStatus,"error");
            assert.equal(invalidAttrs.state.files.get(RECORD).failures[0].reason,"block_attributes_read_failed");
        }
        const unsupportedOrdinary=await fixture({shapes:{[ids[0]]:{template:"- 普通列表"}}});
        unsupportedOrdinary.state.blockResponses.set(ids[0],[{id:blockId(ids[0],"body"),type:"l",markdown:"- 普通列表"}]);
        assert.equal((await unsupportedOrdinary.runtime.rebuildEnhancedDiaryProjectRecordIndex(unsupportedOrdinary.config)).lastStatus,"success","ordinary list content is not enhanced record evidence");
        assert.equal(unsupportedOrdinary.state.files.get(RECORD).complete,true);
        assert.equal(unsupportedOrdinary.state.calls.some((call)=>call.path === "/api/attr/batchGetBlockAttrs"),false,"ordinary body blocks need no property scan");
        // Official ChildBlock types/subType and Markdown shapes; inline images belong to a paragraph.
        const plainBodies=[
            {type:"p",markdown:"普通段落"}, {type:"l",subType:"u",markdown:"- 普通列表"},
            {type:"l",subType:"o",markdown:"1. 有序列表"}, {type:"l",subType:"t",markdown:"- [ ] 普通任务"},
            {type:"t",markdown:"| 名称 | 内容 |\n| --- | --- |\n| A | B |"},
            {type:"p",markdown:"![图片](assets/fixture.png)"}, {type:"b",markdown:"> 普通引用"},
            {type:"c",markdown:"```js\nconst value=1;\n```"}, {type:"sb",markdown:"{{{row\n\n普通段落\n\n}}}"},
            {type:"m",markdown:"$$\nx^2\n$$"}, {type:"html",markdown:"<div>普通内容</div>"},
            {type:"p"}, // Real omission, not markdown:"".
        ];
        for(const body of plainBodies){
            const plain=await fixture();plain.state.blockResponses.set(ids[0],[{id:blockId(ids[0],"body"),...body}]);
            const parsed=await plain.runtime.queryTodayQuickRecordsDetailed(ids[0],body.markdown||"","2026-10-01",plain.config.headingStructure,plain.config.templateFieldMapping,plain.config);
            assert.equal(parsed.status,"not_applicable",JSON.stringify(body));assert.equal(parsed.structureComplete,false);
            const calls=plain.state.calls.filter((call)=>call.path==="/api/attr/batchGetBlockAttrs");assert.equal(calls.length,0);
            assert.equal((await plain.runtime.rebuildEnhancedDiaryProjectRecordIndex(plain.config)).lastStatus,"success");
            assert.equal(plain.state.files.get(RECORD).complete,true);
        }
        for(const title of ["问题","想法","决策","09:00","09:00 普通安排"]){
            const plain=await fixture({shapes:{[ids[0]]:{template:`# ${title}\n\n普通段落`}}});
            const response=blocks(ids[0],plain.state.shapes[ids[0]]);
            response.push({id:blockId(ids[0],"body"),type:"l",subType:"u",markdown:"- 普通列表"});
            plain.state.blockResponses.set(ids[0],response);
            assert.equal((await plain.runtime.rebuildEnhancedDiaryProjectRecordIndex(plain.config)).lastStatus,"success",title);
            assert(plain.state.calls.filter((call)=>call.path==="/api/attr/batchGetBlockAttrs").every((call)=>call.payload.ids.every((id)=>response.find((block)=>block.id===id).type==="h")),"only possible heading relations are inspected");
        }
        const commonStructure=await fixture({shapes:{[ids[0]]:{template:"# 普通标题\n\n## 问题\n\n### 09:00\n\n普通正文"}}});commonStructure.state.unlinked=true;
        assert.equal((await commonStructure.runtime.rebuildEnhancedDiaryProjectRecordIndex(commonStructure.config)).lastStatus,"success","common parent/time headings alone do not establish a record model");
        const nestedQuick=await fixture();
        nestedQuick.state.blockResponses.set(ids[0],[{id:blockId(ids[0],"body"),type:"sb",markdown:"{{{row\n\n## 快速记录\n\n}}}"}]);
        assert.equal((await nestedQuick.runtime.rebuildEnhancedDiaryProjectRecordIndex(nestedQuick.config)).lastStatus,"error","a real orphan quick heading inside a container is explicit evidence");
        const quotedExample=await fixture();
        quotedExample.state.blockResponses.set(ids[0],[{id:blockId(ids[0],"body"),type:"c",markdown:"```md\n## 快速记录\n```"}]);
        assert.equal((await quotedExample.runtime.rebuildEnhancedDiaryProjectRecordIndex(quotedExample.config)).lastStatus,"success","code examples are not actual headings");
        const omitted=await fixture();
        omitted.state.blockResponses.set(ids[0],[{id:blockId(ids[0],"body"),type:"sb",content:"普通内容"}]);
        assert.equal((await omitted.runtime.rebuildEnhancedDiaryProjectRecordIndex(omitted.config)).lastStatus,"success","irrelevant non-heading Markdown is optional");
        const missingHeading=await fixture();
        missingHeading.state.blockResponses.set(ids[0],[{id:blockId(ids[0],"root"),type:"h",subType:"h1"}]);
        missingHeading.state.kramdownResponses.set(blockId(ids[0],"root"),"# 普通标题\n{: id=\"fixture\"}");
        assert.equal((await missingHeading.runtime.rebuildEnhancedDiaryProjectRecordIndex(missingHeading.config)).lastStatus,"success");
        missingHeading.state.kramdownResponses.clear();missingHeading.state.blockResponses.set(ids[0],[{id:blockId(ids[0],"root"),type:"h",subType:"h1"}]);
        assert.equal((await missingHeading.runtime.rebuildEnhancedDiaryProjectRecordIndex(missingHeading.config)).lastStatus,"error","unknown heading cannot hide evidence");
        const historyList=await fixture({old:true,complete:false});
        historyList.state.blockResponses.set(ids[0],[{id:blockId(ids[0],"body"),type:"l",subType:"u",markdown:"- 普通列表"}]);
        const retained=structuredClone(historyList.state.files.get(RECORD).items);
        assert.equal((await historyList.runtime.rebuildEnhancedDiaryProjectRecordIndex(historyList.config)).lastStatus,"error");
        assert.deepEqual(historyList.state.files.get(RECORD).items,retained);
        assert.equal(historyList.state.files.get(RECORD).failures[0].reason,"historical_relations_unconfirmed");

        const many=await fixture();
        const completeDocs={};
        const dateText=(date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
        for(let i=0;i<150;i++){
            const date=dateText(new Date(2026,0,i+1)),compact=date.replaceAll("-","");
            const id=`${i===0?"20261013000000":compact+"000000"}-${i.toString(36).padStart(7,"0")}`;
            completeDocs[compact]={id,date:compact,box:NOTEBOOK,title:`随笔 ${i}`,updated:"20261013000000"};
            many.state.metadata.set(id,{id,content:`随笔 ${i}`});
        }
        many.state.files.get(DIARY).docs=completeDocs;
        const latest=await many.runtime.getLatestDailyNotesWithStatus({loadData:async()=>many.config});
        assert.equal(latest.items.length,100);assert.equal(Object.keys(latest.calendarDates).length,150);
        assert.equal(latest.items[0].diaryDate,"2026-05-30","a newly created January backfill cannot outrank May diary dates");
        const oldest=completeDocs["20260101"];
        assert(!latest.items.some((note)=>note.id===oldest.id));assert.equal(latest.calendarDates["2026-01-01"].id,oldest.id);
        assert.deepEqual(Object.keys(latest.calendarDates["2026-01-01"]).sort(),["content","id"],"old calendar entries contain only necessary metadata");
        const beforeCalendar=many.state.calls.length;
        for(const month of ["2026-01","2026-02","2026-03"]){
            const rows=many.runtime.buildCustomCalendarData(latest.calendarDates,month);
            assert(rows.length<=31);assert(rows.every((row)=>row.value.length===2&&typeof row.value[1]==="string"));
            if(month==="2026-01")assert.equal(rows[0].value[1],oldest.id);
        }
        many.runtime.clickCalendar(latest.calendarDates,{componentType:"series",seriesType:"custom",name:"2026-01-01"});
        assert.equal(many.state.opened.at(-1)[1],oldest.id);assert.equal(many.state.calls.length,beforeCalendar,"month data/click lookup is local and never rebuilds/scans");
        const component=many.runtime.mountDiaryComponent({loadData:async()=>many.config},{limit:7});await component.pending;
        assert.equal(component.snapshot.displayedDocs.length,7);assert.equal(Object.keys(component.snapshot.calendarDates).length,150);
        assert.equal(component.snapshot.displayedDocs[0].diaryDate,"2026-05-30");
        const icons=await many.runtime.getLatestDailyNotesResult(true,NOTEBOOK);
        assert.deepEqual(many.runtime.diaryIcon(icons.calendarDates["2026-05-30"],true),{type:"text",value:"📔"});
        assert.deepEqual(many.runtime.diaryIcon(icons.calendarDates["2026-05-30"],false),{type:"text",value:"📝"});
        assert.deepEqual(many.runtime.diaryIcon(icons.calendarDates["2026-01-01"],true),{type:"text",value:"📝"},"old lightweight dates retain the configured icon fallback without bulk fetches");
        assert.equal(many.state.calls.filter((call)=>call.path==="/api/block/getBlockInfo").length,10,"icons stay bounded, never fetched for all 150 dates");
        const textOf=(item)=>item.children.filter((child)=>child.type==="text").map((child)=>child.style.text);
        const timestamp=new Date(2026,4,30).getTime();
        const renderer=many.runtime.calendarRenderer(icons.calendarDates);
        assert(textOf(renderer.render(timestamp,completeDocs["20260530"].id)).includes("📔"),"actual renderItem must resolve numeric ECharts time to the existing diary date key");
        const svgChart=echarts.init(null,null,{renderer:"svg",ssr:true,width:700,height:450});
        try {
            svgChart.setOption(many.runtime.calendarRenderer(icons.calendarDates,{cursor:new Date(2026,4,31)}).snapshot.option);
            assert(svgChart.renderToSVGString().includes("📔"),"installed ECharts must parse the time dimension and invoke the real calendar callback with the document icon");
        } finally { svgChart.dispose(); }
        const defaultRenderer=many.runtime.calendarRenderer(latest.calendarDates,{defaultIcon:"📅"});
        assert(textOf(defaultRenderer.render(new Date(2026,0,1).getTime(),oldest.id)).includes("📅"),"missing document icon uses the configured default");
        const configuredRenderer=many.runtime.calendarRenderer(icons.calendarDates,{builtin:false,defaultIcon:"⭐"});
        assert(textOf(configuredRenderer.render(timestamp,completeDocs["20260530"].id)).includes("⭐"),"ordinary mode keeps its configured icon");
        const customDates={...latest.calendarDates,"2026-01-01":{...latest.calendarDates["2026-01-01"],icon:"fixture/custom.svg"}};
        const custom=many.runtime.calendarRenderer(customDates).render(new Date(2026,0,1).getTime(),oldest.id);
        assert(custom.children.some((child)=>child.type==="image"&&child.style.image==="/emojis/fixture/custom.svg"),"custom document icons match the numeric calendar date");
        const beforeNavigation=many.state.calls.length;
        for(const [compact,entry] of Object.entries(completeDocs).slice(0,50)){
            const day=new Date(Number(compact.slice(0,4)),Number(compact.slice(4,6))-1,Number(compact.slice(6,8)));
            assert(textOf(defaultRenderer.render(day.getTime(),entry.id)).includes("📅"),"each of the 101st–150th dates remains renderable");
        }
        const preview=many.runtime.hoverCalendar(latest.calendarDates,{componentType:"series",seriesType:"custom",name:"2026-01-01",event:{event:{clientX:10,clientY:20}}});
        assert.equal(preview[0][0].id,oldest.id);assert.deepEqual(preview[0].slice(2,4),[10,20],"old-date hover preview retains the correct document and coordinates");
        for(const [start,direction,expected] of [
            [new Date(2026,0,31),"next","2026-02"], [new Date(2026,2,31),"previous","2026-02"],
            [new Date(2026,9,31),"previous","2026-09"], [new Date(2026,11,31),"next","2027-01"],
            [new Date(2027,0,31),"previous","2026-12"], [new Date(2024,0,31),"next","2024-02"],
            [new Date(2024,2,31),"previous","2024-02"], [new Date(2024,1,29),"next","2024-03"],
            [new Date(2024,1,29),"previous","2024-01"],
        ]){
            const navigation=many.runtime.calendarRenderer(latest.calendarDates,{cursor:start});navigation[direction]();
            assert.equal(navigation.snapshot.option.calendar.range,expected);assert.equal(navigation.snapshot.date.getDate(),1);
            assert.equal(navigation.snapshot.resizes,2,"navigation still invokes the real updateCalendar/applyChartTheme chain");
            if(expected.endsWith("-02"))assert.equal(navigation.snapshot.option.series.data.length,expected.startsWith("2024")?29:28);
        }
        assert.equal(many.state.calls.length,beforeNavigation,"render/hover/month navigation never calls an API, reindexes, or scans");
        let release;many.state.readBarrier=new Promise((resolve)=>{release=resolve;});
        const destroyed=many.runtime.mountDiaryComponent({loadData:async()=>many.config});destroyed.destroy();release();await destroyed.pending;
        assert.deepEqual(destroyed.snapshot,{calendarDates:{},displayedDocs:[],dailyNotesReadFailed:false,dailyNotesLimited:false,scheduled:0});
        const scope=await fixture();
        scope.state.metadata.set(ids[0],{id:ids[0],type:"d",box:"another-notebook",content:"标题",ial:'{: custom-dailynote-20261001="x"}'});
        assert.equal((await scope.runtime.rebuildEnhancedDiaryIndex(NOTEBOOK)).migratedCount,0,"official date cannot bypass notebook scope");
        const historical=await fixture({old:true,shapes:{[ids[0]]:{missingRoot:true}}});
        const saved=structuredClone(historical.state.files.get(RECORD).items);
        assert.equal((await historical.runtime.rebuildEnhancedDiaryProjectRecordIndex(historical.config)).lastStatus,"error");
        assert.deepEqual(historical.state.files.get(RECORD).items,saved);
        assert.equal(historical.state.files.get(RECORD).failures[0].reason,"historical_relations_unconfirmed");
        assert(warnings.every(([, details]) => typeof details === "object" && !Object.hasOwn(details, "content")), "diagnostics must exclude private record bodies");
    } finally { console.warn = originalWarn; }
    console.log("PASS enhanced diary: real parsers/index/open/notify and 150 dates; actual calendar renderItem with numeric timestamps, builtin/default/custom icons, old-date click/hover; month-end/year/leap navigation and real updateCalendar chain; strict failures/history and destroy protection; no user-document writes or calendar API scans");
}
