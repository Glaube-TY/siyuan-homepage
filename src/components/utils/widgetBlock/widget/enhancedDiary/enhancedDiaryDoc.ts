import {
    exportMdContent,
    renderSprig,
    createDailyNote,
    appendBlockChecked,
    insertBlockChecked,
    updateBlockChecked,
    deleteBlockChecked,
    getChildBlocksChecked,
    sqlChecked,
} from "@/api";
import { openDocs } from "@/components/tools/openDocs";
import { renderEnhancedDiaryTemplate, scanDiaryContentForPeriod, getLegacyCompletionMarker, getSkipMarker } from "./enhancedDiaryUtils";
import type { EnhancedDiaryPeriod, EnhancedDiaryTemplateContext, EnhancedDiaryHeadingStructureConfig, EnhancedDiaryTemplateFieldMapping } from "./enhancedDiaryTypes";
import {
    ENHANCED_DIARY_COMPLETED_SUFFIX,
    stripReviewStatusSuffix,
    validateDayWorkspaceStructure,
    getEnhancedDiaryHeadingPlan,
    normalizeHeadingTitle,
    type EnhancedDiaryWorkspaceValidationResult,
} from "./enhancedDiaryMarkdownSections";
import {
    getFieldAliases,
    getPrimaryFieldTitle,
} from "./enhancedDiaryTemplateFieldMapping";
import { pruneTaskSectionsFromDayTemplate } from "./enhancedDiaryTemplatePrune";
import { getEnhancedDiaryIndexEntry, indexCreatedEnhancedDiaryDocument, removeStaleEnhancedDiaryEntry, resolveEnhancedDiaryDateFromMetadata, initializeEnhancedDiaryIndex } from "./enhancedDiaryIndex";

let activeDiaryNotebookId = "";

export function setEnhancedDiaryIndexNotebook(notebookId?: string): void {
    activeDiaryNotebookId = notebookId || "";
}

export interface EnhancedDiaryDocumentInfo {
    id: string;
    date: string;
    attrDate: string;
    title?: string;
    content: string;
}

export function formatDiaryAttrDate(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}${mm}${dd}`;
}

export async function findDiaryDocumentByDate(date: Date, notebookId?: string): Promise<{ id: string; title?: string } | null> {
    const targetNotebookId = notebookId || activeDiaryNotebookId;
    if (!targetNotebookId) return null;
    const entry = await getEnhancedDiaryIndexEntry(targetNotebookId, formatDiaryAttrDate(date));
    return entry ? { id: entry.id, title: entry.title } : null;
}

export interface DiaryMarkdownReadResult {
    ok: boolean;
    content: string;
}

export type DiaryDocumentLookupResult =
    | { status: "exists"; doc: EnhancedDiaryDocumentInfo }
    | { status: "missing" }
    | { status: "unreadable"; docId: string };

export async function readDiaryMarkdownResult(docId: string): Promise<DiaryMarkdownReadResult> {
    try {
        const res = await exportMdContent(docId);
        if (typeof res?.content === "string") return { ok: true, content: res.content };
        return { ok: false, content: "" };
    } catch (err) {
        console.warn("[enhancedDiaryDoc] readDiaryMarkdown failed", err);
        return { ok: false, content: "" };
    }
}

export async function readDiaryMarkdown(docId: string): Promise<string> {
    return (await readDiaryMarkdownResult(docId)).content;
}

export type DiaryDocumentInspectionStatus = "valid" | "missing" | "out_of_scope" | "date_mismatch" | "unknown";

export interface DiaryDocumentInspectionResult {
    status: DiaryDocumentInspectionStatus;
    /** The 8-digit diary date from metadata, when status is "valid" */
    diaryDate?: string;
    /** The raw content (first line = title) from SQL, for freshness */
    title?: string;
}

/**
 * Single-doc authoritative metadata check.
 * Only uses WHERE id = '...' LIMIT 1 — no full-db scan.
 * Checks: existence, type='d', box match, date recognition via shared pure function.
 */
export async function inspectEnhancedDiaryDocumentTarget(
    docId: string,
    targetNotebookId: string,
    expectedDate?: string
): Promise<DiaryDocumentInspectionResult> {
    let rows: any[];
    try {
        const escaped = docId.replace(/'/g, "''");
        rows = await sqlChecked(
            `SELECT id, type, box, content, ial, hpath, path FROM blocks WHERE id = '${escaped}' LIMIT 1`
        );
    } catch {
        return { status: "unknown" };
    }

    const block = rows[0] as { id?: string; type?: string; box?: string; content?: string; ial?: string; hpath?: string; path?: string } | undefined;
    if (!block) return { status: "missing" };

    if (block.type !== "d") return { status: "out_of_scope" };

    if (block.box !== targetNotebookId) return { status: "out_of_scope" };

    const resolved = resolveEnhancedDiaryDateFromMetadata({
        ial: block.ial,
        title: block.content,
        hpath: block.hpath,
        path: block.path,
    });
    if (!resolved) return { status: "date_mismatch" };
    if (expectedDate && resolved.date !== expectedDate) return { status: "date_mismatch" };

    return { status: "valid", diaryDate: resolved.date, title: block.content };
}

export async function getDiaryDocumentForDate(date: Date, notebookId?: string): Promise<EnhancedDiaryDocumentInfo | null> {
    const lookup = await lookupDiaryDocumentForDate(date, notebookId);
    if (lookup.status === "exists") return lookup.doc;
    return null;
}

export type EnhancedDiaryWriteTargetStatus = "valid" | "missing" | "out_of_scope" | "date_mismatch" | "unknown" | "not_configured";

export interface EnhancedDiaryWriteTargetResult {
    status: EnhancedDiaryWriteTargetStatus;
    diaryDate?: string;
}

/**
 * Unified write-target validation before any diary modification.
 * Thin wrapper around inspectEnhancedDiaryDocumentTarget with dailyNotebookId guard.
 */
export async function validateEnhancedDiaryWriteTarget(
    docId: string,
    dailyNotebookId: string,
    expectedDate?: string
): Promise<EnhancedDiaryWriteTargetResult> {
    if (!dailyNotebookId) return { status: "not_configured" };

    const inspection = await inspectEnhancedDiaryDocumentTarget(docId, dailyNotebookId, expectedDate);
    if (inspection.status === "valid") return { status: "valid", diaryDate: inspection.diaryDate };
    return { status: inspection.status };
}

/**
 * Three-state diary document query that distinguishes:
 * - "exists": index has entry, SQL confirms doc exists, exportMdContent succeeds
 * - "missing": index has no entry, OR SQL confirms doc is gone
 * - "unreadable": index + SQL say doc exists, but exportMdContent temporarily failed
 */
export async function lookupDiaryDocumentForDate(
    date: Date,
    notebookId?: string
): Promise<DiaryDocumentLookupResult> {
    const targetNotebookId = notebookId || activeDiaryNotebookId;
    if (!targetNotebookId) return { status: "missing" };

    const entry = await findDiaryDocumentByDate(date, targetNotebookId);
    if (!entry) return { status: "missing" };

    // Authoritative metadata check — type, box, date must all match
    const expectedDate = formatDiaryAttrDate(date);
    const inspection = await inspectEnhancedDiaryDocumentTarget(entry.id, targetNotebookId, expectedDate);

    if (inspection.status === "valid") {
        // Use fresh title from SQL, fall back to index entry
        const markdown = await readDiaryMarkdownResult(entry.id);
        if (!markdown.ok) {
            return { status: "unreadable", docId: entry.id };
        }
        return {
            status: "exists",
            doc: {
                id: entry.id,
                date: expectedDate,
                attrDate: expectedDate,
                title: inspection.title || entry.title,
                content: markdown.content,
            },
        };
    }

    if (inspection.status === "missing") {
        await removeStaleEnhancedDiaryEntry(targetNotebookId, entry.id).catch(() => undefined);
        return { status: "missing" };
    }

    if (inspection.status === "out_of_scope" || inspection.status === "date_mismatch") {
        // Document moved out of scope or date changed — clean stale mapping
        await removeStaleEnhancedDiaryEntry(targetNotebookId, entry.id).catch(() => undefined);
        return { status: "missing" };
    }

    // inspection.status === "unknown" — SQL failed, do NOT create new doc
    return { status: "unreadable", docId: entry.id };
}

export function openDiaryDocument(plugin: any, docId: string): void {
    openDocs(plugin, docId, 1);
}

export function getSiyuanAppId(plugin: any): string {
    return plugin?.app?.appId
        || plugin?.app?.id
        || (window as any)?.siyuan?.ws?.app?.appId
        || (window as any)?.siyuan?.ws?.app?.id
        || (window as any)?.siyuan?.appId
        || "";
}

export function normalizeCreatedDailyNoteId(result: any): string | null {
    if (typeof result === "string") return result;
    if (typeof result?.data === "string") return result.data;
    if (typeof result?.id === "string") return result.id;
    if (typeof result?.data?.id === "string") return result.data.id;
    return null;
}

export async function renderEnhancedDiaryMarkdownWithSprig(
    period: EnhancedDiaryPeriod,
    template: string,
    context: Parameters<typeof renderEnhancedDiaryTemplate>[2]
): Promise<string> {
    const replaced = renderEnhancedDiaryTemplate(period, template, context);
    try {
        const rendered = await renderSprig(replaced);
        if (typeof rendered === "string") {
            return rendered;
        }
        console.warn("[enhancedDiaryDoc] renderSprig returned non-string, falling back");
        return replaced;
    } catch (err) {
        console.warn("[enhancedDiaryDoc] renderSprig failed, falling back to template-only", err);
        return replaced;
    }
}

export function isSameLocalDate(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

export async function createTodayDailyNoteForWidget(plugin: any, notebookId?: string): Promise<string | null> {
    const notebook = notebookId;
    const app = getSiyuanAppId(plugin);
    if (!notebook) {
        console.warn("[enhancedDiaryDoc] missing daily notebook id");
        return null;
    }
    if (!app) {
        console.warn("[enhancedDiaryDoc] missing siyuan app id");
        return null;
    }
    try {
        const result = await createDailyNote(notebook, app);
        const docId = normalizeCreatedDailyNoteId(result);
        if (docId) {
            setEnhancedDiaryIndexNotebook(notebook);
            const indexed = await indexCreatedEnhancedDiaryDocument(notebook, docId).catch((err) => {
                console.warn("[enhancedDiaryDoc] index created daily note failed", err);
                return false;
            });
            if (!indexed) {
                console.warn("[enhancedDiaryDoc] indexCreatedEnhancedDiaryDocument returned false after 3 attempts; " +
                    `diary ${docId} created but not indexed yet, recent-docs delta will pick it up`);
            }
        }
        return docId;
    } catch (err) {
        console.warn("[enhancedDiaryDoc] createTodayDailyNoteForWidget: createDailyNote failed", err);
        return null;
    }
}

export async function openOrCreateDiaryForDate(
    plugin: any,
    date: Date,
    notebookId?: string
): Promise<{ id: string | null; created: boolean; reason?: string }> {
    if (!notebookId) {
        return { id: null, created: false, reason: "missing_notebook" };
    }

    // User-visible index initialization
    const initStatus = await initializeEnhancedDiaryIndex(notebookId);
    if (initStatus.lastStatus !== "success") {
        return { id: null, created: false, reason: "index_not_ready" };
    }

    // Three-state query
    const lookup = await lookupDiaryDocumentForDate(date, notebookId);

    if (lookup.status === "exists") {
        openDiaryDocument(plugin, lookup.doc.id);
        return { id: lookup.doc.id, created: false };
    }

    if (lookup.status === "unreadable") {
        return { id: null, created: false, reason: "existing_doc_unreadable" };
    }

    // status === "missing"
    if (!isSameLocalDate(date, new Date())) {
        return { id: null, created: false, reason: "only_today_create_supported" };
    }

    const docId = await createTodayDailyNoteForWidget(plugin, notebookId);
    if (docId) {
        openDiaryDocument(plugin, docId);
        return { id: docId, created: true };
    }

    return { id: null, created: false, reason: "create_failed" };
}

export function getFirstMarkdownHeading(markdown: string): string | null {
    const match = /^#{1,6}\s+(.+)$/m.exec(markdown);
    return match ? match[1].trim() : null;
}

export function hasTemplateHeading(content: string, heading: string | null): boolean {
    if (!heading) return false;
    return content.includes(heading);
}

interface DocHeadingBlock {
    id: string;
    level: number;
    title: string;
    index: number;
}

function parseDocHeadingBlocks(children: IResGetChildBlock[]): DocHeadingBlock[] {
    const result: DocHeadingBlock[] = [];
    for (let i = 0; i < children.length; i++) {
        const block = children[i];
        const markdown = (block.markdown || "").trim();
        const firstLine = markdown.split("\n")[0]?.trim() || "";
        const markdownMatch = firstLine.match(/^(#{1,6})\s+(.*)$/);
        const subtypeMatch = block.subtype?.match(/^h([1-6])$/);

        if (block.type !== "h" && !markdownMatch) continue;

        const level = markdownMatch
            ? markdownMatch[1].length
            : subtypeMatch
                ? Number(subtypeMatch[1])
                : 0;
        const title = markdownMatch
            ? normalizeHeadingTitle(markdownMatch[2])
            : normalizeHeadingTitle(firstLine.replace(/^#+\s*/, ""));

        if (!level || !title) continue;

        result.push({ id: block.id, level, title, index: i });
    }
    return result;
}

function findNextBoundaryBlock(
    headings: DocHeadingBlock[],
    target: DocHeadingBlock
): DocHeadingBlock | null {
    for (const heading of headings) {
        if (heading.index <= target.index) continue;
        if (heading.level <= target.level) {
            return heading;
        }
    }
    return null;
}

/**
 * Find the day root heading block (level 1, title matches configured aliases with optional status suffix).
 */
function findDayRootHeadingBlock(
    headings: DocHeadingBlock[],
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): DocHeadingBlock | null {
    const aliases = getFieldAliases(mapping, "rootHeadings", "day");
    return headings.find((h) => {
        if (h.level !== 1) return false;
        const stripped = stripReviewStatusSuffix(h.title);
        return aliases.some(
            (alias) => stripped === alias || stripped.startsWith(alias + " ")
        );
    }) || null;
}

/**
 * Find a heading block by any of the provided aliases within a given index range.
 * Prefers headings at `preferredLevel`; falls back to deeper levels if none found at preferred.
 */
function findHeadingBlockByTitleAliasesInScope(
    headings: DocHeadingBlock[],
    aliases: string[],
    startIndex: number,
    endIndex: number,
    preferredLevel: number
): DocHeadingBlock | null {
    const titleMatches = (h: DocHeadingBlock) =>
        aliases.some((alias) => h.title === alias || h.title.startsWith(alias + " "));

    for (const h of headings) {
        if (h.index < startIndex || h.index >= endIndex) continue;
        if (h.level === preferredLevel && titleMatches(h)) return h;
    }

    for (const h of headings) {
        if (h.index < startIndex || h.index >= endIndex) continue;
        if (h.level > preferredLevel && titleMatches(h)) return h;
    }

    return null;
}

/**
 * Patch missing day workspace sections (base sections + sub-items).
 * Called when root heading exists but validateDayWorkspaceStructure reports missing items.
 */
type DayWorkspaceSectionBaseKey = "taskManagement" | "quickRecords" | "dailyReview";
type DayWorkspaceSubKey = "newTasks" | "migratedTasks" | "taskLog";

async function patchDayWorkspaceStructure(
    docId: string,
    headingStructure: EnhancedDiaryHeadingStructureConfig | undefined,
    validation: EnhancedDiaryWorkspaceValidationResult,
    mapping?: EnhancedDiaryTemplateFieldMapping | null,
    taskManagementEnabled: boolean = true
): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
    const rootTitle = getPrimaryFieldTitle(mapping, "rootHeadings", "day");
    // Defensive: root heading missing should be handled upstream in appendTemplateToDiary
    if (validation.missing.some((m) => m.startsWith("# ") && (m === `# ${rootTitle}` || m.startsWith(`# ${rootTitle} `)))) {
        return { ok: false, reason: "missing_day_root" };
    }

    // Determine recommended heading levels
    const plan = headingStructure
        ? getEnhancedDiaryHeadingPlan(headingStructure, "day", mapping)
        : null;
    const baseHash = plan ? "#".repeat(plan.baseLevel) : "##";
    const subHash = plan ? "#".repeat(plan.subLevel) : "###";

    const taskManagement = getPrimaryFieldTitle(mapping, "dayWorkspaceSections", "taskManagement");
    const newTasks = getPrimaryFieldTitle(mapping, "dayWorkspaceSections", "newTasks");
    const migratedTasks = getPrimaryFieldTitle(mapping, "dayWorkspaceSections", "migratedTasks");
    const taskLog = getPrimaryFieldTitle(mapping, "dayWorkspaceSections", "taskLog");
    const quickRecords = getPrimaryFieldTitle(mapping, "dayWorkspaceSections", "quickRecords");
    const dailyReview = getPrimaryFieldTitle(mapping, "dayWorkspaceSections", "dailyReview");

    // Required sections grouped by base parent
    const taskGroup = {
        baseKey: "taskManagement" as DayWorkspaceSectionBaseKey,
        baseLabel: `${baseHash} ${taskManagement}`,
        subs: [
            { key: "newTasks" as DayWorkspaceSubKey, title: newTasks },
            { key: "migratedTasks" as DayWorkspaceSubKey, title: migratedTasks },
            { key: "taskLog" as DayWorkspaceSubKey, title: taskLog },
        ],
    };
    const nonTaskGroups = [
        { baseKey: "quickRecords" as DayWorkspaceSectionBaseKey, baseLabel: `${baseHash} ${quickRecords}`, subs: [] as Array<{ key: DayWorkspaceSubKey; title: string }> },
        { baseKey: "dailyReview" as DayWorkspaceSectionBaseKey, baseLabel: `${baseHash} ${dailyReview}`, subs: [] as Array<{ key: DayWorkspaceSubKey; title: string }> },
    ];
    const sectionGroups = taskManagementEnabled ? [taskGroup, ...nonTaskGroups] : nonTaskGroups;

    // Missing base sections → insert full group at day root scope end
    const missingBaseParts: string[] = [];
    // Missing sub-items of EXISTING parents → insert under that parent
    const missingSubItems: Array<{ parentAliases: string[]; subTitle: string }> = [];

    for (const group of sectionGroups) {
        if (validation.missing.includes(group.baseLabel)) {
            missingBaseParts.push(group.baseLabel);
            for (const sub of group.subs) {
                missingBaseParts.push(`${subHash} ${sub.title}`);
            }
        } else {
            // 父级存在但可能用了旧标题，用内部 key 取别名查找
            const parentAliases = getFieldAliases(mapping, "dayWorkspaceSections", group.baseKey);
            for (const sub of group.subs) {
                const subLabel = `${subHash} ${sub.title}`;
                if (validation.missing.includes(subLabel)) {
                    missingSubItems.push({ parentAliases, subTitle: sub.title });
                }
            }
        }
    }

    let hasError = false;

    const children = await getChildBlocksChecked(docId);
    const headingBlocks = parseDocHeadingBlocks(children);
    const dayRoot = findDayRootHeadingBlock(headingBlocks, mapping);

    const dayScopeEnd = dayRoot
        ? (findNextBoundaryBlock(headingBlocks, dayRoot)?.index ?? children.length)
        : children.length;

    // Handle missing base sections: insert at day root scope end
    if (missingBaseParts.length > 0) {
        const missingMarkdown = missingBaseParts.join("\n\n");
        try {
            if (dayRoot && dayScopeEnd < children.length) {
                await insertBlockChecked("markdown", missingMarkdown, children[dayScopeEnd].id);
            } else {
                await appendBlockChecked("markdown", "\n\n" + missingMarkdown, docId);
            }
        } catch (err) {
            console.warn("[enhancedDiaryDoc] patchDayWorkspaceStructure base failed", err);
            hasError = true;
        }
    }

    // Handle missing sub-items under existing parents
    if (missingSubItems.length > 0) {
        const parentStartIndex = dayRoot ? dayRoot.index + 1 : 0;
        const parentEndIndex = dayScopeEnd;
        // Preferred parent level: dayRoot.level + 1 (e.g. H2 under H1 # 今日日记)
        const preferredParentLevel = dayRoot ? dayRoot.level + 1 : 2;

        // Group missing sub-items by parent aliases
        const groupedByParent = new Map<string, { aliases: string[]; subs: string[] }>();
        for (const sub of missingSubItems) {
            const key = sub.parentAliases.join("|");
            const existing = groupedByParent.get(key);
            if (existing) {
                existing.subs.push(sub.subTitle);
            } else {
                groupedByParent.set(key, { aliases: sub.parentAliases, subs: [sub.subTitle] });
            }
        }

        for (const { aliases, subs: subTitles } of groupedByParent.values()) {
            const parentBlock = findHeadingBlockByTitleAliasesInScope(
                headingBlocks, aliases, parentStartIndex, parentEndIndex, preferredParentLevel
            );
            if (!parentBlock) {
                console.warn("[enhancedDiaryDoc] parent heading not found for sub-items", aliases);
                hasError = true;
                continue;
            }

            const subLevel = parentBlock.level + 1;
            if (subLevel > 6) {
                console.warn("[enhancedDiaryDoc] parent level too deep for sub-items", aliases);
                hasError = true;
                continue;
            }

            // Merge all sub-items for this parent into one markdown block
            const mergedMarkdown = subTitles
                .map((st) => `${"#".repeat(subLevel)} ${st}\n\n`)
                .join("");

            const boundaryBlock = findNextBoundaryBlock(headingBlocks, parentBlock);
            try {
                if (boundaryBlock) {
                    await insertBlockChecked("markdown", mergedMarkdown, boundaryBlock.id);
                } else {
                    await appendBlockChecked("markdown", mergedMarkdown, docId);
                }
            } catch (err) {
                console.warn("[enhancedDiaryDoc] insert sub-items failed", err);
                hasError = true;
            }
        }
    }

    if (hasError) {
        return { ok: false, reason: "append_failed" };
    }
    return { ok: true };
}

export async function appendTemplateToDiary(params: {
    docId: string;
    period: EnhancedDiaryPeriod;
    template: string;
    context: EnhancedDiaryTemplateContext;
    headingStructure?: EnhancedDiaryHeadingStructureConfig;
    mapping?: EnhancedDiaryTemplateFieldMapping | null;
    taskManagementEnabled?: boolean;
}): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
    const { docId, period, template, context, headingStructure, mapping, taskManagementEnabled = true } = params;

    const readResult = await readDiaryMarkdownResult(docId);
    if (!readResult.ok) return { ok: false, reason: "read_failed" };
    const content = readResult.content;
    const scan = scanDiaryContentForPeriod(content, period, mapping);

    const renderedMarkdown = await renderEnhancedDiaryMarkdownWithSprig(period, template, context);
    if (renderedMarkdown.trim() === "") {
        return { ok: false, reason: "empty_template" };
    }

    const heading = getFirstMarkdownHeading(renderedMarkdown);
    const rootTitle = getPrimaryFieldTitle(mapping, "rootHeadings", "day");

    // Day period: validate structure first, regardless of markers/heading state
    if (period === "day") {
        const validation = validateDayWorkspaceStructure(content, headingStructure, mapping, taskManagementEnabled);
        if (!validation.valid) {
            // Check if root heading itself is missing
            const rootMissing = validation.missing.some(
                (m) => m.startsWith("# ") && (m === `# ${rootTitle}` || m.startsWith(`# ${rootTitle} `))
            );
            if (rootMissing) {
                // Root heading missing — append full rendered template
                // 任务管理关闭时，先过滤掉任务体系区块，避免旧默认模板把任务内容写回日记
                const templateToAppend = taskManagementEnabled
                    ? renderedMarkdown
                    : pruneTaskSectionsFromDayTemplate(renderedMarkdown, mapping);
                const markdownToAppend = "\n\n" + templateToAppend.trim();
                try {
                    await appendBlockChecked("markdown", markdownToAppend, docId);
                    return { ok: true };
                } catch (err) {
                    console.warn("[enhancedDiaryDoc] appendTemplateToDiary root missing append failed", err);
                    return { ok: false, reason: "append_failed" };
                }
            }
            // Root exists but sub-sections missing — patch incrementally
            return await patchDayWorkspaceStructure(docId, headingStructure, validation, mapping, taskManagementEnabled);
        }
        // Structure is complete — check markers/heading for skip
        if (scan.hasCompletionMarker || scan.hasSkipMarker) {
            return { ok: true, skipped: true, reason: "marker_exists" };
        }
        return { ok: true, skipped: true, reason: "heading_exists" };
    }

    // Non-day periods: markers take priority to prevent re-appending full template
    if (scan.hasCompletionMarker || scan.hasSkipMarker) {
        return { ok: true, skipped: true, reason: "marker_exists" };
    }
    if (heading && hasTemplateHeading(content, heading)) {
        return { ok: true, skipped: true, reason: "heading_exists" };
    }

    const markdownToAppend = "\n\n" + renderedMarkdown.trim();
    try {
        await appendBlockChecked("markdown", markdownToAppend, docId);
        return { ok: true };
    } catch (err) {
        console.warn("[enhancedDiaryDoc] appendTemplateToDiary failed", err);
        return { ok: false, reason: "append_failed" };
    }
}

interface RootHeadingMatch {
    block: DocHeadingBlock;
    raw: string;
}

function matchesPeriodRootHeading(
    title: string,
    period: EnhancedDiaryPeriod,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): boolean {
    const stripped = stripReviewStatusSuffix(title);
    const aliases = getFieldAliases(mapping, "rootHeadings", period);
    return aliases.some(
        (alias) => stripped === alias || stripped.startsWith(alias + " ")
    );
}

async function findPeriodRootHeadingBlock(
    docId: string,
    period: EnhancedDiaryPeriod,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): Promise<RootHeadingMatch | null> {
    try {
        const children = await getChildBlocksChecked(docId);
        const headings = parseDocHeadingBlocks(children);
        for (const h of headings) {
            if (h.level === 1 && matchesPeriodRootHeading(h.title, period, mapping)) {
                const block = children[h.index];
                if (block) {
                    return { block: h, raw: block.markdown || "" };
                }
            }
        }
    } catch (err) {
        console.warn("[enhancedDiaryDoc] findPeriodRootHeadingBlock failed", err);
    }
    return null;
}

function buildUpdatedRootHeadingMarkdown(raw: string, completed: boolean): string | null {
    const firstLine = raw.split("\n")[0] || "";
    const match = firstLine.match(/^(#{1,6}\s+)(.*)$/);
    if (!match) return null;

    const prefix = match[1];
    const title = match[2].trim();
    const stripped = stripReviewStatusSuffix(title);
    const newTitle = completed ? stripped + ENHANCED_DIARY_COMPLETED_SUFFIX : stripped;
    if (newTitle === title) return null;

    return prefix + newTitle + raw.slice(firstLine.length);
}

function escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
}

function getCompletionMarkerKeyword(period: EnhancedDiaryPeriod): string {
    const labels: Record<EnhancedDiaryPeriod, string> = {
        day: "今日记录🌞",
        week: "本周复盘📅",
        month: "本月总结🌙",
        year: "年度总结🎇",
    };
    return labels[period];
}

function getSkipMarkerKeyword(period: EnhancedDiaryPeriod): string {
    const labels: Record<EnhancedDiaryPeriod, string> = {
        day: "已跳过今日记录⏭️",
        week: "已跳过本周复盘⏭️",
        month: "已跳过本月总结⏭️",
        year: "已跳过年度总结⏭️",
    };
    return labels[period];
}

/** Marker lookup result: found, not found, or query failed. */
type MarkerLookupResult =
    | { status: "found"; id: string; markdown: string }
    | { status: "missing" }
    | { status: "query_failed" };

/** 仅查找旧版任务列表式完成标记块，用于兼容历史数据。 */
async function findLegacyCompletionMarkerBlock(
    docId: string,
    period: EnhancedDiaryPeriod
): Promise<MarkerLookupResult> {
    const keyword = getCompletionMarkerKeyword(period);
    const escapedDocId = escapeSqlString(docId);

    // 先按 root_id 范围拉取有限块，再在 JS 中匹配标记，避免 markdown LIKE 全表扫描
    const query = `SELECT id, markdown FROM blocks WHERE root_id = '${escapedDocId}' ORDER BY created DESC, id DESC LIMIT 200`;

    let results: any[];
    try {
        results = await sqlChecked(query);
    } catch (err) {
        console.warn("[enhancedDiaryDoc] findLegacyCompletionMarkerBlock query failed", err);
        return { status: "query_failed" };
    }
    if (!results || results.length === 0) return { status: "missing" };

    const legacyUnchecked = getLegacyCompletionMarker(period, false);
    const legacyChecked = getLegacyCompletionMarker(period, true);
    const legacyCheckedUpper = legacyChecked.replace("[x]", "[X]");

    for (const row of results) {
        const md = row.markdown as string;
        if (!md.includes(keyword)) continue;
        if (
            md.includes(legacyUnchecked) ||
            md.includes(legacyChecked) ||
            md.includes(legacyCheckedUpper)
        ) {
            return { status: "found", id: row.id as string, markdown: md };
        }
    }
    return { status: "missing" };
}

async function findSkipMarkerBlock(
    docId: string,
    period: EnhancedDiaryPeriod
): Promise<MarkerLookupResult> {
    const keyword = getSkipMarkerKeyword(period);
    const escapedDocId = escapeSqlString(docId);

    // 先按 root_id 范围拉取有限块，再在 JS 中匹配标记，避免 markdown LIKE 全表扫描
    const query = `SELECT id, markdown FROM blocks WHERE root_id = '${escapedDocId}' ORDER BY created DESC, id DESC LIMIT 200`;

    let results: any[];
    try {
        results = await sqlChecked(query);
    } catch (err) {
        console.warn("[enhancedDiaryDoc] findSkipMarkerBlock query failed", err);
        return { status: "query_failed" };
    }
    if (!results || results.length === 0) return { status: "missing" };

    const skip = getSkipMarker(period);
    const skipUpper = skip.replace("[x]", "[X]");

    for (const row of results) {
        const md = row.markdown as string;
        if (!md.includes(keyword)) continue;
        if (md.includes(skip) || md.includes(skipUpper)) {
            return { status: "found", id: row.id as string, markdown: md };
        }
    }
    return { status: "missing" };
}

export async function toggleCompletionMarker(params: {
    docId: string;
    period: EnhancedDiaryPeriod;
    completed: boolean;
    mapping?: EnhancedDiaryTemplateFieldMapping | null;
}): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
    const { docId, period, completed, mapping } = params;

    const root = await findPeriodRootHeadingBlock(docId, period, mapping);
    if (!root) {
        return { ok: false, reason: "root_heading_not_found" };
    }

    const newMarkdown = buildUpdatedRootHeadingMarkdown(root.raw, completed);
    if (!newMarkdown) {
        return { ok: true, skipped: true, reason: completed ? "already_completed" : "already_uncompleted" };
    }

    try {
        await updateBlockChecked("markdown", newMarkdown, root.block.id);
        return { ok: true };
    } catch (err) {
        console.warn("[enhancedDiaryDoc] toggleCompletionMarker update failed", err);
        return { ok: false, reason: "update_failed" };
    }
}

export async function skipPeriod(params: {
    docId: string;
    period: EnhancedDiaryPeriod;
    mapping?: EnhancedDiaryTemplateFieldMapping | null;
}): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
    const { docId, period, mapping } = params;

    const readResult = await readDiaryMarkdownResult(docId);
    if (!readResult.ok) return { ok: false, reason: "read_failed" };
    const content = readResult.content;
    const scan = scanDiaryContentForPeriod(content, period, mapping);
    if (scan.skipped) {
        return { ok: true, skipped: true, reason: "already_skipped" };
    }

    const skip = getSkipMarker(period);

    // 优先替换旧版完成标记块为跳过标记，保持旧文档兼容；
    // 如果找不到旧标记，则在文档末尾追加跳过标记。
    const legacyResult = await findLegacyCompletionMarkerBlock(docId, period);
    if (legacyResult.status === "query_failed") {
        return { ok: false, reason: "marker_query_failed" };
    }
    if (legacyResult.status === "found") {
        try {
            await updateBlockChecked("markdown", skip, legacyResult.id);
            return { ok: true };
        } catch (err) {
            console.warn("[enhancedDiaryDoc] skipPeriod update legacy marker failed", err);
            return { ok: false, reason: "update_failed" };
        }
    }
    // status === "missing" — append new marker
    try {
        await appendBlockChecked("markdown", "\n\n" + skip, docId);
        return { ok: true };
    } catch (err) {
        console.warn("[enhancedDiaryDoc] skipPeriod append failed", err);
        return { ok: false, reason: "append_failed" };
    }
}

export async function restoreSkippedPeriod(params: {
    docId: string;
    period: EnhancedDiaryPeriod;
    mode: "pending" | "completed";
    mapping?: EnhancedDiaryTemplateFieldMapping | null;
}): Promise<{ ok: boolean; skipped?: boolean; reason?: string; changed?: boolean }> {
    const { docId, period, mode, mapping } = params;

    const skipResult = await findSkipMarkerBlock(docId, period);
    if (skipResult.status === "query_failed") {
        return { ok: false, reason: "marker_query_failed" };
    }
    if (skipResult.status === "missing") {
        return { ok: false, reason: "skip_marker_not_found" };
    }

    // 先更新顶级标题后缀，成功后再删除旧的跳过标记块，避免状态与标记不一致。
    const toggleResult = await toggleCompletionMarker({
        docId,
        period,
        completed: mode === "completed",
        mapping,
    });
    if (!toggleResult.ok && !toggleResult.skipped) {
        return toggleResult;
    }

    try {
        await deleteBlockChecked(skipResult.id);
        return { ok: true };
    } catch (err) {
        console.warn("[enhancedDiaryDoc] restoreSkippedPeriod delete skip marker failed", err);
        // 标题已更新成功，仅跳过标记块未删除
        return { ok: false, changed: true, reason: "skip_cleanup_failed" };
    }
}
