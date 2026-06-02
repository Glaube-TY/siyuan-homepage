import type { EvidenceWorkspace } from "../../workspace/evidence-workspace";
import type { StructurePack, StructurePackItem } from "./context-pack-types";

const RELATION_RULES = [
  "The document tree is navigation context and must not replace read content evidence.",
  "When a parent document is selected as focus root, its descendants are included as structural candidates.",
  "When a child document is selected, its parent and siblings may provide supporting topic context.",
  "Children under the same parent form a topic cluster.",
  "Structure can guide what to read, but final conclusions require evidence content.",
];

function titleOrFallback(title: unknown): string {
  return typeof title === "string" && title.trim().length > 0 ? title.trim() : "Untitled document";
}

export function buildStructurePack(input: {
  workspace: EvidenceWorkspace;
  maxItems?: number;
}): StructurePack {
  const { workspace } = input;
  const maxItems = input.maxItems ?? 30;
  const items: StructurePackItem[] = [];
  const seen = new Set<string>();

  const focusDocs = workspace.activeFocusScope?.expandedDocs ?? [];
  for (const doc of focusDocs) {
    const title = titleOrFallback(doc.title);
    const key = doc.titlePath ?? title;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      title,
      titlePath: doc.titlePath,
      relationToFocus: doc.relationToFocus,
      structuralReason: doc.structuralReason ?? "Included by the active focus scope.",
      shouldRead: true,
      readPriority: doc.relationToFocus === "root" ? 100 : doc.relationToFocus === "descendant" ? 80 : 60,
      source: "focus_doc_scope",
    });
    if (items.length >= maxItems) break;
  }

  if (items.length < maxItems) {
    const mappings = [...(workspace.docHandleMappings ?? [])]
      .sort((a, b) => b.depth - a.depth);

    for (const mapping of mappings) {
      const title = titleOrFallback(mapping.title);
      const key = mapping.titlePath ?? title;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        title,
        titlePath: mapping.titlePath,
        relationToFocus: "structural_candidate",
        structuralReason: "文档树结构节点，可作为结构候选。",
        shouldRead: true,
        readPriority: 50,
        source: mapping.source === "doc_tree_context" ? "doc_tree_context" : "knowledge_map",
      });
      if (items.length >= maxItems) break;
    }
  }

  if (items.length < maxItems) {
    for (const candidate of workspace.candidateDocs) {
      if ((candidate as { provenance?: string }).provenance !== "structural_focus") continue;
      const title = titleOrFallback(candidate.title);
      const key = candidate.titlePath ?? title;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        title,
        titlePath: candidate.titlePath,
        relationToFocus: "structural_candidate",
        structuralReason: "Candidate was added by structural focus.",
        shouldRead: true,
        readPriority: 70,
        source: "focus_doc_scope",
      });
      if (items.length >= maxItems) break;
    }
  }

  // 优先使用 activeFocusScope.primaryRoot（focus_doc_scope 明确记录的最小相关分支根）
  let focusedRoot: StructurePackItem | undefined;
  const primaryRoot = workspace.activeFocusScope?.primaryRoot;
  if (primaryRoot) {
    focusedRoot = items.find(
      (item) => item.title === primaryRoot.title && item.titlePath === primaryRoot.titlePath,
    );
  }

  // 其次从 activeFocusScope.expandedDocs 中提取 branch_root/root
  if (!focusedRoot && workspace.activeFocusScope) {
    const focusRootFromExpanded = workspace.activeFocusScope.expandedDocs?.find(
      (d) => d.relationToFocus === "branch_root" || d.relationToFocus === "root",
    );
    if (focusRootFromExpanded) {
      focusedRoot = items.find(
        (item) => item.title === focusRootFromExpanded.title && item.titlePath === focusRootFromExpanded.titlePath,
      );
    }
  }

  // 只有当 activeFocusScope 存在时，才从 items 中按优先级找
  if (!focusedRoot && workspace.activeFocusScope) {
    focusedRoot = items.find((item) => item.relationToFocus === "branch_root")
      ?? items.find((item) => item.relationToFocus === "root")
      ?? items.find((item) => item.relationToFocus === "ancestor");
  }

  const loaded = workspace.knowledgeMap?.loaded === true || !!workspace.activeFocusScope || items.length > 0;

  let summaryText: string;
  if (!loaded) {
    summaryText = "No structure pack is available yet.";
  } else if (items.length === 0) {
    summaryText = "Structure is marked loaded but no safe structure items were produced.";
  } else {
    const rootTitle = focusedRoot?.title ?? "unknown";
    const rootTitlePath = focusedRoot?.titlePath ?? "";
    const descendantCount = items.filter((i) => i.relationToFocus === "descendant").length;
    const siblingCount = items.filter((i) => i.relationToFocus === "sibling").length;
    const branchRootCount = items.filter((i) => i.relationToFocus === "branch_root").length;

    if (descendantCount > 0) {
      summaryText = `当前聚焦文档树：${rootTitlePath || rootTitle}。该文档树下包含 ${descendantCount} 个子文档和 ${siblingCount} 个兄弟文档。这些子文档因位于该父文档子树下，应视为结构承接材料，优先读取正文后综合判断。`;
    } else if (branchRootCount > 0) {
      summaryText = `当前聚焦文档树：${rootTitlePath || rootTitle}。该分支根节点下多个子文档被纳入结构范围，构成主题簇，应优先读取相关子文档正文。`;
    } else {
      summaryText = `Structure pack contains ${items.length} safe document-tree items focused on "${rootTitle}". Structure guides reading and is not final evidence.`;
    }
  }

  return {
    loaded,
    focusedRootTitle: focusedRoot?.title,
    focusedRootTitlePath: focusedRoot?.titlePath,
    relationRules: RELATION_RULES,
    items,
    summaryText,
    warning: loaded && items.length === 0 ? "Structure is marked loaded but no safe structure items were produced." : undefined,
  };
}
