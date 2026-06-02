/**
 * Source Coverage
 *
 * 从 EvidenceWorkspace 派生来源覆盖矩阵与摘要。
 *
 * 职责：
 * - 纯函数，不调用 API、不执行工具、不调用 LLM
 * - 统计 discovered/read/unread sources
 * - 不把 candidateDocs/candidateBlocks 当最终证据
 * - coverageLevel 优先级：document > section > outline > unread
 */

import type { EvidenceWorkspace } from "./evidence-workspace";

export type SourceCoverageLevel = "unread" | "outline" | "section" | "document";

export interface SourceCoverageItem {
  docId: string;
  title: string;
  titlePath?: string;
  parentTitles?: string[];
  sourceKinds: string[];
  coverageLevel: SourceCoverageLevel;
  hasCandidateDoc: boolean;
  hasCandidateBlock: boolean;
  hasReadDocument: boolean;
  hasReadBlockContext: boolean;
  hasOutline: boolean;
  inventoryOnly?: boolean;
  hasStrongCandidate?: boolean;
  provenance?: string[];
}

export interface SourceCoverageSummary {
  discoveredSourceCount: number;
  readSourceCount: number;
  unreadSourceCount: number;
  sourceCoverageRatio: number;
  unreadSourceDocIds: string[];
  readSourceDocIds: string[];
  matrix: SourceCoverageItem[];
}

function determineCoverageLevel(item: SourceCoverageItem): SourceCoverageLevel {
  if (item.hasReadDocument) return "document";
  if (item.hasReadBlockContext) return "section";
  if (item.hasOutline) return "outline";
  return "unread";
}

function isReadSource(level: SourceCoverageLevel): boolean {
  return level === "document" || level === "section";
}

export function buildSourceCoverageSummary(workspace: EvidenceWorkspace): SourceCoverageSummary {
  const docMap = new Map<string, SourceCoverageItem>();

  // 从 candidateDocs 收集
  for (const doc of workspace.candidateDocs) {
    if (!doc.docId) continue;
    const existing = docMap.get(doc.docId);
    if (existing) {
      existing.hasCandidateDoc = true;
      if (doc.inventoryOnly === true) existing.inventoryOnly = true;
      if (doc.provenance) {
        if (!existing.provenance) existing.provenance = [];
        if (!existing.provenance.includes(doc.provenance)) existing.provenance.push(doc.provenance);
      }
      if (doc.titlePath && !existing.titlePath) existing.titlePath = doc.titlePath;
      if (doc.parentTitles && !existing.parentTitles) existing.parentTitles = doc.parentTitles;
      if (!existing.sourceKinds.includes("candidateDoc")) existing.sourceKinds.push("candidateDoc");
      if (doc.provenance === "search_scope" && doc.hasQuery === true) existing.hasStrongCandidate = true;
      if (doc.provenance === "list_scope_docs_query" && doc.hasQuery === true) existing.hasStrongCandidate = true;
      if (doc.hasQuery === true && doc.inventoryOnly !== true) existing.hasStrongCandidate = true;
    } else {
      const isInventoryOnly = doc.inventoryOnly === true || 
        (doc.provenance === "list_scope_docs" && doc.hasQuery !== true);
      const isStrong = doc.provenance === "search_scope" && doc.hasQuery === true ||
        doc.provenance === "list_scope_docs_query" && doc.hasQuery === true ||
        (doc.hasQuery === true && doc.inventoryOnly !== true);
      
      docMap.set(doc.docId, {
        docId: doc.docId,
        title: doc.title,
        titlePath: doc.titlePath,
        parentTitles: doc.parentTitles,
        sourceKinds: ["candidateDoc"],
        coverageLevel: "unread",
        hasCandidateDoc: true,
        hasCandidateBlock: false,
        hasReadDocument: false,
        hasReadBlockContext: false,
        hasOutline: false,
        inventoryOnly: isInventoryOnly || undefined,
        hasStrongCandidate: isStrong || undefined,
        provenance: doc.provenance ? [doc.provenance] : undefined,
      });
    }
  }

  // 从 candidateBlocks 收集
  for (const block of workspace.candidateBlocks) {
    if (!block.docId) continue;
    const existing = docMap.get(block.docId);
    if (existing) {
      existing.hasCandidateBlock = true;
      if (!existing.sourceKinds.includes("candidateBlock")) existing.sourceKinds.push("candidateBlock");
    } else {
      docMap.set(block.docId, {
        docId: block.docId,
        title: block.docTitle,
        sourceKinds: ["candidateBlock"],
        coverageLevel: "unread",
        hasCandidateDoc: false,
        hasCandidateBlock: true,
        hasReadDocument: false,
        hasReadBlockContext: false,
        hasOutline: false,
      });
    }
  }

  // 从 readDocuments 收集
  for (const doc of workspace.readDocuments) {
    if (!doc.docId) continue;
    const existing = docMap.get(doc.docId);
    if (existing) {
      existing.hasReadDocument = true;
      if (!existing.sourceKinds.includes("readDocument")) existing.sourceKinds.push("readDocument");
    } else {
      docMap.set(doc.docId, {
        docId: doc.docId,
        title: doc.title,
        sourceKinds: ["readDocument"],
        coverageLevel: "unread",
        hasCandidateDoc: false,
        hasCandidateBlock: false,
        hasReadDocument: true,
        hasReadBlockContext: false,
        hasOutline: false,
      });
    }
  }

  // 从 readBlockContexts 收集
  for (const ctx of workspace.readBlockContexts) {
    if (!ctx.docId) continue;
    const existing = docMap.get(ctx.docId);
    if (existing) {
      existing.hasReadBlockContext = true;
      if (!existing.sourceKinds.includes("readBlockContext")) existing.sourceKinds.push("readBlockContext");
    } else {
      docMap.set(ctx.docId, {
        docId: ctx.docId,
        title: ctx.docTitle,
        sourceKinds: ["readBlockContext"],
        coverageLevel: "unread",
        hasCandidateDoc: false,
        hasCandidateBlock: false,
        hasReadDocument: false,
        hasReadBlockContext: true,
        hasOutline: false,
      });
    }
  }

  // 从 docOutlines 收集
  for (const outline of workspace.docOutlines) {
    if (!outline.docId) continue;
    const existing = docMap.get(outline.docId);
    if (existing) {
      existing.hasOutline = true;
      if (!existing.sourceKinds.includes("outline")) existing.sourceKinds.push("outline");
    } else {
      docMap.set(outline.docId, {
        docId: outline.docId,
        title: outline.title || "",
        sourceKinds: ["outline"],
        coverageLevel: "unread",
        hasCandidateDoc: false,
        hasCandidateBlock: false,
        hasReadDocument: false,
        hasReadBlockContext: false,
        hasOutline: true,
      });
    }
  }

  // 从 dailyNotes 收集
  for (const note of workspace.dailyNotes || []) {
    if (!note.docId) continue;
    const existing = docMap.get(note.docId);
    if (existing) {
      if (!existing.sourceKinds.includes("dailyNote")) existing.sourceKinds.push("dailyNote");
    } else {
      docMap.set(note.docId, {
        docId: note.docId,
        title: note.title || "",
        sourceKinds: ["dailyNote"],
        coverageLevel: "unread",
        hasCandidateDoc: false,
        hasCandidateBlock: false,
        hasReadDocument: false,
        hasReadBlockContext: false,
        hasOutline: false,
      });
    }
  }

  // 从 metadataHits 收集
  for (const hit of workspace.metadataHits || []) {
    if (!hit.docId) continue;
    const existing = docMap.get(hit.docId);
    if (existing) {
      if (!existing.sourceKinds.includes("metadataHit")) existing.sourceKinds.push("metadataHit");
    } else {
      docMap.set(hit.docId, {
        docId: hit.docId,
        title: hit.docTitle || "",
        sourceKinds: ["metadataHit"],
        coverageLevel: "unread",
        hasCandidateDoc: false,
        hasCandidateBlock: false,
        hasReadDocument: false,
        hasReadBlockContext: false,
        hasOutline: false,
      });
    }
  }

  // 确定每个来源的 coverageLevel
  const matrix: SourceCoverageItem[] = [];
  for (const item of docMap.values()) {
    item.coverageLevel = determineCoverageLevel(item);
    matrix.push(item);
  }

  // 统计
  const discoveredSourceCount = matrix.length;
  const readSourceCount = matrix.filter((item) => isReadSource(item.coverageLevel)).length;
  const unreadSourceCount = discoveredSourceCount - readSourceCount;
  const sourceCoverageRatio = discoveredSourceCount > 0 ? readSourceCount / discoveredSourceCount : 0;

  // unreadSourceDocIds 只包括：
  // - strong candidate docs 未读
  // - candidateBlocks 所属文档未读
  // - 已明确读取/固定范围的 outline 等强来源
  // 无 query inventory 不应独立进入 unreadSourceDocIds
  const unreadSourceDocIds = matrix
    .filter((item) => {
      if (isReadSource(item.coverageLevel)) return false;
      if (item.inventoryOnly === true && !item.hasStrongCandidate) return false;
      return true;
    })
    .map((item) => item.docId);

  const readSourceDocIds = matrix
    .filter((item) => isReadSource(item.coverageLevel))
    .map((item) => item.docId);

  return {
    discoveredSourceCount,
    readSourceCount,
    unreadSourceCount,
    sourceCoverageRatio,
    unreadSourceDocIds,
    readSourceDocIds,
    matrix,
  };
}
