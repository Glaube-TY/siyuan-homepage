import { isFailoverEligible, SubsonicError, toSubsonicTransportError } from "./subsonicErrors";
import { normalizeServerInfo } from "./subsonicResponse";
import type { SubsonicClient } from "./subsonicClient";
import type { SubsonicEndpointKind, SubsonicServerInfo } from "./subsonicTypes";

export const SUBSONIC_LOCAL_PROBE_TIMEOUT_MS = 1500;
export const SUBSONIC_REMOTE_PROBE_TIMEOUT_MS = 5000;
export const SUBSONIC_NETWORK_RECHECK_DEBOUNCE_MS = 800;

export type EndpointHealthStatus = "idle" | "testing" | "online" | "offline" | "auth_error" | "server_error";

export interface EndpointHealth {
    configured: boolean;
    status: EndpointHealthStatus;
    latencyMs?: number;
    lastSuccessAt?: number;
    lastFailureAt?: number;
    safeError?: string;
    serverType?: string;
    serverVersion?: string;
}

export interface SubsonicEndpointState {
    activeKind: SubsonicEndpointKind | null;
    activeBaseUrl: string | null;
    generation: number;
    local: EndpointHealth;
    remote: EndpointHealth;
    serverInfo?: SubsonicServerInfo;
    lastConnectedAt: number | null;
}

export interface EndpointManagerConfig {
    localBaseUrl?: string;
    remoteBaseUrl?: string;
}

export interface EndpointRequestContext {
    kind: SubsonicEndpointKind;
    baseUrl: string;
    generation: number;
    signal: AbortSignal;
}

function initialHealth(configured: boolean): EndpointHealth {
    return { configured, status: "idle" };
}

export class SubsonicEndpointManager {
    private destroyed = false;
    private probeEpoch = 0;
    private recheckTimer: ReturnType<typeof setTimeout> | null = null;
    private listenersAttached = false;
    private readonly lifecycleController = new AbortController();
    private readonly stateListeners = new Set<(state: SubsonicEndpointState) => void>();
    private state: SubsonicEndpointState;

    constructor(private readonly config: EndpointManagerConfig, private readonly client: SubsonicClient) {
        this.state = {
            activeKind: null,
            activeBaseUrl: null,
            generation: 0,
            local: initialHealth(!!config.localBaseUrl),
            remote: initialHealth(!!config.remoteBaseUrl),
            lastConnectedAt: null,
        };
    }

    getState(): SubsonicEndpointState {
        return { ...this.state, local: { ...this.state.local }, remote: { ...this.state.remote } };
    }

    subscribe(listener: (state: SubsonicEndpointState) => void): () => void {
        this.stateListeners.add(listener);
        listener(this.getState());
        return () => this.stateListeners.delete(listener);
    }

    async initialize(): Promise<SubsonicEndpointState> {
        this.attachNetworkListeners();
        const epoch = ++this.probeEpoch;
        if (this.config.localBaseUrl) {
            const localOk = await this.probe("local", epoch);
            if (localOk) {
                this.activate("local");
                if (this.config.remoteBaseUrl) void this.probe("remote", epoch);
                return this.getState();
            }
            if (this.state.local.status === "auth_error") {
                throw new SubsonicError("auth_failed", "用户名或密码不正确。本地/远程地址不会继续自动切换。" );
            }
        }
        if (this.config.remoteBaseUrl) {
            const remoteOk = await this.probe("remote", epoch);
            if (remoteOk) {
                this.activate("remote");
                return this.getState();
            }
            if (this.state.remote.status === "auth_error") {
                throw new SubsonicError("auth_failed", "用户名或密码不正确。本地/远程地址不会继续自动切换。" );
            }
        }
        throw new SubsonicError("network_error", "NAS 音乐服务当前不可用。本地地址与远程地址均连接失败。" );
    }

    async refreshConnection(): Promise<void> {
        if (this.destroyed) return;
        const epoch = ++this.probeEpoch;
        if (this.config.localBaseUrl && await this.probe("local", epoch)) {
            this.activate("local");
            if (this.config.remoteBaseUrl) void this.probe("remote", epoch);
            return;
        }
        if (this.config.remoteBaseUrl && await this.probe("remote", epoch)) this.activate("remote");
    }

    async executeRead<T>(operation: (context: EndpointRequestContext) => Promise<T>): Promise<T> {
        const context = this.requireActiveContext();
        try {
            const result = await operation(context);
            this.ensureContextActive(context);
            return result;
        } catch (error) {
            if (!isFailoverEligible(error)) throw error;
            const alternate = context.kind === "local" ? "remote" : "local";
            const epoch = ++this.probeEpoch;
            if (!this.baseUrlFor(alternate) || !await this.probe(alternate, epoch)) throw error;
            this.activate(alternate);
            const retryContext = this.requireActiveContext();
            const result = await operation(retryContext);
            this.ensureContextActive(retryContext);
            return result;
        }
    }

    async executeIdempotentWrite<T>(operation: (context: EndpointRequestContext) => Promise<T>): Promise<T> {
        return this.executeRead(operation);
    }

    async executeNonIdempotentWrite<T>(operation: (context: EndpointRequestContext) => Promise<T>): Promise<T> {
        const context = this.requireActiveContext();
        try {
            const result = await operation(context);
            this.ensureContextActive(context);
            return result;
        } catch (error) {
            if (isFailoverEligible(error)) {
                throw new SubsonicError("operation_uncertain", "操作结果不确定，请刷新后确认。", { cause: error });
            }
            throw error;
        }
    }

    async forceAlternate(failedKind?: SubsonicEndpointKind): Promise<EndpointRequestContext> {
        const current = this.requireActiveContext();
        const sourceKind = failedKind || current.kind;
        const alternate = sourceKind === "local" ? "remote" : "local";
        if (current.kind === alternate && current.baseUrl === this.baseUrlFor(alternate)) return current;
        const epoch = ++this.probeEpoch;
        if (!this.baseUrlFor(alternate) || !await this.probe(alternate, epoch)) {
            throw new SubsonicError("stream_failed", "当前网络无法继续播放此歌曲。" );
        }
        this.activate(alternate);
        return this.requireActiveContext();
    }

    destroy(): void {
        this.destroyed = true;
        this.lifecycleController.abort();
        this.probeEpoch += 1;
        if (this.recheckTimer) clearTimeout(this.recheckTimer);
        this.recheckTimer = null;
        this.detachNetworkListeners();
        this.stateListeners.clear();
    }

    private requireActiveContext(): EndpointRequestContext {
        if (!this.state.activeKind || !this.state.activeBaseUrl) {
            throw new SubsonicError("network_error", "NAS 音乐服务尚未连接。" );
        }
        return { kind: this.state.activeKind, baseUrl: this.state.activeBaseUrl, generation: this.state.generation, signal: this.lifecycleController.signal };
    }

    private ensureContextActive(context: EndpointRequestContext): void {
        if (this.destroyed || context.signal.aborted || context.generation !== this.state.generation || context.kind !== this.state.activeKind) {
            throw new SubsonicError("request_aborted", "请求已取消。" );
        }
    }

    private async probe(kind: SubsonicEndpointKind, epoch: number): Promise<boolean> {
        const baseUrl = this.baseUrlFor(kind);
        if (!baseUrl || this.destroyed) return false;
        this.updateHealth(kind, { status: "testing", safeError: undefined });
        const startedAt = Date.now();
        try {
            const envelope = await this.client.request(baseUrl, kind, "ping", {}, {
                timeoutMs: kind === "local" ? SUBSONIC_LOCAL_PROBE_TIMEOUT_MS : SUBSONIC_REMOTE_PROBE_TIMEOUT_MS,
                signal: this.lifecycleController.signal,
            });
            if (this.destroyed || epoch !== this.probeEpoch) return false;
            const info = normalizeServerInfo(envelope);
            this.updateHealth(kind, {
                status: "online", latencyMs: Date.now() - startedAt, lastSuccessAt: Date.now(), safeError: undefined,
                serverType: info.type, serverVersion: info.serverVersion,
            });
            this.state.serverInfo = info;
            return true;
        } catch (rawError) {
            if (this.destroyed || epoch !== this.probeEpoch) return false;
            const error = toSubsonicTransportError(rawError, kind);
            this.updateHealth(kind, {
                status: error.category === "auth_failed" ? "auth_error" : error.category === "server_error" ? "server_error" : "offline",
                lastFailureAt: Date.now(), safeError: error.message,
            });
            return false;
        }
    }

    private activate(kind: SubsonicEndpointKind): void {
        const baseUrl = this.baseUrlFor(kind);
        if (!baseUrl) return;
        if (this.state.activeKind !== kind || this.state.activeBaseUrl !== baseUrl) this.state.generation += 1;
        this.state.activeKind = kind;
        this.state.activeBaseUrl = baseUrl;
        this.state.lastConnectedAt = Date.now();
        this.emit();
    }

    private baseUrlFor(kind: SubsonicEndpointKind): string | undefined {
        return kind === "local" ? this.config.localBaseUrl : this.config.remoteBaseUrl;
    }

    private updateHealth(kind: SubsonicEndpointKind, patch: Partial<EndpointHealth>): void {
        this.state[kind] = { ...this.state[kind], ...patch };
        this.emit();
    }

    private emit(): void {
        const snapshot = this.getState();
        this.stateListeners.forEach((listener) => listener(snapshot));
    }

    private scheduleNetworkRecheck = (): void => {
        if (this.destroyed) return;
        if (this.recheckTimer) clearTimeout(this.recheckTimer);
        this.recheckTimer = setTimeout(() => { this.recheckTimer = null; void this.refreshConnection(); }, SUBSONIC_NETWORK_RECHECK_DEBOUNCE_MS);
    };

    private attachNetworkListeners(): void {
        if (this.listenersAttached || typeof window === "undefined") return;
        window.addEventListener("online", this.scheduleNetworkRecheck);
        window.addEventListener("offline", this.scheduleNetworkRecheck);
        window.addEventListener("focus", this.scheduleNetworkRecheck);
        document?.addEventListener("visibilitychange", this.scheduleNetworkRecheck);
        this.listenersAttached = true;
    }

    private detachNetworkListeners(): void {
        if (!this.listenersAttached || typeof window === "undefined") return;
        window.removeEventListener("online", this.scheduleNetworkRecheck);
        window.removeEventListener("offline", this.scheduleNetworkRecheck);
        window.removeEventListener("focus", this.scheduleNetworkRecheck);
        document?.removeEventListener("visibilitychange", this.scheduleNetworkRecheck);
        this.listenersAttached = false;
    }
}
