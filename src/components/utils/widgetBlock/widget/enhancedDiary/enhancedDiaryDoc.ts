import {
    sql,
    exportMdContent,
    renderSprig,
    createDailyNote,
    appendBlock,
    insertBlock,
    updateBlock,
    getChildBlocks,
} from "@/api";
import { openDocs } from "@/components/tools/openDocs";
import { renderEnhancedDiaryTemplate, scanDiaryContentForPeriod, getCompletionMarker, getSkipMarker } from "./enhancedDiaryUtils";
import type { EnhancedDiaryPeriod, EnhancedDiaryTemplateContext, EnhancedDiaryHeadingStructureConfig } from "./enhancedDiaryTypes";
import { validateDayWorkspaceStructure, getEnhancedDiaryHeadingPlan, normalizeHeadingTitle, type EnhancedDiaryWorkspaceValidationResult } from "./enhancedDiaryMarkdownSections";

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

export async function findDiaryDocumentByDate(date: Date): Promise<{ id: string; title?: string } | null> {
    const yyyymmdd = formatDiaryAttrDate(date);
    const query = `SELECT id, content FROM blocks WHERE type = 'd' AND ial LIKE '%custom-dailynote-${yyyymmdd}%' ORDER BY created DESC LIMIT 1`;
    try {
        const results = await sql(query);
        if (results && results.length > 0) {
            return {
                id: results[0].id,
                title: results[0].content,
            };
        }
    } catch (err) {
        console.warn("[enhancedDiaryDoc] findDiaryDocumentByDate failed", err);
    }
    return null;
}

export async function readDiaryMarkdown(docId: string): Promise<string> {
    try {
        const res = await exportMdContent(docId);
        return res?.content || "";
    } catch (err) {
        console.warn("[enhancedDiaryDoc] readDiaryMarkdown failed", err);
        return "";
    }
}

export async function getDiaryDocumentForDate(date: Date): Promise<EnhancedDiaryDocumentInfo | null> {
    const doc = await findDiaryDocumentByDate(date);
    if (!doc) return null;
    const content = await readDiaryMarkdown(doc.id);
    return {
        id: doc.id,
        date: formatDiaryAttrDate(date),
        attrDate: formatDiaryAttrDate(date),
        title: doc.title,
        content,
    };
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
        return normalizeCreatedDailyNoteId(result);
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
    const doc = await getDiaryDocumentForDate(date);
    if (doc) {
        openDiaryDocument(plugin, doc.id);
        return { id: doc.id, created: false };
    }

    if (!isSameLocalDate(date, new Date())) {
        return { id: null, created: false, reason: "only_today_create_supported" };
    }

    if (!notebookId) {
        return { id: null, created: false, reason: "missing_notebook" };
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
 * Find the # 今日日记 root heading block (level 1, title matches "今日日记" or "今日日记 ...").
 */
function findDayRootHeadingBlock(headings: DocHeadingBlock[]): DocHeadingBlock | null {
    return headings.find(
        (h) => h.level === 1 && (h.title === "今日日记" || h.title.startsWith("今日日记 "))
    ) || null;
}

/**
 * Find a heading block by title within a given index range [startIndex, endIndex).
 * Prefers headings at `preferredLevel`; falls back to deeper levels if none found at preferred.
 */
function findHeadingBlockByTitleInScope(
    headings: DocHeadingBlock[],
    expectedTitle: string,
    startIndex: number,
    endIndex: number,
    preferredLevel: number
): DocHeadingBlock | null {
    const titleMatches = (h: DocHeadingBlock) =>
        h.title === expectedTitle || h.title.startsWith(expectedTitle + " ");

    // Pass 1: preferred level
    for (const h of headings) {
        if (h.index < startIndex || h.index >= endIndex) continue;
        if (h.level === preferredLevel && titleMatches(h)) return h;
    }

    // Pass 2: fallback — deeper level
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
async function patchDayWorkspaceStructure(
    docId: string,
    headingStructure: EnhancedDiaryHeadingStructureConfig | undefined,
    validation: EnhancedDiaryWorkspaceValidationResult
): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
    // Defensive: root heading missing should be handled upstream in appendTemplateToDiary
    if (validation.missing.some((m) => m.startsWith("# ") && (m === "# 今日日记" || m.startsWith("# 今日日记 ")))) {
        return { ok: false, reason: "missing_day_root" };
    }

    // Determine recommended heading levels
    const plan = headingStructure
        ? getEnhancedDiaryHeadingPlan(headingStructure, "day")
        : null;
    const baseHash = plan ? "#".repeat(plan.baseLevel) : "##";
    const subHash = plan ? "#".repeat(plan.subLevel) : "###";

    // Required sections grouped by base parent
    const sectionGroups: Array<{ baseLabel: string; baseTitle: string; subs: string[] }> = [
        { baseLabel: `${baseHash} 任务管理`, baseTitle: "任务管理", subs: ["新建任务", "迁移任务", "任务动态"] },
        { baseLabel: `${baseHash} 快速记录`, baseTitle: "快速记录", subs: [] },
        { baseLabel: `${baseHash} 今日复盘`, baseTitle: "今日复盘", subs: [] },
    ];

    // Missing base sections → insert full group at day root scope end
    const missingBaseParts: string[] = [];
    // Missing sub-items of EXISTING parents → insert under that parent
    const missingSubItems: Array<{ parentTitle: string; subTitle: string }> = [];

    for (const group of sectionGroups) {
        if (validation.missing.includes(group.baseLabel)) {
            missingBaseParts.push(group.baseLabel);
            for (const sub of group.subs) {
                missingBaseParts.push(`${subHash} ${sub}`);
            }
        } else {
            for (const sub of group.subs) {
                const subLabel = `${subHash} ${sub}`;
                if (validation.missing.includes(subLabel)) {
                    missingSubItems.push({ parentTitle: group.baseTitle, subTitle: sub });
                }
            }
        }
    }

    let hasError = false;

    const children = await getChildBlocks(docId);
    const headingBlocks = parseDocHeadingBlocks(children);
    const dayRoot = findDayRootHeadingBlock(headingBlocks);

    const dayScopeEnd = dayRoot
        ? (findNextBoundaryBlock(headingBlocks, dayRoot)?.index ?? children.length)
        : children.length;

    // Handle missing base sections: insert at day root scope end
    if (missingBaseParts.length > 0) {
        const missingMarkdown = missingBaseParts.join("\n\n");
        try {
            if (dayRoot && dayScopeEnd < children.length) {
                await insertBlock("markdown", missingMarkdown, children[dayScopeEnd].id);
            } else {
                await appendBlock("markdown", "\n\n" + missingMarkdown, docId);
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

        // Group missing sub-items by parent title
        const groupedByParent = new Map<string, string[]>();
        for (const sub of missingSubItems) {
            const list = groupedByParent.get(sub.parentTitle);
            if (list) {
                list.push(sub.subTitle);
            } else {
                groupedByParent.set(sub.parentTitle, [sub.subTitle]);
            }
        }

        for (const [parentTitle, subTitles] of groupedByParent) {
            const parentBlock = findHeadingBlockByTitleInScope(
                headingBlocks, parentTitle, parentStartIndex, parentEndIndex, preferredParentLevel
            );
            if (!parentBlock) {
                console.warn("[enhancedDiaryDoc] parent heading not found for sub-items", parentTitle);
                hasError = true;
                continue;
            }

            const subLevel = parentBlock.level + 1;
            if (subLevel > 6) {
                console.warn("[enhancedDiaryDoc] parent level too deep for sub-items", parentTitle);
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
                    await insertBlock("markdown", mergedMarkdown, boundaryBlock.id);
                } else {
                    await appendBlock("markdown", mergedMarkdown, docId);
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
}): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
    const { docId, period, template, context, headingStructure } = params;

    const content = await readDiaryMarkdown(docId);
    const scan = scanDiaryContentForPeriod(content, period);

    const renderedMarkdown = await renderEnhancedDiaryMarkdownWithSprig(period, template, context);
    if (renderedMarkdown.trim() === "") {
        return { ok: false, reason: "empty_template" };
    }

    const heading = getFirstMarkdownHeading(renderedMarkdown);

    // Day period: validate structure first, regardless of markers/heading state
    if (period === "day") {
        const validation = validateDayWorkspaceStructure(content, headingStructure);
        if (!validation.valid) {
            // Check if root heading itself is missing
            const rootMissing = validation.missing.some(
                (m) => m.startsWith("# ") && (m === "# 今日日记" || m.startsWith("# 今日日记 "))
            );
            if (rootMissing) {
                // Root heading missing — append full rendered template
                const markdownToAppend = "\n\n" + renderedMarkdown.trim();
                try {
                    await appendBlock("markdown", markdownToAppend, docId);
                    return { ok: true };
                } catch (err) {
                    console.warn("[enhancedDiaryDoc] appendTemplateToDiary root missing append failed", err);
                    return { ok: false, reason: "append_failed" };
                }
            }
            // Root exists but sub-sections missing — patch incrementally
            return await patchDayWorkspaceStructure(docId, headingStructure, validation);
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
        await appendBlock("markdown", markdownToAppend, docId);
        return { ok: true };
    } catch (err) {
        console.warn("[enhancedDiaryDoc] appendTemplateToDiary failed", err);
        return { ok: false, reason: "append_failed" };
    }
}

function escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
}

function getCompletionMarkerKeyword(period: EnhancedDiaryPeriod): string {
    const marker = getCompletionMarker(period, false);
    return marker.replace(/^- \[[ xX]\]\s*/, "");
}

function getSkipMarkerKeyword(period: EnhancedDiaryPeriod): string {
    const marker = getSkipMarker(period);
    return marker.replace(/^- \[[ xX]\]\s*/, "");
}

async function findCompletionMarkerBlock(
    docId: string,
    period: EnhancedDiaryPeriod
): Promise<{ id: string; markdown: string } | null> {
    const keyword = getCompletionMarkerKeyword(period);
    const escapedDocId = escapeSqlString(docId);
    const escapedKeyword = escapeSqlString(keyword);

    const query = `SELECT id, markdown FROM blocks WHERE root_id = '${escapedDocId}' AND markdown LIKE '%${escapedKeyword}%' ORDER BY created DESC LIMIT 20`;

    try {
        const results = await sql(query);
        if (!results || results.length === 0) return null;

        const unchecked = getCompletionMarker(period, false);
        const checked = getCompletionMarker(period, true);
        const checkedUpper = checked.replace("[x]", "[X]");

        for (const row of results) {
            const md = row.markdown as string;
            if (
                md.includes(unchecked) ||
                md.includes(checked) ||
                md.includes(checkedUpper)
            ) {
                return { id: row.id as string, markdown: md };
            }
        }
    } catch (err) {
        console.warn("[enhancedDiaryDoc] findCompletionMarkerBlock failed", err);
    }
    return null;
}

async function findSkipMarkerBlock(
    docId: string,
    period: EnhancedDiaryPeriod
): Promise<{ id: string; markdown: string } | null> {
    const keyword = getSkipMarkerKeyword(period);
    const escapedDocId = escapeSqlString(docId);
    const escapedKeyword = escapeSqlString(keyword);

    const query = `SELECT id, markdown FROM blocks WHERE root_id = '${escapedDocId}' AND markdown LIKE '%${escapedKeyword}%' ORDER BY created DESC LIMIT 20`;

    try {
        const results = await sql(query);
        if (!results || results.length === 0) return null;

        const skip = getSkipMarker(period);
        const skipUpper = skip.replace("[x]", "[X]");

        for (const row of results) {
            const md = row.markdown as string;
            if (md.includes(skip) || md.includes(skipUpper)) {
                return { id: row.id as string, markdown: md };
            }
        }
    } catch (err) {
        console.warn("[enhancedDiaryDoc] findSkipMarkerBlock failed", err);
    }
    return null;
}

export async function toggleCompletionMarker(params: {
    docId: string;
    period: EnhancedDiaryPeriod;
    completed: boolean;
}): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
    const { docId, period, completed } = params;

    const block = await findCompletionMarkerBlock(docId, period);
    if (!block) {
        return { ok: false, reason: "marker_not_found" };
    }

    const unchecked = getCompletionMarker(period, false);
    const checked = getCompletionMarker(period, true);
    const checkedUpper = checked.replace("[x]", "[X]");

    let newMarkdown: string | null = null;

    if (completed) {
        if (block.markdown.includes(checked) || block.markdown.includes(checkedUpper)) {
            return { ok: true, skipped: true, reason: "already_completed" };
        }
        if (block.markdown.includes(unchecked)) {
            newMarkdown = block.markdown.replace(unchecked, checked);
        } else {
            return { ok: false, reason: "marker_not_found" };
        }
    } else {
        if (block.markdown.includes(unchecked)) {
            return { ok: true, skipped: true, reason: "already_uncompleted" };
        }
        if (block.markdown.includes(checked)) {
            newMarkdown = block.markdown.replace(checked, unchecked);
        } else if (block.markdown.includes(checkedUpper)) {
            newMarkdown = block.markdown.replace(checkedUpper, unchecked);
        } else {
            return { ok: false, reason: "marker_not_found" };
        }
    }

    if (!newMarkdown) {
        return { ok: false, reason: "marker_not_found" };
    }

    try {
        await updateBlock("markdown", newMarkdown, block.id);
        return { ok: true };
    } catch (err) {
        console.warn("[enhancedDiaryDoc] toggleCompletionMarker update failed", err);
        return { ok: false, reason: "update_failed" };
    }
}

export async function skipPeriod(params: {
    docId: string;
    period: EnhancedDiaryPeriod;
}): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
    const { docId, period } = params;

    const content = await readDiaryMarkdown(docId);
    const scan = scanDiaryContentForPeriod(content, period);
    if (scan.skipped) {
        return { ok: true, skipped: true, reason: "already_skipped" };
    }

    const block = await findCompletionMarkerBlock(docId, period);
    if (!block) {
        return { ok: false, reason: "marker_not_found" };
    }

    const unchecked = getCompletionMarker(period, false);
    const checked = getCompletionMarker(period, true);
    const checkedUpper = checked.replace("[x]", "[X]");
    const skip = getSkipMarker(period);

    let newMarkdown: string | null = null;

    if (block.markdown.includes(unchecked)) {
        newMarkdown = block.markdown.replace(unchecked, skip);
    } else if (block.markdown.includes(checked)) {
        newMarkdown = block.markdown.replace(checked, skip);
    } else if (block.markdown.includes(checkedUpper)) {
        newMarkdown = block.markdown.replace(checkedUpper, skip);
    } else {
        return { ok: false, reason: "marker_not_found" };
    }

    try {
        await updateBlock("markdown", newMarkdown, block.id);
        return { ok: true };
    } catch (err) {
        console.warn("[enhancedDiaryDoc] skipPeriod update failed", err);
        return { ok: false, reason: "update_failed" };
    }
}

export async function restoreSkippedPeriod(params: {
    docId: string;
    period: EnhancedDiaryPeriod;
    mode: "pending" | "completed";
}): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
    const { docId, period, mode } = params;

    const block = await findSkipMarkerBlock(docId, period);
    if (!block) {
        return { ok: false, reason: "skip_marker_not_found" };
    }

    const skip = getSkipMarker(period);
    const skipUpper = skip.replace("[x]", "[X]");
    const target = mode === "completed"
        ? getCompletionMarker(period, true)
        : getCompletionMarker(period, false);

    if (!block.markdown.includes(skip) && !block.markdown.includes(skipUpper)) {
        return { ok: false, reason: "skip_marker_not_found" };
    }

    const newMarkdown = block.markdown.includes(skip)
        ? block.markdown.replace(skip, target)
        : block.markdown.replace(skipUpper, target);

    try {
        await updateBlock("markdown", newMarkdown, block.id);
        return { ok: true };
    } catch (err) {
        console.warn("[enhancedDiaryDoc] restoreSkippedPeriod update failed", err);
        return { ok: false, reason: "update_failed" };
    }
}
