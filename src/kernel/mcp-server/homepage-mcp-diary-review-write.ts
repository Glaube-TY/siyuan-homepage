import SHA256 from "crypto-js/sha256";
import { getBlockAttrsChecked, getBlockKramdownChecked } from "@/api";
import { readTaskIndexSnapshot } from "@/components/tools/siyuanComponentDataApi";
import { buildUpdatedRootHeadingMarkdown, findPeriodRootHeadingBlock, validateEnhancedDiaryWriteTarget } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryDoc";
import { scanDiaryContentForPeriod } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryUtils";
import { ENHANCED_DIARY_COMPLETED_SUFFIX, stripReviewStatusSuffix, matchesRootHeadingWithMapping } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryTemplateFieldMapping";
import { readEnhancedDiaryProjectIndexStrict } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryProjectIndex";
import { readEnhancedDiaryProjectRecordIndexStrict } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryProjectRecordIndex";
import { getEnhancedDiaryIndexEntriesStrict } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryIndex";
import { loadDataStrict } from "@/features/kb/services/agent-workbench/storage/notebrain-plugin-storage";
import type { ToolRuntimeContext } from "@/features/kb/services/agent-workbench/contracts/tool-contract";
import { homepageMcpDiaryReviewStatusSchema, homepageMcpWritePreviewSchema, HOMEPAGE_MCP_DIARY_TASK_WRITES, HOMEPAGE_MCP_DIARY_REVIEW_LABELS, HOMEPAGE_MCP_DIARY_REVIEW_STATUS_NAMES } from "@/features/agent-platform/mcp-server/homepage-mcp-write-preview";
import { readHomepageMcpDiaryDocumentState, rowFingerprint, diaryAttributes, nativeOrders, HomepageMcpDiaryTargetUnavailable } from "./homepage-mcp-diary-task-write";

const hash = (value: unknown): string => SHA256(JSON.stringify(value)).toString();
const requireState = (valid: unknown): void => { if (!valid) throw new HomepageMcpDiaryTargetUnavailable("今日日记、日复盘根标题或索引状态无法可靠核对，未生成确认。"); };

async function readReviewState(docId: string) {
  const state = await readHomepageMcpDiaryDocumentState(new Date(), "newTasks");
  requireState(state.doc.id === docId && (await validateEnhancedDiaryWriteTarget(docId, state.target.notebookId, state.target.date)).status === "valid");
  const root = await findPeriodRootHeadingBlock(docId, "day", state.config.templateFieldMapping);
  requireState(root && root.block.level === 1);
  if (!root) throw new Error("diary_review_root_missing");
  const roots = state.top.filter((block) => block.type === "h" && /^#\s+/.test(block.markdown) &&
    matchesRootHeadingWithMapping(block.markdown.replace(/^#\s+/, ""), "day", state.config.templateFieldMapping));
  const row = state.rows.find((item) => item.id === root.block.id);
  requireState(roots.length === 1 && roots[0].id === root.block.id && row?.type === "h" && row.subtype === "h1" &&
    row.markdown === root.raw && state.parents[root.block.id] === docId && ["h", "NodeHeading"].includes(state.treeInfos[root.block.id]?.type));
  if (!row) throw new Error("diary_review_row_missing");
  const raw = await getBlockKramdownChecked(row.id), attrs = await getBlockAttrsChecked(row.id);
  requireState(raw.id === row.id && raw.kramdown.replace(/\n\{:[^\n]*\}\s*$/, "").trim() === root.raw &&
    hash(diaryAttributes(row.ial)) === hash(Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== "updated").sort(([a], [b]) => a.localeCompare(b)))));
  const title = root.block.title;
  const completed = title.endsWith(ENHANCED_DIARY_COMPLETED_SUFFIX);
  requireState(root.raw === "# " + title && stripReviewStatusSuffix(title).length &&
    title.split(ENHANCED_DIARY_COMPLETED_SUFFIX).length - 1 === (completed ? 1 : 0));
  const scan = scanDiaryContentForPeriod(state.doc.content, "day", state.config.templateFieldMapping);
  requireState(scan.hasCompletionMarker && !scan.skipped && !scan.hasSkipMarker && scan.completed === completed);
  const quickRecords = await readHomepageMcpDiaryDocumentState(new Date(), "quickRecords");
  requireState(quickRecords.doc.id === docId && quickRecords.target.date === state.target.date &&
    quickRecords.target.configFingerprint === state.target.configFingerprint && hash(quickRecords.rows) === hash(state.rows) &&
    hash(quickRecords.top) === hash(state.top) && hash(quickRecords.parents) === hash(state.parents));
  const index = await readTaskIndexSnapshot();
  requireState(index.fileExists && index.items.length <= 10_000);
  await Promise.all([readEnhancedDiaryProjectIndexStrict(state.config.projectStorage), readEnhancedDiaryProjectRecordIndexStrict(state.target.notebookId)]);
  const auxiliary = await Promise.all(["enhanced-diary-project-index.json", "enhanced-diary-project-record-index.json"].map(async (key) => {
    const read = await loadDataStrict<Record<string, unknown>>(key);
    requireState(read.status === "ok" && read.data && !Array.isArray(read.data));
    if (read.status !== "ok") throw new Error("diary_review_index_unreadable");
    requireState(JSON.stringify(read.data).length <= 1_000_000);
    return read.data;
  }));
  const indexes = hash([index.items, auxiliary, await getEnhancedDiaryIndexEntriesStrict(state.target.notebookId)]);
  const orders = nativeOrders(state);
  return { ...state, root, row, completed, indexes, orders, quickRecordsId: quickRecords.target.headingId,
    fingerprint: hash([state.stateFingerprint, raw, attrs, indexes, orders]) };
}

export async function prepareHomepageMcpDiaryReviewWrite(args: Record<string, unknown>) {
  const input = homepageMcpDiaryReviewStatusSchema.parse(args);
  const state = await readReviewState(input.docId);
  if (state.completed === (input.status === "completed")) throw new HomepageMcpDiaryTargetUnavailable("复盘已经是目标状态，无需修改，未生成确认。");
  const expectedMarkdown = buildUpdatedRootHeadingMarkdown(state.root.raw, input.status === "completed");
  requireState(expectedMarkdown);
  const target: NonNullable<ToolRuntimeContext["diaryReviewStatusTarget"]> = {
    docId: state.doc.id, notebookId: state.target.notebookId, date: state.target.date, period: "day", status: input.status,
    rootHeadingId: state.root.block.id, rootMarkdown: state.root.raw, expectedMarkdown: expectedMarkdown!, stateFingerprint: state.fingerprint,
    readTarget: async () => { if ((await readReviewState(input.docId)).fingerprint !== state.fingerprint) throw new Error("diary_review_conflict"); },
  };
  const values = [state.doc.title!, state.doc.id, state.target.date, target.rootHeadingId, state.root.block.title,
    state.completed ? "已完成" : "未完成", input.status === "completed" ? "已完成" : "未完成", expectedMarkdown!.slice(2), "1"];
  return { target, stateFingerprint: state.fingerprint, state,
    preview: homepageMcpWritePreviewSchema.parse({ action: "manage_review", operationName: HOMEPAGE_MCP_DIARY_REVIEW_STATUS_NAMES[input.status],
      consequence: HOMEPAGE_MCP_DIARY_TASK_WRITES.manage_review.consequence, targetName: state.doc.title!, targetId: target.rootHeadingId,
      affectedCount: 1, details: HOMEPAGE_MCP_DIARY_REVIEW_LABELS.map((label, i) => ({ label, value: values[i] })) }) };
}

export async function verifyHomepageMcpDiaryReviewWrite(before: Awaited<ReturnType<typeof prepareHomepageMcpDiaryReviewWrite>>): Promise<boolean> {
  for (const wait of [0, 100, 250, 500, 1000, 1500, 2000]) {
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      const after = await readReviewState(before.target.docId), state = before.state;
      if (after.root.raw !== before.target.expectedMarkdown) continue;
      return after.root.block.id === before.target.rootHeadingId && after.completed === (before.target.status === "completed") &&
        hash(after.target) === hash(state.target) && after.indexes === state.indexes && after.quickRecordsId === state.quickRecordsId &&
        hash(after.parents) === hash(state.parents) && hash(after.orders) === hash(state.orders) &&
        hash(after.top.map((block) => block.id)) === hash(state.top.map((block) => block.id)) && after.rows.length === state.rows.length &&
        state.rows.every((row) => {
          const current = after.rows.find((item) => item.id === row.id);
          return !!current && rowFingerprint(current) === rowFingerprint(row.id === before.target.rootHeadingId
            ? { ...row, content: after.root.block.title, markdown: before.target.expectedMarkdown } : row);
        });
    } catch { /* 只有限回读，绝不重放标题更新。 */ }
  }
  return false;
}
