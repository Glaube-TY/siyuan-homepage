export type AgentProviderErrorCategory =
  | "authentication"
  | "rate_limit"
  | "network"
  | "timeout"
  | "cancelled"
  | "protocol"
  | "unknown";

export interface AgentProviderErrorOptions {
  code?: string;
  status?: number;
  category?: AgentProviderErrorCategory;
  retryable?: boolean;
  retryAfterMs?: number;
  safeToReplay?: boolean;
  userAction?: "retry" | "check_credentials" | "switch_model" | "inspect_provider";
  correlationId?: string;
  /** 原始 JS Error 名称，仅供调试，不作为对外错误码。 */
  errorName?: string;
}

function categoryForCode(code: string): AgentProviderErrorCategory {
  if (code === "provider_auth_failed") return "authentication";
  if (code === "provider_rate_limited") return "rate_limit";
  if (code === "provider_timeout" || code === "provider_stream_idle_timeout") return "timeout";
  if (code === "user_aborted" || code === "provider_aborted") return "cancelled";
  if (code === "provider_network_error") return "network";
  if (code === "empty_stream" || code === "provider_http_error") return "protocol";
  return "unknown";
}

export class AgentProviderError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly category: AgentProviderErrorCategory;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly safeToReplay: boolean;
  readonly sideEffectState = "not_started" as const;
  readonly userAction?: AgentProviderErrorOptions["userAction"];
  readonly correlationId?: string;
  readonly errorName?: string;

  constructor(message: string, options: AgentProviderErrorOptions = {}) {
    super(message);
    this.name = "AgentProviderError";
    this.code = options.code ?? "provider_error";
    this.status = options.status;
    this.category = options.category ?? categoryForCode(this.code);
    this.retryable = options.retryable
      ?? (this.category === "network" || this.category === "rate_limit" || this.category === "timeout");
    this.retryAfterMs = options.retryAfterMs;
    this.safeToReplay = options.safeToReplay ?? true;
    this.userAction = options.userAction;
    this.correlationId = options.correlationId;
    this.errorName = options.errorName;
  }
}

export function normalizeProviderError(err: unknown): AgentProviderError {
  if (err instanceof AgentProviderError) return err;
  if (err instanceof Error) {
    if (err.name === "AbortError") {
      return new AgentProviderError(err.message || "Provider request aborted.", {
        code: "provider_aborted",
        category: "cancelled",
        retryable: false,
      });
    }
    return new AgentProviderError(err.message || "Agent Workbench 运行异常。", {
      code: "agent_workbench_unexpected_error",
      retryable: false,
      errorName: err.name || "Error",
    });
  }
  return new AgentProviderError(String(err), { code: "agent_workbench_unexpected_error", retryable: false });
}

/** 只按稳定错误码识别结构化空流；不解析 message、name 或自然语言。 */
export function isEmptyStreamError(err: unknown): boolean {
  return err instanceof AgentProviderError && err.code === "empty_stream";
}

