import { mount } from "svelte";
import type { Plugin } from "siyuan";
import { getFileOrNullChecked } from "@/api";
import { isSiyuanMobileFrontend, svelteDialog } from "@/libs/dialog";
import { getPluginStorageRoot } from "../deviceView/deviceViewPaths";
import HomepageOperationGuideDialog from "./HomepageOperationGuideDialog.svelte";

export const HOMEPAGE_OPERATION_GUIDE_KEY = "siyuan-homepage:desktop-operation-guide:suppressed-v1";

const PREFERENCE_FILE = "homepage-operation-guide.json";
type GuidePlugin = Pick<Plugin, "name" | "saveData">;
const pendingWrites = new WeakMap<GuidePlugin, Promise<boolean>>();
let preferenceRevision = 0;

const PREFERENCE_ERRORS = {
    pre_read_failed: "保存前读取提示偏好失败，请重试，或点击关闭。",
    preference_corrupted: "提示偏好文件已损坏或格式不受支持，未覆盖原文件，请点击关闭。",
    write_rejected: "思源拒绝保存提示偏好，请检查只读模式或权限后重试，或点击关闭。",
    write_timeout_or_unknown: "保存结果尚未确认，请稍后重试核对，或点击关闭。",
    verify_read_failed: "写入后回读失败，保存结果尚未确认，请重试核对，或点击关闭。",
    verify_mismatch: "写入后文件验证未通过，保存结果尚未确认，请重试核对，或点击关闭。",
};

class PreferenceError extends Error {
    constructor(readonly stage: keyof typeof PREFERENCE_ERRORS) {
        super(PREFERENCE_ERRORS[stage]);
        this.name = "HomepageOperationGuidePreferenceError";
    }
}

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
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
        value = new TextDecoder("utf-8", { fatal: true }).decode(value);
    }
    if (typeof value === "string") value = JSON.parse(value);
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) ||
        Object.keys(value).length !== 2 ||
        !Object.prototype.hasOwnProperty.call(value, "version") || !Object.prototype.hasOwnProperty.call(value, "suppressed") ||
        (value as { version?: unknown }).version !== 1 ||
        typeof (value as { suppressed?: unknown }).suppressed !== "boolean") {
        throw new Error("Invalid operation guide preference");
    }
    return (value as { suppressed: boolean }).suppressed;
}

async function readPreference(
    plugin: GuidePlugin,
    readStage: "pre_read_failed" | "verify_read_failed" = "pre_read_failed",
): Promise<boolean | null> {
    let raw: unknown;
    try {
        // 只以严格文件读取为准；SDK loadData 的会话缓存不能证明磁盘状态。
        raw = await preferenceIO(getFileOrNullChecked(`${getPluginStorageRoot(plugin)}/${PREFERENCE_FILE}`));
        if (raw === null) return null;
        if (raw instanceof Blob) raw = await preferenceIO(raw.text());
    } catch {
        throw new PreferenceError(readStage);
    }
    try { return parsePreference(raw); }
    catch {
        throw new PreferenceError(readStage === "pre_read_failed" ? "preference_corrupted" : "verify_mismatch");
    }
}

async function persistSuppression(plugin: GuidePlugin, onlyIfMissing = false): Promise<boolean> {
    const pending = pendingWrites.get(plugin);
    if (pending) return pending;
    const write = (async () => {
        const current = await readPreference(plugin);
        if (current === true) { preferenceRevision++; return true; }
        if (onlyIfMissing && current !== null) return current;
        let result: unknown;
        try {
            result = await preferenceIO(plugin.saveData(PREFERENCE_FILE, { version: 1, suppressed: true }));
        } catch (error) {
            const rejected = error && typeof error === "object" && "code" in error &&
                typeof error.code === "number" && error.code !== 0;
            throw new PreferenceError(rejected ? "write_rejected" : "write_timeout_or_unknown");
        }
        if (!result || typeof result !== "object" || !("code" in result) || typeof result.code !== "number") {
            throw new PreferenceError("write_timeout_or_unknown");
        }
        if (result.code !== 0) throw new PreferenceError("write_rejected");
        if (await readPreference(plugin, "verify_read_failed") !== true) throw new PreferenceError("verify_mismatch");
        preferenceRevision++;
        return true;
    })();
    pendingWrites.set(plugin, write);
    try { return await write; }
    catch (error) {
        console.warn("[Homepage] 操作提示偏好保存未完成。", {
            stage: error instanceof PreferenceError ? error.stage : "write_timeout_or_unknown",
        });
        throw error;
    }
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
        catch (error) {
            readFailed = true;
            console.warn("[Homepage] 操作提示偏好读取失败。", {
                stage: error instanceof PreferenceError ? error.stage : "pre_read_failed",
            });
        }
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
