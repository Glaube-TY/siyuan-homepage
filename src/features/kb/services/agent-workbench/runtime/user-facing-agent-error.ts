/**
 * 将 Agent Workbench 内部错误码 / 错误消息映射为用户可读提示。
 *
 * 原则：
 * - 内部错误码、provider 原始错误、JSON 解析细节等只进入 debug/trace
 * - 用户可见错误必须短、清楚、中文
 * - 禁止出现：Planner、JSON、OpenAI-compatible、raw fallback、provider、
 *   endpoint、端点、控制面、API/chat、Coding Plan、reasoning、reasonCode、
 *   fail_closed_no_planner_decision
 */

export interface UserFacingAgentError {
  title: string;
  message: string;
  suggestion?: string;
}

export interface CompletedStepsSummary {
  text: string;
}

export interface AgentTurnDisplayError {
  title: string;
  message: string;
  suggestion?: string;
  completedStepsSummary?: string;
}

/**
 * 根据内部错误码 / 错误消息映射为用户可读错误。
 */
export function mapAgentErrorToUserFacing(input: {
  agentErrorCode?: string;
  message?: string;
}): UserFacingAgentError {
  const code = (input.agentErrorCode ?? "").toLowerCase();
  const msg = (input.message ?? "").toLowerCase();

  // 超时
  if (code.includes("control_plane_timeout") || code.includes("stream_idle_timeout") || msg.includes("超时")) {
    return {
      title: "模型响应超时",
      message: "模型没有在设定时间内返回可继续执行的内容，本轮已停止。",
      suggestion: "可以重试，或换用响应更稳定的模型。",
    };
  }

  // 只返回思考，没有可执行内容
  if (code.includes("reasoning_only") || code.includes("empty_content")) {
    return {
      title: "模型没有返回可执行内容",
      message: "模型没有返回可执行内容，本轮已停止。",
      suggestion: "可以重试，或更换一个更稳定的普通对话模型。",
    };
  }

  // 格式错误（JSON 解析失败、不符合 schema 等）
  if (code.includes("invalid_json") || code.includes("json_parse") || code.includes("不是合法") || code.includes("格式不正确")) {
    return {
      title: "模型输出格式不正确",
      message: "模型输出格式不符合自动操作要求，本轮已停止。",
      suggestion: "可以重试，或更换一个更稳定的普通对话模型。",
    };
  }

  // 输出被截断
  if (code.includes("output_truncated")) {
    return {
      title: "模型输出被截断",
      message: "模型输出过长被截断，本轮已停止。",
      suggestion: "可以在模型设置中调大输出上限后重试。",
    };
  }

  // 内容被过滤
  if (code.includes("content_filtered")) {
    return {
      title: "模型输出被过滤",
      message: "模型输出因安全策略被过滤，本轮已停止。",
    };
  }

  // 原生工具调用（非当前模式支持）
  if (code.includes("native_tool_calls")) {
    return {
      title: "模型返回了不兼容的内容",
      message: "模型返回了当前模式不支持的内容，本轮已停止。",
      suggestion: "可以重试，或换用更稳定的普通对话模型。",
    };
  }

  // HTTP 错误
  if (code.includes("http_401")) {
    return {
      title: "认证失败",
      message: "连接失败：当前 API Key 未通过鉴权。",
    };
  }
  if (code.includes("http_403")) {
    return {
      title: "权限不足",
      message: "连接失败：当前 API Key 没有调用该模型的权限。",
    };
  }
  if (code.includes("http_429")) {
    return {
      title: "请求频率过高",
      message: "请求过于频繁或额度受限，请稍后重试。",
    };
  }
  if (code.includes("http_5xx")) {
    return {
      title: "服务商暂时无法完成请求",
      message: "服务商暂时无法完成请求，请稍后重试。",
    };
  }
  if (code.includes("http_xxx")) {
    return {
      title: "模型请求失败",
      message: "模型请求失败，本轮已停止。",
      suggestion: "可以重试，或检查模型配置。",
    };
  }
  if (code.includes("network_error") || code.includes("control_plane_fetch_failed")) {
    return {
      title: "模型请求失败",
      message: "模型请求失败，本轮已停止。",
      suggestion: "可以重试，或检查模型配置。",
    };
  }

  // 安全边界错误
  if (code === "forbidden_field" || code === "forbidden_flow_control") {
    return {
      title: "模型输出包含不允许的字段",
      message: "模型输出包含不允许的字段，本轮已停止。",
    };
  }

  // 工具参数不完整
  if (code.includes("invalid_args") || msg.includes("参数不符合")) {
    return {
      title: "工具参数不完整",
      message: "工具调用参数不符合要求，本轮未完成该操作。",
      suggestion: "可以补充必要信息后重试。",
    };
  }

  // 模型调用失败
  if (code === "planner_model_call_failed") {
    return {
      title: "模型未返回可执行内容",
      message: "模型没有返回可继续执行的内容，本轮已停止。",
      suggestion: "可以重试，或换用更稳定的模型。",
    };
  }

  // 模型输出格式不正确
  if (code === "invalid_planner_decision") {
    return {
      title: "模型输出格式不正确",
      message: "模型输出格式不符合自动操作要求，本轮已停止。",
      suggestion: "可以重试，或更换一个更稳定的普通对话模型。",
    };
  }

  // 模型主动停止
  if (code === "planner_stopped") {
    return {
      title: "模型主动停止",
      message: "模型停止了本轮执行。",
    };
  }

  // 联网未使用
  if (code === "required_web_not_used") {
    return {
      title: "未使用联网能力",
      message: "本轮要求联网，但模型没有使用联网能力。",
      suggestion: "可以重试，或在提问时附上明确联网要求。",
    };
  }

  // 最终回答格式错误
  if (code === "final_answer_invalid") {
    return {
      title: "最终回答格式错误",
      message: "最终回答格式不符合要求，本轮已停止。",
    };
  }

  // 工具调用超限
  if (code === "tool_call_limit_reached") {
    return {
      title: "工具调用次数超限",
      message: "工具调用次数达到本轮安全上限，本轮已停止。",
      suggestion: "可以重试，或将复杂任务拆分为多个步骤。",
    };
  }

  // 用户取消
  if (code === "user_aborted") {
    return {
      title: "操作已取消",
      message: "用户取消了操作。",
    };
  }

  // 未知异常
  if (code === "agent_workbench_unexpected_error") {
    return {
      title: "本轮未完成",
      message: "运行过程中出现异常，本轮已停止。",
      suggestion: "可以重试，或稍后再试。",
    };
  }

  // 默认
  return {
    title: "本轮未完成",
    message: "模型没有给出可继续执行的有效内容，本轮已停止。",
  };
}

/**
 * 从本轮事件中提取已完成工具步骤的短摘要。
 * 只使用 ToolResult ok:true 的事件，不读取工具正文，不调用 LLM。
 * 不依赖具体工具名，使用通用计数。
 */
export function buildCompletedStepsSummary(events: Array<{
  type: string;
  ok?: boolean;
}>): CompletedStepsSummary | undefined {
  const successCount = events.filter((e) => e.type === "ToolResult" && e.ok === true).length;

  if (successCount === 0) {
    return undefined;
  }

  if (successCount === 1) {
    return { text: "本轮已完成 1 个工具步骤。" };
  }

  return { text: `本轮已完成 ${successCount} 个工具步骤。` };
}
