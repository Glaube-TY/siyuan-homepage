import { batchGetBlockAttrs, batchSetBlockAttrs } from "@/api";
import {
    isEnhancedDiaryProjectEffectivelyActive,
    readEnhancedDiaryProjectIndex,
    rebuildEnhancedDiaryProjectIndexAfterChange,
    refreshEnhancedDiaryProjectIndex,
    resolveEnhancedDiaryProjectTarget,
} from "../enhancedDiaryProjectIndex";
import {
    ENHANCED_DIARY_PROJECT_ARCHIVED_AT_ATTR,
    ENHANCED_DIARY_PROJECT_STATUS_ATTR,
    parseEnhancedDiaryBatchBlockAttrs,
    parseEnhancedDiaryProjectLifecycle,
    type EnhancedDiaryProjectIndexPayload,
    type EnhancedDiaryProjectLifecycleStatus,
    type EnhancedDiaryProjectTarget,
} from "../enhancedDiaryProjectTypes";
import type { EnhancedDiaryProjectStorageConfig } from "../enhancedDiaryTypes";

export interface EnhancedDiaryProjectLifecycleContext {
    target: EnhancedDiaryProjectTarget;
    affectedTargetIds: string[];
    descendantCount: number;
}

export type EnhancedDiaryProjectLifecycleChangeResult =
    | { status: "success"; affectedCount: number; verifiedCount: number }
    | { status: "partial"; affectedCount: number; verifiedCount: number; unverifiedTargetIds: string[]; message: string }
    | { status: "blocked"; affectedCount: 0; verifiedCount: 0; blockingTarget: EnhancedDiaryProjectTarget; message: string };

export class EnhancedDiaryProjectWriteTargetError extends Error {
    constructor(
        public readonly code: "invalid_project_target" | "archived_project_target",
        message: string,
    ) {
        super(message);
        this.name = "EnhancedDiaryProjectWriteTargetError";
    }
}

function lifecycleOf(index: EnhancedDiaryProjectIndexPayload, targetId: string): EnhancedDiaryProjectLifecycleStatus {
    return index.roots[targetId]?.status || index.nodes[targetId]?.status || "active";
}

function collectAffectedTargetIds(index: EnhancedDiaryProjectIndexPayload, target: EnhancedDiaryProjectTarget): string[] {
    const descendants = Object.values(index.nodes)
        .filter((node) => node.ancestorTargetIds.includes(target.id))
        .sort((a, b) => a.ancestorTargetIds.length - b.ancestorTargetIds.length || a.order - b.order)
        .map((node) => node.id);
    return [target.id, ...descendants];
}

async function readStrictLifecycleProjectIndex(
    storage: EnhancedDiaryProjectStorageConfig,
): Promise<EnhancedDiaryProjectIndexPayload> {
    const refresh = await refreshEnhancedDiaryProjectIndex(storage);
    if (refresh.lastStatus === "error") {
        throw new Error(`项目索引刷新失败：${refresh.lastMessage || "未知错误"}`);
    }
    let index = await readEnhancedDiaryProjectIndex(storage);
    if (!index.complete) {
        const rebuild = await rebuildEnhancedDiaryProjectIndexAfterChange(storage);
        if (rebuild.lastStatus !== "success") {
            throw new Error(`项目索引重建失败：${rebuild.lastMessage || "未知错误"}`);
        }
        index = await readEnhancedDiaryProjectIndex(storage);
        if (!index.complete) throw new Error("项目索引重建后仍不完整，未执行项目生命周期操作。");
    }
    return index;
}

export async function validateEnhancedDiaryProjectWriteTarget(
    storage: EnhancedDiaryProjectStorageConfig,
    targetId: string,
    existingTargetId?: string,
): Promise<EnhancedDiaryProjectTarget> {
    const index = await readStrictLifecycleProjectIndex(storage);
    const target = resolveEnhancedDiaryProjectTarget(index, targetId);
    if (!target) {
        throw new EnhancedDiaryProjectWriteTargetError(
            "invalid_project_target",
            "目标项目不存在或项目索引已过期。",
        );
    }
    if (targetId === existingTargetId || isEnhancedDiaryProjectEffectivelyActive(index, targetId)) {
        return target;
    }
    throw new EnhancedDiaryProjectWriteTargetError(
        "archived_project_target",
        "该项目已经归档，不能新增任务、记录或子项目，请先恢复项目。",
    );
}

export async function getEnhancedDiaryProjectLifecycleContext(
    storage: EnhancedDiaryProjectStorageConfig,
    targetId: string,
): Promise<EnhancedDiaryProjectLifecycleContext> {
    const index = await readStrictLifecycleProjectIndex(storage);
    const target = resolveEnhancedDiaryProjectTarget(index, targetId);
    if (!target) throw new Error("目标项目不存在或项目索引已过期。");
    const affectedTargetIds = collectAffectedTargetIds(index, target);
    return { target, affectedTargetIds, descendantCount: affectedTargetIds.length - 1 };
}

function findNearestArchivedAncestor(
    index: EnhancedDiaryProjectIndexPayload,
    target: EnhancedDiaryProjectTarget,
): EnhancedDiaryProjectTarget | null {
    for (const ancestorId of [...target.ancestorTargetIds].reverse()) {
        if (lifecycleOf(index, ancestorId) !== "archived") continue;
        return resolveEnhancedDiaryProjectTarget(index, ancestorId);
    }
    return null;
}

async function changeEnhancedDiaryProjectLifecycle(
    storage: EnhancedDiaryProjectStorageConfig,
    targetId: string,
    status: EnhancedDiaryProjectLifecycleStatus,
): Promise<EnhancedDiaryProjectLifecycleChangeResult> {
    const index = await readStrictLifecycleProjectIndex(storage);
    const target = resolveEnhancedDiaryProjectTarget(index, targetId);
    if (!target) throw new Error("目标项目不存在或项目索引已过期。");
    if (status === "active") {
        const blockingTarget = findNearestArchivedAncestor(index, target);
        if (blockingTarget) {
            return {
                status: "blocked",
                affectedCount: 0,
                verifiedCount: 0,
                blockingTarget,
                message: `请先恢复上级项目“${blockingTarget.title}”。`,
            };
        }
    }

    const affectedTargetIds = collectAffectedTargetIds(index, target);
    const archivedAt = status === "archived" ? new Date().toISOString() : "";
    await batchSetBlockAttrs(affectedTargetIds.map((id) => ({
        id,
        attrs: {
            [ENHANCED_DIARY_PROJECT_STATUS_ATTR]: status === "archived" ? "archived" : "",
            [ENHANCED_DIARY_PROJECT_ARCHIVED_AT_ATTR]: archivedAt,
        },
    })));

    const attrsById = parseEnhancedDiaryBatchBlockAttrs(await batchGetBlockAttrs(affectedTargetIds));
    const unverifiedTargetIds = affectedTargetIds.filter((id) => {
        const attrs = attrsById[id];
        const lifecycle = parseEnhancedDiaryProjectLifecycle(attrs);
        return status === "archived"
            ? lifecycle.status !== "archived" || lifecycle.archivedAt !== archivedAt
            : lifecycle.status !== "active" || Boolean(attrs?.[ENHANCED_DIARY_PROJECT_ARCHIVED_AT_ATTR]);
    });
    const rebuild = await rebuildEnhancedDiaryProjectIndexAfterChange(storage);
    if (unverifiedTargetIds.length || rebuild.lastStatus !== "success") {
        return {
            status: "partial",
            affectedCount: affectedTargetIds.length,
            verifiedCount: affectedTargetIds.length - unverifiedTargetIds.length,
            unverifiedTargetIds,
            message: unverifiedTargetIds.length
                ? `已提交项目状态，但有 ${unverifiedTargetIds.length} 个项目节点暂未通过属性校验。`
                : rebuild.lastMessage || "项目状态已写入，但项目索引刷新未完成。",
        };
    }
    return { status: "success", affectedCount: affectedTargetIds.length, verifiedCount: affectedTargetIds.length };
}

export function archiveEnhancedDiaryProject(
    storage: EnhancedDiaryProjectStorageConfig,
    targetId: string,
): Promise<EnhancedDiaryProjectLifecycleChangeResult> {
    return changeEnhancedDiaryProjectLifecycle(storage, targetId, "archived");
}

export function restoreEnhancedDiaryProject(
    storage: EnhancedDiaryProjectStorageConfig,
    targetId: string,
): Promise<EnhancedDiaryProjectLifecycleChangeResult> {
    return changeEnhancedDiaryProjectLifecycle(storage, targetId, "active");
}
