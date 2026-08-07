import type { SubsonicEndpointState } from "./subsonic/subsonicEndpointManager";

export interface MusicCloudConnectionStatus {
    activeLabel: string;
    localStatus: string;
    remoteStatus: string;
    serverSummary: string;
    checkedAt: number;
}

const listeners = new Set<(status: MusicCloudConnectionStatus | null) => void>();
let currentStatus: MusicCloudConnectionStatus | null = null;

function formatHealth(state: SubsonicEndpointState, kind: "local" | "remote"): string {
    const health = state[kind];
    if (!health.configured) return "未配置";
    if (health.status === "online") return `在线${health.latencyMs !== undefined ? ` · ${health.latencyMs} ms` : ""}`;
    if (health.status === "auth_error") return "认证失败";
    if (health.status === "testing") return "正在测试";
    if (health.status === "idle") return "尚未测试";
    return health.safeError || "离线";
}

export function publishMusicCloudConnectionStatus(status: MusicCloudConnectionStatus): void {
    currentStatus = { ...status };
    for (const listener of listeners) listener({ ...currentStatus });
}

export function publishMusicCloudEndpointState(state: SubsonicEndpointState): void {
    const activeHealth = state.activeKind ? state[state.activeKind] : null;
    const info = state.serverInfo;
    const serverSummary = [
        activeHealth?.serverType || info?.type || "Subsonic",
        activeHealth?.serverVersion || info?.serverVersion || "",
        `API ${info?.apiVersion || "未知"}`,
    ].filter(Boolean).join(" ");
    publishMusicCloudConnectionStatus({
        activeLabel: state.activeKind === "local" ? "本地地址" : state.activeKind === "remote" ? "远程地址" : "未连接",
        localStatus: formatHealth(state, "local"),
        remoteStatus: formatHealth(state, "remote"),
        serverSummary,
        checkedAt: Date.now(),
    });
}

export function subscribeMusicCloudConnectionStatus(
    listener: (status: MusicCloudConnectionStatus | null) => void,
): () => void {
    listeners.add(listener);
    listener(currentStatus ? { ...currentStatus } : null);
    return () => listeners.delete(listener);
}
