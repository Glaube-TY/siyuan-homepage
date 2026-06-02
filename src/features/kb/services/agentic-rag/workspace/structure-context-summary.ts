/**
 * Structure Context Summary
 *
 * 为 Planner 提供结构语义上下文，让 AI 明确看到"结构关系说明包"。
 *
 * 职责：
 * - 从 activeFocusScope.expandedDocs 生成 Planner 可见的结构上下文
 * - 不泄露真实 docId/path/box
 * - 输出简短的树形结构说明
 */

import type { ActiveFocusScope } from "../tools/knowledge-map-types";

export interface StructureContextBrief {
  focusedRootTitle: string;
  focusedRootTitlePath?: string;
  relationRules: string[];
  focusedTreeItems: {
    title: string;
    titlePath?: string;
    relationToFocus: "root" | "descendant" | "sibling" | "ancestor" | "branch_root";
    structuralReason?: string;
    shouldRead: boolean;
  }[];
  summaryText: string;
}

export function buildStructureContextBrief(
  activeFocusScope: ActiveFocusScope | undefined
): StructureContextBrief | null {
  if (!activeFocusScope || !activeFocusScope.expandedDocs || activeFocusScope.expandedDocs.length === 0) {
    return null;
  }

  const expandedDocs = activeFocusScope.expandedDocs;

  // 找根节点（relationToFocus="root" 的第一个）
  const rootDoc = expandedDocs.find((d) => d.relationToFocus === "root");
  if (!rootDoc) {
    return null;
  }

  const focusedRootTitle = rootDoc.title;
  const focusedRootTitlePath = rootDoc.titlePath;

  const relationRules = [
    "父文档被选为聚焦根时，子文档默认继承父主题相关性",
    "子文档被选为聚焦根时，父文档和兄弟文档可能是同一主题补充材料",
    "同一父文档下的子文档是一个主题簇，应作为结构候选读取",
  ];

  const focusedTreeItems = expandedDocs.map((d) => ({
    title: d.title,
    titlePath: d.titlePath,
    relationToFocus: d.relationToFocus,
    structuralReason: d.structuralReason,
    shouldRead: d.relationToFocus === "root" || d.relationToFocus === "descendant",
  }));

  // 生成简短摘要文本
  const rootTitle = focusedRootTitle;
  const descendantTitles = expandedDocs
    .filter((d) => d.relationToFocus === "descendant")
    .map((d) => d.title);

  let summaryText = `已聚焦到文档树：${rootTitle}`;
  if (descendantTitles.length > 0) {
    summaryText += `。其子文档包括：${descendantTitles.join("、")}`;
    summaryText += `。这些子文档作为该父文档的子文档，应视为${rootTitle}的结构承接材料，应优先读取。`;
  } else {
    summaryText += `。`;
  }

  return {
    focusedRootTitle,
    focusedRootTitlePath,
    relationRules,
    focusedTreeItems,
    summaryText,
  };
}
