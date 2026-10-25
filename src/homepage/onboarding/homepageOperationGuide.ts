import { mount } from "svelte";
import type { Plugin } from "siyuan";
import { getFileOrNullChecked } from "@/api";
import { isSiyuanMobileFrontend, svelteDialog } from "@/libs/dialog";
import HomepageOperationGuideDialog from "./HomepageOperationGuideDialog.svelte";

export const HOMEPAGE_OPERATION_GUIDE_KEY = "siyuan-homepage:desktop-operation-guide:suppressed-v1";

const PREFERENCE_FILE = "homepage-operation-guide.json";
const PREFERENCE_PATH = `/data/storage/petal/siyuan-homepage/${PREFERENCE_FILE}`;
type GuidePlugin = Pick<Plugin, "loadData" | "saveData">;
const pendingWrites = new WeakMap<GuidePlugin, Promise<boolean>>();
let preferenceRevision = 0;

async function preferenceIO<T>(operation: Promise<T>): Promise<T> {
    // SDK 失败回调可能不结束 Promise；只给本次 I/O 设置有界超时。
    let timer: ReturnType<typeof setTimeout>;
    try {
        return await Promise.race([operation, new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Operation guide preference I/O timed out")), 10_000);
        })]);
    } finally { clearTimeout(timer!); }
}

function parsePreference(value: unknown): boolean {
    if (typeof value === "string") value = JSON.parse(value);
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).length !== 2 ||
        (value as { version?: unknown }).version !== 1 ||
        typeof (value as { suppressed?: unknown }).suppressed !== "boolean") {
        throw new Error("Invalid operation guide preference");
    }
    return (value as { suppressed: boolean }).suppressed;
}

async function readPreference(plugin: GuidePlugin): Promise<boolean | null> {
    const loaded = await preferenceIO(plugin.loadData(PREFERENCE_FILE));
    // loadData 可在缺失或失败时回退缓存；只有严格读取的明确 404 才代表缺失。
    const raw = await preferenceIO(getFileOrNullChecked(PREFERENCE_PATH));
    if (raw === null) return null;
    const suppressed = parsePreference(raw instanceof Blob ? await raw.text() : raw);
    if (parsePreference(loaded) !== suppressed) throw new Error("Operation guide preference read-back mismatch");
    return suppressed;
}

async function persistSuppression(plugin: GuidePlugin, onlyIfMissing = false): Promise<boolean> {
    const pending = pendingWrites.get(plugin);
    if (pending) return pending;
    const write = (async () => {
        const current = await readPreference(plugin);
        if (current === true) { preferenceRevision++; return true; }
        if (onlyIfMissing && current !== null) return current;
        const result = await preferenceIO(plugin.saveData(PREFERENCE_FILE, { version: 1, suppressed: true }));
        if (result && typeof result === "object" && "code" in result && result.code !== 0) {
            throw new Error("Operation guide preference write failed");
        }
        if (await readPreference(plugin) !== true) throw new Error("Operation guide preference read-back failed");
        preferenceRevision++;
        return true;
    })();
    pendingWrites.set(plugin, write);
    try { return await write; }
    finally { pendingWrites.delete(plugin); }
}

export async function isHomepageOperationGuideSuppressed(plugin: GuidePlugin): Promise<boolean> {
    await pendingWrites.get(plugin);
    const suppressed = await readPreference(plugin);
    if (suppressed !== null) return suppressed;
    if (window.localStorage.getItem(HOMEPAGE_OPERATION_GUIDE_KEY) !== "1") return false;
    try { return await persistSuppression(plugin, true); }
    catch {
        // 保留旧标记，本次仍尊重用户原有选择；不把失败的迁移当作完成。
        console.warn("[Homepage] 操作提示偏好迁移失败。");
        return true;
    }
}

export async function suppressHomepageOperationGuide(plugin: GuidePlugin): Promise<void> {
    await persistSuppression(plugin);
}

let activeOwner: symbol | null = null;
const waiting = new Set<() => void>();

/** One attempt per homepage instance; recheck preferences before taking dialog ownership. */
export function createHomepageOperationGuide(plugin: GuidePlugin, canOpen: () => boolean) {
    const owner = Symbol("homepage-operation-guide");
    let destroyed = false;
    let shown = false;
    let frame: number | null = null;
    let reading = false;
    let dialog: { close: () => void } | null = null;
    const eligible = () => !destroyed && !shown && !isSiyuanMobileFrontend() && canOpen();

    async function open() {
        frame = null;
        if (!eligible() || reading) return;
        if (activeOwner) { waiting.add(request); return; }
        let readFailed = false;
        let suppressed = false;
        const revision = preferenceRevision;
        reading = true;
        try { suppressed = await isHomepageOperationGuideSuppressed(plugin); }
        catch { readFailed = true; }
        finally { reading = false; }
        if (!eligible()) return;
        if (suppressed) { shown = true; return; }
        if (revision !== preferenceRevision) { request(); return; }
        if (activeOwner) { waiting.add(request); return; }
        activeOwner = owner;
        shown = true;
        let close = () => {};
        try {
            const opened = svelteDialog({
                title: "主页操作提示",
                width: "420px",
                constructor: (target) => mount(HomepageOperationGuideDialog, { target, props: {
                    onClose: () => close(), readFailed,
                    onSuppress: async () => {
                        if (destroyed || activeOwner !== owner) throw new Error("Operation guide closed");
                        await suppressHomepageOperationGuide(plugin);
                    },
                } }),
                callback: () => {
                    dialog = null;
                    if (activeOwner !== owner) return;
                    activeOwner = null;
                    const pending = [...waiting];
                    waiting.clear();
                    pending.forEach((retry) => retry());
                },
            });
            close = opened.close;
            if (destroyed || activeOwner !== owner) opened.close();
            else dialog = opened;
        } catch {
            shown = false;
            if (activeOwner === owner) activeOwner = null;
            console.warn("[Homepage] 操作提示暂时无法打开。");
        }
    }

    function request() {
        if (frame !== null || reading || waiting.has(request) || !eligible()) return;
        // Let the ready state reach a painted frame, then recheck visibility before taking focus.
        frame = requestAnimationFrame(() => {
            frame = null;
            if (eligible()) frame = requestAnimationFrame(open);
        });
    }

    return {
        request,
        destroy() {
            if (destroyed) return;
            destroyed = true;
            if (frame !== null) cancelAnimationFrame(frame);
            frame = null;
            waiting.delete(request);
            const ownedDialog = dialog;
            dialog = null;
            ownedDialog?.close();
        },
    };
}
