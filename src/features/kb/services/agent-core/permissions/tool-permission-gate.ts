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
 */
export class DefaultToolPermissionGate implements ToolPermissionGate {
  constructor(private readonly bridge: ToolConfirmationBridge = new RegisteredConfirmationBridge()) {}

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
      } catch (err) {
        preview.summary = err instanceof Error
          ? `预览生成失败：${err.message}`
          : "预览生成失败。";
      }
    }

    params.onPermissionRequired?.(preview);
    const decision = await this.bridge.request(preview);
    return { decision, preview };
  }
}
