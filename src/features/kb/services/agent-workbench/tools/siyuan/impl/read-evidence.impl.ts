import type { SiyuanToolDeps } from "../siyuan-tool-deps";
import {
  isEvidenceDocInScope,
  type ReadEvidenceInput,
  type ReadEvidenceOutput,
} from "../contracts/read-evidence.contract";
import { sqlSelectReadonly } from "../../../../siyuan/read-only-kernel";
import { sanitizeContent, sanitizeTitle } from "./safe-text";

const TOTAL_MAX_CHARS = 12000;

interface BlockRow {
  id: string;
  root_id: string;
  type: string;
  content: string;
  markdown: string;
  parent_id: string;
  sort: number;
}

interface EvidenceDocRow {
  id: string;
  box: string;
  path: string;
  content: string;
}

function quotedIds(ids: readonly string[]): string {
  return ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
}

export async function executeReadEvidence(
  deps: SiyuanToolDeps,
  args: ReadEvidenceInput,
): Promise<{ safeOutput: ReadEvidenceOutput }> {
  const blockIds = [...new Set(args.blockIds)];
  const maxChars = Math.min(4000, Math.max(200, args.maxCharsPerBlock ?? 2400));
  const blockRows = await sqlSelectReadonly<BlockRow>(
    `SELECT id, root_id, parent_id, sort, type, content, markdown FROM blocks WHERE id IN (${quotedIds(blockIds)})`,
    { maxLimit: 5, allowedTables: ["blocks"] },
  );
  const byId = new Map(blockRows.map((row) => [row.id, row]));
  const rootIds = [...new Set(blockRows.map((row) => row.root_id).filter(Boolean))];
  const scope = deps.getEffectiveScope() ?? deps.getScope();
  const scopeRootIds = scope?.type === "doc_tree" ? [scope.rootDocId] : [];
  const requestedDocIds = [...new Set([...rootIds, ...scopeRootIds])];
  const docRows = requestedDocIds.length > 0
    ? await sqlSelectReadonly<EvidenceDocRow>(
        `SELECT id, box, path, content FROM blocks WHERE type = 'd' AND id IN (${quotedIds(requestedDocIds)})`,
        { maxLimit: Math.max(5, requestedDocIds.length), allowedTables: ["blocks"] },
      )
    : [];
  const docs = new Map(docRows.map((row) => [row.id, row]));

  const items: ReadEvidenceOutput["items"] = [];
  const errors: NonNullable<ReadEvidenceOutput["errors"]> = [];
  let totalEvidenceChars = 0;

  for (const blockId of blockIds) {
    const row = byId.get(blockId);
    if (!row) {
      errors.push({ blockId, code: "resource_not_found", message: "该块不存在或已被删除。" });
      continue;
    }
    if (row.type === "d" || row.id === row.root_id) {
      errors.push({ blockId, code: "doc_id_not_allowed", message: "read_evidence 只接受内容块 ID，不接受文档 ID。" });
      continue;
    }
    const doc = docs.get(row.root_id);
    if (!scope || !doc || !isEvidenceDocInScope(doc, scope, scope.type === "doc_tree" ? docs.get(scope.rootDocId) : undefined)) {
      errors.push({ blockId, code: "scope_denied", message: "该块不属于当前 Agent 范围。" });
      continue;
    }

    const source = sanitizeContent(row.markdown || row.content || "");
    const remaining = Math.max(0, TOTAL_MAX_CHARS - totalEvidenceChars);
    const allowed = Math.min(maxChars, remaining);
    if (allowed <= 0) break;
    const content = source.slice(0, allowed);
    totalEvidenceChars += content.length;
    const sourceBlockIds = [blockId];
    let contextBefore = "";
    let contextAfter = "";
    const beforeLimit = Math.min(1000, Math.max(0, args.contextBeforeChars ?? 0));
    const afterLimit = Math.min(1000, Math.max(0, args.contextAfterChars ?? 0));
    if (row.parent_id && beforeLimit > 0 && totalEvidenceChars < TOTAL_MAX_CHARS) {
      const beforeRows = await sqlSelectReadonly<BlockRow>(
        `SELECT id, root_id, parent_id, sort, type, content, markdown FROM blocks WHERE root_id = '${row.root_id.replace(/'/g, "''")}' AND parent_id = '${row.parent_id.replace(/'/g, "''")}' AND sort < ${Number(row.sort) || 0} ORDER BY sort DESC LIMIT 4`,
        { maxLimit: 4, allowedTables: ["blocks"] },
      );
      const beforeText = beforeRows.reverse().map((item) => sanitizeContent(item.markdown || item.content || "")).filter(Boolean).join("\n");
      const contextLimit = Math.min(beforeLimit, TOTAL_MAX_CHARS - totalEvidenceChars);
      contextBefore = beforeText.slice(Math.max(0, beforeText.length - contextLimit));
      totalEvidenceChars += contextBefore.length;
      sourceBlockIds.unshift(...beforeRows.map((item) => item.id));
    }
    if (row.parent_id && afterLimit > 0 && totalEvidenceChars < TOTAL_MAX_CHARS) {
      const afterRows = await sqlSelectReadonly<BlockRow>(
        `SELECT id, root_id, parent_id, sort, type, content, markdown FROM blocks WHERE root_id = '${row.root_id.replace(/'/g, "''")}' AND parent_id = '${row.parent_id.replace(/'/g, "''")}' AND sort > ${Number(row.sort) || 0} ORDER BY sort ASC LIMIT 4`,
        { maxLimit: 4, allowedTables: ["blocks"] },
      );
      const afterText = afterRows.map((item) => sanitizeContent(item.markdown || item.content || "")).filter(Boolean).join("\n");
      const contextLimit = Math.min(afterLimit, TOTAL_MAX_CHARS - totalEvidenceChars);
      contextAfter = afterText.slice(0, contextLimit);
      totalEvidenceChars += contextAfter.length;
      sourceBlockIds.push(...afterRows.map((item) => item.id));
    }
    items.push({
      blockId,
      docId: row.root_id,
      docTitle: sanitizeTitle(doc.content || "未命名文档"),
      headingPath: [sanitizeTitle(doc.content || "未命名文档")],
      content,
      contextBefore,
      contextAfter,
      evidenceChars: content.length,
      truncated: content.length < source.length,
      sourceBlockIds: [...new Set(sourceBlockIds)],
    });
  }

  return {
    safeOutput: {
      items,
      errors: errors.length > 0 ? errors : undefined,
      totalEvidenceChars,
      note: "这些是已读取的块级正文证据；搜索候选本身不属于已读证据。",
    },
  };
}
