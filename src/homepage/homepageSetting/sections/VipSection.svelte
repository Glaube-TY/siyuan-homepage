<script lang="ts">
    import { showMessage } from "siyuan";
    import * as advanced from "@/components/tools/advanced";
    import type { LicenseVerifyResult } from "@/components/tools/advanced";
    import {
        redeemMembership,
        normalizeBaseUrl,
        DEFAULT_BASE_URL,
        RedeemError,
        type RedeemResponse,
    } from "@/services/redemptionService";
    import {
        syncLicenseStatus,
        type LicenseSyncResponse,
    } from "@/services/licenseStatusService";
    import pluginManifest from "../../../../plugin.json";

    interface Props {
        plugin: any;
        USER_NAME: string;
        USER_ID: string;
        USER_CODE: string;
        USER_CODE_V2?: string;
        IDENTITY_SOURCE?: string;
        activated: boolean;
        activationResult: any;
        ActivationCode: string;
        onDeactivate: () => Promise<void>;
        onActivate: () => Promise<void>;
        onActivationCodeChange: (value: string) => void;
        onAdvancedReady?: () => void;
        onMembershipActivated: (result: LicenseVerifyResult) => void;
        onMembershipRevoked: () => void;
    }

    let {
        plugin,
        USER_NAME,
        USER_ID,
        USER_CODE,
        USER_CODE_V2 = "",
        activated,
        activationResult,
        ActivationCode,
        onDeactivate,
        onActivate,
        onActivationCodeChange,
        onMembershipActivated,
        onMembershipRevoked,
    }: Props = $props();

    const TUTORIAL_URL = "https://blog.glaube-ty.top/zhu-ye-cha-jian";
    const MEMBER_GROUP_URL = "https://qm.qq.com/q/4ebO3QB6R2";
    const MEMBER_GROUP_NUMBER = "391403097";
    const AFDIAN_URL = "https://afdian.com/a/glaube-ty";
    const REDEMPTION_CONFIG_KEY = "redemption-service-config.json";

    // ── 兑换状态 ──
    let redemptionCode = $state("");
    let redeeming = $state(false);
    let redeemError = $state("");
    let redeemSuccessMessage = $state("");

    // ── 刷新会员状态 ──
    let syncing = $state(false);
    let syncMessage = $state("");

    // ── 服务地址 ──
    let serviceBaseUrl = $state(DEFAULT_BASE_URL);
    let serviceBaseUrlInput = $state(DEFAULT_BASE_URL);

    // ── 折叠区域 ──
    let showManualActivation = $state(false);
    let showServiceSettings = $state(false);

    // ── 加载服务地址配置 ──
    async function loadServiceConfig(): Promise<void> {
        try {
            const config = await plugin.loadData(REDEMPTION_CONFIG_KEY);
            if (config && typeof config === "object" && config.baseUrl) {
                const url = normalizeBaseUrl(config.baseUrl);
                if (url) {
                    serviceBaseUrl = url;
                    serviceBaseUrlInput = url;
                }
            }
        } catch {
            // 使用默认地址
        }
    }

    loadServiceConfig();

    function copyText(text: string, successMessage: string): void {
        if (!text) {
            showMessage("暂无可复制的会员识别码");
            return;
        }
        navigator.clipboard
            .writeText(text)
            .then(() => {
                showMessage(successMessage);
            })
            .catch((err) => {
                console.error("复制失败", err);
                showMessage("复制失败，请手动选择复制");
            });
    }

    // ── 兑换前刷新身份 ──
    async function refreshIdentityBeforeRedeem(): Promise<{
        userName: string;
        userId: string;
        userCodeV2: string;
    } | null> {
        const identity = await advanced.updateVIP();
        if (!identity.USER_ID) {
            return null;
        }
        return {
            userName: identity.USER_NAME,
            userId: identity.USER_ID,
            userCodeV2: identity.USER_CODE_V2,
        };
    }

    // ── 兑换并激活 ──
    async function handleRedeem(): Promise<void> {
        redeemError = "";
        redeemSuccessMessage = "";

        const code = redemptionCode.trim();
        if (!code) return;

        redeeming = true;
        try {
            const freshIdentity = await refreshIdentityBeforeRedeem();
            if (!freshIdentity) {
                redeemError = "请先登录后再兑换。";
                return;
            }

            const response: RedeemResponse = await redeemMembership(serviceBaseUrl, {
                userCode: freshIdentity.userCodeV2,
                redemptionCode: code,
                pluginVersion: pluginManifest.version || "unknown",
            });

            const result = await advanced.activateLicense(
                plugin,
                response.license,
                freshIdentity.userName,
                freshIdentity.userId,
            );

            if (!result.valid || !result.userInfo) {
                redeemError = result.error || "激活失败";
                return;
            }

            onMembershipActivated(result);
            redemptionCode = "";

            if (response.reused) {
                redeemSuccessMessage = "已恢复当前账号的会员授权。";
            } else if (result.userInfo.isLifetime) {
                redeemSuccessMessage = "永久会员兑换并激活成功。";
            } else if (response.isRenewal && response.addedDays) {
                redeemSuccessMessage = `会员续费成功，已增加 ${response.addedDays} 天。`;
            } else if (response.addedDays) {
                redeemSuccessMessage = `会员兑换并激活成功，已增加 ${response.addedDays} 天。`;
            } else {
                redeemSuccessMessage = "会员兑换并激活成功";
            }
        } catch (error) {
            if (error instanceof RedeemError) {
                switch (error.code) {
                    case "CODE_REPLACED_BY_NEWER_CODE":
                        redeemError =
                            "该兑换码已被后续兑换码替代，请使用最近一次兑换码找回会员状态。";
                        break;
                    case "MEMBERSHIP_REVOKED":
                        redeemError =
                            "当前账号的会员授权已被管理员清理，请使用新的兑换码或联系管理员。";
                        break;
                    case "USER_DELETED":
                        redeemError = "当前账号已被管理员删除，请联系管理员恢复。";
                        break;
                    case "CODE_BOUND_TO_OTHER_USER":
                        redeemError =
                            "该兑换码已被其他账号使用，请使用购买时对应的账号兑换。";
                        break;
                    case "NETWORK_ERROR":
                    case "SERVER_ERROR":
                    default:
                        redeemError =
                            error.message || "暂时无法连接激活服务器，请稍后重试。";
                }
            } else {
                redeemError =
                    error instanceof Error
                        ? error.message
                        : "暂时无法连接激活服务器，请稍后重试。";
            }
        } finally {
            redeeming = false;
        }
    }

    // ── 刷新会员状态（仅手动触发） ──
    async function handleSyncLicenseStatus(): Promise<void> {
        syncMessage = "";
        syncing = true;

        try {
            // 1. 刷新身份
            const identity = await advanced.updateVIP();
            if (!identity.USER_ID) {
                syncMessage = "请先登录。";
                return;
            }

            // 2. 读取本地 ActivationCode
            const localCode = await advanced.getSavedActivationCode(plugin);
            if (!localCode) {
                syncMessage = "本地没有可用于同步的 SH 授权，请重新输入兑换码或联系管理员。";
                return;
            }

            // 3. 旧 AES 不上传
            if (!localCode.startsWith("SH.")) {
                syncMessage = "旧版授权仅支持本地兼容验证，暂不支持服务器状态同步。";
                return;
            }

            // 4. 调用服务器
            const response: LicenseSyncResponse = await syncLicenseStatus(
                serviceBaseUrl,
                {
                    userCode: identity.USER_CODE_V2,
                    currentLicense: localCode,
                    pluginVersion: pluginManifest.version || "unknown",
                },
            );

            // 5. 按状态处理
            if (response.status === "active") {
                const result = await advanced.activateLicense(
                    plugin,
                    response.license,
                    identity.USER_NAME,
                    identity.USER_ID,
                );

                if (!result.valid || !result.userInfo) {
                    syncMessage = result.error || "服务器同步激活失败";
                    return;
                }

                onMembershipActivated(result);

                if (response.changed) {
                    syncMessage = "已同步管理员调整后的会员状态。";
                } else {
                    syncMessage = "当前会员状态已是最新。";
                }
            } else if (response.status === "revoked") {
                if (response.clearLocalLicense) {
                    await advanced.deleteLicense(plugin);
                    onMembershipRevoked();
                    syncMessage = "会员授权已由管理员取消，本地激活信息已清除。";
                } else {
                    syncMessage = response.message || "会员授权已被管理员取消。";
                }
            } else if (response.status === "expired") {
                syncMessage = response.message || "服务器返回会员已过期。";
                // 不删除本地授权，保留过期 SH 作为同步凭据
            } else if (response.status === "unmanaged") {
                syncMessage = response.message || "当前授权未在服务器托管。";
                // 不删除本地授权
            }
        } catch (error) {
            syncMessage =
                error instanceof Error
                    ? error.message
                    : "暂时无法连接激活服务器，请稍后重试。";
        } finally {
            syncing = false;
        }
    }

    // ── 保存服务地址 ──
    async function handleSaveServiceUrl(): Promise<void> {
        const normalized = normalizeBaseUrl(serviceBaseUrlInput);
        try {
            await plugin.saveData(REDEMPTION_CONFIG_KEY, { baseUrl: normalized });
            serviceBaseUrl = normalized;
            serviceBaseUrlInput = normalized;
            showMessage("服务器地址已保存", 2000);
        } catch {
            showMessage("保存失败，请稍后重试", 3000);
        }
    }

    function handleResetServiceUrl(): void {
        serviceBaseUrlInput = DEFAULT_BASE_URL;
        serviceBaseUrl = DEFAULT_BASE_URL;
        plugin.saveData(REDEMPTION_CONFIG_KEY, { baseUrl: DEFAULT_BASE_URL }).catch(() => {});
    }

    const isPermanentMember = $derived(
        activated && activationResult?.userInfo?.isLifetime === true,
    );

    function getRedeemButtonDisabled(): boolean {
        if (!USER_ID) return true;
        if (redeeming) return true;
        if (!redemptionCode.trim()) return true;
        if (isPermanentMember) return true;
        return false;
    }
</script>

<div class="vip-section">
    <!-- ═══ 1. 当前账号 ═══ -->
    <div class="vip-info">
        {#if USER_NAME || USER_ID}
            <label for="">用户名：{USER_NAME}</label>
            <label for="">用户ID：{USER_ID}</label>
            <div class="sync-status-area">
                <button
                    class="sync-status-btn"
                    onclick={handleSyncLicenseStatus}
                    disabled={syncing}
                >
                    {syncing ? "正在刷新……" : "刷新会员状态"}
                </button>
                <span class="sync-status-hint">仅在点击时联网同步管理员调整；平时仍使用本地离线验证。</span>
                {#if syncMessage}
                    <span class="sync-status-message">{syncMessage}</span>
                {/if}
            </div>
        {:else}
            <label for="">请先登录后进行查看！</label>
        {/if}
    </div>

    <!-- ═══ 2. 当前会员状态 ═══ -->
    {#if activated}
        <div
            class="activated"
            class:activated-lifetime={activationResult.userInfo.isLifetime}
        >
            <div class="activated-hero">
                <div class="activated-badge">
                    {activationResult.userInfo.isLifetime ? "永久会员" : "会员已激活"}
                </div>
                <h2>
                    {activationResult.userInfo.isLifetime ? "尊享永久会员" : "会员服务已启用"}
                </h2>
                <p class="activated-desc">
                    感谢你对主页插件的支持。愿它继续陪你整理灵感、沉淀知识，也欢迎把使用建议反馈给作者。
                </p>
                {#if activationResult.userInfo.isLifetime}
                    <p class="activated-desc lifetime-desc">
                        你已获得永久会员资格，后续可持续享受会员功能与更新支持。
                    </p>
                {/if}
            </div>

            <div class="activated-stats">
                <div class="activated-stat">
                    <span>到期时间</span>
                    <strong>{activationResult.userInfo.due}</strong>
                </div>
                <div class="activated-stat">
                    <span>剩余天数</span>
                    <strong>
                        {activationResult.userInfo.isLifetime ? "永久" : activationResult.userInfo.remainingDays}
                    </strong>
                </div>
            </div>

            <div class="member-actions">
                <a
                    class="member-link primary"
                    href={TUTORIAL_URL}
                    target="_blank"
                    rel="noopener noreferrer">查看插件教程</a
                >
                <a
                    class="member-link"
                    href={MEMBER_GROUP_URL}
                    target="_blank"
                    rel="noopener noreferrer">加入主页插件会员群</a
                >
            </div>

            <div class="member-group-card">
                <div>
                    <span>主页插件会员群</span>
                    <strong>群号：{MEMBER_GROUP_NUMBER}</strong>
                </div>
                <p>群内会同步教程、常见问题和会员相关说明，也欢迎交流你的主页配置思路。</p>
            </div>

            {#if activationResult.legacyDeprecated}
                <div class="legacy-license-warning">
                    ⚠️ 当前使用的是旧版激活码。激活方式已更换，请联系作者换发新版激活码。
                    旧版激活方式将只兼容到 2026 年 8 月 31 日。
                </div>
            {/if}
            <button class="deactivate-button" onclick={onDeactivate}>注销激活</button>
        </div>
    {/if}

    <!-- ═══ 3. 购买与兑换会员 ═══ -->
    <div class="purchase-redeem-section">
        <h2>👑 会员服务</h2>
        <h3>
            <a
                href="https://blog.glaube-ty.top/archives/019d3f20-03d4-70fd-8afe-dff8bb2107ab"
                target="_blank"
                class="vip-benefits-link">👑查看会员权益👑</a
            >
        </h3>

        {#if USER_NAME || USER_ID}
            <!-- 套餐卡 -->
            <div class="purchase-plan">
                <h4>💰 订阅方案</h4>
                <div class="plan-card">
                    <div class="plan-item monthly">
                        <div class="plan-price">
                            <span class="new-price" style="color: var(--b3-theme-primary); font-weight: bold; font-size: 18px;">5 元</span>
                        </div>
                        <div class="plan-duration">/ 月</div>
                    </div>
                    <div class="plan-item monthly">
                        <div class="plan-price">
                            <span class="new-price" style="color: var(--b3-theme-primary); font-weight: bold; font-size: 18px;">12 元</span>
                        </div>
                        <div class="plan-duration">/ 季</div>
                    </div>
                    <div class="plan-item yearly">
                        <div class="plan-price">
                            <span class="new-price" style="color: var(--b3-theme-primary); font-weight: bold; font-size: 18px;">35 元</span>
                        </div>
                        <div class="plan-duration">/ 年</div>
                    </div>
                    <div class="plan-item permanent">
                        <div class="plan-badge">🔥 限时优惠</div>
                        <div class="plan-price">
                            <span class="old-price" style="text-decoration: line-through; color: #999; font-size: 14px; margin-right: 5px;">128 元</span>
                            <span class="new-price" style="color: #ef4444; font-weight: bold; font-size: 20px;">99 元</span>
                        </div>
                        <div class="plan-duration">永久会员</div>
                        <div class="plan-urgency">⏰ 随时恢复原价</div>
                    </div>
                </div>
            </div>

            <!-- 购买地址 -->
            <div class="purchase-address">
                <h4>🛍️ 购买地址</h4>
                <div class="address-card">
                    <div class="address-item">
                        <span class="icon">🔗</span>
                        <div class="address-content">
                            <strong>地址：</strong>
                            <a href={AFDIAN_URL}>爱发电</a>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 兑换说明 -->
            <p class="redemption-desc">
                在爱发电购买后，复制系统自动发送的会员兑换码，在此完成兑换。
            </p>
            {#if activated && !isPermanentMember}
                <p class="redemption-renewal-hint">
                    兑换后会在当前剩余天数基础上增加对应套餐时长。
                </p>
            {/if}

            <!-- ═══ 4. 兑换区域 ═══ -->
            <div class="redemption-section">
                <div class="redemption-input-row">
                    <input
                        type="text"
                        class="redemption-code-input"
                        placeholder="请输入会员兑换码"
                        bind:value={redemptionCode}
                        disabled={redeeming || isPermanentMember}
                    />
                    <button
                        class="redeem-btn"
                        onclick={handleRedeem}
                        disabled={getRedeemButtonDisabled()}
                    >
                        {redeeming ? "正在兑换……" : "兑换并激活"}
                    </button>
                </div>
                {#if isPermanentMember}
                    <p class="redeem-permanent-hint">当前账号已经是永久会员，无需继续续费。</p>
                {/if}
                {#if !USER_ID}
                    <p class="redeem-login-hint">请先登录后再兑换。</p>
                {/if}
                {#if redeemError}
                    <div class="redeem-error">{redeemError}</div>
                {/if}
                {#if redeemSuccessMessage}
                    <div class="redeem-success">{redeemSuccessMessage}</div>
                {/if}
            </div>

            <!-- 问题咨询 -->
            <div class="purchase-question">
                <h4>❓ 问题咨询</h4>
                <div class="question-card">
                    <div class="question-item">
                        <span class="icon">📧</span>
                        <div class="question-content">
                            <strong>邮箱：</strong>
                            <a href="mailto:glaube_ty@qq.com">glaube_ty@qq.com</a>
                        </div>
                    </div>
                    <div class="question-item">
                        <span class="icon">💬</span>
                        <div class="question-content">
                            <strong>腾讯频道：(订阅问题请私信管理员)</strong>
                            <a href="https://pd.qq.com/s/2ks4079x0">SY 插件交流频道</a>
                        </div>
                    </div>
                </div>
            </div>
        {:else}
            <label for="">由于会员功能与账号绑定，<br />请先登录后进行查看！</label>
        {/if}
    </div>

    <!-- ═══ 5. 售后手动激活（折叠） ═══ -->
    <div class="collapsible-section">
        <button
            class="collapsible-toggle"
            onclick={() => (showManualActivation = !showManualActivation)}
        >
            <span class="collapsible-arrow" class:expanded={showManualActivation}>▶</span>
            售后手动激活
        </button>
        {#if showManualActivation}
            <div class="collapsible-content">
                <p class="collapsible-hint">
                    仅用于作者人工下发的 SH 激活码，普通购买请使用上方会员兑换码。
                </p>
                {#if USER_NAME || USER_ID}
                    <div class="manual-activation-code-row">
                        <label for="manual-activation-code">SH 激活码：</label>
                        <textarea
                            id="manual-activation-code"
                            value={ActivationCode}
                            oninput={(e) => onActivationCodeChange(e.currentTarget.value)}
                        ></textarea>
                    </div>
                    <div class="btn-group">
                        <button onclick={onActivate}>激活</button>
                    </div>
                    <!-- 售后场景下可能需要会员识别码 -->
                    <div class="manual-user-code">
                        <span>会员识别码：</span>
                        <code>{USER_CODE_V2 || USER_CODE}</code>
                        <button
                            class="copy-btn-small"
                            onclick={() => copyText(USER_CODE_V2 || USER_CODE, "会员识别码已复制")}
                        >复制</button>
                    </div>
                {:else}
                    <label for="">由于会员功能与账号绑定，<br />请先登录后进行查看！</label>
                {/if}
            </div>
        {/if}
    </div>

    <!-- ═══ 6. 激活服务连接设置（折叠） ═══ -->
    <div class="collapsible-section">
        <button
            class="collapsible-toggle"
            onclick={() => (showServiceSettings = !showServiceSettings)}
        >
            <span class="collapsible-arrow" class:expanded={showServiceSettings}>▶</span>
            激活服务连接设置
        </button>
        {#if showServiceSettings}
            <div class="collapsible-content">
                <div class="service-url-row">
                    <label for="service-url-input">服务器地址</label>
                    <div class="service-url-control">
                        <input
                            id="service-url-input"
                            type="text"
                            class="service-url-input"
                            bind:value={serviceBaseUrlInput}
                            placeholder={DEFAULT_BASE_URL}
                        />
                        <button class="btn" onclick={handleSaveServiceUrl}>保存</button>
                        <button class="btn" onclick={handleResetServiceUrl}>恢复默认</button>
                    </div>
                </div>
            </div>
        {/if}
    </div>
</div>
