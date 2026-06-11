/**
 * 文档内容编辑风险等级判断。
 * 只做结构化判断，不读文档、不调用 API。
 */

import type {
  DocContentEditOperation,
  DocContentEditRiskLevel,
  DocContentEditTarget,
} from "./doc-content-edit-types";

export interface AssessDocContentEditRiskInput {
  operation: DocContentEditOperation;
  target: DocContentEditTarget;
  markdownLength?: number;
}

export interface AssessDocContentEditRiskResult {
  riskLevel: DocContentEditRiskLevel;
  warnings: string[];
}

export function assessDocContentEditRisk(
  input: AssessDocContentEditRiskInput,
): AssessDocContentEditRiskResult {
  const { operation, target, markdownLength = 0 } = input;
  const warnings: string[] = [];

  let riskLevel: DocContentEditRiskLevel = "low";

  // 1. 基础风险等级
  switch (operation) {
    case "create_doc":
    case "update_block":
    case "insert_block":
      riskLevel = "low";
      break;
    case "rename_doc":
    case "delete_block":
    case "move_block":
      riskLevel = "medium";
      break;
    case "replace_doc_content":
      riskLevel = "high";
      break;
    case "delete_doc":
      riskLevel = "high";
      break;
  }

  // 2. 内容长度风险
  if (markdownLength > 12000) {
    riskLevel = "high";
    warnings.push("内容长度超过 12000 字符，操作风险较高。");
  }

  // 3. 目标明确性风险（根据 operation 判断必需目标）
  const missing = getMissingRequiredTarget(operation, target);
  if (missing.length > 0) {
    riskLevel = "high";
    warnings.push(`缺少该操作必需的目标信息：${missing.join("、")}。`);
  }

  return { riskLevel, warnings };
}

function getMissingRequiredTarget(
  operation: DocContentEditOperation,
  target: DocContentEditTarget,
): string[] {
  const missing: string[] = [];

  switch (operation) {
    case "create_doc": {
      // 需要 notebookId + docPath 或 docId/docPath 中至少一种可定位信息
      const hasLocation =
        !!target.docId ||
        (!!target.notebookId && !!target.docPath) ||
        !!target.docPath;
      if (!hasLocation) {
        missing.push("docId 或 notebookId+docPath 或 docPath");
      }
      break;
    }
    case "rename_doc":
    case "delete_doc":
    case "replace_doc_content": {
      if (!target.docId) {
        missing.push("docId");
      }
      break;
    }
    case "update_block":
    case "delete_block": {
      if (!target.blockId) {
        missing.push("blockId");
      }
      break;
    }
    case "insert_block": {
      if (!target.referenceBlockId) {
        missing.push("referenceBlockId");
      }
      break;
    }
    case "move_block": {
      if (!target.blockId) {
        missing.push("blockId");
      }
      // 目标位置信息由后续 toolInput 提供，此处不做强制检查
      break;
    }
  }

  return missing;
}
