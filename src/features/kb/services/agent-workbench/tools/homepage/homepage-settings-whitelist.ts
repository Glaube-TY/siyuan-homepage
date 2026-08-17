/**
 * 主页设置 Agent 工具的字段白名单与纯校验逻辑。
 * 零导入：保证可在 Node 验证脚本中直接加载；主题与内置按钮判定由调用方注入。
 */

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const BING_API_TYPES = new Set([
  "POD_UHD", "POD_1K", "POD_Normal", "rand_uhd", "rand_1K", "rand_Normal", "ECY1", "RAND1",
]);

/** 需要高级功能的设置字段（与设置 UI 的会员门槛一致）。 */
export const ADVANCED_REQUIRED_SETTING_FIELDS: readonly string[] = [
  "footerEnabled", "footerContent",
  "mouseGlobalEnabled", "MouseTrailEnabled", "ClickEffectEnabled", "ClickEffectContent",
  "backgroundImageEnabled", "backgroundImageGlobalEnabled", "backgroundImageType",
  "backgroundImageRemoteUrl", "backgroundImageOpacity", "backgroundImageBlur",
  "bingApiType",
];

/** Agent 可读写的主页设置白名单（不含 base64 图片数据等大字段）。 */
export const SETTINGS_FIELD_KEYS: readonly string[] = [
  "bannerEnabled", "bannerGlobalType", "bingApiType", "bannerType", "bannerRemoteUrl", "bannerHeight",
  "bannerTitleColor", "bannerStatusColor", "bannerButtonColor",
  "bannerGlassEnabled", "bannerGlassColorMode", "bannerGlassColor", "bannerGlassOpacity", "bannerGlassBlur",
  "customTitle", "showIcon", "titleIconType", "TitleIconEmoji", "homepageTitleAlign",
  "footerEnabled", "footerContent",
  "mouseGlobalEnabled", "MouseTrailEnabled", "ClickEffectEnabled", "ClickEffectContent",
  "backgroundImageEnabled", "backgroundImageGlobalEnabled", "backgroundImageType",
  "backgroundImageRemoteUrl", "backgroundImageOpacity", "backgroundImageBlur",
  "FallEffectsEnabled", "GlobalFallingEffectsEnabled", "FallingIcon", "FallingDensity", "FallingSpeed",
  "statsInfoText", "statusTextMode",
  "preferredThemeId",
];

export const SETTINGS_FIELD_LABELS: Record<string, string> = {
  bannerEnabled: "横幅开关",
  bannerGlobalType: "横幅来源类型",
  bingApiType: "Bing 壁纸接口",
  bannerType: "横幅图片来源",
  bannerRemoteUrl: "横幅远程图片地址",
  bannerHeight: "横幅高度",
  bannerTitleColor: "横幅标题颜色",
  bannerStatusColor: "横幅状态文字颜色",
  bannerButtonColor: "横幅按钮颜色",
  bannerGlassEnabled: "横幅毛玻璃",
  bannerGlassColorMode: "毛玻璃颜色模式",
  bannerGlassColor: "毛玻璃颜色",
  bannerGlassOpacity: "毛玻璃不透明度",
  bannerGlassBlur: "毛玻璃模糊度",
  customTitle: "自定义标题",
  showIcon: "显示标题图标",
  titleIconType: "标题图标类型",
  TitleIconEmoji: "标题图标表情",
  homepageTitleAlign: "标题对齐",
  footerEnabled: "显示页脚",
  footerContent: "页脚内容",
  mouseGlobalEnabled: "鼠标特效全局应用",
  MouseTrailEnabled: "鼠标跟随特效",
  ClickEffectEnabled: "点击特效",
  ClickEffectContent: "点击特效内容",
  backgroundImageEnabled: "背景图开关",
  backgroundImageGlobalEnabled: "背景图全局应用",
  backgroundImageType: "背景图来源",
  backgroundImageRemoteUrl: "背景图远程地址",
  backgroundImageOpacity: "背景图不透明度",
  backgroundImageBlur: "背景图模糊度",
  FallEffectsEnabled: "飘落特效开关",
  GlobalFallingEffectsEnabled: "飘落特效全局应用",
  FallingIcon: "飘落图形",
  FallingDensity: "飘落密度",
  FallingSpeed: "飘落速度",
  statsInfoText: "状态语文本",
  statusTextMode: "状态语模式",
  preferredThemeId: "首选主题",
};

/** 主题校验器：非法主题必须抛错（错误信息会透传给 Agent）。 */
export type HomepageThemeValidator = (themeId: string, advancedEnabled: boolean) => void;

/** 生成 update_settings.patch 的精确 JSON Schema（与执行期白名单一致，供 agent_tool_help 与预览使用）。 */
export function buildSettingsPatchJsonSchema(): Record<string, unknown> {
  const color = { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" };
  const url = { type: "string", description: "不含凭据的 http/https 地址。" };
  return {
    type: "object", additionalProperties: false, minProperties: 1,
    properties: {
      bannerEnabled: { type: "boolean" },
      bannerGlobalType: { type: "string", enum: ["custom", "bing"], description: "bing 需要高级功能。" },
      bingApiType: { type: "string", enum: ["POD_UHD", "POD_1K", "POD_Normal", "rand_uhd", "rand_1K", "rand_Normal", "ECY1", "RAND1"] },
      bannerType: { type: "string", enum: ["local", "remote"] },
      bannerRemoteUrl: url,
      bannerHeight: { type: "string", description: "100-800 的整数，单位 px。" },
      bannerTitleColor: color, bannerStatusColor: color, bannerButtonColor: color,
      bannerGlassEnabled: { type: "boolean" },
      bannerGlassColorMode: { type: "string", enum: ["theme", "custom"] },
      bannerGlassColor: color,
      bannerGlassOpacity: { type: "integer", minimum: 0, maximum: 80 },
      bannerGlassBlur: { type: "integer", minimum: 0, maximum: 40 },
      customTitle: { type: "string", maxLength: 200 },
      showIcon: { type: "boolean" },
      titleIconType: { type: "string", enum: ["emoji", "image"] },
      TitleIconEmoji: { type: "string", maxLength: 32 },
      homepageTitleAlign: { type: "string", enum: ["left", "center", "right"] },
      footerEnabled: { type: "boolean", description: "需要高级功能。" },
      footerContent: { type: "string", maxLength: 2000, description: "支持 HTML；需要高级功能。" },
      mouseGlobalEnabled: { type: "boolean", description: "需要高级功能。" },
      MouseTrailEnabled: { type: "boolean", description: "需要高级功能。" },
      ClickEffectEnabled: { type: "boolean", description: "需要高级功能。" },
      ClickEffectContent: { type: "string", maxLength: 100, description: "需要高级功能。" },
      backgroundImageEnabled: { type: "boolean", description: "需要高级功能。" },
      backgroundImageGlobalEnabled: { type: "boolean", description: "需要高级功能。" },
      backgroundImageType: { type: "string", enum: ["local", "remote"], description: "需要高级功能。" },
      backgroundImageRemoteUrl: { ...url, description: "需要高级功能。" },
      backgroundImageOpacity: { type: "integer", minimum: 0, maximum: 100, description: "需要高级功能。" },
      backgroundImageBlur: { type: "integer", minimum: 0, maximum: 40, description: "需要高级功能。" },
      FallEffectsEnabled: { type: "boolean" },
      GlobalFallingEffectsEnabled: { type: "boolean" },
      FallingIcon: { type: "string", maxLength: 50 },
      FallingDensity: { type: "string", enum: ["low", "medium", "high"] },
      FallingSpeed: { type: "string", enum: ["low", "medium", "high"] },
      statsInfoText: { type: "string", maxLength: 500 },
      statusTextMode: { type: "string", enum: ["custom", "ai"], description: "ai 需要高级功能。" },
      preferredThemeId: { type: "string", description: "get_settings.availableThemes 中的真实主题 ID。" },
    },
  };
}

/** 生成 update_buttons.ops 的精确 JSON Schema（与执行期校验一致；不含 add 操作）。 */
export function buildButtonsOpsJsonSchema(): Record<string, unknown> {
  return {
    type: "array", minItems: 1,
    items: {
      type: "object", additionalProperties: false,
      properties: {
        op: { type: "string", enum: ["toggle", "rename", "remove", "reorder"] },
        id: { type: "integer", description: "toggle/rename/remove 必填，来自 list_buttons。" },
        checked: { type: "boolean", description: "toggle 必填。" },
        label: { type: "string", minLength: 1, maxLength: 20, description: "rename 必填；只能重命名现有按钮。" },
        orderedIds: { type: "array", items: { type: "integer" }, description: "reorder 必填；无重复地包含全部现有按钮 ID。" },
      },
    },
  };
}

/**
 * 资源配套校验：patch 与当前配置的关系约束。
 * - remote 图片来源必须具有合法 remote URL（patch 中或当前配置中）。
 * - titleIconType=image 不能在没有现有图片数据时制造不可用状态。
 */
export function validateSettingsResourceCoherence(
  patch: Record<string, unknown>,
  current: Record<string, unknown>,
): void {
  if (patch.bannerType === "remote" || (patch.bannerGlobalType === "custom" && patch.bannerType === undefined && current.bannerType === "remote")) {
    const url = patch.bannerRemoteUrl ?? current.bannerRemoteUrl;
    if (typeof url !== "string" || !url) throw new Error("横幅图片来源为 remote 时必须提供合法的 bannerRemoteUrl");
  }
  if (patch.backgroundImageType === "remote" || (patch.backgroundImageType === undefined && current.backgroundImageType === "remote")) {
    if (patch.backgroundImageType === "remote") {
      const url = patch.backgroundImageRemoteUrl ?? current.backgroundImageRemoteUrl;
      if (typeof url !== "string" || !url) throw new Error("背景图来源为 remote 时必须提供合法的 backgroundImageRemoteUrl");
    }
  }
  if (patch.titleIconType === "image") {
    const hasImage = typeof current.TitleIconImage === "string" && current.TitleIconImage.length > 0;
    if (!hasImage) throw new Error("当前没有标题图标图片数据，不能切换为 image 类型；请先在设置中上传标题图标");
  }
}

/**
 * 校验标题图标 Emoji 输入：只接受真实 Emoji/字符或合法 Unicode 编码串（hex 或 hex-hex...）。
 * 拒绝 HTML 标签、事件属性、实体、引号与控制字符，防止 {@html} 渲染注入。
 */
export function validateTitleIconEmoji(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("字段 TitleIconEmoji 必须是文本");
  const text = value.trim();
  if (text.length > 32) throw new Error("字段 TitleIconEmoji 过长");
  if (/[<>&"'`]/.test(text)) {
    throw new Error("字段 TitleIconEmoji 不允许包含 HTML 特殊字符或控制字符");
  }
  if (Array.from(text).some((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f;
  })) {
    throw new Error("字段 TitleIconEmoji 不允许包含 HTML 特殊字符或控制字符");
  }
  // Unicode 编码串（如 1f600、1f468-200d-1f4bb）必须能解析为合法码点。
  if (/^[0-9a-fA-F]+(-[0-9a-fA-F]+)*$/.test(text)) {
    for (const part of text.split("-")) {
      const codePoint = Number.parseInt(part, 16);
      if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
        throw new Error("字段 TitleIconEmoji 包含非法 Unicode 码点");
      }
    }
  }
  return text;
}

function assertHttpUrl(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) throw new Error(`字段 ${field} 必须是 http/https 地址`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`字段 ${field} 不是合法 URL`);
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error(`字段 ${field} 只允许不含凭据的 http/https 地址`);
  }
  return value;
}

function assertIn(value: unknown, allowed: readonly string[], field: string): string {
  const text = String(value);
  if (!allowed.includes(text)) throw new Error(`字段 ${field} 必须在 ${allowed.join("/")} 范围内`);
  return text;
}

function assertIntegerInRange(value: unknown, min: number, max: number, field: string): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`字段 ${field} 必须是 ${min} 到 ${max} 的整数`);
  }
  return value as number;
}

/**
 * 校验并规范化设置 patch。纯函数，可在 Node 验证脚本中直接测试。
 * preferredThemeId 通过注入的 validateTheme 校验（生产环境注入主题注册表检查）。
 */
export function normalizeSettingsPatch(
  patch: Record<string, unknown>,
  advancedEnabled: boolean,
  validateTheme?: HomepageThemeValidator,
): Record<string, unknown> {
  const keys = Object.keys(patch);
  if (keys.length === 0) throw new Error("patch 至少包含一个设置字段");
  const output: Record<string, unknown> = {};
  for (const key of keys) {
    if (!SETTINGS_FIELD_KEYS.includes(key)) throw new Error(`字段 ${key} 不在主页设置 Agent 白名单中`);
    if (ADVANCED_REQUIRED_SETTING_FIELDS.includes(key) && !advancedEnabled) {
      throw new Error(`字段 ${key} 需要高级功能`);
    }
    const value = patch[key];
    switch (key) {
      case "bannerEnabled": case "bannerGlassEnabled": case "showIcon":
      case "footerEnabled": case "mouseGlobalEnabled": case "MouseTrailEnabled": case "ClickEffectEnabled":
      case "backgroundImageEnabled": case "backgroundImageGlobalEnabled":
      case "FallEffectsEnabled": case "GlobalFallingEffectsEnabled":
        if (typeof value !== "boolean") throw new Error(`字段 ${key} 必须是布尔值`);
        output[key] = value;
        break;
      case "bannerGlobalType": {
        const text = assertIn(value, ["custom", "bing"], key);
        if (text === "bing" && !advancedEnabled) throw new Error("Bing 每日一图需要高级功能");
        output[key] = text;
        break;
      }
      case "bingApiType":
        output[key] = assertIn(value, [...BING_API_TYPES], key);
        break;
      case "bannerType":
        output[key] = assertIn(value, ["local", "remote"], key);
        break;
      case "bannerRemoteUrl":
        output[key] = assertHttpUrl(value, key);
        break;
      case "bannerHeight": {
        const height = assertIntegerInRange(Number(value), 100, 800, key);
        output[key] = String(height);
        break;
      }
      case "bannerTitleColor": case "bannerStatusColor": case "bannerButtonColor":
      case "bannerGlassColor": {
        if (typeof value !== "string" || !HEX_COLOR.test(value)) throw new Error(`字段 ${key} 必须是 #RRGGBB 颜色`);
        output[key] = value.toLowerCase();
        break;
      }
      case "bannerGlassColorMode":
        output[key] = assertIn(value, ["theme", "custom"], key);
        break;
      case "bannerGlassOpacity":
        output[key] = assertIntegerInRange(value, 0, 80, key);
        break;
      case "bannerGlassBlur":
        output[key] = assertIntegerInRange(value, 0, 40, key);
        break;
      case "customTitle": {
        if (typeof value !== "string" || value.length > 200) throw new Error("字段 customTitle 必须是不超过 200 字符的文本");
        output[key] = value;
        break;
      }
      case "titleIconType":
        output[key] = assertIn(value, ["emoji", "image"], key);
        break;
      case "TitleIconEmoji":
        output[key] = validateTitleIconEmoji(value);
        break;
      case "homepageTitleAlign":
        output[key] = assertIn(value, ["left", "center", "right"], key);
        break;
      case "footerContent": {
        if (typeof value !== "string" || value.length > 2000) throw new Error("字段 footerContent 必须是不超过 2000 字符的文本");
        output[key] = value;
        break;
      }
      case "backgroundImageType":
        output[key] = assertIn(value, ["local", "remote"], key);
        break;
      case "backgroundImageRemoteUrl":
        output[key] = assertHttpUrl(value, key);
        break;
      case "backgroundImageOpacity":
        output[key] = assertIntegerInRange(value, 0, 100, key);
        break;
      case "backgroundImageBlur":
        output[key] = assertIntegerInRange(value, 0, 40, key);
        break;
      case "FallingDensity": case "FallingSpeed":
        output[key] = assertIn(value, ["low", "medium", "high"], key);
        break;
      case "FallingIcon": {
        if (typeof value !== "string" || !value || value.length > 50) throw new Error("字段 FallingIcon 必须是不超过 50 字符的文本");
        output[key] = value;
        break;
      }
      case "ClickEffectContent": {
        if (typeof value !== "string" || value.length > 100) throw new Error("字段 ClickEffectContent 必须是不超过 100 字符的文本");
        output[key] = value;
        break;
      }
      case "statsInfoText": {
        if (typeof value !== "string" || value.length > 500) throw new Error("字段 statsInfoText 必须是不超过 500 字符的文本");
        output[key] = value;
        break;
      }
      case "statusTextMode": {
        const text = assertIn(value, ["custom", "ai"], key);
        if (text === "ai" && !advancedEnabled) throw new Error("AI 状态语需要高级功能");
        output[key] = text;
        break;
      }
      case "preferredThemeId": {
        if (typeof value !== "string" || !value) throw new Error("字段 preferredThemeId 必须是主题 ID");
        if (validateTheme) {
          validateTheme(value, advancedEnabled);
        } else {
          throw new Error(`主题 ${value} 不存在或不支持桌面主页`);
        }
        output[key] = value;
        break;
      }
      default:
        throw new Error(`字段 ${key} 不在主页设置 Agent 白名单中`);
    }
  }
  return output;
}

/** 快捷按钮更新操作：一次 update_buttons 可提交多个操作，按顺序应用。
 * 注意：不提供 add——Agent 无法配置安全有效的 shortcut/action，避免创建可见但无功能的按钮。 */
export type HomepageButtonOp =
  | { op: "toggle"; id: number; checked: boolean }
  | { op: "rename"; id: number; label: string }
  | { op: "remove"; id: number }
  | { op: "reorder"; orderedIds: number[] };

/** 快捷按钮最小结构（与按钮注册表/设置 UI 结构兼容）。 */
export interface HomepageButtonRow {
  id: number;
  label: string;
  checked: boolean;
  shortcut?: string;
  order: number;
  action?: string;
}

function assertButtonLabel(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 20) {
    throw new Error("按钮名称必须是 1 到 20 个字符的文本");
  }
  return value.trim();
}

/**
 * 校验并应用快捷按钮操作序列。纯函数，可在 Node 验证脚本中直接测试。
 * 内置核心按钮只允许切换显示，不允许重命名或删除；isCore 由调用方注入真实判定。
 */
export function normalizeButtonOps(
  buttons: readonly HomepageButtonRow[],
  rawOps: unknown,
  isCore: (button: HomepageButtonRow) => boolean = (button) => Boolean(button.action),
): HomepageButtonRow[] {
  if (!Array.isArray(rawOps) || rawOps.length === 0) {
    throw new Error("ops 必须是非空操作数组");
  }
  let current: HomepageButtonRow[] = buttons.map((item) => ({ ...item }));
  const findButton = (id: number): HomepageButtonRow | undefined => current.find((item) => item.id === id);
  const ensureCustom = (id: number) => {
    const button = findButton(id);
    if (!button) throw new Error(`按钮 ${id} 不存在`);
    if (isCore(button)) throw new Error(`内置按钮 ${button.label} 只允许切换显示`);
    return button;
  };
  for (const raw of rawOps) {
    if (!raw || typeof raw !== "object") throw new Error("每个按钮操作必须是对象");
    const op = raw as Record<string, unknown>;
    switch (op.op) {
      case "toggle": {
        if (typeof op.id !== "number" || typeof op.checked !== "boolean") throw new Error("toggle 操作需要数字 id 和布尔 checked");
        const button = findButton(op.id);
        if (!button) throw new Error(`按钮 ${op.id} 不存在`);
        const checked = op.checked;
        current = current.map((item) => item.id === op.id ? { ...item, checked } : item);
        break;
      }
      case "rename": {
        if (typeof op.id !== "number") throw new Error("rename 操作需要数字 id");
        ensureCustom(op.id);
        const label = assertButtonLabel(op.label);
        current = current.map((item) => item.id === op.id ? { ...item, label } : item);
        break;
      }
      case "remove": {
        if (typeof op.id !== "number") throw new Error("remove 操作需要数字 id");
        ensureCustom(op.id);
        current = current.filter((item) => item.id !== op.id);
        break;
      }
      case "reorder": {
        if (!Array.isArray(op.orderedIds) || op.orderedIds.length !== current.length
          || op.orderedIds.some((id) => typeof id !== "number")
          || new Set(op.orderedIds).size !== current.length
          || op.orderedIds.some((id) => !findButton(id))) {
          throw new Error("reorder 操作的 orderedIds 必须无重复地包含全部现有按钮 ID");
        }
        const byId = new Map(current.map((item) => [item.id, item]));
        current = (op.orderedIds as number[]).map((id, index) => ({ ...byId.get(id)!, order: index }));
        break;
      }
      default:
        throw new Error(`不支持的按钮操作 ${String(op.op)}`);
    }
  }
  return current;
}
