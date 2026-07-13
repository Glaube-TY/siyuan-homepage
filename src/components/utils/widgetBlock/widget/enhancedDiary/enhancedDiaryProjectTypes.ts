import type { EnhancedDiaryProjectStorageConfig } from "./enhancedDiaryTypes";

export const ENHANCED_DIARY_PROJECT_NODE_ATTR = "custom-homepage-enhanced-diary-project-node";
export const ENHANCED_DIARY_PROJECT_TARGET_ATTR = "custom-homepage-enhanced-diary-project-target";
export const ENHANCED_DIARY_KEY_RECORD_ATTR = "custom-homepage-enhanced-diary-key-record";
export const ENHANCED_DIARY_PROJECT_STATUS_ATTR = "custom-homepage-enhanced-diary-project-status";
export const ENHANCED_DIARY_PROJECT_ARCHIVED_AT_ATTR = "custom-homepage-enhanced-diary-project-archived-at";
export const ENHANCED_DIARY_PROJECT_INDEX_PATH =
    "/data/storage/petal/siyuan-homepage/enhanced-diary-project-index.json";
export const ENHANCED_DIARY_PROJECT_RECORD_INDEX_PATH =
    "/data/storage/petal/siyuan-homepage/enhanced-diary-project-record-index.json";

export type EnhancedDiaryProjectTargetKind = "root" | "node";
export type EnhancedDiaryProjectLifecycleStatus = "active" | "archived";
export type EnhancedDiaryProjectRelationStatus =
    | "none"
    | "normal"
    | "missing_visible_reference"
    | "missing_hidden_relation"
    | "target_mismatch"
    | "invalid_target";

export interface EnhancedDiaryRootProject {
    id: string;
    kind: "root";
    title: string;
    notebookId: string;
    path: string;
    hpath: string;
    order: number;
    updated: string;
    status: EnhancedDiaryProjectLifecycleStatus;
    archivedAt: string;
}

export interface EnhancedDiaryProjectNode {
    id: string;
    kind: "node";
    rootProjectId: string;
    title: string;
    level: 1 | 2 | 3 | 4 | 5 | 6;
    parentTargetId: string;
    ancestorTargetIds: string[];
    order: number;
    updated: string;
    status: EnhancedDiaryProjectLifecycleStatus;
    archivedAt: string;
}

export interface EnhancedDiaryProjectTarget {
    id: string;
    kind: EnhancedDiaryProjectTargetKind;
    title: string;
    rootProjectId: string;
    parentTargetId?: string;
    ancestorTargetIds: string[];
    pathTitles: string[];
    valid: boolean;
    status: EnhancedDiaryProjectLifecycleStatus;
    archivedAt: string;
}

export interface EnhancedDiaryProjectIndexPayload {
    version: number;
    updatedAt: string;
    containerSignature: string;
    complete: boolean;
    roots: Record<string, EnhancedDiaryRootProject>;
    nodes: Record<string, EnhancedDiaryProjectNode>;
}

export interface EnhancedDiaryProjectRelation {
    hiddenProjectTargetId?: string;
    projectTargetId?: string;
    visibleProjectTargetId?: string;
    rootProjectId?: string;
    projectPath?: string[];
    projectAncestorTargetIds?: string[];
    relationStatus: EnhancedDiaryProjectRelationStatus;
}

export function getEnhancedDiaryProjectContainerSignature(
    storage: EnhancedDiaryProjectStorageConfig,
): string {
    return storage.mode === "parentDoc"
        ? `parentDoc:${storage.parentDocId}`
        : `notebook:${storage.notebookId}`;
}

export function readCustomAttribute(ial: unknown, name: string): string {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`(?:^|[\\s{])${escaped}="([^"]*)"`, "i").exec(String(ial || ""));
    return match?.[1] || "";
}

export function hasEnhancedDiaryProjectNodeAttribute(ial: unknown): boolean {
    return readCustomAttribute(ial, ENHANCED_DIARY_PROJECT_NODE_ATTR) === "true";
}

export type EnhancedDiaryBlockAttrs = Record<string, string>;

export function parseEnhancedDiaryProjectLifecycle(
    value: Record<string, unknown> | undefined,
): { status: EnhancedDiaryProjectLifecycleStatus; archivedAt: string } {
    const rawStatus = value?.[ENHANCED_DIARY_PROJECT_STATUS_ATTR] ?? value?.status;
    const status: EnhancedDiaryProjectLifecycleStatus = rawStatus === "archived" ? "archived" : "active";
    const rawArchivedAt = value?.[ENHANCED_DIARY_PROJECT_ARCHIVED_AT_ATTR] ?? value?.archivedAt;
    return {
        status,
        archivedAt: status === "archived" ? String(rawArchivedAt || "") : "",
    };
}

export function parseEnhancedDiaryBatchBlockAttrs(value: unknown): Record<string, EnhancedDiaryBlockAttrs> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result: Record<string, EnhancedDiaryBlockAttrs> = {};
    for (const [key, rawAttrs] of Object.entries(value)) {
        if (!rawAttrs || typeof rawAttrs !== "object" || Array.isArray(rawAttrs)) continue;
        const attrs = Object.fromEntries(Object.entries(rawAttrs).map(([name, attrValue]) => [name, String(attrValue ?? "")]));
        const id = attrs.id || key;
        if (id) result[id] = attrs;
    }
    return result;
}

export function hasEnhancedDiaryProjectNodeAttrs(attrs: EnhancedDiaryBlockAttrs | undefined): boolean {
    return attrs?.[ENHANCED_DIARY_PROJECT_NODE_ATTR] === "true";
}

export function readEnhancedDiaryProjectTargetId(ial: unknown): string {
    return readCustomAttribute(ial, ENHANCED_DIARY_PROJECT_TARGET_ATTR);
}

export function readEnhancedDiaryProjectTargetIdFromAttrs(attrs: unknown): string {
    if (!attrs || typeof attrs !== "object" || Array.isArray(attrs)) return "";
    return String((attrs as Record<string, unknown>)[ENHANCED_DIARY_PROJECT_TARGET_ATTR] || "");
}
