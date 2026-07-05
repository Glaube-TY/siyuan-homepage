/**
 * 将 Agent Workbench 内部错误码 / 错误消息映射为用户可读提示。
 *
 * 原则：
 * - 内部错误码和服务商原始错误只进入 debug/trace
 * - 用户可见错误必须短、清楚、中文
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
  if (code.includes("agent_timeout") || code.includes("stream_idle_timeout") || msg.includes("超时")) {
    return {
      title: "模型响应超时",
      message: "模型没有在设定时间内返回可继续执行的内容，本轮已停止。",
      suggestion: "可以重试，或换用响应更稳定的模型。",
    };
  }

  // 没有可执行内容
  if (code.includes("empty_content")) {
    return {
      title: "模型没有返回可执行内容",
      message: "模型没有返回可执行内容，本轮已停止。",
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
      message: "模型生成内容时被安全策略拦截，本轮已停止。",
      suggestion: "可以换用更适合 Agent 的模型后重试，或将需求拆成更明确的小步骤。",
    };
  }

  // Agent 工具调用不兼容
  if (code.includes("native_tool_calls") || code.includes("tool_call_not_supported")) {
    return {
      title: "模型不支持 Agent 工具调用",
      message: "当前模型不能完成 Agent 工具调用，本轮已停止。",
      suggestion: "可以重试，或换用通过 Agent 兼容性测试的模型。",
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
  if (code.includes("network_error")) {
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
  if (code === "agent_model_call_failed") {
    return {
      title: "模型未返回可执行内容",
      message: "模型没有返回可继续执行的内容，本轮已停止。",
      suggestion: "可以重试，或换用更稳定的模型。",
    };
  }

  // 模型输出格式不正确
  if (code === "invalid_agent_decision") {
    return {
      title: "模型输出格式不正确",
      message: "模型输出格式不符合 Agent 要求，本轮已停止。",
      suggestion: "可以重试，或更换一个更稳定的普通对话模型。",
    };
  }

  // 模型主动停止
  if (code === "agent_stopped") {
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

  // 工具调用超限
  if (code === "tool_call_limit_reached" || code === "tool_call_limit_exceeded") {
    return {
      title: "工具调用次数超限",
      message: "工具调用次数达到本轮安全上限，本轮已停止。",
      suggestion: "可以重试、拆分任务，或在基础设置中调高 Agent 每轮最大工具调用次数。",
    };
  }

  // 重复调用未注册工具
  if (code === "repeated_unknown_tool") {
    return {
      title: "工具未注册且被重复调用",
      message: "模型重复调用了当前未注册的工具，本轮已停止。",
      suggestion: "可以重新同步 MCP 工具，或让 AI 先使用 mcp_manage.list_tools 查看实际可用工具名。",
    };
  }

  if (code === "trajectory_repetition_detected") {
    return {
      title: "多次重复探索后已停止",
      message: "模型多次调用高度相似的搜索或读取工具，本轮已停止。",
      suggestion: "可以缩小范围、指定文档，或让 AI 先总结已获得结果。",
    };
  }

  // 写入前置条件变化
  if (code === "write_precondition_changed") {
    return {
      title: "目标内容已变化",
      message: "目标内容在确认前后发生变化，写入操作没有执行。",
      suggestion: "请重新读取当前内容后再操作。",
    };
  }

  // 写入目标不存在
  if (code === "write_target_not_found") {
    return {
      title: "目标不存在",
      message: "目标内容块不存在，写入操作没有执行。",
    };
  }

  // 写入部分完成
  if (code === "write_partial_failed") {
    return {
      title: "写入部分完成",
      message: "部分写入可能已经完成，请重新读取文档确认当前状态。",
    };
  }

  // 用户取消
  if (code === "user_aborted") {
    return {
      title: "操作已取消",
      message: "已手动停止回答。",
    };
  }

  // 用户拒绝写入
  if (code === "user_rejected") {
    return {
      title: "操作已取消",
      message: "用户已拒绝本次写入操作，本轮已停止。",
    };
  }

  // 重复写入阻止
  if (code === "duplicate_write_call_blocked" || code === "duplicate_read_call_blocked") {
    return {
      title: "已阻止重复调用",
      message: "模型在同一轮中重复提交了相同的工具调用，系统已阻止第二次执行。",
      suggestion: "请先确认上一次调用结果后继续。",
    };
  }

  // 写入失败
  if (code === "write_operation_failed") {
    return {
      title: "写入操作失败",
      message: "文档写入操作未完成。",
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
 * 区分只读步骤和写入步骤，让用户清楚知道哪些操作已执行。
 * 不影响 Agent、不进入 observation。
 */
export function buildCompletedStepsSummary(events: Array<{
  type: string;
  ok?: boolean;
  result?: { ok?: boolean; code?: string; errorCode?: string };
  toolCallId?: string;
  readOnly?: boolean;
  toolName?: string;
  code?: string;
}>): CompletedStepsSummary | undefined {
  // Build a map: toolCallId -> readOnly from native tool_start events.
  const readOnlyMap = new Map<string, boolean>();
  for (const e of events) {
    if (e.type === "tool_start" && e.toolCallId && typeof e.readOnly === "boolean") {
      readOnlyMap.set(e.toolCallId, e.readOnly);
    }
  }

  let readOnlySuccess = 0;
  let writeSuccess = 0;
  let failedTools = 0;
  const readOnlyToolNames = new Set<string>();
  const writeToolNames = new Set<string>();
  const failureCodes = new Set<string>();

  for (const e of events) {
    if (e.type === "error") {
      const code = e.code;
      if (code) failureCodes.add(code);
      continue;
    }
    const ok = e.ok === true || e.result?.ok === true;
    if (e.type !== "tool_result" || !e.toolCallId) continue;
    const ro = readOnlyMap.get(e.toolCallId);
    if (ok) {
      if (ro === false) {
        writeSuccess++;
        if (e.toolName) writeToolNames.add(e.toolName);
      } else {
        // readOnly === true or no matching tool_start (fallback to read-only)
        readOnlySuccess++;
        if (e.toolName) readOnlyToolNames.add(e.toolName);
      }
    } else {
      failedTools++;
      const code = e.result?.code ?? e.result?.errorCode;
      if (code) failureCodes.add(code);
    }
  }

  const lines: string[] = [];
  if (readOnlySuccess > 0) {
    lines.push(`已完成只读步骤 ${readOnlySuccess} 个${readOnlyToolNames.size > 0 ? `：${Array.from(readOnlyToolNames).slice(0, 5).join("、")}` : ""}。`);
  }
  if (writeSuccess > 0) {
    lines.push(`已完成写入步骤 ${writeSuccess} 个${writeToolNames.size > 0 ? `：${Array.from(writeToolNames).slice(0, 5).join("、")}` : ""}。`);
    lines.push("请以工具结果和当前思源内容为准；系统不会自动回滚。");
  }
  if (failedTools > 0 || failureCodes.size > 0) {
    lines.push(`失败工具 ${failedTools} 个${failureCodes.size > 0 ? `，主要错误：${Array.from(failureCodes).slice(0, 5).join("、")}` : ""}。`);
  }
  if (["tool_call_limit_reached", "tool_call_limit_exceeded", "repeated_unknown_tool", "trajectory_repetition_detected"].some((c) => failureCodes.has(c))) {
    lines.push("可以缩小范围、指定文档或让 AI 先总结已获得结果。");
  }

  return lines.length > 0 ? { text: lines.join("\n") } : undefined;
}
