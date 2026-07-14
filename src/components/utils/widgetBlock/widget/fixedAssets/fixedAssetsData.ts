import {
    FIXED_ASSETS_STORE_TRANSACTION_LOCK,
    loadSharedJson,
    mutateSharedJson,
    runSharedWidgetExclusive,
    type SharedRevisionedFile,
    type SharedWidgetMigrationMetadata,
} from "../sharedLocalStorage/sharedLocalStorage";
import {
    FIXED_ASSETS_FILE,
    FIXED_ASSETS_SCHEMA,
    SHARED_WIDGET_DATA_VERSION,
} from "../sharedLocalStorage/sharedWidgetStoragePaths";
import { assertSharedWidgetMigrationReady } from "../sharedLocalStorage/sharedWidgetMigration";

export type FixedAssetCostMode = "elapsed" | "expectedLife" | "retireDate";

export interface FixedAssetRecord {
    id: string;
    name: string;
    category: string;
    icon: string;
    purchasePrice: number;
    extraCost: number;
    purchaseDate: string;
    retireDate?: string;
    warrantyDate?: string;
    expectedDays?: number;
    costMode: FixedAssetCostMode;
    note?: string;
    createdAt: string;
    updatedAt: string;
    archived?: boolean;
}

export interface FixedAssetsFile extends SharedRevisionedFile {
    assets: FixedAssetRecord[];
    migration?: SharedWidgetMigrationMetadata;
}

export interface FixedAssetsStoreStatus {
    ok: boolean;
    missingFields: string[];
    message: string;
}

export interface FixedAssetsLoadResult {
    assets: FixedAssetRecord[];
    status: FixedAssetsStoreStatus;
}

function finiteCount(value: unknown): number {
    const count = Number(value);
    return Number.isFinite(count) ? Math.max(0, count) : 0;
}

function normalizeCostMode(value: unknown): FixedAssetCostMode {
    return value === "expectedLife" || value === "retireDate" ? value : "elapsed";
}

function normalizeAsset(input: Partial<FixedAssetRecord>): FixedAssetRecord {
    const now = new Date().toISOString();
    return {
        id: typeof input.id === "string" && input.id.trim() ? input.id.trim() : createFixedAssetId(),
        name: typeof input.name === "string" ? input.name.trim() : "",
        category: typeof input.category === "string" ? input.category.trim() : "",
        icon: typeof input.icon === "string" && input.icon.trim() ? input.icon : "📦",
        purchasePrice: finiteCount(input.purchasePrice),
        extraCost: finiteCount(input.extraCost),
        purchaseDate: typeof input.purchaseDate === "string" ? input.purchaseDate : "",
        retireDate: typeof input.retireDate === "string" && input.retireDate ? input.retireDate : undefined,
        warrantyDate: typeof input.warrantyDate === "string" && input.warrantyDate ? input.warrantyDate : undefined,
        expectedDays: finiteCount(input.expectedDays) || undefined,
        costMode: normalizeCostMode(input.costMode),
        note: typeof input.note === "string" && input.note ? input.note : undefined,
        createdAt: typeof input.createdAt === "string" && input.createdAt ? input.createdAt : now,
        updatedAt: typeof input.updatedAt === "string" && input.updatedAt ? input.updatedAt : now,
        archived: input.archived === true,
    };
}

export function createFixedAssetId(): string {
    return `fixed-asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyFixedAssetsFile(): FixedAssetsFile {
    return {
        schema: FIXED_ASSETS_SCHEMA,
        version: SHARED_WIDGET_DATA_VERSION,
        revision: 0,
        updatedAt: new Date().toISOString(),
        assets: [],
    };
}

export function normalizeFixedAssetsFile(raw: unknown): FixedAssetsFile {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("固定资产数据结构无效");
    const value = raw as Record<string, unknown>;
    if (value.schema !== FIXED_ASSETS_SCHEMA || value.version !== SHARED_WIDGET_DATA_VERSION) {
        throw new Error("固定资产数据 schema 或 version 不受支持");
    }
    if (!Array.isArray(value.assets)) throw new Error("固定资产列表无效");
    const assets = value.assets.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("固定资产记录无效");
        const asset = normalizeAsset(item as Partial<FixedAssetRecord>);
        if (!asset.id || !asset.name || !asset.purchaseDate) throw new Error("固定资产关键字段无效");
        return asset;
    });
    return {
        schema: FIXED_ASSETS_SCHEMA,
        version: SHARED_WIDGET_DATA_VERSION,
        revision: finiteCount(value.revision),
        updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
        assets,
        migration: value.migration as SharedWidgetMigrationMetadata | undefined,
    };
}

export function sameFixedAsset(left: FixedAssetRecord, right: FixedAssetRecord): boolean {
    const normalizedLeft = normalizeAsset(left);
    const normalizedRight = normalizeAsset(right);
    return normalizedLeft.id === normalizedRight.id
        && normalizedLeft.name === normalizedRight.name
        && normalizedLeft.category === normalizedRight.category
        && normalizedLeft.icon === normalizedRight.icon
        && normalizedLeft.purchasePrice === normalizedRight.purchasePrice
        && normalizedLeft.extraCost === normalizedRight.extraCost
        && normalizedLeft.purchaseDate === normalizedRight.purchaseDate
        && normalizedLeft.retireDate === normalizedRight.retireDate
        && normalizedLeft.warrantyDate === normalizedRight.warrantyDate
        && normalizedLeft.expectedDays === normalizedRight.expectedDays
        && normalizedLeft.costMode === normalizedRight.costMode
        && normalizedLeft.note === normalizedRight.note
        && normalizedLeft.createdAt === normalizedRight.createdAt
        && normalizedLeft.updatedAt === normalizedRight.updatedAt
        && normalizedLeft.archived === normalizedRight.archived;
}

export function validateFixedAssetRecords(
    actual: FixedAssetRecord[],
    expected: FixedAssetRecord[],
    message = "固定资产写入后业务数据校验失败",
): void {
    const actualById = new Map(actual.map((asset) => [asset.id, asset]));
    const expectedIds = new Set(expected.map((asset) => asset.id));
    if (actual.length !== expected.length
        || actualById.size !== actual.length
        || expectedIds.size !== expected.length
        || expected.some((asset) => {
            const saved = actualById.get(asset.id);
            return !saved || !sameFixedAsset(saved, asset);
        })) {
        throw new Error(message);
    }
}

function validateAssets(actual: FixedAssetsFile, expected: FixedAssetsFile): void {
    validateFixedAssetRecords(actual.assets, expected.assets);
}

export async function getFixedAssetsStoreStatus(): Promise<FixedAssetsStoreStatus> {
    try {
        await assertSharedWidgetMigrationReady("fixed-assets");
        const file = await loadSharedJson(FIXED_ASSETS_FILE, normalizeFixedAssetsFile);
        if (file?.migration?.status === "failed") {
            return { ok: false, missingFields: [], message: "旧数据迁移尚未完成，请重新加载插件后重试。" };
        }
        return {
            ok: true,
            missingFields: [],
            message: file?.migration?.cleanupStatus === "pending" ? "旧数据库清理待重试" : "本地数据已就绪",
        };
    } catch (error) {
        return { ok: false, missingFields: [], message: error instanceof Error ? error.message : "本地存储不可用" };
    }
}

export async function loadFixedAssets(): Promise<FixedAssetsLoadResult> {
    await assertSharedWidgetMigrationReady("fixed-assets");
    const file = await loadSharedJson(FIXED_ASSETS_FILE, normalizeFixedAssetsFile);
    return {
        assets: (file?.assets || []).filter((asset) => !asset.archived),
        status: { ok: true, missingFields: [], message: "本地数据已就绪" },
    };
}

export async function saveFixedAsset(input: Partial<FixedAssetRecord>): Promise<FixedAssetRecord> {
    await assertSharedWidgetMigrationReady("fixed-assets");
    return runSharedWidgetExclusive(FIXED_ASSETS_STORE_TRANSACTION_LOCK, async () => {
        const now = new Date().toISOString();
        const asset = normalizeAsset({ ...input, updatedAt: now });
        const saved = await mutateSharedJson({
            store: "fixed-assets",
            path: FIXED_ASSETS_FILE,
            createEmpty: createEmptyFixedAssetsFile,
            normalize: normalizeFixedAssetsFile,
            mutate: (file) => {
                const index = file.assets.findIndex((item) => item.id === asset.id);
                if (index >= 0) {
                    asset.createdAt = file.assets[index].createdAt;
                    asset.archived = false;
                    file.assets[index] = asset;
                } else {
                    file.assets.push(asset);
                }
            },
            validate: validateAssets,
        });
        return saved.assets.find((item) => item.id === asset.id) || asset;
    });
}

export async function archiveFixedAsset(assetId: string): Promise<void> {
    await assertSharedWidgetMigrationReady("fixed-assets");
    await runSharedWidgetExclusive(FIXED_ASSETS_STORE_TRANSACTION_LOCK, () => mutateSharedJson({
        store: "fixed-assets",
        path: FIXED_ASSETS_FILE,
        createEmpty: createEmptyFixedAssetsFile,
        normalize: normalizeFixedAssetsFile,
        mutate: (file) => {
            const asset = file.assets.find((item) => item.id === assetId);
            if (!asset) return;
            asset.archived = true;
            asset.updatedAt = new Date().toISOString();
        },
        validate: validateAssets,
    }));
}

export function getAssetTotalCost(asset: Pick<FixedAssetRecord, "purchasePrice" | "extraCost">): number {
    return Math.max(0, Number(asset.purchasePrice) || 0) + Math.max(0, Number(asset.extraCost) || 0);
}

export function getDaysBetween(startDate: string, endDate: string): number {
    const start = new Date(`${startDate}T00:00:00`).getTime();
    const end = new Date(`${endDate}T00:00:00`).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 1;
    return Math.floor((end - start) / 86400000) + 1;
}

export function getAssetCostDays(asset: FixedAssetRecord, now = new Date()): number {
    if (asset.costMode === "expectedLife" && asset.expectedDays && asset.expectedDays > 0) return asset.expectedDays;
    if (asset.costMode === "retireDate" && asset.retireDate) return getDaysBetween(asset.purchaseDate, asset.retireDate);
    const pad = (value: number) => String(value).padStart(2, "0");
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    return getDaysBetween(asset.purchaseDate, today);
}

export function getAssetDailyCost(asset: FixedAssetRecord): number {
    return getAssetTotalCost(asset) / Math.max(1, getAssetCostDays(asset));
}

export type FixedAssetCostPeriod = "hour" | "day" | "week" | "month" | "quarter" | "year";

export interface FixedAssetCostPeriodMeta {
    value: FixedAssetCostPeriod;
    label: string;
    suffix: string;
    dailyMultiplier: number;
}

export const FIXED_ASSET_COST_PERIODS: Record<FixedAssetCostPeriod, FixedAssetCostPeriodMeta> = {
    hour: { value: "hour", label: "小时", suffix: "/时", dailyMultiplier: 1 / 24 },
    day: { value: "day", label: "日均", suffix: "/天", dailyMultiplier: 1 },
    week: { value: "week", label: "周均", suffix: "/周", dailyMultiplier: 7 },
    month: { value: "month", label: "月均", suffix: "/月", dailyMultiplier: 30.4375 },
    quarter: { value: "quarter", label: "季均", suffix: "/季", dailyMultiplier: 30.4375 * 3 },
    year: { value: "year", label: "年均", suffix: "/年", dailyMultiplier: 365.25 },
};

export function normalizeFixedAssetCostPeriod(
    value: unknown,
    fallback: FixedAssetCostPeriod = "day",
): FixedAssetCostPeriod {
    if (value === "hour" || value === "day" || value === "week"
        || value === "month" || value === "quarter" || value === "year") return value;
    return fallback;
}

export function getCostByPeriod(dailyCost: number, period: FixedAssetCostPeriod): number {
    return dailyCost * (FIXED_ASSET_COST_PERIODS[period] || FIXED_ASSET_COST_PERIODS.day).dailyMultiplier;
}

export function getAssetPeriodCost(asset: FixedAssetRecord, period: FixedAssetCostPeriod): number {
    return getCostByPeriod(getAssetDailyCost(asset), period);
}
