import type { Plugin } from "siyuan";
import { isHomepageEntitlementGranted } from "@/features/entitlement/homepage-entitlement";
import { getCurrentDeviceViewContext } from "@/homepage/deviceView/deviceViewContext";
import { ensureCurrentDeviceViewReady } from "@/homepage/deviceView/deviceViewReadiness";
import {
  readDeviceViewSettings,
  updateDeviceViewSettings,
} from "@/homepage/deviceView/deviceViewStorage";
import type { DeviceViewContext } from "@/homepage/deviceView/deviceViewTypes";
import { normalizeHomepageAppearanceConfig } from "@/homepage/theme/runtime/appearanceConfig";
import { homepageThemeRegistry } from "@/homepage/theme/registry/themeRegistry";
import { getButtonActionMeta, isCoreButton, normalizeButtons } from "@/homepage/homepageSetting/buttonSettings";
import {
  ADVANCED_REQUIRED_SETTING_FIELDS,
  normalizeButtonOps,
  normalizeSettingsPatch,
  SETTINGS_FIELD_KEYS,
  validateSettingsResourceCoherence,
  type HomepageButtonRow,
} from "./homepage-settings-whitelist";

export { SETTINGS_FIELD_LABELS } from "./homepage-settings-whitelist";

export class HomepageSettingsServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly recoverable = true,
  ) {
    super(message);
    this.name = "HomepageSettingsServiceError";
  }
}

export interface HomepageSettingsSnapshot {
  status: "ok";
  surface: "desktop-homepage";
  viewRevision: number;
  advancedEnabled: boolean;
  settings: Record<string, unknown>;
  availableThemes: Array<{ id: string; name: string; access: string; preferred: boolean; available: boolean }>;
  editableFields: string[];
  advancedRequiredFields: string[];
}

export interface HomepageSettingsUpdateResult {
  status: "ok";
  surface: "desktop-homepage";
  viewRevision: number;
  changed: boolean;
  updatedFields: string[];
  summary: string;
}

export interface HomepageButtonsSnapshot {
  status: "ok";
  surface: "desktop-homepage";
  viewRevision: number;
  buttons: HomepageButtonRow[];
  coreActions: Array<{ action: string; title: string; description: string }>;
}

export interface HomepageButtonsUpdateResult {
  status: "ok";
  surface: "desktop-homepage";
  viewRevision: number;
  changed: boolean;
  summary: string;
}

interface HomepageSettingsServiceDeps {
  getPlugin(): Plugin;
}

function sanitizeSettingsReadValue(key: string, value: unknown): unknown {
  if (key !== "bannerRemoteUrl" && key !== "backgroundImageRemoteUrl") return value;
  if (typeof value !== "string") return value;
  try {
    const url = new URL(value);
    for (const queryKey of Array.from(url.searchParams.keys())) {
      if (/token|key|password|secret|authorization|cookie|credential/i.test(queryKey)) {
        url.searchParams.set(queryKey, "[REDACTED]");
      }
    }
    return url.toString().replace(/%5BREDACTED%5D/gi, "[REDACTED]");
  } catch {
    return value;
  }
}

export class HomepageSettingsService {
  constructor(private readonly deps: HomepageSettingsServiceDeps) {}

  /** 轻量可用性检查：只确认插件实例与设备视图 context 可解析，不做 IO。 */
  isAvailable(): boolean {
    try {
      getCurrentDeviceViewContext(this.deps.getPlugin(), "desktop-homepage");
      return true;
    } catch {
      return false;
    }
  }

  private async readView() {
    const plugin = this.deps.getPlugin();
    const context = getCurrentDeviceViewContext(plugin, "desktop-homepage");
    try {
      await ensureCurrentDeviceViewReady(context);
      const view = await readDeviceViewSettings(context);
      if (!view) throw new Error("桌面主页 view.json 缺失");
      return { context, view };
    } catch (error) {
      throw new HomepageSettingsServiceError(
        "homepage_not_ready",
        error instanceof Error ? error.message : "主页数据暂不可用。",
      );
    }
  }

  async getSettings(): Promise<HomepageSettingsSnapshot> {
    const { view } = await this.readView();
    const advancedEnabled = isHomepageEntitlementGranted();
    const appearance = normalizeHomepageAppearanceConfig(view.config.homepageAppearance);
    const settings: Record<string, unknown> = {};
    for (const key of SETTINGS_FIELD_KEYS) {
      if (key === "preferredThemeId") {
        settings.preferredThemeId = appearance.preferredThemeId;
        continue;
      }
      if (key in view.config) settings[key] = sanitizeSettingsReadValue(key, view.config[key]);
    }
    const availableThemes = homepageThemeRegistry.list("desktop-homepage").map((theme) => ({
      id: theme.id,
      name: theme.name,
      access: theme.access,
      preferred: theme.id === appearance.preferredThemeId,
      available: theme.access === "free" || advancedEnabled,
    }));
    return {
      status: "ok",
      surface: "desktop-homepage",
      viewRevision: view.revision,
      advancedEnabled,
      settings,
      availableThemes,
      editableFields: [...SETTINGS_FIELD_KEYS],
      advancedRequiredFields: [...ADVANCED_REQUIRED_SETTING_FIELDS, "statusTextMode=ai", "bannerGlobalType=bing", "vip 主题"],
    };
  }

  /** view.json 变更提交：内置 revision CAS 与写后校验，冲突映射为 view_revision_conflict。 */
  private async commitViewMutation(
    context: DeviceViewContext,
    mutation: (config: Record<string, unknown>) => Record<string, unknown>,
    expectedViewRevision: number,
  ): Promise<void> {
    try {
      await updateDeviceViewSettings(context, mutation, { expectedRevision: expectedViewRevision });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("并发更新")) {
        throw new HomepageSettingsServiceError("view_revision_conflict", "主页设置已被并发更新，请重新读取后再操作。");
      }
      throw new HomepageSettingsServiceError("settings_write_failed", `主页设置写入失败：${message}`, false);
    }
  }

  /** 主题切换校验：主题必须已注册、支持桌面主页；vip 主题需要高级功能。 */
  private validateThemeId(themeId: string, advancedEnabled: boolean): void {
    const theme = homepageThemeRegistry.get(themeId);
    if (!theme || !theme.surfaces.includes("desktop-homepage")) {
      throw new Error(`主题 ${themeId} 不存在或不支持桌面主页`);
    }
    if (theme.access === "vip" && !advancedEnabled) {
      throw new Error(`主题 ${theme.name} 需要高级功能`);
    }
  }

  async updateSettings(patch: Record<string, unknown>, expectedViewRevision: number): Promise<HomepageSettingsUpdateResult> {
    const { context, view } = await this.readView();
    const advancedEnabled = isHomepageEntitlementGranted();
    const normalized = normalizeSettingsPatch(
      patch,
      advancedEnabled,
      (themeId, advanced) => this.validateThemeId(themeId, advanced),
    );
    if (view.revision !== expectedViewRevision) {
      throw new HomepageSettingsServiceError(
        "view_revision_conflict",
        `主页设置已变化：预期 revision ${expectedViewRevision}，当前为 ${view.revision}。`,
      );
    }
    validateSettingsResourceCoherence(normalized, view.config);
    // 无变化写入：不提交、不派发事件、不产生假 updatedFields。
    const currentAppearance = normalizeHomepageAppearanceConfig(view.config.homepageAppearance);
    const unchanged = Object.entries(normalized).every(([key, value]) => {
      if (key === "preferredThemeId") return currentAppearance.preferredThemeId === value;
      return JSON.stringify(view.config[key]) === JSON.stringify(value);
    });
    if (unchanged) {
      return {
        status: "ok",
        surface: "desktop-homepage",
        viewRevision: view.revision,
        changed: false,
        updatedFields: [],
        summary: "主页设置未变化，无需写入",
      };
    }
    const themeOnly = Object.keys(normalized).every((key) => key === "preferredThemeId");
    await this.commitViewMutation(context, (config) => {
      const next = { ...config };
      for (const [key, value] of Object.entries(normalized)) {
        if (key === "preferredThemeId") {
          next.homepageAppearance = { ...normalizeHomepageAppearanceConfig(next.homepageAppearance), preferredThemeId: value };
        } else {
          next[key] = value;
        }
      }
      return next;
    }, expectedViewRevision);
    const verified = await readDeviceViewSettings(context);
    if (!verified) throw new HomepageSettingsServiceError("write_not_committed", "主页设置写后验证失败。", false);
    for (const [key, value] of Object.entries(normalized)) {
      const actual = key === "preferredThemeId"
        ? normalizeHomepageAppearanceConfig(verified.config.homepageAppearance).preferredThemeId
        : verified.config[key];
      if (JSON.stringify(actual) !== JSON.stringify(value)) {
        throw new HomepageSettingsServiceError("write_not_committed", `主页设置字段 ${key} 写后验证失败。`, false);
      }
    }
    this.dispatchSettingsSaved(themeOnly);
    return {
      status: "ok",
      surface: "desktop-homepage",
      viewRevision: verified.revision,
      changed: true,
      updatedFields: Object.keys(normalized),
      summary: "主页设置已更新",
    };
  }

  async listButtons(): Promise<HomepageButtonsSnapshot> {
    const { view } = await this.readView();
    const buttons = normalizeButtons((view.config.buttonsList as HomepageButtonRow[]) ?? []);
    const coreActions = buttons
      .filter((button) => button.action)
      .map((button) => {
        const meta = getButtonActionMeta(button);
        return { action: button.action!, title: meta?.title ?? button.label, description: meta?.description ?? "" };
      });
    return {
      status: "ok",
      surface: "desktop-homepage",
      viewRevision: view.revision,
      buttons,
      coreActions,
    };
  }

  async updateButtons(rawOps: unknown, expectedViewRevision: number): Promise<HomepageButtonsUpdateResult> {
    const { context, view } = await this.readView();
    if (view.revision !== expectedViewRevision) {
      throw new HomepageSettingsServiceError(
        "view_revision_conflict",
        `主页设置已变化：预期 revision ${expectedViewRevision}，当前为 ${view.revision}。`,
      );
    }
    const current = normalizeButtons((view.config.buttonsList as HomepageButtonRow[]) ?? []);
    const next = normalizeButtonOps(current, rawOps, (button) => isCoreButton(button));
    // 无变化写入：不提交、不派发事件。
    if (JSON.stringify(next) === JSON.stringify(current)) {
      return {
        status: "ok",
        surface: "desktop-homepage",
        viewRevision: view.revision,
        changed: false,
        summary: "快捷按钮未变化，无需写入",
      };
    }
    await this.commitViewMutation(context, (config) => ({ ...config, buttonsList: next }), expectedViewRevision);
    const verified = await readDeviceViewSettings(context);
    if (!verified) throw new HomepageSettingsServiceError("write_not_committed", "快捷按钮写后验证失败。", false);
    if (JSON.stringify(normalizeButtons(verified.config.buttonsList as HomepageButtonRow[] ?? [])) !== JSON.stringify(next)) {
      throw new HomepageSettingsServiceError("write_not_committed", "快捷按钮写后验证失败。", false);
    }
    this.dispatchSettingsSaved(false);
    return {
      status: "ok",
      surface: "desktop-homepage",
      viewRevision: verified.revision,
      changed: true,
      summary: "快捷按钮已更新",
    };
  }

  /** 通知已打开的主页热应用本次设置变更；themeOnly 走轻量外观刷新路径。 */
  private dispatchSettingsSaved(themeOnly: boolean): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("homepage-settings-saved", {
      ...(themeOnly ? { detail: { appearanceOnly: true } } : {}),
    }));
  }
}
