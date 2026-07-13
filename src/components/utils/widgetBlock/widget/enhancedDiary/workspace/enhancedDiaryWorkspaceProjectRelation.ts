import {
    ENHANCED_DIARY_PROJECT_TARGET_ATTR,
    readEnhancedDiaryProjectTargetId,
    readEnhancedDiaryProjectTargetIdFromAttrs,
    type EnhancedDiaryProjectIndexPayload,
    type EnhancedDiaryProjectRelation,
} from "../enhancedDiaryProjectTypes";
import { resolveEnhancedDiaryProjectTarget } from "../enhancedDiaryProjectIndex";
import {
    deleteBlockChecked,
    getBlockKramdownChecked,
    insertBlockChecked,
    setBlockAttrsChecked,
    updateBlockChecked,
} from "@/api";
import { ENHANCED_DIARY_KEY_RECORD_ATTR } from "../enhancedDiaryProjectTypes";

const PROJECT_MARKER = "📁";
const BLOCK_REF_PATTERN = /\(\(([0-9]{14}-[a-z0-9]{7})(?:\s+["'](?:\\.|[^"'])*["'])?\)\)/gi;
const RECORD_CONTENT_BLOCK_LIMIT = 32;

interface RecordProjectReferenceBlock {
    id: string;
    markdown: string;
}

function escapeRefTitle(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/[\r\n]+/g, " ").trim();
}

/** 生成思源动态块引用。引用文本只是展示缓存，稳定关系由块 ID 与块属性承担。 */
export function generateVisibleProjectReference(targetId: string, title: string): string {
    if (!/^[0-9]{14}-[a-z0-9]{7}$/i.test(targetId)) throw new Error("项目目标 ID 无效。");
    return `${PROJECT_MARKER}${`((${targetId} \"${escapeRefTitle(title)}\"))`}`;
}

export function parseVisibleProjectTargetId(markdown: unknown): string | undefined {
    const text = String(markdown || "");
    const markerIndex = text.lastIndexOf(PROJECT_MARKER);
    if (markerIndex < 0) return undefined;
    BLOCK_REF_PATTERN.lastIndex = 0;
    const match = BLOCK_REF_PATTERN.exec(text.slice(markerIndex));
    return match?.[1];
}

export function removeVisibleProjectReference(markdown: unknown): string {
    const text = String(markdown || "");
    return text
        .replace(/\s*（?\s*📁\s*\(\([0-9]{14}-[a-z0-9]{7}(?:\s+["'](?:\\.|[^"'])*["'])?\)\)\s*）?/gi, "")
        .replace(/[ \t]+$/gm, "")
        .trimEnd();
}

export function appendTaskProjectReference(markdown: string, targetId: string, title: string): string {
    const base = removeVisibleProjectReference(markdown).trimEnd();
    return `${base} ${generateVisibleProjectReference(targetId, title)}`;
}

export function appendRecordProjectReference(markdown: string, targetId: string, title: string): string {
    const base = removeVisibleProjectReference(markdown).trimEnd();
    return `${base}\n\n（${generateVisibleProjectReference(targetId, title)}）`;
}

export function resolveProjectRelation(
    index: EnhancedDiaryProjectIndexPayload,
    ial: unknown,
    markdown: unknown,
): EnhancedDiaryProjectRelation {
    const hidden = typeof ial === "object"
        ? readEnhancedDiaryProjectTargetIdFromAttrs(ial)
        : readEnhancedDiaryProjectTargetId(ial);
    const visible = parseVisibleProjectTargetId(markdown);
    const hiddenTarget = resolveEnhancedDiaryProjectTarget(index, hidden);
    const visibleTarget = resolveEnhancedDiaryProjectTarget(index, visible);
    let relationStatus: EnhancedDiaryProjectRelation["relationStatus"] = "none";
    if (hiddenTarget && visibleTarget && hidden === visible) relationStatus = "normal";
    else if (hiddenTarget && visibleTarget) relationStatus = "target_mismatch";
    else if (hiddenTarget && !visible) relationStatus = "missing_visible_reference";
    else if (!hidden && visibleTarget) relationStatus = "missing_hidden_relation";
    else if (hidden || visible) relationStatus = "invalid_target";
    const effectiveTarget = hiddenTarget || visibleTarget;
    return {
        hiddenProjectTargetId: hidden || undefined,
        projectTargetId: effectiveTarget?.id,
        visibleProjectTargetId: visible || undefined,
        rootProjectId: effectiveTarget?.rootProjectId,
        projectPath: effectiveTarget?.pathTitles,
        projectAncestorTargetIds: effectiveTarget?.ancestorTargetIds,
        relationStatus,
    };
}

export function projectTargetAttribute(targetId?: string): Record<string, string> {
    return { [ENHANCED_DIARY_PROJECT_TARGET_ATTR]: targetId || "" };
}

export type ProjectRelationRepairMode = "adopt_visible" | "restore_hidden" | "relink" | "cancel";

export interface ProjectRelationRepairTarget {
    kind: "task" | "record";
    relationBlockId: string;
    contentBlockIds?: string[];
    hiddenTargetId?: string;
    visibleTargetId?: string;
}

function stripKramdownAttrs(markdown: unknown): string {
    return String(markdown || "").replace(/\s*\{:.*?\}\s*$/gm, "").trimEnd();
}

async function findRecordProjectReferenceBlock(
    contentBlockIds: string[] | undefined,
): Promise<RecordProjectReferenceBlock | undefined> {
    const ids = Array.from(new Set((contentBlockIds || []).filter(Boolean)));
    if (ids.length > RECORD_CONTENT_BLOCK_LIMIT) {
        throw new Error("记录正文块过多，请在原日记中检查项目引用。");
    }
    const matches: RecordProjectReferenceBlock[] = [];
    for (const id of ids) {
        const raw = await getBlockKramdownChecked(id);
        const markdown = stripKramdownAttrs(raw?.kramdown);
        if (parseVisibleProjectTargetId(markdown)) matches.push({ id, markdown });
    }
    if (matches.length > 1) {
        throw new Error("记录中存在多个项目引用块，请在原日记中确认后再修复。");
    }
    return matches[0];
}

async function ensureRecordProjectReference(params: {
    target: ProjectRelationRepairTarget;
    targetId: string;
    targetTitle: string;
    existing?: RecordProjectReferenceBlock;
}): Promise<void> {
    if (params.existing) {
        const cleaned = removeVisibleProjectReference(params.existing.markdown);
        const nextMarkdown = appendRecordProjectReference(cleaned, params.targetId, params.targetTitle);
        await updateBlockChecked(
            "markdown",
            cleaned.trim() ? nextMarkdown : nextMarkdown.trimStart(),
            params.existing.id,
        );
        return;
    }
    const contentBlockIds = Array.from(new Set((params.target.contentBlockIds || []).filter(Boolean)));
    const previousId = contentBlockIds[contentBlockIds.length - 1] || params.target.relationBlockId;
    await insertBlockChecked(
        "markdown",
        `（${generateVisibleProjectReference(params.targetId, params.targetTitle)}）`,
        undefined,
        previousId,
    );
}

export async function repairEnhancedDiaryProjectRelation(params: {
    index: EnhancedDiaryProjectIndexPayload;
    target: ProjectRelationRepairTarget;
    mode: ProjectRelationRepairMode;
    replacementTargetId?: string;
}): Promise<void> {
    const { target, mode, index } = params;
    const chosenId = mode === "adopt_visible" ? target.visibleTargetId
        : mode === "restore_hidden" ? target.hiddenTargetId
            : mode === "relink" ? params.replacementTargetId : "";
    const chosen = chosenId ? resolveEnhancedDiaryProjectTarget(index, chosenId) : null;
    if (chosenId && !chosen) throw new Error("所选项目目标已失效，请重新关联。");
    if (mode !== "cancel" && !chosen) throw new Error("项目目标已失效，请重新关联。");

    if (target.kind === "task") {
        const raw = await getBlockKramdownChecked(target.relationBlockId);
        const markdown = stripKramdownAttrs(raw?.kramdown);
        const lines = markdown.split("\n");
        const cleanedFirstLine = removeVisibleProjectReference(lines[0] || "");
        lines[0] = chosen ? appendTaskProjectReference(cleanedFirstLine, chosen.id, chosen.title) : cleanedFirstLine;
        await updateBlockChecked("markdown", lines.join("\n"), target.relationBlockId);
        await setBlockAttrsChecked(target.relationBlockId, {
            [ENHANCED_DIARY_PROJECT_TARGET_ATTR]: chosen?.id || "",
        });
        return;
    }

    if (mode === "adopt_visible") {
        if (!chosen) throw new Error("日记中的项目引用已失效，请重新关联。");
        await setBlockAttrsChecked(target.relationBlockId, {
            [ENHANCED_DIARY_PROJECT_TARGET_ATTR]: chosen.id,
        });
        return;
    }

    const referenceBlock = await findRecordProjectReferenceBlock(target.contentBlockIds);
    if (mode === "cancel") {
        if (referenceBlock) {
            const cleaned = removeVisibleProjectReference(referenceBlock.markdown);
            if (cleaned.trim()) await updateBlockChecked("markdown", cleaned, referenceBlock.id);
            else await deleteBlockChecked(referenceBlock.id);
        }
        await setBlockAttrsChecked(target.relationBlockId, {
            [ENHANCED_DIARY_PROJECT_TARGET_ATTR]: "",
            [ENHANCED_DIARY_KEY_RECORD_ATTR]: "",
        });
        return;
    }

    if (!chosen) throw new Error("项目目标已失效，请重新关联。");
    if (mode === "relink") {
        await setBlockAttrsChecked(target.relationBlockId, {
            [ENHANCED_DIARY_PROJECT_TARGET_ATTR]: chosen.id,
        });
    }
    await ensureRecordProjectReference({
        target,
        targetId: chosen.id,
        targetTitle: chosen.title,
        existing: referenceBlock,
    });
    if (mode === "restore_hidden") {
        await setBlockAttrsChecked(target.relationBlockId, {
            [ENHANCED_DIARY_PROJECT_TARGET_ATTR]: chosen.id,
        });
    }
}
