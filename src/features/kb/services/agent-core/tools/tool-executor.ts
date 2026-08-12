import type { NativeTool, ToolExecutionContext, ToolExecutionResult } from "./native-tool";
import { createToolExecutionFailure } from "./tool-execution-result";

export class NativeToolExecutor {
  async execute(params: {
    tool: NativeTool;
    args: Record<string, unknown>;
    ctx: ToolExecutionContext;
    readOnly: boolean;
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
      const failure = createToolExecutionFailure({
        toolName: params.tool.name,
        code: params.readOnly ? "tool_execution_failed" : "write_result_unknown",
        message: err instanceof Error ? err.message : "Tool execution failed.",
        recoverable: params.readOnly,
      });
      failure.sideEffectState = params.readOnly ? "not_started" : "unknown";
      return failure;
    }
  }
}

