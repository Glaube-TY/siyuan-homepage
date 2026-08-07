export type SubsonicErrorCategory =
    | "invalid_config" | "local_unreachable" | "remote_unreachable"
    | "auth_failed" | "token_auth_unsupported" | "api_version_unsupported"
    | "server_response_invalid" | "permission_denied" | "resource_not_found"
    | "network_timeout" | "network_error" | "server_transient" | "stream_failed"
    | "server_error" | "request_aborted" | "operation_uncertain";

export class SubsonicError extends Error {
    constructor(
        public readonly category: SubsonicErrorCategory,
        message: string,
        public readonly details: { httpStatus?: number; apiCode?: number; cause?: unknown } = {},
    ) {
        super(message);
        this.name = "SubsonicError";
    }
}

export function isFailoverEligible(error: unknown): boolean {
    if (!(error instanceof SubsonicError)) return false;
    return ["network_timeout", "network_error", "server_transient", "local_unreachable", "remote_unreachable"]
        .includes(error.category);
}

export function mapSubsonicApiError(code: number | undefined, message = ""): SubsonicError {
    if (code === 40 || code === 41) return new SubsonicError("auth_failed", "用户名或密码不正确。", { apiCode: code });
    if (code === 20) return new SubsonicError("api_version_unsupported", "服务器不支持 Subsonic 1.16.1。", { apiCode: code });
    if (code === 30) return new SubsonicError("api_version_unsupported", "客户端协议版本不受服务器支持。", { apiCode: code });
    if (code === 50) return new SubsonicError("permission_denied", "当前账号没有执行此操作的权限。", { apiCode: code });
    if (code === 70) return new SubsonicError("resource_not_found", "请求的音乐资源不存在。", { apiCode: code });
    if (/token.*(not supported|unsupported)|不支持.*token/i.test(message)) {
        return new SubsonicError("token_auth_unsupported", "服务器不支持安全的 Subsonic Token 认证。", { apiCode: code });
    }
    return new SubsonicError("server_error", "NAS 音乐服务器返回错误。", { apiCode: code });
}

export function toSubsonicTransportError(error: unknown, endpointKind?: "local" | "remote"): SubsonicError {
    if (error instanceof SubsonicError) return error;
    if (error instanceof DOMException && error.name === "AbortError") {
        return new SubsonicError("request_aborted", "请求已取消。", { cause: error });
    }
    const message = error instanceof Error ? error.message : String(error || "");
    if (/timeout|timed out|超时/i.test(message)) {
        return new SubsonicError("network_timeout", "NAS 音乐服务连接超时。", { cause: error });
    }
    return new SubsonicError(
        endpointKind === "local" ? "local_unreachable" : endpointKind === "remote" ? "remote_unreachable" : "network_error",
        endpointKind === "local" ? "本地音乐服务暂时无法连接。" : endpointKind === "remote" ? "远程音乐服务暂时无法连接。" : "NAS 音乐服务网络连接失败。",
        { cause: error },
    );
}
