import type {
  AgentHttpPostOptions,
  AgentHttpResponse,
  AgentHttpTransport,
} from "../../../../agent-core/providers/agent-http-transport";
import { requestViaSiyuanProxy } from "./siyuan-proxy-request";

/** Browser-only native-search transport; all external requests use SiYuan forwardProxy. */
export class SiyuanProxyAgentHttpTransport implements AgentHttpTransport {
  constructor(private readonly timeoutMs = 60_000) {}

  async post(options: AgentHttpPostOptions): Promise<AgentHttpResponse> {
    const result = await requestViaSiyuanProxy(options.url, {
      method: "POST",
      headers: [options.headers],
      body: options.body,
      contentType: "application/json",
      timeout: this.timeoutMs,
    });
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => null },
      async json(): Promise<unknown> { return typeof result === "string" ? JSON.parse(result) : result; },
      async text(): Promise<string> { return typeof result === "string" ? result : JSON.stringify(result); },
      body: null,
    };
  }
}
