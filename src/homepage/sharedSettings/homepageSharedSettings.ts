import { getFileOrNullChecked } from "@/api";
import { getPluginStorageRoot } from "@/homepage/deviceView/deviceViewPaths";
import { writeJson } from "@/homepage/deviceView/deviceViewStorage";
import {
    cloneJsonSafe,
    cloneJsonSafeOmittingUndefinedObjectProperties,
    hasSameJsonSemantic,
    isJsonSafe,
    isPlainJsonObject,
} from "@/homepage/deviceView/jsonSafe";

const HOMEPAGE_SHARED_SETTINGS_SCHEMA = "siyuan-homepage-shared-settings";
const HOMEPAGE_SHARED_SETTINGS_VERSION = 1;
const HOMEPAGE_SHARED_SETTINGS_FILE = "homepageSharedSettings.json";

/**
 * 这些字段描述跨设备公共能力或所有移动端共同使用的入口偏好。
 * 桌面/移动主页的布局、横幅、组件排列和悬浮按钮位置仍保留在各自 device-view 中。
 */
export const HOMEPAGE_SHARED_SETTING_KEYS = [
    "autoOpenMobileHomepage",
    "mobileAutoOpenEnabled",
    "mobileAutoOpenTarget",
    "mobileQuickActionsEnabled",
    "mobileQuickActionsButtonSize",
    "mobileQuickActionItems",
    "quickNotesEnabled",
    "quickNotesPosition",
    "quickNotesTimestampEnabled",
    "quickNotesAddPosition",
    "taskEditorEnabled",
    "aiKbDockEnabled",
    "aiKbTabEnabled",
    "selectionAiToolbar",
    "tasksPlusSelectedNotebookIds",
    "reviewDocsSelectedNotebookIds",
    "favoritesMigrationStatus",
    "reviewDocsMigrationStatus",
    "taskIndexMigrationStatus",
    "heatmapIndexStatus",
    "statIndexStatus",
    "enhancedDiaryIndexStatus",
] as const;

export type HomepageSharedSettingsLegacySource = "desktop" | "mobile";

const MOBILE_LEGACY_SETTING_KEYS = new Set<(typeof HOMEPAGE_SHARED_SETTING_KEYS)[number]>([
    "autoOpenMobileHomepage",
    "mobileAutoOpenEnabled",
    "mobileAutoOpenTarget",
    "mobileQuickActionsEnabled",
    "mobileQuickActionsButtonSize",
    "mobileQuickActionItems",
]);

interface HomepageSharedSettingsDocument {
    schema: typeof HOMEPAGE_SHARED_SETTINGS_SCHEMA;
    version: typeof HOMEPAGE_SHARED_SETTINGS_VERSION;
    revision: number;
    updatedAt: string;
    config: Record<string, unknown>;
    [key: string]: unknown;
}

export interface HomepageSharedSettingsSnapshot {
    revision: number;
    updatedAt: string;
    config: Record<string, unknown>;
}

const writeQueues = new Map<string, Promise<void>>();

export class HomepageSharedSettingsError extends Error {
    constructor(message: string, public readonly cause?: unknown) {
        super(message);
        this.name = "HomepageSharedSettingsError";
    }
}

function getSharedSettingsPath(plugin: any): string {
    return `${getPluginStorageRoot(plugin)}/${HOMEPAGE_SHARED_SETTINGS_FILE}`;
}

async function decodeJson(raw: unknown, path: string): Promise<unknown> {
    let text: string;
    if (raw instanceof Blob) text = await raw.text();
    else if (typeof raw === "string") text = raw;
    else if (raw instanceof ArrayBuffer) text = new TextDecoder().decode(raw);
    else if (ArrayBuffer.isView(raw)) {
        const view = raw as ArrayBufferView;
        text = new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    } else if (isPlainJsonObject(raw)) {
        return cloneJsonSafe(raw, `共享主页设置 ${path}`);
    } else {
        throw new HomepageSharedSettingsError(`共享主页设置 ${path} 返回了不支持的数据类型`);
    }
    if (!text.trim()) throw new HomepageSharedSettingsError(`共享主页设置 ${path} 为空`);
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new HomepageSharedSettingsError(`共享主页设置 ${path} JSON 损坏`, error);
    }
}

function validateDocument(value: unknown, path: string): HomepageSharedSettingsDocument {
    if (!isPlainJsonObject(value)) {
        throw new HomepageSharedSettingsError(`共享主页设置 ${path} 不是普通对象`);
    }
    if (
        value.schema !== HOMEPAGE_SHARED_SETTINGS_SCHEMA
        || value.version !== HOMEPAGE_SHARED_SETTINGS_VERSION
    ) {
        throw new HomepageSharedSettingsError(`共享主页设置 ${path} schema/version 无效`);
    }
    if (!Number.isInteger(value.revision) || Number(value.revision) < 1) {
        throw new HomepageSharedSettingsError(`共享主页设置 ${path} revision 无效`);
    }
    if (typeof value.updatedAt !== "string" || !value.updatedAt) {
        throw new HomepageSharedSettingsError(`共享主页设置 ${path} updatedAt 无效`);
    }
    if (!isPlainJsonObject(value.config) || !isJsonSafe(value.config)) {
        throw new HomepageSharedSettingsError(`共享主页设置 ${path} config 无效`);
    }
    return cloneJsonSafe(value as unknown as HomepageSharedSettingsDocument, `共享主页设置 ${path}`);
}

async function readDocument(plugin: any): Promise<HomepageSharedSettingsDocument | null> {
    const path = getSharedSettingsPath(plugin);
    let raw: unknown;
    try {
        raw = await getFileOrNullChecked(path);
    } catch (error) {
        throw new HomepageSharedSettingsError(`读取共享主页设置失败：${path}`, error);
    }
    if (raw === null) return null;
    return validateDocument(await decodeJson(raw, path), path);
}

async function writeDocument(
    plugin: any,
    document: HomepageSharedSettingsDocument,
): Promise<HomepageSharedSettingsDocument> {
    const path = getSharedSettingsPath(plugin);
    const safeDocument = validateDocument(document, path);
    try {
        await writeJson(path, safeDocument);
        const verified = await readDocument(plugin);
        if (!verified || !hasSameJsonSemantic(verified, safeDocument)) {
            throw new HomepageSharedSettingsError(`共享主页设置 ${path} 写入后校验失败`);
        }
        return verified;
    } catch (error) {
        if (error instanceof HomepageSharedSettingsError) throw error;
        throw new HomepageSharedSettingsError(`保存共享主页设置失败：${path}`, error);
    }
}

async function inWriteQueue<T>(path: string, task: () => Promise<T>): Promise<T> {
    const previous = writeQueues.get(path) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.catch(() => undefined).then(() => current);
    writeQueues.set(path, queued);
    await previous.catch(() => undefined);
    try {
        return await task();
    } finally {
        release();
        if (writeQueues.get(path) === queued) writeQueues.delete(path);
    }
}

export function pickHomepageSharedSettings(
    config: Record<string, unknown>,
): Record<string, unknown> {
    const selected: Record<string, unknown> = {};
    for (const key of HOMEPAGE_SHARED_SETTING_KEYS) {
        if (Object.prototype.hasOwnProperty.call(config, key) && config[key] !== undefined) {
            selected[key] = config[key];
        }
    }
    return cloneJsonSafeOmittingUndefinedObjectProperties(selected, "共享主页设置字段");
}

function pickLegacyHomepageSharedSettings(
    config: Record<string, unknown>,
    source: HomepageSharedSettingsLegacySource,
): Record<string, unknown> {
    const selected = pickHomepageSharedSettings(config);
    return Object.fromEntries(
        Object.entries(selected).filter(([key]) => {
            const isMobileOwned = MOBILE_LEGACY_SETTING_KEYS.has(
                key as (typeof HOMEPAGE_SHARED_SETTING_KEYS)[number],
            );
            return source === "mobile" ? isMobileOwned : !isMobileOwned;
        }),
    );
}

async function ensureSharedSettings(
    plugin: any,
    legacyConfig: Record<string, unknown>,
    legacySource: HomepageSharedSettingsLegacySource,
): Promise<Record<string, unknown>> {
    const path = getSharedSettingsPath(plugin);
    const legacyShared = pickLegacyHomepageSharedSettings(legacyConfig, legacySource);
    return inWriteQueue(path, async () => {
        const existing = await readDocument(plugin);
        if (!existing) {
            if (Object.keys(legacyShared).length === 0) return {};
            const created: HomepageSharedSettingsDocument = {
                schema: HOMEPAGE_SHARED_SETTINGS_SCHEMA,
                version: HOMEPAGE_SHARED_SETTINGS_VERSION,
                revision: 1,
                updatedAt: new Date().toISOString(),
                legacySources: { [legacySource]: true },
                config: legacyShared,
            };
            return (await writeDocument(plugin, created)).config;
        }

        const legacySources = isPlainJsonObject(existing.legacySources)
            ? existing.legacySources
            : {};
        if (legacySources[legacySource] === true) {
            return cloneJsonSafe(existing.config, "共享主页设置");
        }

        // 旧版共享文件没有记录字段归属，可能由错误的“首次读取者”创建。
        // 每个来源首次接入时，用其负责的旧字段修复一次，之后共享文件保持权威。
        const updated: HomepageSharedSettingsDocument = {
            ...existing,
            revision: existing.revision + 1,
            updatedAt: new Date().toISOString(),
            legacySources: {
                ...legacySources,
                [legacySource]: true,
            },
            config: {
                ...existing.config,
                ...legacyShared,
            },
        };
        return (await writeDocument(plugin, updated)).config;
    });
}

export async function mergeHomepageSharedSettings(
    plugin: any,
    viewConfig: Record<string, unknown>,
    legacySource: HomepageSharedSettingsLegacySource,
): Promise<Record<string, unknown>> {
    const safeViewConfig = cloneJsonSafe(viewConfig, "设备视图主页设置");
    const sharedConfig = await ensureSharedSettings(plugin, safeViewConfig, legacySource);
    return cloneJsonSafe({
        ...safeViewConfig,
        ...pickHomepageSharedSettings(sharedConfig),
    }, "合并后的主页设置");
}

export async function readHomepageSharedSettingsSnapshot(
    plugin: any,
): Promise<HomepageSharedSettingsSnapshot | null> {
    const document = await readDocument(plugin);
    if (!document) return null;
    return {
        revision: document.revision,
        updatedAt: document.updatedAt,
        config: cloneJsonSafe(document.config, "共享主页设置快照"),
    };
}

export async function saveHomepageSharedSettings(
    plugin: any,
    config: Record<string, unknown>,
): Promise<void> {
    const patch = pickHomepageSharedSettings(config);
    if (Object.keys(patch).length === 0) return;
    const path = getSharedSettingsPath(plugin);
    await inWriteQueue(path, async () => {
        const existing = await readDocument(plugin);
        const nextConfig = {
            ...(existing?.config ?? {}),
            ...patch,
        };
        if (existing && hasSameJsonSemantic(existing.config, nextConfig)) return;
        await writeDocument(plugin, {
            ...(existing ?? {}),
            schema: HOMEPAGE_SHARED_SETTINGS_SCHEMA,
            version: HOMEPAGE_SHARED_SETTINGS_VERSION,
            revision: (existing?.revision ?? 0) + 1,
            updatedAt: new Date().toISOString(),
            config: nextConfig,
        });
    });
}
