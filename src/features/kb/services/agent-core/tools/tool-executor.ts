import type { NativeTool, ToolExecutionContext, ToolExecutionResult } from "./native-tool";
import { createToolExecutionFailure } from "./tool-execution-result";

export class NativeToolExecutor {
  async execute(params: {
    tool: NativeTool;
    args: Record<string, unknown>;
    ctx: ToolExecutionContext;
  }): Promise<ToolExecutionResult> {
    if (params.ctx.abortSignal?.aborted) {
      return createToolExecutionFailure({
        toolName: params.tool.name,
        code: "user_aborted",
        message: "User aborted the operation.",
        recoverable: false,
      });
    }

    try {
      return await params.tool.execute(params.args, params.ctx);
    } catch (err) {
      return createToolExecutionFailure({
        toolName: params.tool.name,
        code: "tool_execution_failed",
        message: err instanceof Error ? err.message : "Tool execution failed.",
        recoverable: true,
      });
    }
  }
}

