import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  readEvidenceInputJsonSchemaOverride,
  readEvidenceInputSchema,
  type ReadEvidenceInput,
  type ReadEvidenceOutput,
} from "./contracts/read-evidence.contract";

export interface ReadEvidenceDeps {
  executeReadEvidence(args: ReadEvidenceInput): Promise<{ safeOutput: ReadEvidenceOutput }>;
}

export function createReadEvidenceTool(deps: ReadEvidenceDeps): ToolContract<ReadEvidenceInput, ReadEvidenceOutput> {
  return {
    name: "read_evidence",
    title: "读取块级证据",
    description: "按搜索返回的真实 blockId 读取当前范围内的有限正文证据。",
    inputSchema: readEvidenceInputSchema,
    readOnly: true,
    safety: { readOnly: true, riskLevel: "low" },
    source: "builtin",
    inputHint: "blockIds 必填，最多 5 个；只接受内容块 ID。",
    boundary: "只按明确 blockId 窄读并校验 AgentScope，不扫描整库，不读取整篇文档。",
    providerVisible: false,
    inputJsonSchemaOverride: readEvidenceInputJsonSchemaOverride,
    availability: () => ({ available: true }),
    async execute(_ctx: ToolRuntimeContext, args: ReadEvidenceInput): Promise<ToolResult<ReadEvidenceOutput>> {
      try {
        const result = await deps.executeReadEvidence(args);
        return { ok: true, data: result.safeOutput };
      } catch {
        return { ok: false, data: null, error: { code: "tool_internal_error", message: "块级证据读取失败。", recoverable: true } };
      }
    },
    summarizeResult(result) {
      return result.ok && result.data ? `已读取 ${result.data.items.length} 个块级证据。` : "块级证据读取失败。";
    },
  };
}
