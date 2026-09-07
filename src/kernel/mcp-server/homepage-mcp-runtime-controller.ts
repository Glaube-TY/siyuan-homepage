import type { NativeToolRegistry } from "../../features/kb/services/agent-core/tools/native-tool-registry";
import {
  HOMEPAGE_MCP_CAPABILITY_NAMES,
  EXPECTED_HOMEPAGE_MCP_CAPABILITY_COUNT,
} from "./homepage-mcp-capability-policy";
import {
  HomepageMcpCapabilityRegistrationError,
  registerHomepageMcpCapabilities,
  unregisterHomepageMcpCapabilities,
  type RegisteredHomepageMcpCapabilities,
  type UnregisterHomepageMcpCapabilitiesResult,
} from "./register-homepage-mcp-capabilities";
import type { HomepageMcpAgent } from "./homepage-mcp-types";

export const HOMEPAGE_MCP_SERVER_SETTINGS_STORAGE_KEY =
  "homepage-mcp-server-settings";
export const HOMEPAGE_MCP_SERVER_SETTINGS_SCHEMA_VERSION = 1 as const;
export const HOMEPAGE_MCP_RECONCILE_INTERVAL_MS = 60_000;

export interface HomepageMcpServerSettings {
  schemaVersion: typeof HOMEPAGE_MCP_SERVER_SETTINGS_SCHEMA_VERSION;
  enabled: boolean;
}

export type HomepageMcpServerStatus =
  | "disabled"
  | "enabled"
  | "locked"
  | "error"
  | "initializing";

export interface HomepageMcpServerSnapshot {
  schemaVersion: typeof HOMEPAGE_MCP_SERVER_SETTINGS_SCHEMA_VERSION;
  enabled: boolean;
  active: boolean;
  entitlementAvailable: boolean;
  status: HomepageMcpServerStatus;
  capabilityCount: number;
  expectedCapabilityCount: number;
  lastError: string | null;
}

export interface HomepageMcpServerStorage {
  get(key: string): Promise<string | null>;
  getStrict?(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface HomepageMcpRuntimeControllerOptions {
  agent?: HomepageMcpAgent | null;
  registry: NativeToolRegistry;
  storage: HomepageMcpServerStorage;
  isEntitlementAvailable(): Promise<boolean>;
  timeout(fn: () => void, ms: number): () => void;
  log?: {
    info?(entry: Record<string, unknown>): void;
    warn?(entry: Record<string, unknown>): void;
    error?(entry: Record<string, unknown>): void;
  };
}

export class HomepageMcpRuntimeController {
  private registered: RegisteredHomepageMcpCapabilities = emptyRegisteredCapabilities();
  private enabled = false;
  private entitlementAvailable = false;
  private status: HomepageMcpServerStatus = "initializing";
  private lastError: string | null = null;
  private initialized = false;
  private shuttingDown = false;
  private cancelReconcileTimer: (() => void) | null = null;
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly options: HomepageMcpRuntimeControllerOptions) {}

  initialize(): Promise<void> {
    return this.enqueue(async () => {
      if (this.initialized) return;
      this.status = "initializing";
      this.lastError = null;
      try {
        const settings = await this.loadSettings();
        this.enabled = settings.enabled;
        if (!this.enabled) {
          this.entitlementAvailable = await this.readEntitlement();
          this.status = "disabled";
          return;
        }

        this.entitlementAvailable = await this.readEntitlement();
        if (!this.entitlementAvailable) {
          this.status = "locked";
          this.scheduleReconcile();
          return;
        }
        await this.registerAll();
        this.status = "enabled";
        this.scheduleReconcile();
      } catch (error) {
        this.status = "error";
        this.lastError = safeErrorSummary(error);
        this.options.log?.error?.({ status: "homepage_mcp_initialize_failed", message: this.lastError });
        if (this.enabled) this.scheduleReconcile();
      } finally {
        this.initialized = true;
      }
    });
  }

  getSnapshot(): HomepageMcpServerSnapshot {
    return {
      schemaVersion: HOMEPAGE_MCP_SERVER_SETTINGS_SCHEMA_VERSION,
      enabled: this.enabled,
      active: this.isActive(),
      entitlementAvailable: this.entitlementAvailable,
      status: this.status,
      capabilityCount: this.registered.names.length,
      expectedCapabilityCount: EXPECTED_HOMEPAGE_MCP_CAPABILITY_COUNT,
      lastError: this.lastError,
    };
  }

  setEnabled(enabled: boolean): Promise<HomepageMcpServerSnapshot> {
    if (typeof enabled !== "boolean") {
      return Promise.reject(new Error("homepageMcp.setEnabled 需要 boolean 类型的 enabled 参数"));
    }

    return this.enqueue(async () => {
      if (!this.initialized) throw new Error("主页 MCP 控制器尚未初始化");
      if (this.shuttingDown) throw new Error("主页 MCP 控制器正在关闭");

      if (enabled) {
        this.entitlementAvailable = await this.readEntitlement();
        if (!this.entitlementAvailable) {
          const cleanup = await this.unregisterAll();
          this.status = cleanup.allUnregistered ? "locked" : "error";
          this.lastError = cleanup.allUnregistered
            ? null
            : `会员不可用且能力注销失败：${cleanup.errors.map(({ name, error }) => `${name}: ${safeErrorSummary(error)}`).join("；")}`.slice(0, 300);
          this.scheduleReconcile();
          return this.getSnapshot();
        }
        return this.enable();
      }
      return this.disable();
    });
  }

  reconcile(): Promise<HomepageMcpServerSnapshot> {
    return this.enqueue(async () => {
      if (!this.initialized || this.shuttingDown) return this.getSnapshot();
      this.cancelReconcileTimer?.();
      this.cancelReconcileTimer = null;

      this.entitlementAvailable = await this.readEntitlement();
      if (!this.enabled) {
        const cleanup = await this.unregisterAll();
        this.status = cleanup.allUnregistered ? "disabled" : "error";
        this.lastError = cleanup.allUnregistered
          ? null
          : `主页 MCP 能力清理失败：${cleanup.errors.map(({ name, error }) => `${name}: ${safeErrorSummary(error)}`).join("；")}`.slice(0, 300);
        return this.getSnapshot();
      }

      if (!this.entitlementAvailable) {
        const cleanup = await this.unregisterAll();
        if (cleanup.allUnregistered) {
          this.status = "locked";
          this.lastError = null;
        } else {
          this.status = "error";
          this.lastError = `会员不可用且能力注销失败：${cleanup.errors.map(({ name, error }) => `${name}: ${safeErrorSummary(error)}`).join("；")}`.slice(0, 300);
        }
        this.scheduleReconcile();
        return this.getSnapshot();
      }

      if (!this.isActive()) {
        try {
          if (this.registered.names.length > 0) {
            const cleanup = await this.unregisterAll();
            if (!cleanup.allUnregistered) {
              throw new Error(`旧能力未能完全注销：${cleanup.errors.map(({ name }) => name).join("、")}`);
            }
          }
          await this.registerAll();
          this.status = "enabled";
          this.lastError = null;
        } catch (error) {
          this.status = "error";
          this.lastError = safeErrorSummary(error);
        }
      } else {
        this.status = "enabled";
        this.lastError = null;
      }
      this.scheduleReconcile();
      return this.getSnapshot();
    });
  }

  shutdown(): Promise<void> {
    return this.enqueue(async () => {
      if (this.shuttingDown) return;
      this.shuttingDown = true;
      this.cancelReconcileTimer?.();
      this.cancelReconcileTimer = null;
      const cleanup = await this.unregisterAll();
      if (cleanup.allUnregistered) {
        this.status = "disabled";
        this.lastError = null;
      } else {
        this.status = "error";
        this.lastError = `主页 MCP 能力清理失败：${cleanup.errors.map(({ name, error }) => `${name}: ${safeErrorSummary(error)}`).join("；")}`.slice(0, 300);
      }
    });
  }

  private async enable(): Promise<HomepageMcpServerSnapshot> {
    this.status = "initializing";
    this.lastError = null;
    try {
      if (!this.isActive()) {
        if (this.registered.names.length > 0) {
          const cleanup = await this.unregisterAll();
          if (!cleanup.allUnregistered) {
            throw new Error(`旧能力未能完全注销：${cleanup.errors.map(({ name }) => name).join("、")}`);
          }
        }
        await this.registerAll();
      }
      await this.saveSettingsAndVerify(true);
      this.enabled = true;
      this.status = "enabled";
      this.lastError = null;
      this.scheduleReconcile();
    } catch (error) {
      const previousEnabled = this.enabled;
      const cleanup = await this.unregisterAll();
      this.enabled = previousEnabled;
      this.status = "error";
      this.lastError = `主页 MCP 开启失败：${safeErrorSummary(error)}${cleanup.errors.length > 0 ? `；清理失败：${cleanup.errors.map(({ name }) => name).join("、")}` : ""}`.slice(0, 300);
      if (this.enabled) this.scheduleReconcile();
    }
    return this.getSnapshot();
  }

  private async disable(): Promise<HomepageMcpServerSnapshot> {
    this.status = "initializing";
    this.lastError = null;
    const previousEnabled = this.enabled;
    const cleanup = await this.unregisterAll();
    if (!cleanup.allUnregistered) {
      this.status = "error";
      this.lastError = `主页 MCP 关闭失败，能力未能完全注销：${cleanup.errors.map(({ name, error }) => `${name}: ${safeErrorSummary(error)}`).join("；")}`.slice(0, 300);
      return this.getSnapshot();
    }

    try {
      await this.saveSettingsAndVerify(false);
      this.enabled = false;
      this.status = "disabled";
      this.lastError = null;
      this.cancelReconcileTimer?.();
      this.cancelReconcileTimer = null;
    } catch (error) {
      this.enabled = previousEnabled;
      this.status = "error";
      this.lastError = `主页 MCP 关闭失败，设置未能确认保存：${safeErrorSummary(error)}`;
      if (previousEnabled && this.entitlementAvailable) {
        try {
          await this.registerAll();
        } catch (recoveryError) {
          this.lastError = `${this.lastError}；能力恢复失败：${safeErrorSummary(recoveryError)}`.slice(0, 300);
        }
      }
    }
    return this.getSnapshot();
  }

  private async registerAll(): Promise<void> {
    try {
      this.registered = await registerHomepageMcpCapabilities(
        this.options.agent,
        this.options.registry,
        {
          isActive: () => this.isActive(),
          isEntitlementAvailable: () => this.readEntitlement(),
        },
      );
    } catch (error) {
      if (error instanceof HomepageMcpCapabilityRegistrationError) {
        this.registered = error.registered;
      }
      throw error;
    }
  }

  private unregisterAll(): Promise<UnregisterHomepageMcpCapabilitiesResult> {
    return unregisterHomepageMcpCapabilities(this.options.agent, this.registered).then((result) => {
      this.registered = result.registered;
      return result;
    });
  }

  private isActive(): boolean {
    return this.enabled
      && this.entitlementAvailable
      && this.registered.names.length === EXPECTED_HOMEPAGE_MCP_CAPABILITY_COUNT
      && this.registered.records.length === EXPECTED_HOMEPAGE_MCP_CAPABILITY_COUNT
      && HOMEPAGE_MCP_CAPABILITY_NAMES.every((name, index) => this.registered.names[index] === name);
  }

  private async loadSettings(): Promise<HomepageMcpServerSettings> {
    const raw = this.options.storage.getStrict
      ? await this.options.storage.getStrict(HOMEPAGE_MCP_SERVER_SETTINGS_STORAGE_KEY)
      : await this.options.storage.get(HOMEPAGE_MCP_SERVER_SETTINGS_STORAGE_KEY);
    if (raw === null) {
      return {
        schemaVersion: HOMEPAGE_MCP_SERVER_SETTINGS_SCHEMA_VERSION,
        enabled: false,
      };
    }
    return parseSettings(JSON.parse(raw));
  }

  private async saveSettingsAndVerify(enabled: boolean): Promise<void> {
    const settings: HomepageMcpServerSettings = {
      schemaVersion: HOMEPAGE_MCP_SERVER_SETTINGS_SCHEMA_VERSION,
      enabled,
    };
    await this.options.storage.set(
      HOMEPAGE_MCP_SERVER_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings),
    );
    const raw = this.options.storage.getStrict
      ? await this.options.storage.getStrict(HOMEPAGE_MCP_SERVER_SETTINGS_STORAGE_KEY)
      : await this.options.storage.get(HOMEPAGE_MCP_SERVER_SETTINGS_STORAGE_KEY);
    if (raw === null) throw new Error("保存后未找到主页 MCP 设置");
    const verified = parseSettings(JSON.parse(raw));
    if (verified.enabled !== enabled) {
      throw new Error("保存后的主页 MCP 设置与请求不一致");
    }
  }

  private async readEntitlement(): Promise<boolean> {
    try {
      return (await this.options.isEntitlementAvailable()) === true;
    } catch {
      return false;
    }
  }

  private scheduleReconcile(): void {
    this.cancelReconcileTimer?.();
    this.cancelReconcileTimer = null;
    if (!this.enabled || this.shuttingDown) return;
    this.cancelReconcileTimer = this.options.timeout(() => {
      this.cancelReconcileTimer = null;
      void this.reconcile().catch((error) => {
        this.status = "error";
        this.lastError = safeErrorSummary(error);
        this.options.log?.error?.({ status: "homepage_mcp_reconcile_failed", message: this.lastError });
        this.scheduleReconcile();
      });
    }, HOMEPAGE_MCP_RECONCILE_INTERVAL_MS);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}

function emptyRegisteredCapabilities(): RegisteredHomepageMcpCapabilities {
  return { names: [], records: [] };
}

function parseSettings(value: unknown): HomepageMcpServerSettings {
  if (!isPlainRecord(value)) throw new Error("主页 MCP 设置必须是普通对象");
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== "enabled" || keys[1] !== "schemaVersion") {
    throw new Error("主页 MCP 设置字段无效");
  }
  if (value.schemaVersion !== HOMEPAGE_MCP_SERVER_SETTINGS_SCHEMA_VERSION) {
    throw new Error("主页 MCP 设置 schemaVersion 必须为 1");
  }
  if (typeof value.enabled !== "boolean") {
    throw new Error("主页 MCP 设置 enabled 必须是 boolean");
  }
  return {
    schemaVersion: HOMEPAGE_MCP_SERVER_SETTINGS_SCHEMA_VERSION,
    enabled: value.enabled,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeErrorSummary(error: unknown): string {
  const text = String(error instanceof Error ? error.message : error ?? "未知错误")
    .replace(/[\r\n]+/g, " ")
    .trim();
  if (!text) return "未知错误";
  if (/(api[_ -]?key|authorization|bearer|access[_ -]?token|refresh[_ -]?token|password|secret|license)/i.test(text)) {
    return "错误详情包含敏感信息，已隐藏";
  }
  return text.slice(0, 240);
}
