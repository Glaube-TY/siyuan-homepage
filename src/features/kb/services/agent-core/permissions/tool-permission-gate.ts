import type { NativeTool } from "../tools/native-tool";
import { buildToolPermissionPreview } from "./write-preview-builder";
import { RegisteredConfirmationBridge, type ToolConfirmationBridge } from "./confirmation-bridge";
import type { ToolPermissionDecision, ToolPermissionPreview } from "./tool-preview";

export interface ToolPermissionGate {
  check(params: {
    tool: NativeTool;
    args: Record<string, unknown>;
    onPermissionRequired?: (preview: ToolPermissionPreview) => void;
  }): Promise<{
    decision: ToolPermissionDecision;
    preview: ToolPermissionPreview;
  }>;
}

/**
 * Default permission gate — for readOnly tools returns allow immediately,
 * for write tools delegates to the bridge.
 *
 * `autoAllowedToolNames`: tool names that the user has explicitly trusted
 * and should skip the confirmation dialog. These tools still go through
 * preview (to obtain confirmationId) and all safety guards.
 */
export class DefaultToolPermissionGate implements ToolPermissionGate {
  private readonly autoAllowedNames: Set<string>;

  constructor(
    private readonly bridge: ToolConfirmationBridge = new RegisteredConfirmationBridge(),
    autoAllowedToolNames?: string[],
  ) {
    this.autoAllowedNames = new Set(autoAllowedToolNames ?? []);
  }

  async check(params: {
    tool: NativeTool;
    args: Record<string, unknown>;
    onPermissionRequired?: (preview: ToolPermissionPreview) => void;
  }): Promise<{
    decision: ToolPermissionDecision;
    preview: ToolPermissionPreview;
  }> {
    const preview = buildToolPermissionPreview(params.tool, params.args);

    if (params.tool.readOnly) {
      return { decision: { type: "allow" }, preview };
    }

    // Write tools: always run preview to obtain confirmationId
    if (params.tool.preview) {
      try {
        const previewData = await params.tool.preview(params.args);
        const data = previewData && typeof previewData === "object"
          ? previewData as Record<string, unknown>
          : undefined;
        if (data?.displayMode) preview.displayMode = data.displayMode as ToolPermissionPreview["displayMode"];
        if (typeof data?.confirmationId === "string") preview.confirmationId = data.confirmationId;
        if (data?.editDiffPreview) preview.editDiffPreview = data.editDiffPreview as ToolPermissionPreview["editDiffPreview"];
        if (data?.arrowFlow) preview.arrowFlow = data.arrowFlow as ToolPermissionPreview["arrowFlow"];
        if (data?.argsPreview && typeof data.argsPreview === "object") {
          preview.argsPreview = data.argsPreview as Record<string, unknown>;
        }
        if (typeof data?.summary === "string") preview.summary = data.summary;
        if (typeof data?.title === "string") preview.title = data.title;
        if (typeof data?.risk === "string") preview.risk = data.risk as ToolPermissionPreview["risk"];
        if (typeof data?.operationLabel === "string") preview.operationLabel = data.operationLabel;
        if (typeof data?.targetSummary === "string") preview.targetSummary = data.targetSummary;
        if (typeof data?.impactSummary === "string") preview.impactSummary = data.impactSummary;
        if (typeof data?.riskReason === "string") preview.riskReason = data.riskReason;
        if (Array.isArray(data?.warnings)) preview.warnings = data.warnings.filter((item): item is string => typeof item === "string");
        if (typeof data?.missingPreviewReason === "string") preview.missingPreviewReason = data.missingPreviewReason;
        if (Array.isArray(data?.sections)) {
          preview.sections = data.sections.filter((item): item is { label: string; value: string } => (
            !!item
            && typeof item === "object"
            && typeof (item as { label?: unknown }).label === "string"
            && typeof (item as { value?: unknown }).value === "string"
          ));
        }
        if (data?.permissionAction === "deny") {
          return {
            decision: {
              type: "deny",
              reason: typeof data.permissionReason === "string" ? data.permissionReason : "工具权限策略拒绝执行。",
            },
            preview,
          };
        }
        if (data?.permissionAction === "allow") {
          return { decision: { type: "allow" }, preview };
        }
      } catch (err) {
        // preview failure on a trusted tool cannot blindly execute
        preview.summary = err instanceof Error
          ? `预览生成失败：${err.message}`
          : "预览生成失败。";
        return { decision: { type: "deny", reason: "预览生成失败，无法安全执行。" }, preview };
      }
    }

    // Tool-level trusted (e.g. MCP trusted): auto-allow after preview
    // Preview still ran above to obtain confirmationId, edit diffs, safety checks.
    if (params.tool.safety?.requiresConfirmation === false) {
      return { decision: { type: "allow" }, preview };
    }

    // User-trusted tools: auto-allow after preview
    if (this.autoAllowedNames.has(params.tool.name)) {
      return { decision: { type: "allow" }, preview };
    }

    // Default: show confirmation dialog
    params.onPermissionRequired?.(preview);
    const decision = await this.bridge.request(preview);
    return { decision, preview };
  }
}
