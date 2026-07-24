<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import {
        loadUserLayoutTemplates,
        saveCurrentDeviceAsLayoutTemplate,
        applyUserLayoutTemplateToCurrentDevice,
        deleteUserLayoutTemplate,
        getUserLayoutTemplateAvailability,
        updateUserLayoutTemplateFromCurrentDevice,
        buildUserLayoutTemplatePreview,
        buildUserLayoutTemplateItemStyle,
        isLegacyUserLayoutTemplate,
        resolveCurrentLayoutTarget,
        type UserLayoutTemplate,
        type UserLayoutTemplateAvailability,
        type UserLayoutTemplatePreview,
        type UserLayoutTemplatePreviewItem,
    } from "@/homepage/templates/userLayoutTemplates";
    import { getCurrentDeviceViewContext } from "@/homepage/deviceView/deviceViewContext";
    import type { DeviceViewContext } from "@/homepage/deviceView/deviceViewTypes";

    interface Props {
        plugin: any;
    }

    let { plugin }: Props = $props();

    let advancedEnabled = $derived(plugin.ADVANCED);
    let loading = $state(true);
    let currentTargetType = $state<"homepage" | "section">("homepage");
    let currentColumns = $state<number | null>(null);
    let loadError = $state<string | null>(null);

    let userLayoutTemplates: UserLayoutTemplate[] = $state([]);
    let userLayoutAvailabilityMap = $state<Record<string, UserLayoutTemplateAvailability>>({});
    let selectedTemplate: UserLayoutTemplate | null = $state(null);
    let savingLayoutTemplate = $state(false);
    let applyingUserLayout = $state(false);
    let deletingUserLayout = $state(false);
    let showApplyUserLayoutConfirm = $state(false);
    let showDeleteUserLayoutConfirm = $state(false);
    let layoutTemplateName = $state("");
    let layoutTemplateDescription = $state("");
    let detailMode = $state<"template" | "saveLayout">("template");
    let selectedPreview: UserLayoutTemplatePreview | null = $state(null);
    let loadingPreview = $state(false);
    let previewError = $state<string | null>(null);
    let updatingLayoutTemplate = $state(false);
    let showUpdateConfirm = $state(false);

    async function refreshSelectedPreview(template = selectedTemplate, fixedContext?: DeviceViewContext) {
        previewError = null;
        if (!template) {
            selectedPreview = null;
            return;
        }
        loadingPreview = true;
        try {
            selectedPreview = await buildUserLayoutTemplatePreview(plugin, template, fixedContext);
        } catch (error) {
            previewError = error instanceof Error ? error.message : "加载布局模板预览失败";
            selectedPreview = null;
        } finally {
            loadingPreview = false;
        }
    }

    async function selectUserLayoutTemplate(t: UserLayoutTemplate) {
        detailMode = "template";
        selectedTemplate = t;
        await refreshSelectedPreview(t);
    }

    onMount(async () => {
        try {
            if (!advancedEnabled) {
                loading = false;
                return;
            }

            const context = getCurrentDeviceViewContext(plugin, "desktop-homepage");
            const target = await resolveCurrentLayoutTarget(plugin, context);
            currentTargetType = target.targetType;
            currentColumns = target.columns;
            userLayoutTemplates = await loadUserLayoutTemplates(plugin);
            for (const t of userLayoutTemplates) {
                userLayoutAvailabilityMap[t.id] = await getUserLayoutTemplateAvailability(plugin, t, context, target);
            }
            selectedTemplate = userLayoutTemplates[0] ?? null;
            if (selectedTemplate) {
                await refreshSelectedPreview(selectedTemplate, context);
            }
        } catch (error: any) {
            loadError = error?.message || "加载失败";
            showMessage(`模板中心加载失败: ${loadError}`, 5000, "error");
        } finally {
            loading = false;
        }
    });

    async function refreshTemplateCenterState(options?: { keepSelection?: boolean }) {
        const prevId = selectedTemplate?.id ?? null;
        const context = getCurrentDeviceViewContext(plugin, "desktop-homepage");
        const target = await resolveCurrentLayoutTarget(plugin, context);
        currentTargetType = target.targetType;
        currentColumns = target.columns;
        userLayoutTemplates = await loadUserLayoutTemplates(plugin);
        userLayoutAvailabilityMap = {};

        for (const t of userLayoutTemplates) {
            userLayoutAvailabilityMap[t.id] = await getUserLayoutTemplateAvailability(plugin, t, context, target);
        }

        if (options?.keepSelection !== false && prevId) {
            selectedTemplate = userLayoutTemplates.find((t) => t.id === prevId) ?? userLayoutTemplates[0] ?? null;
        } else {
            selectedTemplate = userLayoutTemplates[0] ?? null;
        }

        if (selectedTemplate) {
            await refreshSelectedPreview(selectedTemplate, context);
        } else {
            selectedPreview = null;
            previewError = "";
        }
    }

    function openSaveLayoutPanel() {
        if (!advancedEnabled) {
            showMessage("主页模板为会员功能，请先开通会员。", 3000, "info");
            return;
        }
        detailMode = "saveLayout";
    }

    function cancelSaveLayoutPanel() {
        detailMode = "template";
        layoutTemplateName = "";
        layoutTemplateDescription = "";
    }

    async function handleSaveLayoutTemplate() {
        if (savingLayoutTemplate) return;
        if (!advancedEnabled) {
            showMessage("主页模板为会员功能，请先开通会员。", 3000, "info");
            return;
        }
        if (!layoutTemplateName.trim()) {
            showMessage("请输入模板名称", 3000, "info");
            return;
        }
        savingLayoutTemplate = true;

        try {
            const savedTemplate = await saveCurrentDeviceAsLayoutTemplate(plugin, {
                name: layoutTemplateName.trim(),
                description: layoutTemplateDescription.trim() || undefined,
            });
            showMessage("自定义布局模板已保存", 3000, "info");
            layoutTemplateName = "";
            layoutTemplateDescription = "";
            detailMode = "template";
            selectedTemplate = savedTemplate;
            try {
                await refreshTemplateCenterState({ keepSelection: true });
            } catch {
                showMessage("模板已提交，但界面刷新失败，请重新打开或刷新页面。", 7000, "error");
            }
        } catch (error: any) {
            showMessage(error?.message || "保存布局模板失败", 5000, "error");
        } finally {
            savingLayoutTemplate = false;
        }
    }

    async function handleApply() {
        if (applyingUserLayout) return;
        if (!selectedTemplate) return;

        if (!advancedEnabled) {
            showMessage("主页模板为会员功能，请先开通会员。", 3000, "info");
            return;
        }
        if (!userLayoutAvailabilityMap[selectedTemplate.id]?.available) return;
        showApplyUserLayoutConfirm = true;
    }

    async function confirmApplyUserLayout() {
        if (!selectedTemplate || applyingUserLayout) return;
        showApplyUserLayoutConfirm = false;
        applyingUserLayout = true;

        try {
            const result = await applyUserLayoutTemplateToCurrentDevice(plugin, selectedTemplate.id);
            if (result.success) {
                showMessage("布局模板已应用", 3000, "info");
                if (result.warning) showMessage(result.warning, 6000, "info");
                if (result.skippedWidgetIds.length > 0) {
                    showMessage(`已跳过 ${result.skippedWidgetIds.length} 个已不存在的组件`, 5000, "info");
                }
                try {
                    window.dispatchEvent(new CustomEvent("homepage-template-layout-changed"));
                    window.dispatchEvent(new CustomEvent("homepage-settings-saved"));
                    await refreshTemplateCenterState({ keepSelection: true });
                } catch {
                    showMessage("布局已提交，但模板中心刷新失败，请重新打开或刷新页面。", 7000, "error");
                }
            } else {
                if (result.manualCheckRequired || result.uncertainWidgetIds?.length) {
                    const ids = result.uncertainWidgetIds?.join("、") || "未知";
                    showMessage(`部分组件状态无法确认，请人工检查：${ids}`, 8000, "error");
                }
                showMessage(result.reason || "布局模板应用失败", 5000, "error");
            }
        } catch (error: any) {
            showMessage(error?.message || "布局模板应用失败", 5000, "error");
        } finally {
            applyingUserLayout = false;
        }
    }

    async function handleDeleteUserLayoutTemplate() {
        if (!selectedTemplate || deletingUserLayout) return;
        if (!advancedEnabled) {
            showMessage("主页模板为会员功能，请先开通会员。", 3000, "info");
            return;
        }
        showDeleteUserLayoutConfirm = true;
    }

    async function confirmDeleteUserLayoutTemplate() {
        if (!selectedTemplate || deletingUserLayout) return;
        showDeleteUserLayoutConfirm = false;
        deletingUserLayout = true;

        try {
            const deletedId = selectedTemplate.id;
            const success = await deleteUserLayoutTemplate(plugin, deletedId);
            if (success) {
                showMessage("布局模板已删除", 3000, "info");
                selectedTemplate = null;
                try {
                    await refreshTemplateCenterState({ keepSelection: false });
                } catch {
                    showMessage("模板已提交，但界面刷新失败，请重新打开或刷新页面。", 7000, "error");
                }
            } else {
                showMessage("删除布局模板失败", 3000, "error");
            }
        } catch (error: any) {
            showMessage(error?.message || "删除布局模板失败", 5000, "error");
        } finally {
            deletingUserLayout = false;
        }
    }

    async function handleUpdateUserLayoutTemplate() {
        if (!selectedTemplate || updatingLayoutTemplate) return;
        if (!advancedEnabled) {
            showMessage("主页模板为会员功能，请先开通会员。", 3000, "info");
            return;
        }
        showUpdateConfirm = true;
    }

    function getApplyButtonText(): string {
        if (detailMode === "saveLayout") return "正在保存";
        if (applyingUserLayout) return "添加中...";
        const targetLabel = currentTargetType === "section" ? "当前分栏" : "当前主页";
        if (!selectedTemplate) return `添加到${targetLabel}`;
        if (!advancedEnabled) return "会员可用";
        return userLayoutAvailabilityMap[selectedTemplate.id]?.available ? `添加到${targetLabel}` : "暂不可添加";
    }

    function isApplyDisabled(): boolean {
        if (detailMode === "saveLayout") return true;
        if (applyingUserLayout) return true;
        if (!selectedTemplate) return true;
        if (!advancedEnabled) return true;
        return !userLayoutAvailabilityMap[selectedTemplate.id]?.available;
    }

    function extractPreviewStyle(item: UserLayoutTemplatePreviewItem): string {
        return buildUserLayoutTemplateItemStyle(item.style, item.colSpan, item.rowSpan);
    }

    async function confirmUpdateUserLayoutTemplate() {
        if (!selectedTemplate || updatingLayoutTemplate) return;
        showUpdateConfirm = false;
        updatingLayoutTemplate = true;

        try {
            const updated = await updateUserLayoutTemplateFromCurrentDevice(plugin, selectedTemplate.id);
            if (updated) {
                showMessage("布局模板已更新", 3000, "info");
                selectedTemplate = updated;
                try {
                    await refreshTemplateCenterState({ keepSelection: true });
                } catch {
                    showMessage("模板已提交，但界面刷新失败，请重新打开或刷新页面。", 7000, "error");
                }
            } else {
                showMessage("布局模板更新失败", 3000, "error");
            }
        } catch (error: any) {
            showMessage(error?.message || "布局模板更新失败", 5000, "error");
        } finally {
            updatingLayoutTemplate = false;
        }
    }
</script>

{#if loading}
    <div class="loading-container">
        <div class="loading-spinner"></div>
        <span>正在加载模板中心...</span>
    </div>
{:else if loadError}
    <div class="error-container">
        <span>加载失败: {loadError}</span>
    </div>
{:else if !advancedEnabled}
    <div class="template-center vip-template-gate">
        <div class="vip-gate-panel">
            <div class="vip-gate-badge">会员功能</div>
            <h2 class="vip-gate-title">布局模板</h2>
            <p class="vip-gate-desc">
                将当前主页或活动分栏中的普通组件布局保存为模板，并可追加到多个布局。
            </p>

            <div class="vip-gate-grid">
                <div class="vip-gate-item">
                    <h3>保存布局方案</h3>
                    <p>保存当前主页或活动分栏中的普通组件排列。</p>
                </div>
                <div class="vip-gate-item">
                    <h3>重复添加</h3>
                    <p>同一模板可以添加到多个主页或分栏，每次都会创建独立组件实例。</p>
                </div>
                <div class="vip-gate-item">
                    <h3>安全追加</h3>
                    <p>新组件追加到当前布局末尾，不清空已有组件。</p>
                </div>
                <div class="vip-gate-item">
                    <h3>只改布局</h3>
                    <p>保存组件实例配置副本，不复制任务、项目、记账等共享业务数据，也不会影响侧边栏和移动端主页。</p>
                </div>
            </div>

            <p class="vip-gate-note">
                开通会员后可使用保存、预览、更新、应用和删除布局模板等完整能力。
            </p>
        </div>
    </div>
{:else}
    <div class="template-center">
        <!-- 顶部说明卡 -->
        <div class="info-card">
            <div class="info-row">
                <span class="info-label">当前每行组件数：</span>
                <span class="info-value">{currentColumns ?? "未知"}</span>
            </div>
            <div class="info-tips">
                <p>模板只保存当前主页或活动分栏中的普通组件布局和组件实例配置副本。</p>
                <p>新组件追加到当前布局末尾，不清空已有组件；同一模板可添加到多个布局。</p>
                <p>不复制任务、项目、记账等共享业务数据。</p>
                <p>不影响其他分栏、侧边栏和移动端主页。</p>
            </div>
        </div>

        <!-- 主体两栏 -->
        <div class="main-body">
            <!-- 左侧模板列表 -->
            <div class="template-list-panel">
                <div class="template-list">
                    {#if userLayoutTemplates.length > 0}
                        {#each userLayoutTemplates as t (t.id)}
                            <button
                                type="button"
                                class="template-list-item user-layout-item"
                                class:active={selectedTemplate?.id === t.id}
                                onclick={() => selectUserLayoutTemplate(t)}
                            >
                                <div class="template-list-header">
                                    <span class="template-list-name">{t.name}</span>
                                    {#if isLegacyUserLayoutTemplate(t)}
                                        <span class="custom-badge legacy-badge">旧公开模板</span>
                                    {:else}
                                        <span class="custom-badge">自定义</span>
                                    {/if}
                                </div>
                                {#if t.description}
                                    <div class="template-list-desc">{t.description}</div>
                                {/if}
                                <div class="template-list-meta">
                                    <span>{t.columns} 列</span>
                                </div>
                                <div class="template-list-status">
                                    {#if userLayoutAvailabilityMap[t.id]?.available}
                                        <span class="status-available">{userLayoutAvailabilityMap[t.id]?.reason || "可应用"}</span>
                                    {:else}
                                        <span class="status-unavailable">{userLayoutAvailabilityMap[t.id]?.reason || "暂不可应用"}</span>
                                    {/if}
                                </div>
                            </button>
                        {/each}
                    {:else}
                        <div class="template-list-section-hint">
                            <p>还没有自定义布局模板，可以保存当前布局作为模板。</p>
                        </div>
                    {/if}
                </div>

                <!-- 保存入口 -->
                <div class="save-layout-entry">
                    <button
                        type="button"
                        class="b3-button b3-button--outline save-entry-btn"
                        disabled={savingLayoutTemplate}
                        onclick={openSaveLayoutPanel}
                    >
                        {currentTargetType === "section" ? "保存当前分栏模板" : "保存当前主页模板"}
                    </button>
                </div>
            </div>

            <!-- 右侧模板详情 -->
            <div class="template-detail-panel">
                {#if detailMode === "saveLayout"}
                    <div class="detail-header">
                        <div class="detail-title-row">
                            <h3 class="detail-title">{currentTargetType === "section" ? "保存当前分栏模板" : "保存当前主页模板"}</h3>
                        </div>
                        <p class="detail-desc">模板保存当前分栏（或主页）的组件分布、尺寸、样式和组件实例配置副本，不复制共享业务数据。应用时新组件追加到末尾，不清空已有组件。</p>
                    </div>

                    <div class="save-form standalone-save-form">
                        <div class="form-group">
                            <label class="form-label" for="layout-template-name">模板名称</label>
                            <input
                                type="text"
                                id="layout-template-name"
                                class="form-input"
                                bind:value={layoutTemplateName}
                                placeholder="请输入模板名称"
                            />
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="layout-template-desc">描述（可选）</label>
                            <textarea
                                id="layout-template-desc"
                                class="form-input form-textarea"
                                bind:value={layoutTemplateDescription}
                                placeholder="请输入描述"
                            ></textarea>
                        </div>
                        <div class="form-actions">
                            <button
                                type="button"
                                class="b3-button b3-button--outline"
                                disabled={savingLayoutTemplate}
                                onclick={cancelSaveLayoutPanel}
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                class="b3-button"
                                disabled={savingLayoutTemplate}
                                onclick={handleSaveLayoutTemplate}
                            >
                                {savingLayoutTemplate ? "保存中..." : "保存"}
                            </button>
                        </div>
                    </div>
                {:else if selectedTemplate}
                    {@const t = selectedTemplate}
                    <div class="detail-header">
                        <div class="detail-title-row">
                            <h3 class="detail-title">{t.name}</h3>
                            {#if isLegacyUserLayoutTemplate(t)}
                                <span class="custom-badge legacy-badge">旧公开模板</span>
                            {:else}
                                <span class="custom-badge">自定义</span>
                            {/if}
                        </div>
                        {#if t.description}
                            <p class="detail-desc">{t.description}</p>
                        {/if}
                    </div>

                    <div class="detail-info">
                        <div class="detail-info-row">
                            <span class="detail-info-label">模板类型：</span>
                            <span class="detail-info-value">
                                {isLegacyUserLayoutTemplate(t) ? "旧公开模板" : "自定义布局模板"}
                            </span>
                        </div>
                        <div class="detail-info-row">
                            <span class="detail-info-label">保存时列数：</span>
                            <span class="detail-info-value">{t.columns}</span>
                        </div>
                        <div class="detail-info-row">
                            <span class="detail-info-label">当前列数：</span>
                            <span class="detail-info-value">{currentColumns ?? "未知"}</span>
                        </div>
                        <div class="detail-info-row">
                            <span class="detail-info-label">兼容状态：</span>
                            {#if userLayoutAvailabilityMap[t.id]?.available}
                                <span class="status-available">{userLayoutAvailabilityMap[t.id]?.reason || "当前列数支持"}</span>
                            {:else}
                                <span class="status-unavailable">
                                    {userLayoutAvailabilityMap[t.id]?.reason || "暂不可应用"}
                                </span>
                            {/if}
                        </div>
                        <div class="detail-info-row">
                            <span class="detail-info-label">包含组件：</span>
                            <span class="detail-info-value">{t.layoutItems.length} 个</span>
                        </div>
                    </div>

                    <p class="template-light-note">该模板只保存普通组件布局和组件实例配置副本，不复制任务、项目、记账等共享业务数据。新组件将追加到当前布局末尾。</p>
                    <p class="template-light-note">同一模板可重复添加到不同分栏，彼此不绑定。</p>
                    <p class="template-light-note">旧模板如预览不准，可用当前布局更新一次。</p>

                    {#if loadingPreview}
                        <div class="layout-preview-section">
                            <h4 class="detail-section-title">布局预览</h4>
                            <p class="template-light-note">正在加载预览...</p>
                        </div>
                    {:else if previewError}
                        <div class="layout-preview-section">
                            <h4 class="detail-section-title">布局预览</h4>
                            <p class="template-light-note warning-text">预览加载失败：{previewError}</p>
                        </div>
                    {:else if selectedPreview}
                        {#if selectedPreview.items.length > 0}
                            <div class="layout-preview-section">
                                <h4 class="detail-section-title">布局预览</h4>
                                <div class="layout-preview">
                                    <div
                                        class="layout-preview-grid"
                                        style="grid-template-columns: repeat({selectedPreview.columns}, minmax(0, 1fr)); grid-auto-flow: dense; grid-auto-rows: 36px; align-items: stretch; gap: {selectedPreview.gap ?? 0.2}rem;"
                                    >
                                        {#each selectedPreview.items as item (item.widgetId)}
                                            <div
                                                class="layout-preview-item"
                                                class:missing={item.missing}
                                                class:placeholder={item.placeholder}
                                                style={extractPreviewStyle(item)}
                                                title={`${item.displayName} (${item.widgetType})`}
                                            >
                                                {item.displayName}
                                                {#if item.missing}
                                                    <span class="missing-tag">已不存在</span>
                                                    <span class="missing-tag">应用时跳过</span>
                                                {:else if item.placeholder}
                                                    <span class="missing-tag">空占位</span>
                                                {/if}
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                            </div>
                        {:else}
                            <p class="template-light-note">该模板暂无组件。</p>
                        {/if}
                    {/if}

                    <div class="user-layout-actions">
                        <button
                            type="button"
                            class="b3-button b3-button--outline update-template-btn"
                            disabled={updatingLayoutTemplate}
                            onclick={handleUpdateUserLayoutTemplate}
                        >
                            {updatingLayoutTemplate ? "更新中..." : "用当前布局更新此模板"}
                        </button>
                        <button
                            type="button"
                            class="b3-button b3-button--outline delete-btn"
                            disabled={deletingUserLayout}
                            onclick={handleDeleteUserLayoutTemplate}
                        >
                            {deletingUserLayout ? "删除中..." : "删除模板"}
                        </button>
                    </div>
                {:else}
                    <div class="empty-detail">请选择或保存一个布局模板。</div>
                {/if}
            </div>
        </div>

        <!-- 底部操作 -->
        <div class="bottom-actions">
            <button
                class="b3-button apply-btn"
                disabled={isApplyDisabled()}
                onclick={handleApply}
            >
                {getApplyButtonText()}
            </button>
        </div>
    </div>
{/if}

<!-- 应用布局模板二次确认弹窗 -->
{#if showApplyUserLayoutConfirm}
    <div class="confirm-overlay">
        <div class="confirm-dialog">
            <div class="confirm-header">
                <h2>确认应用布局模板</h2>
            </div>
            <div class="confirm-body">
                <p>确定要应用布局模板 <strong>{selectedTemplate?.name ?? ""}</strong> 吗？</p>
                <div class="confirm-tips">
                    <p>本次只向{currentTargetType === "section" ? "当前分栏" : "当前主页"}追加普通组件，不清空已有组件；</p>
                    <p>不复制任务、项目、记账等共享业务数据；</p>
                    <p>不影响其他分栏、侧边栏和移动端；</p>
                    <p>同一模板可添加到多个布局。</p>
                </div>
            </div>
            <div class="confirm-footer">
                <button class="b3-button b3-button--text" onclick={() => showApplyUserLayoutConfirm = false}>
                    取消
                </button>
                <button class="b3-button apply-btn" onclick={confirmApplyUserLayout}>
                    确认应用
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- 删除布局模板二次确认弹窗 -->
{#if showDeleteUserLayoutConfirm}
    <div class="confirm-overlay">
        <div class="confirm-dialog">
            <div class="confirm-header">
                <h2>确认删除布局模板</h2>
            </div>
            <div class="confirm-body">
                <p>确定要删除布局模板 <strong>{selectedTemplate?.name ?? ""}</strong> 吗？</p>
                <p class="warning-text">此操作不可恢复。不会删除任何组件或布局。</p>
            </div>
            <div class="confirm-footer">
                <button class="b3-button b3-button--text" onclick={() => showDeleteUserLayoutConfirm = false}>
                    取消
                </button>
                <button class="b3-button b3-button--outline" onclick={confirmDeleteUserLayoutTemplate}>
                    确认删除
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- 更新模板二次确认弹窗 -->
{#if showUpdateConfirm}
    <div class="confirm-overlay">
        <div class="confirm-dialog">
            <div class="confirm-header">
                <h2>确认更新模板</h2>
            </div>
            <div class="confirm-body">
                <p>确定要用{currentTargetType === "section" ? "当前分栏" : "当前主页"}的布局更新模板 <strong>{selectedTemplate?.name ?? ""}</strong> 吗？</p>
                <div class="confirm-tips">
                    <p>这会用{currentTargetType === "section" ? "当前分栏" : "当前主页"}的普通组件分布、尺寸和样式覆盖当前模板；</p>
                    <p>不复制任务、项目、记账等共享业务数据；</p>
                    <p>不影响侧边栏和移动端。</p>
                </div>
            </div>
            <div class="confirm-footer">
                <button class="b3-button b3-button--text" onclick={() => showUpdateConfirm = false}>
                    取消
                </button>
                <button class="b3-button b3-button--outline" onclick={confirmUpdateUserLayoutTemplate}>
                    确认更新
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
    .template-center {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        width: 100%;
        min-width: 0;
        min-height: 0;
        height: 100%;
        padding: 14px 16px 16px;
        gap: 14px;
        overflow: hidden;
        background: var(--b3-theme-background);
        box-sizing: border-box;
    }

    .loading-container,
    .error-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: 1;
        width: 100%;
        min-width: 0;
        height: 100%;
        gap: 12px;
        color: var(--b3-theme-on-surface);
        font-size: 14px;
        box-sizing: border-box;
    }

    .loading-spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--b3-border-color);
        border-top-color: var(--b3-theme-primary);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .vip-template-gate {
        align-items: center;
        justify-content: center;
        padding: 24px;
    }

    .vip-gate-panel {
        width: min(720px, 100%);
        padding: 28px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
        box-sizing: border-box;
    }

    .vip-gate-badge {
        display: inline-flex;
        align-items: center;
        padding: 3px 10px;
        border-radius: 999px;
        background: var(--b3-theme-primary-light);
        color: var(--b3-theme-primary);
        font-size: 12px;
        font-weight: 600;
        margin-bottom: 10px;
    }

    .vip-gate-title {
        margin: 0 0 8px;
        color: var(--b3-theme-on-surface);
        font-size: 22px;
        font-weight: 700;
    }

    .vip-gate-desc {
        margin: 0 0 18px;
        color: var(--b3-theme-on-surface-light);
        font-size: 14px;
        line-height: 1.6;
    }

    .vip-gate-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 16px;
    }

    .vip-gate-item {
        padding: 12px;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-background);
    }

    .vip-gate-item h3 {
        margin: 0 0 6px;
        color: var(--b3-theme-on-surface);
        font-size: 14px;
        font-weight: 600;
    }

    .vip-gate-item p,
    .vip-gate-note {
        margin: 0;
        color: var(--b3-theme-on-surface-light);
        font-size: 13px;
        line-height: 1.5;
    }

    /* 顶部说明卡 */
    .info-card {
        padding: 12px 16px;
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        flex-shrink: 0;
    }

    .info-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        font-size: 14px;
    }

    .info-label {
        color: var(--b3-theme-on-surface);
    }

    .info-value {
        color: var(--b3-theme-primary);
        font-weight: 600;
    }

    .info-tips {
        margin: 0;
    }

    .info-tips p {
        font-size: 13px;
        color: var(--b3-theme-on-surface-light);
        margin: 4px 0;
        line-height: 1.5;
    }

    /* 主体两栏 */
    .main-body {
        display: flex;
        flex: 1;
        width: 100%;
        min-width: 0;
        min-height: 0;
        gap: 14px;
        overflow: hidden;
    }

    /* 左侧模板列表 */
    .template-list-panel {
        width: 320px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        min-height: 0;
        padding: 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
        box-sizing: border-box;
        overflow: hidden;
    }

    .template-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        flex: 1;
        overflow-y: auto;
        min-height: 0;
    }

    .template-list-item {
        display: flex;
        flex-direction: column;
        padding: 10px 12px;
        background: var(--b3-theme-background);
        border: 1px solid transparent;
        border-radius: 6px;
        cursor: pointer;
        text-align: left;
        transition: border-color 0.15s ease, background 0.15s ease;
        gap: 4px;
    }

    .template-list-item:hover {
        border-color: var(--b3-theme-primary-light);
    }

    .template-list-item.active {
        border-color: var(--b3-theme-primary);
        background: var(--b3-theme-primary-light);
    }

    .template-list-header {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .template-list-name {
        font-size: 14px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
    }

    .template-list-desc {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        line-height: 1.4;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
    }

    .template-list-meta {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
    }

    .template-list-status {
        font-size: 12px;
    }

    .status-available {
        color: var(--b3-theme-primary);
        font-weight: 500;
    }

    .status-unavailable {
        color: var(--b3-theme-on-surface-light);
    }

    /* 右侧模板详情 */
    .template-detail-panel {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        min-height: 0;
        padding: 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
        box-sizing: border-box;
        overflow-y: auto;
    }

    .detail-header {
        margin-bottom: 12px;
    }

    .detail-title-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
    }

    .detail-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        margin: 0;
    }

    .detail-desc {
        font-size: 13px;
        color: var(--b3-theme-on-surface-light);
        margin: 0;
        line-height: 1.5;
    }

    .detail-info {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 12px;
        padding: 10px;
        background: var(--b3-theme-background);
        border-radius: 6px;
    }

    .detail-info-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        font-size: 13px;
    }

    .detail-info-label {
        color: var(--b3-theme-on-surface);
        font-weight: 500;
        flex-shrink: 0;
    }

    .detail-info-value {
        color: var(--b3-theme-on-surface-light);
    }

    .detail-section-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        margin: 0 0 8px;
    }

    .empty-detail {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--b3-theme-on-surface-light);
        font-size: 14px;
    }

    /* 底部操作 */
    .bottom-actions {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        width: 100%;
        box-sizing: border-box;
        flex-shrink: 0;
    }

    .apply-btn {
        flex: 2;
    }

    /* 确认弹窗 */
    .confirm-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        background: var(--b3-mask-background);
    }

    .confirm-dialog {
        display: flex;
        flex-direction: column;
        background: var(--b3-theme-surface);
        border-radius: var(--b3-border-radius-b);
        width: 440px;
        max-width: 90vw;
        max-height: calc(100vh - 32px);
        max-height: calc(100dvh - 32px);
        overflow: hidden;
        box-shadow: var(--b3-dialog-shadow);
        animation: dialog-enter 0.2s ease;
    }

    @keyframes dialog-enter {
        from {
            transform: translateY(20px);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }

    .confirm-header {
        padding: 12px 16px;
        border-bottom: 1px solid var(--b3-border-color);
    }

    .confirm-header h2 {
        font-size: 1em;
        margin: 0;
        color: var(--b3-theme-on-surface);
    }

    .confirm-body {
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 16px;
        font-size: 14px;
        line-height: 1.6;
    }

    .confirm-body p {
        margin: 0 0 8px;
        color: var(--b3-theme-on-surface);
    }

    .confirm-body p:last-child {
        margin-bottom: 0;
    }

    .confirm-tips {
        padding: 8px 12px;
        background: var(--b3-theme-background);
        border-radius: 6px;
        margin-top: 8px;
    }

    .confirm-tips p {
        font-size: 13px;
        color: var(--b3-theme-on-surface-light);
        margin: 4px 0;
    }

    .warning-text {
        color: var(--b3-theme-error);
        font-weight: 600;
    }

    .confirm-footer {
        flex: 0 0 auto;
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        padding: 12px 16px;
        border-top: 1px solid var(--b3-border-color);
    }

    /* 响应式 */
    @media (max-width: 700px) {
        .main-body {
            flex-direction: column;
        }

        .template-list-panel {
            width: 100%;
            max-height: 200px;
        }

        .vip-gate-grid {
            grid-template-columns: 1fr;
        }
    }

    /* 列表轻提示 */
    .template-list-section-hint {
        padding: 8px 12px;
        text-align: center;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        line-height: 1.5;
    }

    .template-list-section-hint p {
        margin: 0;
    }

    /* 保存入口 */
    .save-layout-entry {
        padding: 10px 0 0;
        border-top: 1px solid var(--b3-border-color);
        margin-top: 8px;
        flex-shrink: 0;
    }

    .save-entry-btn {
        width: 100%;
    }

    /* 自定义徽章 */
    .custom-badge {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 12px;
        background: var(--b3-theme-primary);
        color: #fff;
        font-weight: 500;
    }

    /* 个人布局操作区 */
    .user-layout-actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 12px;
    }

    .delete-btn {
        width: 100%;
        color: var(--b3-theme-error);
        border-color: var(--b3-theme-error);
    }

    .delete-btn:hover {
        background: rgba(217, 83, 79, 0.1);
    }

    /* 保存表单 */
    .save-form {
        margin-top: 12px;
        padding: 12px;
        background: var(--b3-theme-background);
        border-radius: 6px;
    }

    .form-group {
        margin-bottom: 10px;
    }

    .form-label {
        display: block;
        font-size: 13px;
        color: var(--b3-theme-on-surface);
        font-weight: 500;
        margin-bottom: 4px;
    }

    .form-input {
        width: 100%;
        padding: 6px 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        font-size: 13px;
        box-sizing: border-box;
    }

    .form-input:focus {
        outline: none;
        border-color: var(--b3-theme-primary);
    }

    .form-textarea {
        min-height: 60px;
        resize: vertical;
        font-family: inherit;
    }

    .form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }

    .standalone-save-form {
        margin-top: 12px;
        padding: 16px;
        background: var(--b3-theme-background);
        border-radius: 6px;
    }

    .template-light-note {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        margin: 8px 0;
    }

    .layout-preview-section {
        margin-top: 12px;
    }

    .layout-preview {
        max-height: 260px;
        overflow: auto;
        padding: 8px;
        background: var(--b3-theme-surface);
        border-radius: 6px;
    }

    .layout-preview-grid {
        display: grid;
        user-select: none;
        pointer-events: none;
    }

    .layout-preview-item {
        padding: 8px;
        background: var(--b3-theme-background);
        border-radius: 4px;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        border: 1px solid var(--b3-border-color);
    }

    .layout-preview-item.missing {
        opacity: 0.4;
        background: var(--b3-theme-surface-light);
        color: var(--b3-theme-on-surface-light);
    }

    .layout-preview-item.placeholder {
        opacity: 0.65;
        background: var(--b3-theme-surface-light);
        color: var(--b3-theme-on-surface-light);
    }

    .missing-tag {
        display: block;
        font-size: 10px;
        color: var(--b3-theme-on-surface-light);
        margin-top: 2px;
    }

    .update-template-btn {
        width: 100%;
    }
</style>
