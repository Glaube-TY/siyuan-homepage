import { SubsonicError, toSubsonicTransportError } from "./subsonicErrors";
import { parseSubsonicEnvelope } from "./subsonicResponse";
import type { SubsonicEndpointKind, SubsonicEndpointName, SubsonicEnvelope, SubsonicRequestOptions } from "./subsonicTypes";
import { buildSubsonicUrl } from "./subsonicUrl";

export type SubsonicProxy = (
    url: string, method?: string, payload?: any, headers?: any[], timeout?: number,
    contentType?: string, payloadEncoding?: string, responseEncoding?: string,
) => Promise<IResForwardProxy>;

export class SubsonicClient {
    constructor(
        private readonly credentials: { username: string; password: string },
        private readonly proxy?: SubsonicProxy,
    ) {}

    buildUrl(baseUrl: string, endpoint: SubsonicEndpointName, params: Record<string, any> = {}): string {
        return buildSubsonicUrl(baseUrl, endpoint, params, this.credentials);
    }

    async request(
        baseUrl: string,
        endpointKind: SubsonicEndpointKind,
        endpoint: SubsonicEndpointName,
        params: Record<string, any> = {},
        options: SubsonicRequestOptions = {},
    ): Promise<SubsonicEnvelope> {
        if (options.signal?.aborted) throw new SubsonicError("request_aborted", "请求已取消。" );
        const url = this.buildUrl(baseUrl, endpoint, params);
        try {
            const proxy = this.proxy || (await import("../../../../../../api")).forwardProxyChecked;
            const response = await proxy(url, "GET", {}, [], options.timeoutMs ?? 7000, "application/json", undefined, "text");
            if (options.signal?.aborted) throw new SubsonicError("request_aborted", "请求已取消。" );
            if (response.status < 200 || response.status >= 300) {
                if (response.status === 401) throw new SubsonicError("auth_failed", "用户名或密码不正确。", { httpStatus: response.status });
                if (response.status === 403) throw new SubsonicError("permission_denied", "当前账号没有执行此操作的权限。", { httpStatus: response.status });
                if (response.status === 404) throw new SubsonicError("resource_not_found", "请求的音乐资源不存在。", { httpStatus: response.status });
                if ([502, 503, 504].includes(response.status)) {
                    throw new SubsonicError("server_transient", "NAS 音乐服务器暂时不可用。", { httpStatus: response.status });
                }
                throw new SubsonicError("server_error", "NAS 音乐服务器返回异常状态。", { httpStatus: response.status });
            }
            return parseSubsonicEnvelope(response.body);
        } catch (error) {
            throw toSubsonicTransportError(error, endpointKind);
        }
    }
}
