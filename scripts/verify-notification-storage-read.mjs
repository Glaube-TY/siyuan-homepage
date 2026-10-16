import assert from "node:assert/strict";
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modules = [
    ["review-notify", "ReviewNotify", "REVIEW_NOTIFY"],
    ["task-notify", "TaskNotify", "TASK_NOTIFY"],
    ["countdown-notify", "CountdownNotify", "COUNTDOWN_NOTIFY"],
    ["enhanced-diary-notify", "EnhancedDiaryNotify", "ENHANCED_DIARY_NOTIFY"],
    ["focus-notify", "FocusNotify", "FOCUS_NOTIFY"],
];
const bundle = await build({
    stdin: { resolveDir: root, loader: "ts", contents: `
        export { z } from 'zod';
        export * from './src/features/notification-center/notification-center-storage';
        export {setNotificationCenterPlugin} from './src/features/notification-center/notification-center-plugin';
        export {loadNotificationCenterSettings} from './src/features/notification-center/notification-center-settings-store';
        export {DEFAULT_NOTIFICATION_CENTER_SETTINGS,NOTIFICATION_CENTER_SETTINGS_KEY} from './src/features/notification-center/constants';
        export {setSiyuanRuntimePort} from './src/runtime/siyuan-runtime-port';
        export {SiyuanApiError} from './src/api';
        export {createNotificationScanScheduler} from './src/features/notification-center/notification-scan-scheduler';
        ${modules.map(([dir]) => `export * from './src/features/${dir}/${dir}-settings-store';export * from './src/features/${dir}/constants';`).join("\n")}
    ` }, bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent",
    plugins: [{ name: "notification-storage-fixture", setup(builder) {
        builder.onResolve({ filter: /\/kb-sensitive-secret-crypto$/ }, () => ({ path: "crypto", namespace: "fixture" }));
        builder.onResolve({ filter: /\/homepage-entitlement$/ }, () => ({ path: "entitlement", namespace: "fixture" }));
        builder.onResolve({ filter: /\/notification-center-mobile-plan-manager$/ }, () => ({ path: "plans", namespace: "fixture" }));
        builder.onResolve({ filter: /\/notification-center-events$/ }, () => ({ path: "events", namespace: "fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: {
            crypto: "export const setKbSensitiveSecretCryptoPlugin=()=>{};export const isEncryptedSecret=()=>false;export const encryptSecretPlainText=async value=>value;export const decryptSecretCipherText=async value=>value;",
            entitlement: "export const isHomepageEntitlementGranted=()=>globalThis.__notificationPremium;",
            plans: "export const requestMobilePlanRefresh=reason=>globalThis.__notificationEvents.push(reason);",
            events: "export const broadcastNotificationCenterEvent=name=>globalThis.__notificationEvents.push(name);",
        }[path] }));
    }}],
});
const rt = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const storageRoot = "/data/storage/petal", pluginRoot = `${storageRoot}/siyuan-homepage`, key = rt.REVIEW_NOTIFY_SETTINGS_KEY;
const dir = (name) => ({ name, isDir: true, isSymlink: false });
const file = (name) => ({ name, isDir: false, isSymlink: false });
globalThis.__notificationPremium = true;
globalThis.__notificationEvents = [];
globalThis.window = new EventTarget();

const settings = { ...structuredClone(rt.DEFAULT_REVIEW_NOTIFY_SETTINGS), enabled: true, scanIntervalMs: 75000,
    catchUpWindowMinutes: 120, maxItemsPerMessage: 7, includePath: false, includeNote: true, includeSiyuanLink: false,
    rules: [{ id: "fixture-review", type: "item_due_reminder", title: "Fixture rule", enabled: true, time: "09:30",
        deliveryTargets: [{kind:"desktop"},{kind:"mobile"},{kind:"external-default"},{kind:"external",channelId:"fixture-channel"}] }] };

function fixture({ value = settings, target = key, exists = true, pluginExists = true } = {}) {
    const state = { files: new Map(), directories: new Map([[storageRoot, pluginExists ? [dir("siyuan-homepage")] : []]]),
        directoryReplies: new Map(), reads: [], requests: [], writes: [], load: null, save: null };
    if (pluginExists) state.directories.set(pluginRoot, []);
    if (exists) {
        state.files.set(target, structuredClone(value));
        const segments = target.split("/"); let parent = pluginRoot;
        for (const [i, segment] of segments.entries()) {
            const entries = state.directories.get(parent) || [];
            entries.push(i === segments.length - 1 ? file(segment) : dir(segment)); state.directories.set(parent, entries);
            parent += `/${segment}`;
        }
    }
    const plugin = { name: "siyuan-homepage", async loadData(name) {
        state.reads.push(name); return state.load ? state.load(name) : structuredClone(state.files.get(name) ?? null);
    }, async saveData(name, value) {
        state.writes.push({name,value:structuredClone(value)});
        if (state.save) return state.save(name,value);
        state.files.set(name,structuredClone(value));
    } };
    rt.setNotificationCenterPlugin(plugin);
    for (const [,name] of modules) rt[`set${name}Plugin`]?.(plugin);
    rt.setSiyuanRuntimePort({ async post(url,payload) {
        assert.equal(url,"/api/file/readDir","no write or unrelated Kernel API may run");
        state.requests.push(payload.path);
        if (state.directoryReplies.has(payload.path)) {
            const reply = state.directoryReplies.get(payload.path); if (reply instanceof Error) throw reply; return reply;
        }
        return { code:0, data:structuredClone(state.directories.get(payload.path)) };
    } });
    return state;
}
async function rejectsWithoutWrites(state, operation, check = () => true) {
    await assert.rejects(operation,check); assert.equal(state.writes.length,0);
}

{
    const f=fixture();assert.deepEqual(await rt.loadReviewNotifySettings(),settings);assert.deepEqual(f.requests,[]);
    assert.deepEqual(f.files.get(key),settings);assert.equal(f.writes.length,0);
    f.files.set(key,JSON.stringify(settings));assert.deepEqual(await rt.loadReviewNotifySettings(),settings);
}
for (const value of [null,undefined,""]) {
    const f=fixture({exists:false});f.load=()=>value;
    assert.equal(await rt.readJSON(key,rt.z.object({})),null);
    assert.deepEqual(await rt.loadReviewNotifySettings(),rt.DEFAULT_REVIEW_NOTIFY_SETTINGS);
    assert.deepEqual(f.requests.slice(0,2),[storageRoot,pluginRoot]);assert.equal(f.writes.length,0);
}
{
    const f=fixture({exists:false,pluginExists:false});
    assert.equal(await rt.readJSON(key,rt.z.object({})),null);assert.deepEqual(f.requests,[storageRoot]);assert.equal(f.writes.length,0);
}
for (const code of [-1,403,401,404,500]) {
    const f=fixture();f.load=()=>{throw Error("fixture load failed");};
    f.directoryReplies.set(pluginRoot,{code,msg:"fixture API failure",data:null});
    await rejectsWithoutWrites(f,()=>rt.readJSON(key,rt.z.object({})),error=>{
        assert(error instanceof rt.NotificationCenterStorageError);assert(error.cause instanceof rt.SiyuanApiError);
        assert.equal(error.cause.siyuanCode,code);assert(error.message.includes(`code=${code}`));assert(error.message.includes(pluginRoot));return true;
    });
    assert.deepEqual(f.requests,[storageRoot,pluginRoot],"404 after a confirmed directory remains an error, never implicit missing");
    await rejectsWithoutWrites(f,()=>rt.loadReviewNotifySettings(),error=>error.message.includes(`code=${code}`));
}
{
    const f=fixture();f.load=()=>null;const failure=new TypeError("fixture network unavailable");
    f.directoryReplies.set(storageRoot,failure);
    await rejectsWithoutWrites(f,()=>rt.readJSON(key,rt.z.object({})),error=>error.cause===failure);
}
for(const value of [null,undefined,""]) {
    const f=fixture();f.load=()=>value;
    await rejectsWithoutWrites(f,()=>rt.readJSON(key,rt.z.object({})),error=>error instanceof rt.NotificationCenterStorageError);
    await rejectsWithoutWrites(f,()=>rt.loadReviewNotifySettings());
    assert.deepEqual(f.files.get(key),settings);
}
for(const value of ["{invalid json",{...settings,enabled:"yes"},{...settings,version:99}]) {
    const f=fixture({value});await rejectsWithoutWrites(f,()=>rt.loadReviewNotifySettings());assert.deepEqual(f.files.get(key),value);
}
for(const entries of [null,{},[null],[{name:key}],[{name:key,isDir:"false"}],[{name:"",isDir:false}]]) {
    const f=fixture();f.load=()=>null;f.directoryReplies.set(pluginRoot,{code:0,data:entries});
    await rejectsWithoutWrites(f,()=>rt.readJSON(key,rt.z.object({})),error=>error instanceof rt.NotificationCenterStorageError);
}
for(const reply of [null,undefined,{}, {code:0}, {code:"0",data:[]}]) {
    const f=fixture();f.load=()=>null;f.directoryReplies.set(pluginRoot,reply);
    await rejectsWithoutWrites(f,()=>rt.readJSON(key,rt.z.object({})),error=>error instanceof rt.NotificationCenterStorageError);
}
{
    const f=fixture();f.load=()=>null;f.directories.set(pluginRoot,[dir(key)]);
    await rejectsWithoutWrites(f,()=>rt.readJSON(key,rt.z.object({})));
    f.directories.set(storageRoot,[file("siyuan-homepage")]);await rejectsWithoutWrites(f,()=>rt.readJSON(key,rt.z.object({})));
    for(const invalid of ["", ".", "../outside.json", "folder/../outside.json"])await rejectsWithoutWrites(f,()=>rt.notificationCenterDataFileExists(invalid));
}
{
    const f=fixture({target:"notification-center/mobile-plans/fixture.json"});f.load=()=>null;
    await rejectsWithoutWrites(f,()=>rt.readJSON("notification-center/mobile-plans/fixture.json",rt.z.object({})));
    assert.deepEqual(f.requests,[storageRoot,pluginRoot,`${pluginRoot}/notification-center`,`${pluginRoot}/notification-center/mobile-plans`]);
    assert(f.requests.every(path=>path.startsWith("/data/storage/petal")));
}

// Exercise each actual settings loader/schema through the common storage, including defaults and failures.
for(const [name,prefix]of [...modules.map(([,name,prefix])=>[name,prefix]),["NotificationCenter","NOTIFICATION_CENTER"]]) {
    const target=rt[`${prefix}_SETTINGS_KEY`],value=structuredClone(rt[`DEFAULT_${prefix}_SETTINGS`]),load=rt[`load${name}Settings`];
    const f=fixture({target,value});const expected=await load();assert.equal(f.writes.length,0);assert.deepEqual(f.files.get(target),value);
    f.files.set(target,JSON.stringify(value));assert.deepEqual(await load(),expected);
    f.files.delete(target);f.directories.get(target.includes("/")?`${pluginRoot}/notification-center`:pluginRoot).length=0;
    assert.deepEqual(await load(),expected);assert.equal(f.writes.length,0);
    f.files.set(target,null);f.directories.set(storageRoot,[dir("siyuan-homepage")]);f.directoryReplies.set(pluginRoot,{code:403,msg:"fixture forbidden"});
    await rejectsWithoutWrites(f,()=>load());
}

{
    const f=fixture();assert.deepEqual(await rt.saveReviewNotifySettings(settings),settings);
    assert.equal(f.writes.length,1);assert.deepEqual(f.writes[0],{name:key,value:settings});assert.equal(f.reads.length,2,"write read-back and complete settings verification remain active");
    const invalid=fixture();await rejectsWithoutWrites(invalid,()=>rt.saveReviewNotifySettings({...settings,scanIntervalMs:1}));
    globalThis.__notificationPremium=false;await rejectsWithoutWrites(invalid,()=>rt.saveReviewNotifySettings(settings));globalThis.__notificationPremium=true;
}
for(const failure of ["write","empty-readback","changed-readback"]) {
    const f=fixture();
    if(failure==="write")f.save=()=>{throw Error("fixture save failed");};
    if(failure==="empty-readback")f.load=()=>null;
    if(failure==="changed-readback")f.save=(name,value)=>f.files.set(name,{...value,includeNote:!value.includeNote});
    await assert.rejects(()=>rt.saveReviewNotifySettings(settings));assert.equal(f.writes.length,1);
}

// The unchanged scheduler must retry failed reads and recover saved settings without writing defaults.
{
    const f=fixture();f.load=()=>null;f.directoryReplies.set(pluginRoot,{code:403,msg:"fixture forbidden"});
    const timers=new Map(),originalError=console.error,originalDocument=globalThis.document;let timerId=0,runs=0,otherRuns=0;
    const errors=[];console.error=(...args)=>errors.push(args);
    Object.assign(window,{setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id)});
    globalThis.document=Object.assign(new EventTarget(),{visibilityState:"visible"});
    const scheduler=rt.createNotificationScanScheduler({id:"legacy-review-notify",signals:["fixture-sync-finished"],load:rt.loadReviewNotifySettings,
        resolve:async value=>({enabled:value.enabled,intervalMs:value.scanIntervalMs}),scan:async value=>{assert.deepEqual(value,settings);runs++;}});
    const other=rt.createNotificationScanScheduler({id:"fixture-other-task",signals:[],load:async()=>null,resolve:async()=>({enabled:true,intervalMs:60000}),scan:async()=>{otherRuns++;}});
    const pump=async()=>{const entry=[...timers.entries()][0];timers.delete(entry[0]);entry[1].fn();for(let i=0;i<100;i++)await Promise.resolve();};
    try {
        scheduler.start();other.start();await pump();assert.equal(runs,0);assert.equal(otherRuns,1);assert.equal(errors.length,1);
        assert([...timers.values()].every(timer=>timer.ms>0&&timer.ms<=60000));
        f.load=null;f.directoryReplies.clear();window.dispatchEvent(new Event("fixture-sync-finished"));await pump();assert.equal(runs,1);assert.equal(f.writes.length,0);
    } finally {scheduler.destroy();other.destroy();console.error=originalError;globalThis.document=originalDocument;}
    assert.equal(timers.size,0);
}
console.log("PASS notification storage: actual checked API/storage + six settings loaders; absolute paths, confirmed missing vs null/corrupt/policy/network/API/404/invalid directories, nested paths, zero failure writes; real review save/schema/read-back/integrity/permission checks; scheduler isolation/recovery/cleanup");
