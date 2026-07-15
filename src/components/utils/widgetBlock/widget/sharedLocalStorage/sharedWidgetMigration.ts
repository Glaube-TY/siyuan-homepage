import {
  collectLegacyDatabaseIds,
  collectLegacyWidgetConfigs,
  parseLegacyWidgetConfig,
  readDatabaseIdsFromWidgetConfig,
  type DatabaseWidgetType,
  type LegacyWidgetConfigRecord,
} from "../sharedDatabaseId";
import {
  createEmptyFocusIndexFile,
  listFocusSessionYears,
  loadFocusLegacyBaseline,
  normalizeFocusIndexFile,
  normalizeFocusStatisticsFile,
  rebuildFocusIndexFromFiles,
  saveFocusLegacyBaselineChecked,
  type FocusIndexFile,
  type FocusLegacyTotals,
} from "../focus/focusData";
import {
  createEmptyCYBMOKBatchesYearFile,
  createEmptyCYBMOKIndexFile,
  createLegacyCYBMOKBatch,
  listCYBMOKBatchYears,
  normalizeCYBMOKBatchesYearFile,
  normalizeCYBMOKIndexFile,
  normalizeCYBMOKRecordsFile,
  rebuildCYBMOKIndexFromFiles,
  toLocalCYBMOKDate,
  validateCYBMOKYearFile,
  type CYBMOKBatchRecord,
  type CYBMOKIndexFile,
  type CYBMOKRecord,
} from "../CYBMOK/cybmokData";
import {
  createEmptyCountdownEventsFile,
  normalizeCountdownEventsFile,
  normalizeCountdownEvent,
  validateCountdownEventRecords,
  type CountdownEventInput,
  type CountdownEventRecord,
  type CountdownEventsFile,
} from "../countdown/countdownData";
import {
  createEmptyFixedAssetsFile,
  normalizeFixedAssetsFile,
  validateFixedAssetRecords,
  type FixedAssetRecord,
  type FixedAssetsFile,
} from "../fixedAssets/fixedAssetsData";
import {
  createEmptyReviewLogIndexFile,
  createEmptyReviewLogsYearFile,
  getReviewLogDedupeKey,
  getReviewLogYear,
  listReviewLogYears,
  normalizeReviewLogIndexFile,
  normalizeReviewLogsYearFile,
  rebuildReviewLogIndexFromFiles,
  validateReviewLogRecords,
  type ReviewLogIndexFile,
} from "../reviewDocs/reviewDocsData";
import type { ReviewLogEntry } from "../reviewDocs/reviewDocsTypes";
import { COUNTDOWN_NOTIFY_SETTINGS_KEY } from "@/features/countdown-notify/constants";
import {
  assertSharedWidgetYearFilesComplete,
  COUNTDOWN_STORE_TRANSACTION_LOCK,
  CYBMOK_STORE_TRANSACTION_LOCK,
  FIXED_ASSETS_STORE_TRANSACTION_LOCK,
  FOCUS_STORE_TRANSACTION_LOCK,
  getSharedWidgetStoragePlugin,
  loadSharedRawJson,
  loadSharedJson,
  mutateSharedJson,
  removeSharedLegacyDataChecked,
  REVIEW_DOCS_STORE_TRANSACTION_LOCK,
  runSharedWidgetExclusive,
  SHARED_WIDGET_MIGRATION_LOCK,
  type SharedRevisionedFile,
  type SharedWidgetMigrationMetadata,
} from "./sharedLocalStorage";
import {
  assertLegacyDatabaseScanSafe,
  getLegacyAttributeViewRowIds,
  readLegacyCountdownDatabase,
  readLegacyCYBMOKDatabase,
  readLegacyFixedAssetsDatabase,
  readLegacyFocusDatabase,
  readLegacyReviewDocsDatabase,
  removeLegacyAttributeViewRows,
  type LegacyDatabaseRow,
  type LegacyDatabaseScanResult,
} from "./legacySharedWidgetDatabase";
import {
  COUNTDOWN_EVENTS_FILE,
  CYBMOK_INDEX_FILE,
  CYBMOK_RECORDS_FILE,
  FIXED_ASSETS_FILE,
  FOCUS_INDEX_FILE,
  FOCUS_STATISTICS_FILE,
  getCYBMOKBatchesFile,
  getReviewLogsFile,
  REVIEW_LOG_INDEX_FILE,
} from "./sharedWidgetStoragePaths";

export type MigrationStore =
  | "focus"
  | "cybmok"
  | "countdown"
  | "fixed-assets"
  | "review-docs";

export interface SharedWidgetMigrationState {
  status: "idle" | "running" | "complete" | "failed";
  error?: string;
  migratedStores: MigrationStore[];
  failedStores?: Partial<Record<MigrationStore, string>>;
}

let migrationPromise: Promise<void> | null = null;
let migrationState: SharedWidgetMigrationState = {
  status: "idle",
  migratedStores: [],
};

export function getSharedWidgetMigrationState(): SharedWidgetMigrationState {
  return {
    ...migrationState,
    migratedStores: [...migrationState.migratedStores],
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function createMetadata(
  sourceRecordCount: number,
  importedRecordCount: number,
  legacyDatabaseIds: string[],
  legacyRootFiles: string[],
  rows: Array<LegacyDatabaseRow<unknown>>,
): SharedWidgetMigrationMetadata {
  const byDatabase = new Map<string, Array<LegacyDatabaseRow<unknown>>>();
  for (const row of rows) {
    if (!byDatabase.has(row.databaseId)) byDatabase.set(row.databaseId, []);
    byDatabase.get(row.databaseId)!.push(row);
  }
  const pendingDatabaseRows = Array.from(
    byDatabase,
    ([databaseId, values]) => ({
      databaseId,
      rowIds: values.map((row) => row.rowId),
      srcIds: values.map((row) => row.srcId),
    }),
  ).filter((item) => item.rowIds.length > 0);
  const hasCleanup =
    pendingDatabaseRows.length > 0 || legacyRootFiles.length > 0;
  return {
    version: 1,
    dataValidated: true,
    importedAt: nowIso(),
    status: hasCleanup ? "cleanup-pending" : "complete",
    sourceRecordCount,
    importedRecordCount,
    legacyDatabaseIds,
    legacyRootFiles,
    cleanupStatus: hasCleanup ? "pending" : "complete",
    pendingDatabaseRows:
      pendingDatabaseRows.length > 0 ? pendingDatabaseRows : undefined,
  };
}

async function readPluginData(path: string): Promise<unknown> {
  return loadSharedRawJson(path);
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function compareTimestamp(
  left: string | undefined,
  right: string | undefined,
): number {
  const a = typeof left === "string" && left ? Date.parse(left) : NaN;
  const b = typeof right === "string" && right ? Date.parse(right) : NaN;
  if (Number.isFinite(a) && Number.isFinite(b)) return a - b;
  if (Number.isFinite(a)) return 1;
  if (Number.isFinite(b)) return -1;
  return 0;
}

interface LegacyDatabaseReadSummary<T> {
  scans: Array<LegacyDatabaseScanResult<T>>;
  rows: Array<LegacyDatabaseRow<T>>;
}

async function readAllLegacyRows<T>(
  databaseIds: string[],
  reader: (databaseId: string) => Promise<LegacyDatabaseScanResult<T>>,
): Promise<LegacyDatabaseReadSummary<T>> {
  const scans: Array<LegacyDatabaseScanResult<T>> = [];
  const rows: Array<LegacyDatabaseRow<T>> = [];
  for (const databaseId of databaseIds) {
    try {
      const scan = await reader(databaseId);
      assertLegacyDatabaseScanSafe(scan);
      scans.push(scan);
      rows.push(...scan.rows);
    } catch (error) {
      console.warn(
        `[sharedWidgetMigration] 读取旧数据库 ${databaseId} 失败`,
        error,
      );
      throw error;
    }
  }
  return { scans, rows };
}

function hasCompletedMigration(
  file:
    | (SharedRevisionedFile & { migration?: SharedWidgetMigrationMetadata })
    | null,
): boolean {
  return (
    file?.migration?.dataValidated === true &&
    (file.migration.status === "complete" ||
      file.migration.status === "cleanup-pending")
  );
}

function mergePendingDatabaseRows(
  sources: Array<SharedWidgetMigrationMetadata | undefined>,
): SharedWidgetMigrationMetadata["pendingDatabaseRows"] {
  const byDatabase = new Map<string, Map<string, string | undefined>>();
  for (const metadata of sources) {
    for (const group of metadata?.pendingDatabaseRows || []) {
      if (!byDatabase.has(group.databaseId))
        byDatabase.set(group.databaseId, new Map());
      const rows = byDatabase.get(group.databaseId)!;
      group.rowIds.forEach((rowId, index) => {
        if (!rows.has(rowId) || (!rows.get(rowId) && group.srcIds?.[index])) {
          rows.set(rowId, group.srcIds?.[index]);
        }
      });
    }
  }
  const groups = Array.from(byDatabase, ([databaseId, rows]) => {
    const entries = Array.from(rows);
    return {
      databaseId,
      rowIds: entries.map(([rowId]) => rowId),
      srcIds: entries.map(([rowId, srcId]) => srcId || rowId),
    };
  }).filter((group) => group.rowIds.length > 0);
  return groups.length > 0 ? groups : undefined;
}

export function mergeMigrationMetadata(
  existing: SharedWidgetMigrationMetadata | undefined,
  incoming: SharedWidgetMigrationMetadata | undefined,
): SharedWidgetMigrationMetadata | undefined {
  if (!existing && !incoming) return undefined;
  if (existing?.status === "failed" || incoming?.status === "failed") {
    throw new Error("旧迁移元数据仍标记为失败，已停止清理旧数据");
  }
  const metadata = existing || incoming!;
  const legacyDatabaseIds = Array.from(
    new Set([
      ...(existing?.legacyDatabaseIds || []),
      ...(incoming?.legacyDatabaseIds || []),
    ]),
  );
  const legacyRootFiles = Array.from(
    new Set([
      ...(existing?.legacyRootFiles || []),
      ...(incoming?.legacyRootFiles || []),
    ]),
  );
  const pendingDatabaseRows = mergePendingDatabaseRows([existing, incoming]);
  const cleanupPending =
    existing?.cleanupStatus === "pending" ||
    incoming?.cleanupStatus === "pending" ||
    existing?.status === "cleanup-pending" ||
    incoming?.status === "cleanup-pending" ||
    legacyRootFiles.length > 0 ||
    Boolean(pendingDatabaseRows?.length);
  const cleanupErrors = Array.from(
    new Set([existing?.cleanupError, incoming?.cleanupError].filter(Boolean)),
  );
  return {
    ...metadata,
    dataValidated: true,
    importedAt: existing?.importedAt || incoming?.importedAt || nowIso(),
    sourceRecordCount:
      (existing?.sourceRecordCount || 0) + (incoming?.sourceRecordCount || 0),
    importedRecordCount:
      (existing?.importedRecordCount || 0) +
      (incoming?.importedRecordCount || 0),
    legacyDatabaseIds,
    legacyRootFiles,
    pendingDatabaseRows,
    status: cleanupPending ? "cleanup-pending" : "complete",
    cleanupStatus: cleanupPending ? "pending" : "complete",
    cleanupError:
      cleanupErrors.length > 0 ? cleanupErrors.join("；") : undefined,
  };
}

function rowsNotAlreadyPending<T>(
  rows: Array<LegacyDatabaseRow<T>>,
  ...sources: Array<SharedWidgetMigrationMetadata | undefined>
): Array<LegacyDatabaseRow<T>> {
  const pending = new Set<string>();
  for (const metadata of sources) {
    for (const group of metadata?.pendingDatabaseRows || []) {
      for (const rowId of group.rowIds)
        pending.add(`${group.databaseId}\u0000${rowId}`);
    }
  }
  return rows.filter(
    (row) => !pending.has(`${row.databaseId}\u0000${row.rowId}`),
  );
}

function rootSourceNeedsImport(
  path: string,
  exists: boolean,
  metadata: SharedWidgetMigrationMetadata | undefined,
): boolean {
  return exists && !(metadata?.legacyRootFiles || []).includes(path);
}

async function saveValidatedMigrationMetadata<
  T extends SharedRevisionedFile & {
    migration?: SharedWidgetMigrationMetadata;
  },
>(options: {
  store: MigrationStore;
  path: string;
  createEmpty: () => T;
  normalize: (raw: unknown) => T;
  metadata: SharedWidgetMigrationMetadata;
}): Promise<void> {
  await mutateSharedJson({
    store: options.store,
    path: options.path,
    createEmpty: options.createEmpty,
    normalize: options.normalize,
    mutate: (file) => {
      file.migration = options.metadata;
    },
    validate: (actual) => {
      const saved = actual.migration;
      if (
        saved?.dataValidated !== true ||
        saved.importedAt !== options.metadata.importedAt ||
        saved.sourceRecordCount !== options.metadata.sourceRecordCount ||
        saved.importedRecordCount !== options.metadata.importedRecordCount ||
        saved.status !== options.metadata.status ||
        saved.cleanupStatus !== options.metadata.cleanupStatus ||
        JSON.stringify(saved.legacyDatabaseIds) !==
          JSON.stringify(options.metadata.legacyDatabaseIds) ||
        JSON.stringify(saved.legacyRootFiles) !==
          JSON.stringify(options.metadata.legacyRootFiles) ||
        JSON.stringify(saved.pendingDatabaseRows || []) !==
          JSON.stringify(options.metadata.pendingDatabaseRows || [])
      ) {
        throw new Error(`迁移元数据写入校验失败：${options.path}`);
      }
    },
  });
}

function legacyConfigFields(type: DatabaseWidgetType): string[] {
  return type === "focus"
    ? ["focusDatabaseId"]
    : type === "CYBMOK"
      ? ["CYBMOKDatabaseId", "cybmokDatabaseId"]
      : type === "countdown"
        ? ["countdownDatabaseId", "eventList"]
        : type === "fixedAssets"
          ? ["fixedAssetsDatabaseId"]
          : ["reviewDocsDatabaseId"];
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [
        key,
        stableJsonValue((value as Record<string, unknown>)[key]),
      ]),
  );
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(stableJsonValue(left)) ===
    JSON.stringify(stableJsonValue(right))
  );
}

async function cleanWidgetConfigs(
  configs: LegacyWidgetConfigRecord[],
  type: DatabaseWidgetType,
  validatedDatabaseIds: Set<string>,
): Promise<string[]> {
  const fields = legacyConfigFields(type);
  const failures: string[] = [];
  const plugin = getSharedWidgetStoragePlugin();
  for (const record of configs.filter((item) => item.config.type === type)) {
    try {
      const latest = parseLegacyWidgetConfig(
        await plugin.loadData(record.path),
      );
      if (!latest) throw new Error("无法重新读取最新组件配置");
      if (latest.type !== type) throw new Error("组件类型已经变化");
      const latestData =
        latest.data &&
        typeof latest.data === "object" &&
        !Array.isArray(latest.data)
          ? { ...latest.data }
          : {};
      if (!fields.some((field) => field in latestData)) continue;
      const latestDatabaseIds = readDatabaseIdsFromWidgetConfig(type, latest);
      if (
        latestDatabaseIds.some(
          (databaseId) => !validatedDatabaseIds.has(databaseId),
        )
      ) {
        throw new Error("最新组件配置引用了尚未安全扫描的旧数据库");
      }
      if (
        type === "countdown" &&
        "eventList" in latestData &&
        !sameJsonValue(latestData.eventList, record.config.data?.eventList)
      ) {
        throw new Error("最新纪念日 eventList 与迁移时读取的内容不一致");
      }
      fields.forEach((field) => delete latestData[field]);
      const expected = { ...latest, data: latestData };
      await plugin.saveData(record.path, expected);
      const reloaded = parseLegacyWidgetConfig(
        await plugin.loadData(record.path),
      );
      if (
        !reloaded ||
        reloaded.type !== type ||
        fields.some((field) => field in (reloaded.data || {})) ||
        !sameJsonValue(reloaded, expected)
      ) {
        throw new Error("组件配置清理后校验失败");
      }
    } catch (error) {
      failures.push(record.path);
      console.warn(`[sharedWidgetMigration] 清理 ${record.path} 失败`, error);
    }
  }
  return failures;
}

async function cleanLegacyCountdownNotifySettings(
  validatedDatabaseIds: Set<string>,
): Promise<string[]> {
  const plugin = getSharedWidgetStoragePlugin();
  try {
    const raw = await plugin.loadData(COUNTDOWN_NOTIFY_SETTINGS_KEY);
    if (raw === null || raw === undefined || raw === "") return [];
    const latest = parseLegacyWidgetConfig(raw);
    if (!latest) throw new Error("无法解析最新纪念日通知设置");
    if (!("databaseId" in latest)) return [];
    const databaseId =
      typeof latest.databaseId === "string" ? latest.databaseId.trim() : "";
    if (databaseId && !validatedDatabaseIds.has(databaseId)) {
      throw new Error("最新通知设置引用了尚未安全扫描的旧数据库");
    }
    const expected: Record<string, any> = { ...latest, version: 2 };
    delete expected.databaseId;
    await plugin.saveData(COUNTDOWN_NOTIFY_SETTINGS_KEY, expected);
    const reloaded = parseLegacyWidgetConfig(
      await plugin.loadData(COUNTDOWN_NOTIFY_SETTINGS_KEY),
    );
    if (
      !reloaded ||
      reloaded.version !== 2 ||
      "databaseId" in reloaded ||
      !sameJsonValue(reloaded, expected)
    ) {
      throw new Error("纪念日通知设置清理后校验失败");
    }
    return [];
  } catch (error) {
    console.warn(
      "[sharedWidgetMigration] 清理旧纪念日通知 databaseId 失败",
      error,
    );
    return [COUNTDOWN_NOTIFY_SETTINGS_KEY];
  }
}

function widgetConfigNeedsCleanup(
  configs: LegacyWidgetConfigRecord[],
  type: DatabaseWidgetType,
): boolean {
  const fields = legacyConfigFields(type);
  return configs.some(
    (record) =>
      record.config.type === type &&
      fields.some((field) => field in (record.config.data || {})),
  );
}

function includePendingConfigCleanup(
  metadata: SharedWidgetMigrationMetadata,
  configs: LegacyWidgetConfigRecord[],
  type: DatabaseWidgetType,
): SharedWidgetMigrationMetadata {
  if (!widgetConfigNeedsCleanup(configs, type)) return metadata;
  return { ...metadata, status: "cleanup-pending", cleanupStatus: "pending" };
}

async function runCleanup<
  T extends SharedRevisionedFile & {
    migration?: SharedWidgetMigrationMetadata;
  },
>(options: {
  store: MigrationStore;
  path: string;
  widgetType: DatabaseWidgetType;
  configs: LegacyWidgetConfigRecord[];
  createEmpty: () => T;
  normalize: (raw: unknown) => T;
  validatedDatabaseIds: string[];
  additionalCleanup?: () => Promise<string[]>;
}): Promise<void> {
  const current = await loadSharedJson(options.path, options.normalize);
  if (
    !current?.migration ||
    current.migration.dataValidated !== true ||
    current.migration.status === "failed"
  )
    return;
  if (
    current.migration.status === "complete" &&
    current.migration.cleanupStatus === "complete"
  )
    return;
  const metadata = current.migration;
  const pendingRows: NonNullable<
    SharedWidgetMigrationMetadata["pendingDatabaseRows"]
  > = [];
  const errors: string[] = [];

  for (const group of metadata.pendingDatabaseRows || []) {
    let unrelatedBefore: string[] = [];
    try {
      const targetIds = new Set(group.rowIds);
      unrelatedBefore = (
        await getLegacyAttributeViewRowIds(group.databaseId)
      ).filter((rowId) => !targetIds.has(rowId));
      await removeLegacyAttributeViewRows(
        group.databaseId,
        group.rowIds.map((rowId, index) => ({
          rowId,
          srcId: group.srcIds?.[index],
        })),
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    try {
      const allRemainingIds = await getLegacyAttributeViewRowIds(
        group.databaseId,
      );
      const remainingSet = new Set(allRemainingIds);
      const remainingIds = group.rowIds.filter((rowId) =>
        remainingSet.has(rowId),
      );
      const missingUnrelated = unrelatedBefore.filter(
        (rowId) => !remainingSet.has(rowId),
      );
      if (missingUnrelated.length > 0) {
        throw new Error(
          `旧数据库清理验证发现非目标行缺失：${group.databaseId}`,
        );
      }
      if (remainingIds.length > 0) {
        pendingRows.push({
          databaseId: group.databaseId,
          rowIds: remainingIds,
          srcIds: remainingIds.map(
            (rowId) => group.srcIds?.[group.rowIds.indexOf(rowId)] || rowId,
          ),
        });
      }
    } catch (error) {
      pendingRows.push(group);
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const pendingRootFiles: string[] = [];
  for (const rootFile of metadata.legacyRootFiles || []) {
    try {
      await removeSharedLegacyDataChecked(rootFile);
    } catch (error) {
      pendingRootFiles.push(rootFile);
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const configFailures = await cleanWidgetConfigs(
    options.configs,
    options.widgetType,
    new Set(options.validatedDatabaseIds),
  );
  if (options.additionalCleanup)
    configFailures.push(...(await options.additionalCleanup()));
  if (configFailures.length > 0)
    errors.push(`组件配置清理失败：${configFailures.join("、")}`);
  const cleanupPending =
    pendingRows.length > 0 ||
    pendingRootFiles.length > 0 ||
    configFailures.length > 0;
  await mutateSharedJson({
    store: options.store,
    path: options.path,
    createEmpty: options.createEmpty,
    normalize: options.normalize,
    mutate: (file) => {
      if (!file.migration) return;
      file.migration = {
        ...file.migration,
        status: cleanupPending ? "cleanup-pending" : "complete",
        cleanupStatus: cleanupPending ? "pending" : "complete",
        cleanupError: cleanupPending
          ? errors.join("；") || "旧数据清理待重试"
          : undefined,
        pendingDatabaseRows: pendingRows.length > 0 ? pendingRows : undefined,
        legacyRootFiles: pendingRootFiles,
      };
    },
    validate: (actual) => {
      const saved = actual.migration;
      if (
        !saved ||
        saved.cleanupStatus !== (cleanupPending ? "pending" : "complete") ||
        saved.status !== (cleanupPending ? "cleanup-pending" : "complete") ||
        JSON.stringify(saved.legacyRootFiles) !==
          JSON.stringify(pendingRootFiles) ||
        JSON.stringify(saved.pendingDatabaseRows || []) !==
          JSON.stringify(pendingRows)
      ) {
        throw new Error(`旧数据清理状态写入校验失败：${options.path}`);
      }
    },
  });
}

async function migrateFocus(
  databaseIds: string[],
  configs: LegacyWidgetConfigRecord[],
): Promise<boolean> {
  const existingIndex = await loadSharedJson(
    FOCUS_INDEX_FILE,
    normalizeFocusIndexFile,
  );
  const existingMetadata = existingIndex?.migration;
  const existingBaseline = await loadFocusLegacyBaseline();
  const sessionYears = await listFocusSessionYears();
  assertSharedWidgetYearFilesComplete(existingIndex?.years || [], sessionYears);
  const current = await loadSharedJson(
    FOCUS_STATISTICS_FILE,
    normalizeFocusStatisticsFile,
  );
  const currentTrustedMetadata =
    current?.migration?.dataValidated === true ? current.migration : undefined;
  const rootRaw = (await readPluginData("widget-focus-statistics.json")) as any;
  const currentNeedsImport = rootSourceNeedsImport(
    FOCUS_STATISTICS_FILE,
    Boolean(current),
    existingMetadata,
  );
  const rootNeedsImport = rootSourceNeedsImport(
    "widget-focus-statistics.json",
    rootRaw != null,
    existingMetadata,
  );
  const databaseIdsToScan = Array.from(new Set(databaseIds));
  const needsImport =
    !hasCompletedMigration(existingIndex) ||
    currentNeedsImport ||
    rootNeedsImport ||
    databaseIdsToScan.length > 0;
  let repairedBaselineOrIndex = false;
  if (!needsImport) {
    const baseline = await saveFocusLegacyBaselineChecked({
      totalFocusTime: Math.max(
        existingBaseline?.totals.totalFocusTime || 0,
        existingIndex?.legacyTotals.totalFocusTime || 0,
      ),
      totalFocusTimes: Math.max(
        existingBaseline?.totals.totalFocusTimes || 0,
        existingIndex?.legacyTotals.totalFocusTimes || 0,
      ),
    });
    const baselineMismatch =
      baseline.totals.totalFocusTime !==
        existingIndex?.legacyTotals.totalFocusTime ||
      baseline.totals.totalFocusTimes !==
        existingIndex?.legacyTotals.totalFocusTimes;
    if (
      baselineMismatch ||
      sessionYears.some((year) => !existingIndex?.years.includes(year))
    ) {
      await rebuildFocusIndexFromFiles({
        legacyTotals: baseline.totals,
        migration: existingMetadata,
        dispatch: false,
      });
    }
    repairedBaselineOrIndex = !existingBaseline || baselineMismatch;
  }
  if (needsImport) {
    const { rows: dbRows } = await readAllLegacyRows(
      databaseIdsToScan,
      readLegacyFocusDatabase,
    );
    const newlyObservedRows = rowsNotAlreadyPending(
      dbRows,
      existingMetadata,
      currentTrustedMetadata,
    );
    const candidates: FocusLegacyTotals[] = [
      existingBaseline?.totals || { totalFocusTime: 0, totalFocusTimes: 0 },
      existingIndex?.legacyTotals || { totalFocusTime: 0, totalFocusTimes: 0 },
    ];
    if (currentNeedsImport && current) candidates.push(current.stats);
    if (rootNeedsImport)
      candidates.push({
        totalFocusTime: Math.max(0, Number(rootRaw.totalFocusTime) || 0),
        totalFocusTimes: Math.max(0, Number(rootRaw.totalFocusTimes) || 0),
      });
    candidates.push(...dbRows.map((row) => row.data));
    const legacyTotals = candidates.reduce<FocusLegacyTotals>(
      (result, item) => ({
        totalFocusTime: Math.max(
          result.totalFocusTime,
          Math.max(0, Number(item.totalFocusTime) || 0),
        ),
        totalFocusTimes: Math.max(
          result.totalFocusTimes,
          Math.round(Math.max(0, Number(item.totalFocusTimes) || 0)),
        ),
      }),
      { totalFocusTime: 0, totalFocusTimes: 0 },
    );
    let metadata = mergeMigrationMetadata(
      existingMetadata,
      currentNeedsImport ? currentTrustedMetadata : undefined,
    );
    const newRootFiles = [
      ...(currentNeedsImport ? [FOCUS_STATISTICS_FILE] : []),
      ...(rootNeedsImport ? ["widget-focus-statistics.json"] : []),
    ];
    const delta = createMetadata(
      (currentNeedsImport && !currentTrustedMetadata ? 1 : 0) +
        (rootNeedsImport ? 1 : 0) +
        newlyObservedRows.length,
      (newlyObservedRows.length > 0 ? 1 : 0) +
        (currentNeedsImport && !currentTrustedMetadata ? 1 : 0) +
        (rootNeedsImport ? 1 : 0),
      databaseIdsToScan,
      newRootFiles,
      dbRows,
    );
    metadata = mergeMigrationMetadata(metadata, delta)!;
    metadata = includePendingConfigCleanup(metadata, configs, "focus");
    const baseline = await saveFocusLegacyBaselineChecked(legacyTotals);
    await rebuildFocusIndexFromFiles({
      legacyTotals: baseline.totals,
      migration: existingMetadata,
      dispatch: false,
    });
    await saveValidatedMigrationMetadata({
      store: "focus",
      path: FOCUS_INDEX_FILE,
      createEmpty: createEmptyFocusIndexFile,
      normalize: normalizeFocusIndexFile,
      metadata,
    });
  } else if (existingMetadata && widgetConfigNeedsCleanup(configs, "focus")) {
    await saveValidatedMigrationMetadata({
      store: "focus",
      path: FOCUS_INDEX_FILE,
      createEmpty: createEmptyFocusIndexFile,
      normalize: normalizeFocusIndexFile,
      metadata: includePendingConfigCleanup(existingMetadata, configs, "focus"),
    });
  }
  await runCleanup<FocusIndexFile>({
    store: "focus",
    path: FOCUS_INDEX_FILE,
    widgetType: "focus",
    configs,
    createEmpty: createEmptyFocusIndexFile,
    normalize: normalizeFocusIndexFile,
    validatedDatabaseIds: databaseIdsToScan,
  });
  return needsImport || repairedBaselineOrIndex;
}

function parseLegacyCYBMOKRoot(raw: unknown): CYBMOKRecord[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const now = nowIso();
  return Object.entries(raw as Record<string, unknown>)
    .map(([dateValue, countValue]) => ({
      date: toLocalCYBMOKDate(dateValue),
      count: Math.max(0, Number(countValue) || 0),
      createdAt: now,
      updatedAt: now,
    }))
    .filter((item) => item.date && item.count > 0);
}

function mergeCYBMOKSources(sources: CYBMOKRecord[][]): CYBMOKRecord[] {
  const result = new Map<string, CYBMOKRecord>();
  for (const source of sources) {
    const sourceTotals = new Map<string, CYBMOKRecord>();
    for (const item of source) {
      const date = toLocalCYBMOKDate(item.date);
      if (!date) continue;
      const current = sourceTotals.get(date);
      if (current) current.count += Math.max(0, Number(item.count) || 0);
      else
        sourceTotals.set(date, {
          ...item,
          date,
          count: Math.max(0, Number(item.count) || 0),
        });
    }
    for (const [date, item] of sourceTotals) {
      const current = result.get(date);
      if (!current || item.count > current.count) result.set(date, item);
    }
  }
  return Array.from(result.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

async function loadExistingCYBMOKBatches(
  years: number[],
): Promise<CYBMOKBatchRecord[]> {
  const batches: CYBMOKBatchRecord[] = [];
  for (const year of years) {
    const file = await loadSharedJson(getCYBMOKBatchesFile(year), (raw) =>
      normalizeCYBMOKBatchesYearFile(raw, year),
    );
    if (!file)
      throw new Error(
        `年度明细文件缺失或尚未同步完成，请检查插件数据后重试：${year}`,
      );
    batches.push(...file.batches);
  }
  return batches;
}

async function migrateCYBMOK(
  databaseIds: string[],
  configs: LegacyWidgetConfigRecord[],
): Promise<boolean> {
  const existingIndex = await loadSharedJson(
    CYBMOK_INDEX_FILE,
    normalizeCYBMOKIndexFile,
  );
  const existingMetadata = existingIndex?.migration;
  const batchYears = await listCYBMOKBatchYears();
  assertSharedWidgetYearFilesComplete(existingIndex?.years || [], batchYears);
  const current = await loadSharedJson(
    CYBMOK_RECORDS_FILE,
    normalizeCYBMOKRecordsFile,
  );
  const currentTrustedMetadata =
    current?.migration?.dataValidated === true ? current.migration : undefined;
  const rootRaw = await readPluginData("CYBMOKData.json");
  const currentNeedsImport = rootSourceNeedsImport(
    CYBMOK_RECORDS_FILE,
    Boolean(current),
    existingMetadata,
  );
  const rootNeedsImport = rootSourceNeedsImport(
    "CYBMOKData.json",
    rootRaw != null,
    existingMetadata,
  );
  const databaseIdsToScan = Array.from(new Set(databaseIds));
  const needsImport =
    !hasCompletedMigration(existingIndex) ||
    currentNeedsImport ||
    rootNeedsImport ||
    databaseIdsToScan.length > 0;
  if (
    !needsImport &&
    batchYears.some((year) => !existingIndex?.years.includes(year))
  ) {
    await rebuildCYBMOKIndexFromFiles({
      migration: existingMetadata,
      dispatch: false,
    });
  }
  if (needsImport) {
    const rootRecords = rootNeedsImport ? parseLegacyCYBMOKRoot(rootRaw) : [];
    const existingBatches = await loadExistingCYBMOKBatches(batchYears);
    const runtimeBatches = existingBatches.filter(
      (batch) => batch.kind === "batch",
    );
    const existingLegacyRecords = Array.from(
      existingBatches
        .filter((batch) => batch.kind === "legacy-daily")
        .reduce(
          (totals, batch) =>
            totals.set(
              batch.localDate,
              (totals.get(batch.localDate) || 0) + batch.count,
            ),
          new Map<string, number>(),
        ),
      ([date, count]) => ({ date, count, createdAt: "", updatedAt: "" }),
    );
    const { rows: dbRows } = await readAllLegacyRows(
      databaseIdsToScan,
      readLegacyCYBMOKDatabase,
    );
    const newlyObservedRows = rowsNotAlreadyPending(
      dbRows,
      existingMetadata,
      currentTrustedMetadata,
    );
    const databaseSources = databaseIdsToScan.map((databaseId) =>
      dbRows
        .filter((row) => row.databaseId === databaseId)
        .map((row) => row.data),
    );
    const records = mergeCYBMOKSources([
      existingLegacyRecords,
      currentNeedsImport ? current?.records || [] : [],
      rootRecords,
      ...databaseSources,
    ]);
    let metadata = mergeMigrationMetadata(
      existingMetadata,
      currentNeedsImport ? currentTrustedMetadata : undefined,
    );
    const delta = createMetadata(
      (currentNeedsImport && !currentTrustedMetadata
        ? current?.records.length || 0
        : 0) +
        rootRecords.length +
        newlyObservedRows.length,
      newlyObservedRows.length +
        (currentNeedsImport && !currentTrustedMetadata
          ? current?.records.length || 0
          : 0) +
        rootRecords.length,
      databaseIdsToScan,
      [
        ...(currentNeedsImport ? [CYBMOK_RECORDS_FILE] : []),
        ...(rootNeedsImport ? ["CYBMOKData.json"] : []),
      ],
      dbRows,
    );
    metadata = mergeMigrationMetadata(metadata, delta)!;

    const batches: CYBMOKBatchRecord[] = [
      ...runtimeBatches,
      ...records
        .filter((record) => record.count > 0)
        .map((record) => createLegacyCYBMOKBatch(record.date, record.count)),
    ];
    const byYear = new Map<number, CYBMOKBatchRecord[]>();
    for (const batch of batches) {
      const year = Number(batch.localDate.slice(0, 4));
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year)!.push(batch);
    }
    for (const [year, yearBatches] of byYear) {
      await mutateSharedJson({
        store: "cybmok",
        path: getCYBMOKBatchesFile(year),
        createEmpty: () => createEmptyCYBMOKBatchesYearFile(year),
        normalize: (raw) => normalizeCYBMOKBatchesYearFile(raw, year),
        mutate: (file) => {
          file.batches = yearBatches;
        },
        validate: validateCYBMOKYearFile,
        dispatch: false,
      });
    }
    metadata = includePendingConfigCleanup(metadata, configs, "CYBMOK");
    await rebuildCYBMOKIndexFromFiles({ dispatch: false });
    await saveValidatedMigrationMetadata({
      store: "cybmok",
      path: CYBMOK_INDEX_FILE,
      createEmpty: createEmptyCYBMOKIndexFile,
      normalize: normalizeCYBMOKIndexFile,
      metadata,
    });
  } else if (existingMetadata && widgetConfigNeedsCleanup(configs, "CYBMOK")) {
    await saveValidatedMigrationMetadata({
      store: "cybmok",
      path: CYBMOK_INDEX_FILE,
      createEmpty: createEmptyCYBMOKIndexFile,
      normalize: normalizeCYBMOKIndexFile,
      metadata: includePendingConfigCleanup(
        existingMetadata,
        configs,
        "CYBMOK",
      ),
    });
  }
  await runCleanup<CYBMOKIndexFile>({
    store: "cybmok",
    path: CYBMOK_INDEX_FILE,
    widgetType: "CYBMOK",
    configs,
    createEmpty: createEmptyCYBMOKIndexFile,
    normalize: normalizeCYBMOKIndexFile,
    validatedDatabaseIds: databaseIdsToScan,
  });
  return needsImport;
}

type RankedCountdown = { event: CountdownEventRecord; priority: number };

function mergeCountdownSources(
  sources: Array<{ events: CountdownEventInput[]; priority: number }>,
): CountdownEventRecord[] {
  const map = new Map<string, RankedCountdown>();
  const ids = new Map<string, string>();
  const naturals = new Map<string, string>();
  let fallbackOrder = 0;
  for (const source of sources) {
    for (const input of source.events) {
      if (!input?.name?.trim() || (!input?.date?.trim() && !input?.lunarDate))
        continue;
      const naturalDate = input.date?.trim() || JSON.stringify(input.lunarDate);
      const natural = `${input.name.trim()}|${naturalDate}|${input.recurrence || Boolean(input.anniversary)}`;
      const id = input.id?.trim() || `countdown-legacy-${hashText(natural)}`;
      const now = nowIso();
      const event: CountdownEventRecord = normalizeCountdownEvent(
        {
          ...input,
          id,
          name: input.name.trim(),
          date: input.date?.trim(),
          anniversary: Boolean(input.anniversary),
          order: Number.isFinite(Number(input.order))
            ? Number(input.order)
            : fallbackOrder++,
          createdAt: input.createdAt || now,
          updatedAt: input.updatedAt || now,
          archived: input.archived === true,
        },
        fallbackOrder,
        true,
      );
      const idKey = input.id?.trim() ? `id:${id}` : "";
      const naturalKey = `natural:${natural}`;
      const key =
        (idKey ? ids.get(idKey) : undefined) ||
        naturals.get(naturalKey) ||
        idKey ||
        naturalKey;
      const current = map.get(key);
      if (
        !current ||
        compareTimestamp(event.updatedAt, current.event.updatedAt) > 0 ||
        (compareTimestamp(event.updatedAt, current.event.updatedAt) === 0 &&
          source.priority > current.priority)
      ) {
        map.set(key, { event, priority: source.priority });
      }
      if (idKey) ids.set(idKey, key);
      naturals.set(naturalKey, key);
    }
  }
  return Array.from(map.values(), (item) => item.event)
    .sort(
      (a, b) =>
        a.order - b.order ||
        (a.date || "").localeCompare(b.date || "") ||
        a.name.localeCompare(b.name, "zh-CN"),
    )
    .map((event, order) => ({
      ...event,
      order,
      updatedAt: event.updatedAt || event.createdAt,
    }));
}

function collectWidgetCountdownEvents(
  configs: LegacyWidgetConfigRecord[],
): CountdownEventInput[] {
  return configs
    .filter((record) => record.config.type === "countdown")
    .flatMap((record) =>
      Array.isArray(record.config.data?.eventList)
        ? record.config.data.eventList
        : [],
    );
}

async function migrateCountdown(
  databaseIds: string[],
  configs: LegacyWidgetConfigRecord[],
  notifyDatabaseId: string,
): Promise<boolean> {
  const existing = await loadSharedJson(
    COUNTDOWN_EVENTS_FILE,
    normalizeCountdownEventsFile,
  );
  const existingMetadata = existing?.migration;
  const widgetEvents = collectWidgetCountdownEvents(configs);
  const databaseIdsToScan = Array.from(new Set(databaseIds));
  const needsNotifyCleanup = Boolean(notifyDatabaseId.trim());
  const needsImport =
    !hasCompletedMigration(existing) ||
    databaseIdsToScan.length > 0 ||
    widgetEvents.length > 0;
  if (needsImport) {
    const { rows: dbRows } = await readAllLegacyRows(
      databaseIdsToScan,
      readLegacyCountdownDatabase,
    );
    const newlyObservedRows = rowsNotAlreadyPending(dbRows, existingMetadata);
    const events = mergeCountdownSources([
      { events: widgetEvents, priority: 1 },
      { events: dbRows.map((row) => row.data), priority: 2 },
      { events: existing?.events || [], priority: 3 },
    ]);
    const metadata = includePendingConfigCleanup(
      mergeMigrationMetadata(
        existingMetadata,
        createMetadata(
          Math.max(0, events.length - (existing?.events.length || 0)) +
            newlyObservedRows.length,
          Math.max(0, events.length - (existing?.events.length || 0)),
          databaseIdsToScan,
          [],
          dbRows,
        ),
      )!,
      configs,
      "countdown",
    );
    if (needsNotifyCleanup) {
      metadata.status = "cleanup-pending";
      metadata.cleanupStatus = "pending";
    }
    await mutateSharedJson({
      store: "countdown",
      path: COUNTDOWN_EVENTS_FILE,
      createEmpty: createEmptyCountdownEventsFile,
      normalize: normalizeCountdownEventsFile,
      mutate: (file) => {
        file.events = events;
      },
      validate: (actual) =>
        validateCountdownEventRecords(
          actual.events,
          events,
          "纪念日迁移业务数据校验失败",
        ),
    });
    await saveValidatedMigrationMetadata({
      store: "countdown",
      path: COUNTDOWN_EVENTS_FILE,
      createEmpty: createEmptyCountdownEventsFile,
      normalize: normalizeCountdownEventsFile,
      metadata,
    });
  } else if (
    existingMetadata &&
    widgetConfigNeedsCleanup(configs, "countdown")
  ) {
    await saveValidatedMigrationMetadata({
      store: "countdown",
      path: COUNTDOWN_EVENTS_FILE,
      createEmpty: createEmptyCountdownEventsFile,
      normalize: normalizeCountdownEventsFile,
      metadata: includePendingConfigCleanup(
        existingMetadata,
        configs,
        "countdown",
      ),
    });
  }
  await runCleanup<CountdownEventsFile>({
    store: "countdown",
    path: COUNTDOWN_EVENTS_FILE,
    widgetType: "countdown",
    configs,
    createEmpty: createEmptyCountdownEventsFile,
    normalize: normalizeCountdownEventsFile,
    validatedDatabaseIds: databaseIdsToScan,
    additionalCleanup: needsNotifyCleanup
      ? () => cleanLegacyCountdownNotifySettings(new Set(databaseIdsToScan))
      : undefined,
  });
  return needsImport;
}

type RankedAsset = { asset: FixedAssetRecord; priority: number };

function normalizeFixedAssetForMigration(
  input: FixedAssetRecord,
  migrationNow: string,
): FixedAssetRecord {
  const createdAt =
    typeof input.createdAt === "string" && input.createdAt.trim()
      ? input.createdAt
      : migrationNow;
  return {
    ...input,
    createdAt,
    updatedAt:
      typeof input.updatedAt === "string" && input.updatedAt.trim()
        ? input.updatedAt
        : createdAt,
    archived: input.archived === true,
  };
}

function mergeFixedAssets(
  sources: Array<{ assets: FixedAssetRecord[]; priority: number }>,
): FixedAssetRecord[] {
  const map = new Map<string, RankedAsset>();
  const ids = new Map<string, string>();
  const naturals = new Map<string, string>();
  for (const source of sources) {
    for (const input of source.assets) {
      if (!input?.name?.trim() || !input?.purchaseDate?.trim()) continue;
      const natural = `${input.name.trim()}|${input.purchaseDate.trim()}`;
      const id = input.id?.trim() || `fixed-asset-legacy-${hashText(natural)}`;
      const asset = { ...input, id, archived: input.archived === true };
      const idKey = input.id?.trim() ? `id:${id}` : "";
      const naturalKey = `natural:${natural}`;
      const key =
        (idKey ? ids.get(idKey) : undefined) ||
        naturals.get(naturalKey) ||
        idKey ||
        naturalKey;
      const current = map.get(key);
      if (
        !current ||
        compareTimestamp(asset.updatedAt, current.asset.updatedAt) > 0 ||
        (compareTimestamp(asset.updatedAt, current.asset.updatedAt) === 0 &&
          source.priority > current.priority)
      ) {
        map.set(key, { asset, priority: source.priority });
      }
      if (idKey) ids.set(idKey, key);
      naturals.set(naturalKey, key);
    }
  }
  return Array.from(map.values(), (item) => item.asset);
}

async function migrateFixedAssets(
  databaseIds: string[],
  configs: LegacyWidgetConfigRecord[],
): Promise<boolean> {
  const existing = await loadSharedJson(
    FIXED_ASSETS_FILE,
    normalizeFixedAssetsFile,
  );
  const existingMetadata = existing?.migration;
  const databaseIdsToScan = Array.from(new Set(databaseIds));
  const needsImport =
    !hasCompletedMigration(existing) || databaseIdsToScan.length > 0;
  if (needsImport) {
    const { rows: dbRows } = await readAllLegacyRows(
      databaseIdsToScan,
      readLegacyFixedAssetsDatabase,
    );
    const newlyObservedRows = rowsNotAlreadyPending(dbRows, existingMetadata);
    const migrationNow = nowIso();
    const assets = mergeFixedAssets([
      {
        assets: dbRows.map((row) =>
          normalizeFixedAssetForMigration(row.data, migrationNow),
        ),
        priority: 2,
      },
      {
        assets: (existing?.assets || []).map((asset) =>
          normalizeFixedAssetForMigration(asset, migrationNow),
        ),
        priority: 3,
      },
    ]);
    const metadata = includePendingConfigCleanup(
      mergeMigrationMetadata(
        existingMetadata,
        createMetadata(
          newlyObservedRows.length,
          Math.max(0, assets.length - (existing?.assets.length || 0)),
          databaseIdsToScan,
          [],
          dbRows,
        ),
      )!,
      configs,
      "fixedAssets",
    );
    await mutateSharedJson({
      store: "fixed-assets",
      path: FIXED_ASSETS_FILE,
      createEmpty: createEmptyFixedAssetsFile,
      normalize: normalizeFixedAssetsFile,
      mutate: (file) => {
        file.assets = assets;
      },
      validate: (actual) =>
        validateFixedAssetRecords(
          actual.assets,
          assets,
          "固定资产迁移业务数据校验失败",
        ),
    });
    await saveValidatedMigrationMetadata({
      store: "fixed-assets",
      path: FIXED_ASSETS_FILE,
      createEmpty: createEmptyFixedAssetsFile,
      normalize: normalizeFixedAssetsFile,
      metadata,
    });
  } else if (
    existingMetadata &&
    widgetConfigNeedsCleanup(configs, "fixedAssets")
  ) {
    await saveValidatedMigrationMetadata({
      store: "fixed-assets",
      path: FIXED_ASSETS_FILE,
      createEmpty: createEmptyFixedAssetsFile,
      normalize: normalizeFixedAssetsFile,
      metadata: includePendingConfigCleanup(
        existingMetadata,
        configs,
        "fixedAssets",
      ),
    });
  }
  await runCleanup<FixedAssetsFile>({
    store: "fixed-assets",
    path: FIXED_ASSETS_FILE,
    widgetType: "fixedAssets",
    configs,
    createEmpty: createEmptyFixedAssetsFile,
    normalize: normalizeFixedAssetsFile,
    validatedDatabaseIds: databaseIdsToScan,
  });
  return needsImport;
}

function logCompleteness(log: ReviewLogEntry): number {
  return Object.values(log).filter(
    (value) => value !== "" && value !== null && value !== undefined,
  ).length;
}

interface ReviewLogMigrationItem {
  log: ReviewLogEntry;
  sourceYear: number;
}

function mergeReviewLogs(
  sources: ReviewLogMigrationItem[][],
): ReviewLogMigrationItem[] {
  const map = new Map<
    string,
    { item: ReviewLogMigrationItem; priority: number }
  >();
  sources.forEach((items, priority) => {
    for (const item of items) {
      const key = getReviewLogDedupeKey(item.log);
      const current = map.get(key);
      if (
        !current ||
        logCompleteness(item.log) > logCompleteness(current.item.log) ||
        (logCompleteness(item.log) === logCompleteness(current.item.log) &&
          priority > current.priority)
      ) {
        map.set(key, { item, priority });
      }
    }
  });
  return Array.from(map.values(), (value) => value.item);
}

async function loadExistingReviewLogs(
  years: number[],
): Promise<{ years: number[]; items: ReviewLogMigrationItem[] }> {
  const items: ReviewLogMigrationItem[] = [];
  for (const year of years) {
    const file = await loadSharedJson(getReviewLogsFile(year), (raw) =>
      normalizeReviewLogsYearFile(raw, year),
    );
    if (!file)
      throw new Error(
        `年度明细文件缺失或尚未同步完成，请检查插件数据后重试：${year}`,
      );
    items.push(...file.logs.map((log) => ({ log, sourceYear: year })));
  }
  return { years, items };
}

async function migrateReviewDocs(
  databaseIds: string[],
  configs: LegacyWidgetConfigRecord[],
): Promise<boolean> {
  const existingIndex = await loadSharedJson(
    REVIEW_LOG_INDEX_FILE,
    normalizeReviewLogIndexFile,
  );
  const existingMetadata = existingIndex?.migration;
  const logYears = await listReviewLogYears();
  assertSharedWidgetYearFilesComplete(existingIndex?.years || [], logYears);
  const databaseIdsToScan = Array.from(new Set(databaseIds));
  const needsImport =
    !hasCompletedMigration(existingIndex) || databaseIdsToScan.length > 0;
  if (
    !needsImport &&
    logYears.some((year) => !existingIndex?.years.includes(year))
  ) {
    await rebuildReviewLogIndexFromFiles();
  }
  if (needsImport) {
    const existingLogs = await loadExistingReviewLogs(logYears);
    const { rows: dbRows } = await readAllLegacyRows(
      databaseIdsToScan,
      readLegacyReviewDocsDatabase,
    );
    const newlyObservedRows = rowsNotAlreadyPending(dbRows, existingMetadata);
    const currentLocalYear = new Date().getFullYear();
    const logs = mergeReviewLogs([
      dbRows.map((row) => ({
        log: row.data,
        sourceYear: getReviewLogYear(row.data, currentLocalYear),
      })),
      existingLogs.items,
    ]);
    const byYear = new Map<number, ReviewLogEntry[]>();
    for (const item of logs) {
      const year = getReviewLogYear(item.log, item.sourceYear);
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year)!.push(item.log);
    }
    const years = Array.from(
      new Set([...existingLogs.years, ...byYear.keys()]),
    ).sort();
    const yearCounts = Object.fromEntries(
      years.map((year) => [String(year), byYear.get(year)?.length || 0]),
    );
    const metadata = includePendingConfigCleanup(
      mergeMigrationMetadata(
        existingMetadata,
        createMetadata(
          newlyObservedRows.length,
          Math.max(0, logs.length - existingLogs.items.length),
          databaseIdsToScan,
          [],
          dbRows,
        ),
      )!,
      configs,
      "reviewDocs",
    );
    {
      for (const year of years) {
        const yearLogs = byYear.get(year) || [];
        await mutateSharedJson({
          store: "review-docs",
          path: getReviewLogsFile(year),
          createEmpty: () => createEmptyReviewLogsYearFile(year),
          normalize: (raw) => normalizeReviewLogsYearFile(raw, year),
          mutate: (file) => {
            file.logs = yearLogs;
          },
          validate: (actual) =>
            validateReviewLogRecords(
              actual.logs,
              yearLogs,
              `复习日志 ${year} 年迁移业务数据校验失败`,
            ),
        });
      }
      const allSavedKeys = new Set<string>();
      let savedTotal = 0;
      for (const year of years) {
        const saved = await loadSharedJson(getReviewLogsFile(year), (raw) =>
          normalizeReviewLogsYearFile(raw, year),
        );
        const savedLogs = saved?.logs || [];
        if (savedLogs.length !== yearCounts[String(year)]) {
          throw new Error(`复习日志 ${year} 年迁移数量校验失败`);
        }
        for (const log of savedLogs) {
          const key = getReviewLogDedupeKey(log);
          if (allSavedKeys.has(key))
            throw new Error(`复习日志迁移后仍存在跨年度重复：${key}`);
          allSavedKeys.add(key);
        }
        savedTotal += savedLogs.length;
      }
      if (savedTotal !== logs.length || allSavedKeys.size !== logs.length) {
        throw new Error("复习日志年度文件迁移总数校验失败");
      }
      await mutateSharedJson({
        store: "review-docs",
        path: REVIEW_LOG_INDEX_FILE,
        createEmpty: createEmptyReviewLogIndexFile,
        normalize: normalizeReviewLogIndexFile,
        mutate: (index) => {
          index.years = years;
          index.yearCounts = yearCounts;
          index.totalLogs = savedTotal;
        },
        validate: (actual) => {
          if (
            actual.totalLogs !== savedTotal ||
            actual.years.length !== years.length ||
            years.some(
              (year, index) =>
                actual.years[index] !== year ||
                actual.yearCounts[String(year)] !== yearCounts[String(year)],
            )
          ) {
            throw new Error("复习日志迁移索引校验失败");
          }
        },
      });
      await saveValidatedMigrationMetadata({
        store: "review-docs",
        path: REVIEW_LOG_INDEX_FILE,
        createEmpty: createEmptyReviewLogIndexFile,
        normalize: normalizeReviewLogIndexFile,
        metadata,
      });
    }
  } else if (
    existingMetadata &&
    widgetConfigNeedsCleanup(configs, "reviewDocs")
  ) {
    await saveValidatedMigrationMetadata({
      store: "review-docs",
      path: REVIEW_LOG_INDEX_FILE,
      createEmpty: createEmptyReviewLogIndexFile,
      normalize: normalizeReviewLogIndexFile,
      metadata: includePendingConfigCleanup(
        existingMetadata,
        configs,
        "reviewDocs",
      ),
    });
  }
  await runCleanup<ReviewLogIndexFile>({
    store: "review-docs",
    path: REVIEW_LOG_INDEX_FILE,
    widgetType: "reviewDocs",
    configs,
    createEmpty: createEmptyReviewLogIndexFile,
    normalize: normalizeReviewLogIndexFile,
    validatedDatabaseIds: databaseIdsToScan,
  });
  return needsImport;
}

async function runMigration(): Promise<void> {
  migrationState = { status: "running", migratedStores: [] };
  const plugin = getSharedWidgetStoragePlugin();
  const configs = await collectLegacyWidgetConfigs(plugin);
  const notifyRaw = (await readPluginData(
    "countdownNotifySettings.json",
  )) as any;
  const databaseIds = collectLegacyDatabaseIds(
    configs,
    typeof notifyRaw?.databaseId === "string" ? notifyRaw.databaseId : "",
  );
  const migratedStores: MigrationStore[] = [];
  const failedStores: Partial<Record<MigrationStore, string>> = {};
  const tasks: Array<[MigrationStore, () => Promise<boolean>]> = [
    [
      "focus",
      () =>
        runSharedWidgetExclusive(FOCUS_STORE_TRANSACTION_LOCK, () =>
          migrateFocus(databaseIds.focus, configs),
        ),
    ],
    [
      "cybmok",
      () =>
        runSharedWidgetExclusive(CYBMOK_STORE_TRANSACTION_LOCK, () =>
          migrateCYBMOK(databaseIds.CYBMOK, configs),
        ),
    ],
    [
      "countdown",
      () =>
        runSharedWidgetExclusive(COUNTDOWN_STORE_TRANSACTION_LOCK, () =>
          migrateCountdown(
            databaseIds.countdown,
            configs,
            typeof notifyRaw?.databaseId === "string"
              ? notifyRaw.databaseId
              : "",
          ),
        ),
    ],
    [
      "fixed-assets",
      () =>
        runSharedWidgetExclusive(FIXED_ASSETS_STORE_TRANSACTION_LOCK, () =>
          migrateFixedAssets(databaseIds.fixedAssets, configs),
        ),
    ],
    [
      "review-docs",
      () =>
        runSharedWidgetExclusive(REVIEW_DOCS_STORE_TRANSACTION_LOCK, () =>
          migrateReviewDocs(databaseIds.reviewDocs, configs),
        ),
    ],
  ];
  for (const [store, migrate] of tasks) {
    try {
      if (await migrate()) migratedStores.push(store);
    } catch (error) {
      failedStores[store] =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[sharedWidgetMigration] ${store} 历史数据迁移失败详情`,
        error,
      );
    }
  }
  const failed = Object.keys(failedStores).length > 0;
  migrationState = {
    status: failed ? "failed" : "complete",
    error: failed
      ? "部分组件历史数据迁移未完成，旧数据未删除，请重新加载插件后重试。"
      : undefined,
    migratedStores,
    failedStores: failed ? failedStores : undefined,
  };
  if (failed) {
    console.warn(
      "[sharedWidgetMigration] 部分组件历史数据迁移未完成，旧数据未删除，请重新加载插件后重试。",
    );
  }
}

export async function assertSharedWidgetMigrationReady(
  store: MigrationStore,
): Promise<void> {
  await ensureLegacySharedWidgetMigration();
  if (migrationState.failedStores?.[store]) {
    throw new Error("旧数据迁移尚未完成，请重新加载插件后重试。");
  }
}

export function ensureLegacySharedWidgetMigration(plugin?: any): Promise<void> {
  if (plugin && plugin !== getSharedWidgetStoragePlugin()) {
    throw new Error("共享组件迁移使用了未初始化的插件实例");
  }
  if (!migrationPromise) {
    migrationPromise = runSharedWidgetExclusive(
      SHARED_WIDGET_MIGRATION_LOCK,
      runMigration,
    ).catch((error) => {
      migrationState = {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        migratedStores: [...migrationState.migratedStores],
      };
      console.warn(
        "[sharedWidgetMigration] 部分组件历史数据迁移未完成，旧数据未删除",
        error,
      );
      throw error;
    });
  }
  return migrationPromise;
}
