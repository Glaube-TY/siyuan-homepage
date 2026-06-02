import type { EvidenceWorkspace } from "../../workspace/evidence-workspace";
import type { EvidencePack, EvidencePackItem } from "./context-pack-types";

function contentChars(content: string, fallback?: number): number {
  return typeof fallback === "number" && !isNaN(fallback) ? fallback : content.length;
}

export function buildEvidencePack(input: {
  workspace: EvidenceWorkspace;
  maxItems?: number;
  maxCharsPerItem?: number;
  requestedEvidenceMode?: "with_evidence" | "insufficient_evidence" | "without_kb_evidence";
}): EvidencePack {
  const { workspace } = input;
  const maxItems = input.maxItems ?? 20;
  const maxCharsPerItem = input.maxCharsPerItem ?? 4000;
  const items: EvidencePackItem[] = [];

  for (const doc of workspace.readDocuments) {
    const content = doc.content ?? "";
    items.push({
      handle: `ev:${items.length}`,
      docTitle: doc.title?.trim() || "Untitled document",
      readLevel: "document",
      sourceRole: "direct_evidence",
      content: content.length > maxCharsPerItem ? `${content.slice(0, maxCharsPerItem)}...` : content,
      contentChars: contentChars(content, doc.contentChars),
      citationEligible: true,
    });
    if (items.length >= maxItems) break;
  }

  if (items.length < maxItems) {
    for (const block of workspace.readBlockContexts) {
      const content = block.content ?? "";
      items.push({
        handle: `ev:${items.length}`,
        docTitle: block.docTitle?.trim() || "Untitled document",
        titlePath: block.headingPath?.join(" / "),
        readLevel: "block_context",
        sourceRole: "supporting_context",
        content: content.length > maxCharsPerItem ? `${content.slice(0, maxCharsPerItem)}...` : content,
        contentChars: contentChars(content, block.contentChars),
        citationEligible: true,
      });
      if (items.length >= maxItems) break;
    }
  }

  const totalContentChars = items.reduce((sum, item) => sum + item.contentChars, 0);
  const rawItemCount = workspace.readDocuments.length + workspace.readBlockContexts.length;

  // evidenceMode 来自调用方传入的 requestedEvidenceMode，不根据 items.length 自动决定
  // 如果调用方未提供，fallback 为 insufficient_evidence（不得用于 Planner answer compose 的业务决策）
  const evidenceMode = input.requestedEvidenceMode ?? "insufficient_evidence";

  return {
    itemCount: items.length,
    totalContentChars,
    compacted: rawItemCount > items.length || items.some((item) => item.content.length < item.contentChars),
    items,
    evidenceMode,
    summaryText: items.length > 0
      ? `Evidence pack has ${items.length} read content items and ${totalContentChars} source characters.`
      : "Evidence pack is empty.",
  };
}
