import {
    sql,
    exportMdContent,
    renderSprig,
    createDailyNote,
    appendBlock,
    insertBlock,
    updateBlock,
    deleteBlock,
    getChildBlocks,
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

    const children = await getChildBlocks(docId);
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
    mapping?: EnhancedDiaryTemplateFieldMapping | null;
    taskManagementEnabled?: boolean;
}): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
    const { docId, period, template, context, headingStructure, mapping, taskManagementEnabled = true } = params;

    const content = await readDiaryMarkdown(docId);
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
                    await appendBlock("markdown", markdownToAppend, docId);
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
        await appendBlock("markdown", markdownToAppend, docId);
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
        const children = await getChildBlocks(docId);
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

/** 仅查找旧版任务列表式完成标记块，用于兼容历史数据。 */
async function findLegacyCompletionMarkerBlock(
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

        const legacyUnchecked = getLegacyCompletionMarker(period, false);
        const legacyChecked = getLegacyCompletionMarker(period, true);
        const legacyCheckedUpper = legacyChecked.replace("[x]", "[X]");

        for (const row of results) {
            const md = row.markdown as string;
            if (
                md.includes(legacyUnchecked) ||
                md.includes(legacyChecked) ||
                md.includes(legacyCheckedUpper)
            ) {
                return { id: row.id as string, markdown: md };
            }
        }
    } catch (err) {
        console.warn("[enhancedDiaryDoc] findLegacyCompletionMarkerBlock failed", err);
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
        await updateBlock("markdown", newMarkdown, root.block.id);
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

    const content = await readDiaryMarkdown(docId);
    const scan = scanDiaryContentForPeriod(content, period, mapping);
    if (scan.skipped) {
        return { ok: true, skipped: true, reason: "already_skipped" };
    }

    const skip = getSkipMarker(period);

    // 优先替换旧版完成标记块为跳过标记，保持旧文档兼容；
    // 如果找不到旧标记，则在文档末尾追加跳过标记。
    const legacyBlock = await findLegacyCompletionMarkerBlock(docId, period);
    if (legacyBlock) {
        try {
            await updateBlock("markdown", skip, legacyBlock.id);
            return { ok: true };
        } catch (err) {
            console.warn("[enhancedDiaryDoc] skipPeriod update legacy marker failed", err);
            return { ok: false, reason: "update_failed" };
        }
    }

    try {
        await appendBlock("markdown", "\n\n" + skip, docId);
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
}): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
    const { docId, period, mode, mapping } = params;

    const skipBlock = await findSkipMarkerBlock(docId, period);
    if (!skipBlock) {
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
        await deleteBlock(skipBlock.id);
        return { ok: true };
    } catch (err) {
        console.warn("[enhancedDiaryDoc] restoreSkippedPeriod delete skip marker failed", err);
        // 标题已更新成功，仅跳过标记块未删除，仍视为成功但附带原因。
        return { ok: true, reason: "heading_updated_skip_not_deleted" };
    }
}
