export class AgentProviderError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly recoverable: boolean;

  constructor(message: string, options: { code?: string; status?: number; recoverable?: boolean } = {}) {
    super(message);
    this.name = "AgentProviderError";
    this.code = options.code ?? "provider_error";
    this.status = options.status;
    this.recoverable = options.recoverable ?? true;
  }
}

export function normalizeProviderError(err: unknown): AgentProviderError {
  if (err instanceof AgentProviderError) return err;
  if (err instanceof Error) {
    return new AgentProviderError(err.message, { code: err.name || "provider_error" });
  }
  return new AgentProviderError(String(err), { code: "provider_error" });
}

