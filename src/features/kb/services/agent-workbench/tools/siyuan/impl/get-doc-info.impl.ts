/**
 * get_doc_info adapter.
 *
 * Returns document metadata (title, path, notebook, timestamps, tags).
 * Does NOT read document body content.
 */

import {
  sqlSelectReadonly,
  lsNotebooksReadonly,
} from "../../../../siyuan/read-only-kernel";
import { escapeSqlString } from "../../../../siyuan/safe-sql";
import type { SiyuanToolDeps } from "../siyuan-tool-deps";
import type { GetDocInfoInput, GetDocInfoOutput } from "../contracts/get-doc-info.contract";
import { pushAgentDebugEvent } from "../../../debug/workbench-debug";

interface DocRow {
  id: string;
  title?: string;
  box?: string;
  path?: string;
  created?: string;
  updated?: string;
  tag?: string;
}

/**
 * Parse SiYuan tag field format "#tag1# #tag2#" into string[].
 */
function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  const tags: string[] = [];
  const re = /#([^#\s][^#]*?)#/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const tag = match[1].trim();
    if (tag) tags.push(tag);
    if (tags.length >= 20) break;
  }
  return tags;
}

export async function executeGetDocInfo(
  _deps: SiyuanToolDeps,
  args: GetDocInfoInput,
): Promise<{ safeOutput: GetDocInfoOutput }> {
  const docId = args.docId.trim();
  const safeId = escapeSqlString(docId);

  const rows = await sqlSelectReadonly<DocRow>(
    `SELECT id, content as title, box, path, created, updated, tag FROM blocks WHERE id = '${safeId}' AND type = 'd' LIMIT 1`,
    { maxLimit: 1, allowedTables: ["blocks"] },
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`[resource_not_found] 文档 "${docId}" 不存在或不是文档。`);
  }

  const row = rows[0];
  const box = row.box || "";

  // Resolve notebook name
  let notebookName: string | undefined;
  if (box) {
    try {
      const notebooksRes = await lsNotebooksReadonly();
      const notebooks = notebooksRes?.notebooks ?? [];
      const found = notebooks.find((nb: any) => nb.id === box);
      notebookName = found?.name || undefined;
    } catch {
      // non-critical; notebookName is optional
      pushAgentDebugEvent("DOC_INFO_NOTEBOOK_FAILED", { box }, "warn");
    }
  }

  const tags = parseTags(row.tag);

  const safeOutput: GetDocInfoOutput = {
    docId: row.id,
    title: row.title || "",
    notebookId: box || undefined,
    notebookName,
    path: row.path || undefined,
    created: row.created || undefined,
    updated: row.updated || undefined,
    tags: tags.length > 0 ? tags : undefined,
  };

  return { safeOutput };
}
