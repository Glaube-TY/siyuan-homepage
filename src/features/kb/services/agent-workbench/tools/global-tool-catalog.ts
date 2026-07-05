/**
 * 全局聚合工具目录（只读 UI 元数据）
 *
 * 仅用于 UI / 设置展示，不参与 ToolRegistry 业务流程。
 */

import {
  AGGREGATE_TOOL_CATALOG,
  type AggregateToolName,
} from "./aggregate/aggregate-tool-metadata";

export interface GlobalToolMeta {
  name: AggregateToolName;
  title: string;
  description: string;
  readOnly: boolean;
  requiresConfirmation: boolean;
}

export const globalToolCatalog: GlobalToolMeta[] = AGGREGATE_TOOL_CATALOG.map((tool) => ({
  name: tool.name,
  title: tool.title,
  description: tool.description,
  readOnly: tool.readOnly,
  requiresConfirmation: tool.requiresConfirmation === true,
}));
