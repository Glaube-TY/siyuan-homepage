<script lang="ts">
  import type { KbSettings, KbChatProviderConfig, KbChatModelConfig } from "../../../types/settings";
  import {
    getProviderPresetById,
    generateUniqueProviderId,
  } from "../../../constants/model-provider-presets";
  import { testChatModelConnection, testControlPlaneCompatibility, type ModelConnectionTestResult, type ControlPlaneCompatibilityTestResult } from "../../../services/qa/model-connection-test";
  import { discoverProviderModels } from "../../../services/qa/model-list-discovery";
  import {
    normalizeId,
    isUsableChatModel,
    resolveChatModelSelection,
    mergeDiscoveredChatModels,
    getChatModelKey,
    sanitizeChatProviders,
  } from "../../../services/settings/chat-provider-config";
  import ModelProviderList from "./model-provider-list.svelte";
  import ModelProviderModelsSection from "./model-provider-models-section.svelte";
  import ModelProviderEditorForm from "./model-provider-editor-form.svelte";

  export let settings: KbSettings;

  // 当前选中的 provider ID（用于编辑）
  let editingProviderId = normalizeId(settings.selectedChatProviderId);

  // 当前选中的 preset ID（用于添加 provider）
  let selectedPresetId = "";

  // 测试连接状态
  let testingModelKey = "";
  let testResults: Record<string, ModelConnectionTestResult> = {};

  // 自动操作测试状态
  let testingControlPlaneKey = "";
  let controlPlaneTestResults: Record<string, ControlPlaneCompatibilityTestResult> = {};

  // 刷新模型列表状态
  let refreshingProviderId = "";
  let refreshMessages: Record<string, string> = {};

  // 模型操作 inline message
  let modelActionMessage = "";
  let modelActionMessageType: "success" | "error" = "success";

  // 检查指定 provider 是否为当前使用的 provider
  function isCurrentProvider(providerId: string): boolean {
    return normalizeId(providerId) === normalizeId(settings.selectedChatProviderId);
  }

  // 检查指定 model 是否为当前使用的 model
  function isCurrentModel(providerId: string, modelId: string): boolean {
    return isCurrentProvider(providerId) && normalizeId(modelId) === normalizeId(settings.selectedChatModelId);
  }

  // 判断模型是否可用（provider 启用 + model 通过 isUsableChatModel 判定）
  function canUseModel(provider: KbChatProviderConfig, model: KbChatModelConfig): boolean {
    return provider.enabled !== false && isUsableChatModel(model);
  }

  // 获取"设为当前"按钮 title
  function getSelectModelTitle(provider: KbChatProviderConfig, model: KbChatModelConfig): string {
    if (!normalizeId(model.id)) return "模型 ID 为空，无法设为当前";
    if (isCurrentModel(provider.id, model.id)) return "已是当前使用模型";
    if (!canUseModel(provider, model)) return "提供商或模型已禁用，不能设为当前";
    return "设为当前使用模型";
  }

  // 判断模型是否正在测试连接
  function isTestingModel(providerId: string, modelId: string): boolean {
    return testingModelKey === getChatModelKey(normalizeId(providerId), normalizeId(modelId));
  }

  // 检查是否正在测试自动操作
  function isTestingControlPlane(providerId: string, modelId: string): boolean {
    return testingControlPlaneKey === getChatModelKey(normalizeId(providerId), normalizeId(modelId));
  }

  // 获取"测试自动操作"按钮 title
  function getTestControlPlaneTitle(provider: KbChatProviderConfig, model: KbChatModelConfig): string {
    if (isTestingControlPlane(provider.id, model.id)) return "测试中...";
    if (!normalizeId(model.id)) return "模型 ID 为空，无法测试";
    if (!canUseModel(provider, model)) return "提供商或模型已禁用，无法测试";
    return "测试这个模型是否适合自动操作（会消耗少量额度）";
  }

  // 获取"测试连接"按钮 title
  function getTestModelTitle(provider: KbChatProviderConfig, model: KbChatModelConfig): string {
    if (isTestingModel(provider.id, model.id)) return "测试中...";
    if (!normalizeId(model.id)) return "模型 ID 为空，无法测试连接";
    if (!canUseModel(provider, model)) return "提供商或模型已禁用，无法测试连接";
    return "测试连接（会消耗少量额度）";
  }

  // 获取所有 provider ID（用于生成唯一 ID）
  function getExistingProviderIds(): string[] {
    if (!Array.isArray(settings.chatProviders)) {
      return [];
    }
    return settings.chatProviders.map((p) => p.id);
  }

  // 获取正在编辑的 provider（纯函数，参数由响应式语句传入）
  function getEditingProvider(
    providersInput: KbChatProviderConfig[] | undefined,
    currentEditingProviderId: string,
    currentSelectedProviderId: string
  ): KbChatProviderConfig | undefined {
    const providers = Array.isArray(providersInput) ? providersInput : [];
    if (providers.length === 0) return undefined;

    const byEditingId = providers.find(
      (p) => normalizeId(p.id) === normalizeId(currentEditingProviderId)
    );
    if (byEditingId) return byEditingId;

    const bySelectedId = providers.find(
      (p) => normalizeId(p.id) === normalizeId(currentSelectedProviderId)
    );
    if (bySelectedId) return bySelectedId;

    return providers[0];
  }

  // 创建占位模型（空 id，禁用，不可设为当前）
  function createPlaceholderModel(): KbChatModelConfig {
    return {
      id: "",
      name: "请填写模型 ID",
      temperature: 0.3,
      default: false,
      enabled: false,
    };
  }

  // 设置正在编辑的 provider（不改变当前使用模型）
  function setEditingProvider(providerId: string) {
    const normalizedProviderId = normalizeId(providerId);
    const providers = Array.isArray(settings.chatProviders) ? settings.chatProviders : [];
    const provider = providers.find((p) => normalizeId(p.id) === normalizedProviderId);
    if (!provider) return;
    editingProviderId = normalizeId(provider.id);
    // 清空模型操作消息
    modelActionMessage = "";
  }

  // 统一选择 reconcilation helper
  // 所有 provider/model 增删改后，统一通过这个 helper 解析 selectedChatProviderId / selectedChatModelId
  function reconcileSelection(
    updatedProviders: KbChatProviderConfig[],
    preferredProviderId?: string,
    preferredModelId?: string
  ): { providerId: string; modelId: string } {
    return resolveChatModelSelection(updatedProviders, preferredProviderId, preferredModelId);
  }

  // 更新 provider
  function updateProvider(providerId: string, patch: Partial<KbChatProviderConfig>) {
    const normalizedProviderId = normalizeId(providerId);
    const provider = settings.chatProviders.find((p) => normalizeId(p.id) === normalizedProviderId);
    if (!provider) return;

    const patchedProviders = settings.chatProviders.map((p) =>
      normalizeId(p.id) === normalizedProviderId ? { ...p, ...patch } : p
    );

    const sanitizedProviders = sanitizeChatProviders(patchedProviders, 0.3);

    // 统一使用 reconcileSelection 解析选择
    const resolved = reconcileSelection(sanitizedProviders, settings.selectedChatProviderId, settings.selectedChatModelId);

    settings = {
      ...settings,
      chatProviders: sanitizedProviders,
      selectedChatProviderId: resolved.providerId,
      selectedChatModelId: resolved.modelId,
    };

    // 如果改动 baseUrl/apiKey/type/enabled 等关键字段，清理该 provider 下所有测试结果
    const affectsConnection =
      patch.baseUrl !== undefined ||
      patch.apiKey !== undefined ||
      patch.type !== undefined ||
      patch.enabled !== undefined;
    if (affectsConnection) {
      clearProviderTestResults(providerId);
    }
    modelActionMessage = "";
  }

  // 更新 model（使用 index 定位）
  function updateModel(providerId: string, modelIndex: number, patch: Partial<KbChatModelConfig>) {
    const normalizedProviderId = normalizeId(providerId);
    const provider = settings.chatProviders.find((p) => normalizeId(p.id) === normalizedProviderId);
    if (!provider) return;

    const oldModel = provider.models[modelIndex];
    if (!oldModel) return;

    const updatedModels = provider.models.map((m, idx) =>
      idx === modelIndex ? { ...m, ...patch } : m
    );

    const updatedProviders = settings.chatProviders.map((p) =>
      normalizeId(p.id) === normalizedProviderId ? { ...p, models: updatedModels } : p
    );

    // 统一使用 reconcileSelection 解析选择
    const resolved = reconcileSelection(updatedProviders, settings.selectedChatProviderId, settings.selectedChatModelId);

    settings = {
      ...settings,
      chatProviders: updatedProviders,
      selectedChatProviderId: resolved.providerId,
      selectedChatModelId: resolved.modelId,
    };

    // 模型配置变化，清理测试结果和模型操作消息
    const oldModelId = normalizeId(oldModel.id);
    const newModelId = normalizeId(patch.id !== undefined ? patch.id : oldModel.id);
    if (oldModelId && oldModelId !== newModelId) {
      // model id 变化，清理旧 key 和新 key
      clearModelTestResult(providerId, oldModelId);
      if (newModelId) {
        clearModelTestResult(providerId, newModelId);
      }
    } else if (oldModelId) {
      // temperature/maxTokens/enabled/name 等变化，清理当前 key
      clearModelTestResult(providerId, oldModelId);
    }
    modelActionMessage = "";
  }

  // 判断模板是否已添加（openai-compatible 允许多次添加）
  function isPresetAdded(presetId: string): boolean {
    if (presetId === "openai-compatible") return false;
    return settings.chatProviders.some((p) => p.presetId === presetId || p.id === presetId);
  }

  // 处理模板选择：选择后立即添加；非 openai-compatible 禁止重复添加
  function handlePresetSelect(presetId: string) {
    if (!presetId) return;

    // 非 openai-compatible 且已添加则不重复添加
    if (presetId !== "openai-compatible" && isPresetAdded(presetId)) {
      selectedPresetId = "";
      return;
    }

    addProviderFromPreset(presetId);
    selectedPresetId = "";
  }

  // 添加 provider
  function addProviderFromPreset(presetId: string) {
    const preset = getProviderPresetById(presetId);
    if (!preset) return;

    const existingIds = getExistingProviderIds();
    const newId = generateUniqueProviderId(preset.id, existingIds);

    // 深拷贝 provider 配置，避免共享引用
    // 安全处理 models，如果 preset 没有 models 或为空数组，使用占位模型
    // 注意：如果 preset 里的模型 id 为空，保持空值让用户明确填写，不要自动改成显示名称
    const presetModels = Array.isArray(preset.provider.models) ? preset.provider.models : [];
    const models = presetModels.length > 0
      ? presetModels.map((model) => ({ ...model }))
      : [createPlaceholderModel()];

    const newProvider: KbChatProviderConfig = {
      id: newId,
      name: preset.provider.name,
      type: preset.provider.type,
      baseUrl: preset.provider.baseUrl,
      apiKey: preset.provider.apiKey,
      enabled: preset.provider.enabled,
      models,
      presetId: preset.id,
    };

    const updatedProviders = [...settings.chatProviders, newProvider];

    // 统一使用 reconcileSelection 解析
    const resolved = reconcileSelection(updatedProviders, settings.selectedChatProviderId, settings.selectedChatModelId);

    settings = {
      ...settings,
      chatProviders: updatedProviders,
      selectedChatProviderId: resolved.providerId,
      selectedChatModelId: resolved.modelId,
    };

    // 切换到新 provider 进行编辑
    editingProviderId = newId;
  }

  // 删除 provider
  function removeProvider(providerId: string) {
    const normalizedProviderId = normalizeId(providerId);

    const updatedProviders = settings.chatProviders.filter((p) => normalizeId(p.id) !== normalizedProviderId);

    // 统一使用 reconcileSelection 解析选择
    const resolved = reconcileSelection(updatedProviders, settings.selectedChatProviderId, settings.selectedChatModelId);

    // 如果删除后没有 provider 了，清空所有选中状态
    let newProviderId = resolved.providerId;
    let newModelId = resolved.modelId;
    if (updatedProviders.length === 0) {
      newProviderId = "";
      newModelId = "";
    }

    // 如果删除的是正在编辑的 provider，需要切换 editingProviderId
    let newEditingProviderId = editingProviderId;
    if (normalizedProviderId === normalizeId(editingProviderId)) {
      newEditingProviderId = newProviderId;
    }

    settings = {
      ...settings,
      chatProviders: updatedProviders,
      selectedChatProviderId: newProviderId,
      selectedChatModelId: newModelId,
    };

    // 更新 editingProviderId
    editingProviderId = newEditingProviderId;

    // 删除 provider 后清理该 provider 下所有测试结果和刷新消息
    clearProviderTestResults(providerId);
    const normalizedRefreshProviderId = normalizeId(providerId);
    if (refreshMessages[normalizedRefreshProviderId]) {
      delete refreshMessages[normalizedRefreshProviderId];
      refreshMessages = { ...refreshMessages };
    }
    modelActionMessage = "";
  }

  // 添加 model
  function addModel(providerId: string) {
    const normalizedProviderId = normalizeId(providerId);
    const provider = settings.chatProviders.find((p) => normalizeId(p.id) === normalizedProviderId);
    if (!provider) return;

    const newModel: KbChatModelConfig = createPlaceholderModel();

    const updatedModels = [...provider.models, newModel];
    const updatedProviders = settings.chatProviders.map((p) =>
      normalizeId(p.id) === normalizedProviderId ? { ...p, models: updatedModels } : p
    );

    settings = {
      ...settings,
      chatProviders: updatedProviders,
    };
    modelActionMessage = "";
  }

  // 删除 model（使用 index 定位）
  function removeModel(providerId: string, modelIndex: number) {
    const normalizedProviderId = normalizeId(providerId);
    const provider = settings.chatProviders.find((p) => normalizeId(p.id) === normalizedProviderId);
    if (!provider) return;

    const updatedModels = provider.models.filter((_, idx) => idx !== modelIndex);

    const updatedProviders = settings.chatProviders.map((p) =>
      normalizeId(p.id) === normalizedProviderId ? { ...p, models: updatedModels } : p
    );

    // 统一使用 reconcileSelection 解析选择
    const resolved = reconcileSelection(updatedProviders, settings.selectedChatProviderId, settings.selectedChatModelId);

    settings = {
      ...settings,
      chatProviders: updatedProviders,
      selectedChatProviderId: resolved.providerId,
      selectedChatModelId: resolved.modelId,
    };

    // 删除 model 后清理该 provider 下所有测试结果（因为 index 会前移）
    clearProviderTestResults(providerId);
    modelActionMessage = "";
  }

  // 选择 model（设置为当前使用）
  function selectModel(providerId: string, modelId: string) {
    modelActionMessage = "";
    const normalizedProviderId = normalizeId(providerId);
    const normalizedModelId = normalizeId(modelId);

    if (!normalizedProviderId) {
      modelActionMessage = "提供商 ID 不能为空";
      modelActionMessageType = "error";
      return;
    }

    if (!normalizedModelId) {
      modelActionMessage = "模型 ID 不能为空";
      modelActionMessageType = "error";
      return;
    }

    const provider = settings.chatProviders.find((p) => normalizeId(p.id) === normalizedProviderId);
    if (!provider) {
      modelActionMessage = "提供商不存在";
      modelActionMessageType = "error";
      return;
    }

    if (provider.enabled === false) {
      modelActionMessage = "该提供商已被禁用，无法设为当前使用";
      modelActionMessageType = "error";
      return;
    }

    const model = provider.models.find((m) => normalizeId(m.id) === normalizedModelId);
    if (!model) {
      modelActionMessage = "模型不存在";
      modelActionMessageType = "error";
      return;
    }

    if (!isUsableChatModel(model)) {
      modelActionMessage = "该模型不可用，无法设为当前使用";
      modelActionMessageType = "error";
      return;
    }

    settings = {
      ...settings,
      selectedChatProviderId: normalizedProviderId,
      selectedChatModelId: normalizedModelId,
    };

    modelActionMessage = "已设为当前使用模型";
    modelActionMessageType = "success";
  }

  // 测试模型连接（使用稳定 providerId+modelId key）
  async function testModel(providerId: string, modelId: string) {
    const normalizedProviderId = normalizeId(providerId);
    const normalizedModelId = normalizeId(modelId);

    if (!normalizedProviderId || !normalizedModelId) return;

    const modelKey = getChatModelKey(normalizedProviderId, normalizedModelId);
    if (testingModelKey) return;

    const provider = settings.chatProviders.find((p) => normalizeId(p.id) === normalizedProviderId);
    if (!provider) return;

    const model = provider.models.find((m) => normalizeId(m.id) === normalizedModelId);
    if (!model) return;

    // 内部再次校验模型可用性，与按钮 disabled 逻辑保持一致
    if (!canUseModel(provider, model)) return;

    const startTime = Date.now();

    // 先清理该模型旧结果，避免显示过期信息
    delete testResults[modelKey];
    testResults = { ...testResults };

    testingModelKey = modelKey;

    try {
      const result = await testChatModelConnection(provider, model);
      testResults[modelKey] = result;
      testResults = { ...testResults };
    } catch (error: any) {
      // 兜底写入 error result，不允许静默失败
      testResults[modelKey] = {
        success: false,
        severity: "error",
        message: "测试失败：未能完成连接测试，请稍后重试或检查模型配置。",
        elapsedMs: Date.now() - startTime,
      };
      testResults = { ...testResults };
    } finally {
      testingModelKey = "";
    }
  }

  // 测试自动操作
  async function testControlPlane(providerId: string, modelId: string) {
    const normalizedProviderId = normalizeId(providerId);
    const normalizedModelId = normalizeId(modelId);

    if (!normalizedProviderId || !normalizedModelId) return;

    const modelKey = getChatModelKey(normalizedProviderId, normalizedModelId);
    if (testingControlPlaneKey) return;

    const provider = settings.chatProviders.find((p) => normalizeId(p.id) === normalizedProviderId);
    if (!provider) return;

    const model = provider.models.find((m) => normalizeId(m.id) === normalizedModelId);
    if (!model) return;

    if (!canUseModel(provider, model)) return;

    const startTime = Date.now();

    // 先清理该模型旧结果，避免显示过期信息
    delete controlPlaneTestResults[modelKey];
    controlPlaneTestResults = { ...controlPlaneTestResults };

    testingControlPlaneKey = modelKey;

    try {
      const result = await testControlPlaneCompatibility(provider, model);
      controlPlaneTestResults[modelKey] = result;
      controlPlaneTestResults = { ...controlPlaneTestResults };
    } catch (error: any) {
      // 兜底写入 error result，不允许静默失败
      controlPlaneTestResults[modelKey] = {
        status: "error",
        message: "测试失败：未能完成自动操作测试，请稍后重试或检查模型配置。",
        elapsedMs: Date.now() - startTime,
      };
      controlPlaneTestResults = { ...controlPlaneTestResults };
    } finally {
      testingControlPlaneKey = "";
    }
  }

  // 清理单个模型的测试结果
  function clearModelTestResult(providerId: string, modelId: string) {
    const normalizedProviderId = normalizeId(providerId);
    const normalizedModelId = normalizeId(modelId);
    const modelKey = getChatModelKey(normalizedProviderId, normalizedModelId);
    if (testResults[modelKey]) {
      delete testResults[modelKey];
      testResults = { ...testResults };
    }
    if (controlPlaneTestResults[modelKey]) {
      delete controlPlaneTestResults[modelKey];
      controlPlaneTestResults = { ...controlPlaneTestResults };
    }
  }

  // 清理 provider 下所有测试结果
  function clearProviderTestResults(providerId: string) {
    const normalizedProviderId = normalizeId(providerId);
    const prefix = `${normalizedProviderId}::`;
    let hasChange = false;
    let hasCpChange = false;
    for (const key of Object.keys(testResults)) {
      if (key.startsWith(prefix)) {
        delete testResults[key];
        hasChange = true;
      }
    }
    for (const key of Object.keys(controlPlaneTestResults)) {
      if (key.startsWith(prefix)) {
        delete controlPlaneTestResults[key];
        hasCpChange = true;
      }
    }
    if (hasChange) {
      testResults = { ...testResults };
    }
    if (hasCpChange) {
      controlPlaneTestResults = { ...controlPlaneTestResults };
    }
  }

  function requiresApiKeyForDiscovery(provider: KbChatProviderConfig): boolean {
    return ["kimi", "kimi-api", "kimi-coding", "mimo", "mimo-api", "mimo-coding-plan", "deepseek", "deepseek-api"].includes(provider.type);
  }

  function requiresBaseUrlForDiscovery(provider: KbChatProviderConfig): boolean {
    return ["openai-compatible"].includes(provider.type);
  }

  function canRefreshModels(provider: KbChatProviderConfig): boolean {
    if (refreshingProviderId === provider.id) return false;
    if (requiresBaseUrlForDiscovery(provider) && !provider.baseUrl?.trim()) return false;
    if (requiresApiKeyForDiscovery(provider) && !provider.apiKey?.trim()) return false;
    return true;
  }

  function getRefreshButtonTitle(provider: KbChatProviderConfig): string {
    if (requiresBaseUrlForDiscovery(provider) && !provider.baseUrl?.trim()) {
      return "请先填写 Base URL";
    }
    if (requiresApiKeyForDiscovery(provider) && !provider.apiKey?.trim()) return "请先填写 API Key";
    return "";
  }

  // 刷新模型列表
  async function refreshModels(provider: KbChatProviderConfig) {
    if (!canRefreshModels(provider)) return;
    const providerId = normalizeId(provider.id);
    if (requiresBaseUrlForDiscovery(provider) && !provider.baseUrl?.trim()) {
      refreshMessages = { ...refreshMessages, [providerId]: "请先填写 Base URL" };
      return;
    }
    if (requiresApiKeyForDiscovery(provider) && !provider.apiKey?.trim()) {
      refreshMessages = { ...refreshMessages, [providerId]: "请先填写 API Key" };
      return;
    }

    refreshingProviderId = provider.id;
    refreshMessages = { ...refreshMessages, [providerId]: "" };

    try {
      const result = await discoverProviderModels(provider);
      if (result.success) {
        const { updatedProvider, message } = mergeDiscoveredChatModels(provider, result);
        refreshMessages = { ...refreshMessages, [providerId]: message };

        // 更新 settings 中的 provider
        const updatedProviders = settings.chatProviders.map((p) =>
          normalizeId(p.id) === normalizeId(provider.id) ? updatedProvider : p
        );

        // 始终调用 reconcileSelection 解析选择
        // 如果当前选择仍有效，保持不变；如果失效/为空/指向禁用项，自动回退到第一个可用 provider/model
        const resolved = reconcileSelection(
          updatedProviders,
          settings.selectedChatProviderId,
          settings.selectedChatModelId
        );

        settings = {
          ...settings,
          chatProviders: updatedProviders,
          selectedChatProviderId: resolved.providerId,
          selectedChatModelId: resolved.modelId,
        };

        // 刷新后清理该 provider 的测试结果和模型操作消息
        clearProviderTestResults(provider.id);
        modelActionMessage = "";

        // 检查当前选中的模型是否在刷新后的列表中
        if (settings.selectedChatProviderId === provider.id) {
          const selectedModelId = normalizeId(settings.selectedChatModelId);
          const foundModel = updatedProvider.models.find(
            (m) => normalizeId(m.id) === selectedModelId
          );
          if (!foundModel && selectedModelId) {
            modelActionMessage = "该模型未出现在当前 Key 可用模型列表中，可能无权限或模型 ID 错误。";
            modelActionMessageType = "error";
          } else if (foundModel && foundModel.enabled === false) {
            modelActionMessage = "当前选中模型验证失败（不可用），已自动切换到第一个可用模型。";
            modelActionMessageType = "error";
          }
        }
      } else {
        refreshMessages = { ...refreshMessages, [providerId]: result.message };
      }
    } catch {
      refreshMessages = { ...refreshMessages, [providerId]: "刷新模型列表失败，请检查网络连接" };
    } finally {
      refreshingProviderId = "";
    }
  }

  // 获取 Base URL 提示
  function getBaseUrlHint(type: string): string {
    switch (type) {
      case "kimi":
      case "kimi-api":
        return "默认 https://api.moonshot.cn/v1，不要填 /chat/completions 完整路径";
      case "kimi-coding":
        return "默认 https://api.kimi.com/coding/v1，不要填 /chat/completions 完整路径";
      case "mimo":
      case "mimo-api":
        return "默认 https://api.xiaomimimo.com/v1，不要填 /chat/completions 完整路径";
      case "mimo-coding-plan":
        return "默认 https://token-plan-cn.xiaomimimo.com/v1，不要填 /chat/completions 完整路径";
      case "deepseek":
      case "deepseek-api":
        return "默认 https://api.deepseek.com/v1，不要填 /chat/completions 完整路径";
      case "openai-compatible":
        return "必填，通常填到 /v1，不要填到 /chat/completions";
      default:
        return "";
    }
  }

  // 判断是否显示 API Key 字段（四入口都需要 API Key；自定义可为空但给提示）
  function shouldShowApiKeyField(_provider: KbChatProviderConfig): boolean {
    return true;
  }

  // 获取 API Key placeholder
  function getApiKeyPlaceholder(type: string): string {
    switch (type) {
      case "kimi":
      case "kimi-api":
        return "Moonshot API Key";
      case "kimi-coding":
        return "Kimi Coding API Key";
      case "mimo":
      case "mimo-api":
        return "MiMo API Key";
      case "mimo-coding-plan":
        return "MiMo Coding Plan API Key";
      case "deepseek":
      case "deepseek-api":
        return "DeepSeek API Key";
      case "openai-compatible":
        return "API Key（可留空）";
      default:
        return "API Key";
    }
  }

  // 显式依赖响应式变量，确保 editingProviderId 变化时重新计算
  $: editingProvider = getEditingProvider(
    settings.chatProviders,
    editingProviderId,
    settings.selectedChatProviderId
  );
</script>

<div class="provider-manager">
  <!-- 左侧 Provider 列表 -->
  <ModelProviderList
    providers={settings.chatProviders}
    editingProviderId={editingProviderId}
    selectedProviderId={settings.selectedChatProviderId}
    bind:selectedPresetId
    onSelectProvider={setEditingProvider}
    onSelectPreset={handlePresetSelect}
    isPresetAdded={isPresetAdded}
  />

  <!-- 右侧 Provider 编辑区 -->
  <div class="provider-editor">
    {#if editingProvider}
      <div class="editor-header">
        <h3>{editingProvider.name}</h3>
        <button type="button" class="settings-btn danger" on:click={() => removeProvider(editingProvider.id)}>
          删除提供商
        </button>
      </div>

      <!-- Provider 基础信息表单 -->
      <ModelProviderEditorForm
        provider={editingProvider}
        shouldShowApiKeyField={shouldShowApiKeyField}
        getBaseUrlHint={getBaseUrlHint}
        getApiKeyPlaceholder={getApiKeyPlaceholder}
        onUpdateProvider={updateProvider}
      />

      <!-- 模型列表 -->
      <ModelProviderModelsSection
        provider={editingProvider}
        refreshMessage={refreshMessages[normalizeId(editingProvider.id)] || ""}
        modelActionMessage={modelActionMessage}
        modelActionMessageType={modelActionMessageType}
        testingModelKey={testingModelKey}
        canRefreshModels={canRefreshModels}
        getRefreshButtonTitle={getRefreshButtonTitle}
        onRefreshModels={refreshModels}
        onAddModel={addModel}
        onUpdateModel={updateModel}
        onRemoveModel={removeModel}
        onSelectModel={selectModel}
        onTestModel={testModel}
        onTestControlPlane={testControlPlane}
        isCurrentModel={isCurrentModel}
        canUseModel={canUseModel}
        getSelectModelTitle={getSelectModelTitle}
        getTestModelTitle={getTestModelTitle}
        isTestingModel={isTestingModel}
        isTestingControlPlane={isTestingControlPlane}
        testingControlPlaneKey={testingControlPlaneKey}
        getTestControlPlaneTitle={getTestControlPlaneTitle}
        testResults={testResults}
        controlPlaneTestResults={controlPlaneTestResults}
      />
    {:else}
      <div class="editor-empty-state">
        <p>请选择一个提供商进行编辑</p>
      </div>
    {/if}
  </div>
</div>

<style lang="scss">
  .provider-manager {
    display: flex;
    gap: 16px;
    min-height: 400px;
    min-width: 0;

    @media (max-width: 768px) {
      flex-direction: column;
    }
  }

  // 统一按钮样式（子组件通过 :global(.settings-btn) 共享）
  .settings-btn {
    padding: 6px 12px;
    border: 1px solid var(--b3-border-color);
    border-radius: 4px;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
    cursor: pointer;
    font-size: 13px;
    line-height: 1.4;
    transition: all 0.2s;
    white-space: nowrap;

    &:hover:not(:disabled) {
      background: var(--b3-theme-background-light);
      border-color: var(--b3-theme-primary);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    &.danger {
      &:hover:not(:disabled) {
        border-color: #f44336;
        color: #f44336;
      }
    }
  }

  // 右侧编辑区
  .provider-editor {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--b3-border-color);
    gap: 12px;
    flex-wrap: wrap;

    h3 {
      margin: 0;
      font-size: 18px;
      color: var(--b3-theme-on-surface);
    }
  }

  .editor-empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--b3-theme-on-surface-light);
  }
</style>
