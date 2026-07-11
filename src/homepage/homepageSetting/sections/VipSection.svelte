<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { showMessage } from "siyuan";
    import * as advanced from "@/components/tools/advanced";
    import type { LicenseVerifyResult } from "@/components/tools/advanced";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import { redeemMembership, type RedeemResponse } from "@/services/redemptionService";
    import { syncLicenseStatus, type LicenseSyncResponse } from "@/services/licenseStatusService";
    import {
        MembershipServiceError,
        normalizeBaseUrl,
        DEFAULT_BASE_URL,
        testServiceConnection,
        confirmActivationBestEffort,
        recoverMembershipByIdentity,
        registerExistingSignedLicense,
        isServerMembershipMetadataConsistent,
        type ServiceStatusResult,
    } from "@/services/membershipService";
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
        activated,
        activationResult,
        onDeactivate,
        onMembershipActivated,
        onMembershipRevoked,
    }: Props = $props();

    const TUTORIAL_URL = "https://blog.glaube-ty.top/zhu-ye-cha-jian";
    const MEMBER_GROUP_URL = "https://qm.qq.com/q/4ebO3QB6R2";
    const MEMBER_GROUP_NUMBER = "391403097";
    const AFDIAN_URL = "https://afdian.com/a/glaube-ty";
    const REDEMPTION_CONFIG_KEY = "redemption-service-config.json";
    const ACCOUNT_CHANGED_NO_MUTATION =
        "当前登录账号已变化，本地会员数据未被修改。请切回原账号后点击“刷新/恢复会员状态”，不要重复提交。";
    const ACCOUNT_CHANGED_AFTER_SAVE =
        "会员授权已保存到原账号，但当前登录账号已变化。请切回原账号并重新打开会员设置，不要重新购买或重复兑换。";

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

    // ── 实时身份快照（仅用于界面显示和按钮判断，远程请求仍需重新读取） ──
    let liveUserName = $state("");
    let liveUserId = $state("");
    let liveIdentityLoaded = $state(false);
    // 仅用于异步结果失效，不应成为 effect 的响应式依赖。
    let identityRefreshSeq = 0;

    // ── 测试连接 ──
    let testingService = $state(false);
    let testConnectionMessage = $state("");
    let testConnectionStatus = $state<ServiceStatusResult["status"] | "">("");

    // ── 保存地址 ──
    let savingServiceUrl = $state(false);
    let registeringExisting = $state(false);
    let autoRegistrationPreparing = $state(false);
    let serviceConfigLoading = $state(true);
    let serviceConfigLoaded = $state(false);
    const autoRegistrationAttemptedKeys = new Set<string>();
    const autoRegistrationProbeCompletedKeys = new Set<string>();

    // ── 注销 ──
    let deactivating = $state(false);

    // ── 折叠区域 ──
    let showServiceSettings = $state(false);
    let showRenewal = $state(false);

    // ── 前台忙碌：后台自动登记不应阻塞前台按钮，但前台操作应阻塞后台登记 ──
    const foregroundBusy = $derived(
        redeeming ||
            syncing ||
            testingService ||
            savingServiceUrl ||
            deactivating ||
            serviceConfigLoading,
    );

    // busy 仅反映前台状态，后台自动登记不阻塞用户交互
    const busy = $derived(foregroundBusy);

    // ── 异步上下文保护 ──
    let componentAlive = $state(true);
    let operationGeneration = $state(0);

    interface OperationContext {
        gen: number;
        userId?: string;
        serviceOrigin: string;
        localSh: string;
    }

    onDestroy(() => {
        componentAlive = false;
        operationGeneration += 1;
        identityRefreshSeq += 1;
    });

    /** 前台操作开始时调用：递增 generation，使旧前台和旧后台请求失效。 */
    function beginForegroundOperation(localSh: string = ""): OperationContext {
        operationGeneration += 1;
        return {
            gen: operationGeneration,
            serviceOrigin: serviceBaseUrl,
            localSh,
        };
    }

    /** 取得实时身份后，把真实 userId 绑定到同一 generation 的上下文。 */
    function bindIdentityContext(ctx: OperationContext, userId: string): OperationContext {
        return {
            gen: ctx.gen,
            userId,
            serviceOrigin: ctx.serviceOrigin,
            localSh: ctx.localSh,
        };
    }

    /** 后台自动登记使用只读快照，不递增 generation；新前台操作开始后自然失效。 */
    function makeBackgroundContext(userId: string, localSh: string): OperationContext {
        return {
            gen: operationGeneration,
            userId,
            serviceOrigin: serviceBaseUrl,
            localSh,
        };
    }

    /** 在同一前台操作内派生子上下文（如登记 SH 后继续 sync），不递增 generation。 */
    function deriveOperationContext(parentCtx: OperationContext, localSh: string): OperationContext {
        return {
            gen: parentCtx.gen,
            userId: parentCtx.userId,
            serviceOrigin: parentCtx.serviceOrigin,
            localSh,
        };
    }

    function isForegroundContextValid(ctx: OperationContext): boolean {
        if (!componentAlive) return false;
        if (ctx.gen !== operationGeneration) return false;
        if (ctx.serviceOrigin !== serviceBaseUrl) return false;
        return true;
    }

    /** 对需要绑定 SH 的操作，再次读取真实本地 ActivationCode 确认未变化。 */
    async function isSavedShContextStillValid(
        ctx: OperationContext,
        expectedSh?: string,
    ): Promise<boolean> {
        if (!isForegroundContextValid(ctx)) return false;
        if (!ctx.localSh) return false;
        if (expectedSh && ctx.localSh !== expectedSh) return false;
        const saved = await advanced.readSavedActivationCodeState(plugin);
        return saved.status === "found" && saved.code === ctx.localSh;
    }

    type LiveIdentityContextResult =
        | { valid: true; reason: "ok"; identity: Awaited<ReturnType<typeof advanced.updateVIP>> }
        | { valid: false; reason: "changed" | "read_error" | "context_invalid" };

    /** 实时身份复核：保留失效原因，避免把账号切换误报为网络或重试操作。 */
    async function checkLiveIdentityContext(
        ctx: OperationContext,
    ): Promise<LiveIdentityContextResult> {
        if (!isForegroundContextValid(ctx) || !ctx.userId) {
            return { valid: false, reason: "context_invalid" };
        }
        try {
            const currentIdentity = await advanced.updateVIP();
            return currentIdentity.USER_ID === ctx.userId
                ? { valid: true, reason: "ok", identity: currentIdentity }
                : { valid: false, reason: "changed" };
        } catch {
            return { valid: false, reason: "read_error" };
        }
    }

    async function requireLiveIdentityContext(
        ctx: OperationContext,
        setFailureMessage: (message: string) => void,
        changedMessage: string,
    ): Promise<boolean> {
        const check = await checkLiveIdentityContext(ctx);
        if (check.valid) return true;
        if (check.reason === "read_error") {
            setFailureMessage("暂时无法确认当前思源账号，本地会员数据未被修改。请稍后重试。");
        } else if (check.reason === "changed") {
            setFailureMessage(changedMessage);
        }
        return false;
    }

    function invalidateOldOperations(): void {
        operationGeneration += 1;
    }

    // ── 加载服务地址配置 ──
    async function loadServiceConfig(): Promise<void> {
        try {
            const config = await plugin.loadData(REDEMPTION_CONFIG_KEY);
            if (!componentAlive) return;
            if (config && typeof config === "object" && config.baseUrl) {
                const url = normalizeBaseUrl(config.baseUrl);
                if (url) {
                    serviceBaseUrl = url;
                    serviceBaseUrlInput = url;
                }
            }
        } catch {
            // 使用默认地址
        } finally {
            if (componentAlive) {
                serviceConfigLoading = false;
                serviceConfigLoaded = true;
            }
        }
    }

    loadServiceConfig();

    // ── 实时身份快照 ──
    function applyLiveIdentitySnapshot(
        identity: { USER_NAME: string; USER_ID: string },
        isInitialLoad = false,
    ): void {
        if (!componentAlive) return;

        const prevUserId = liveUserId;
        liveUserName = identity.USER_NAME;
        liveUserId = identity.USER_ID;

        if (isInitialLoad) {
            liveIdentityLoaded = true;
            return;
        }

        // 真实账号发生变化（含退出登录变为空）时清理旧账号状态
        if (liveUserId !== prevUserId) {
            redeemSuccessMessage = "";
            syncMessage = "";
            testConnectionMessage = "";
            testConnectionStatus = "";
            invalidateOldOperations();
            autoRegistrationAttemptedKeys.clear();
            autoRegistrationProbeCompletedKeys.clear();
        }
    }

    async function refreshLiveIdentitySnapshot(seq: number): Promise<void> {
        let identity: { USER_NAME: string; USER_ID: string };
        try {
            identity = await advanced.updateVIP();
        } catch {
            return;
        }
        if (!componentAlive) return;
        if (seq !== identityRefreshSeq) return;
        applyLiveIdentitySnapshot(identity);
    }

    onMount(async () => {
        // 初始化时先用 Props 作为临时展示回退
        liveUserName = USER_NAME;
        liveUserId = USER_ID;
        try {
            const identity = await advanced.updateVIP();
            if (!componentAlive) return;
            applyLiveIdentitySnapshot(identity, true);
        } catch {
            // 身份读取失败时保持 Props 作为临时展示回退
            if (componentAlive) {
                liveIdentityLoaded = true;
            }
        }
    });

    $effect(() => {
        // Props 变化只作为“思源身份可能变化”的信号，最终仍以 updateVIP() 真实结果为准
        if (!componentAlive || !liveIdentityLoaded) return;
        void USER_ID;
        void USER_NAME;
        const seq = ++identityRefreshSeq;
        void refreshLiveIdentitySnapshot(seq);
    });

    function clearMessages(ctx?: OperationContext): void {
        if (!ctx || isForegroundContextValid(ctx)) {
            redeemError = "";
            redeemSuccessMessage = "";
            syncMessage = "";
            testConnectionMessage = "";
            testConnectionStatus = "";
        }
    }

    function setRedeemError(ctx: OperationContext, message: string): void {
        if (isForegroundContextValid(ctx)) redeemError = message;
    }

    function setRedeemSuccess(ctx: OperationContext, message: string): void {
        if (isForegroundContextValid(ctx)) redeemSuccessMessage = message;
    }

    function setSyncMessage(ctx: OperationContext, message: string): void {
        if (isForegroundContextValid(ctx)) syncMessage = message;
    }

    function setTestConnection(
        ctx: OperationContext,
        status: ServiceStatusResult["status"],
        message: string,
    ): void {
        if (isForegroundContextValid(ctx)) {
            testConnectionStatus = status;
            testConnectionMessage = message;
        }
    }

    async function activateIfValid(ctx: OperationContext, result: LicenseVerifyResult): Promise<void> {
        if (!isForegroundContextValid(ctx) || !result.valid) return;
        try {
            await onMembershipActivated(result);
        } catch {
            if (isForegroundContextValid(ctx)) {
                showMessage("会员授权已保存，但界面状态刷新失败，请重新打开设置页。", 3000);
            }
        }
    }

    function isServerMetadataConsistent(
        result: LicenseVerifyResult,
        server: { durationDays: number; issuedDate: string; isLifetime?: boolean },
    ): boolean {
        const info = result.userInfo;
        return Boolean(
            info &&
                typeof info.durationDays === "number" &&
                typeof info.issuedDate === "string" &&
                typeof info.isLifetime === "boolean" &&
                isServerMembershipMetadataConsistent(
                    {
                        durationDays: info.durationDays,
                        issuedDate: info.issuedDate,
                        isLifetime: info.isLifetime,
                    },
                    server,
                ),
        );
    }

    async function revokeIfValid(ctx: OperationContext): Promise<void> {
        if (!isForegroundContextValid(ctx)) return;
        try {
            await onMembershipRevoked();
        } catch {
            if (isForegroundContextValid(ctx)) {
                showMessage("会员授权已清除，但界面状态刷新失败，请重新打开设置页。", 3000);
            }
        }
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
        if (busy) return;

        const code = redemptionCode.trim();
        if (!code) return;

        const ctx = beginForegroundOperation();
        clearMessages(ctx);
        redeeming = true;

        try {
            let freshIdentity: Awaited<ReturnType<typeof refreshIdentityBeforeRedeem>>;
            try {
                freshIdentity = await refreshIdentityBeforeRedeem();
            } catch {
                setRedeemError(
                    ctx,
                    "暂时无法确认当前思源账号，请稍后重试。本地会员数据未被修改。",
                );
                return;
            }
            if (!isForegroundContextValid(ctx) || !freshIdentity) {
                if (isForegroundContextValid(ctx)) redeemError = "请先登录后再兑换。";
                return;
            }

            // 绑定实时身份到同一 generation
            const boundCtx = bindIdentityContext(ctx, freshIdentity.userId);

            const response: RedeemResponse = await redeemMembership(serviceBaseUrl, {
                userCode: freshIdentity.userCodeV2,
                redemptionCode: code,
                pluginVersion: pluginManifest.version || "unknown",
            });

            if (!isForegroundContextValid(boundCtx)) return;

            if (!(await requireLiveIdentityContext(
                boundCtx,
                (message) => setRedeemError(boundCtx, message),
                "兑换请求已按原账号提交，但当前登录账号已变化。请切回原账号后点击“刷新/恢复会员状态”，不要在新账号重复兑换，也不要重新购买。",
            ))) {
                return;
            }

            const result = await advanced.activateLicense(
                plugin,
                response.license,
                freshIdentity.userName,
                freshIdentity.userId,
            );

            if (!isForegroundContextValid(boundCtx)) return;

            if (!result.valid || !result.userInfo) {
                setRedeemError(
                    boundCtx,
                    result.code === 51
                        ? "服务器兑换已经完成，但本地保存失败。请稍后重新输入同一兑换码恢复，不要重新购买。"
                        : result.error || "激活失败",
                );
                return;
            }

            // SH 已保存后，先确认实时账号，再用签名结果更新界面。
            if (!(await requireLiveIdentityContext(
                boundCtx,
                (message) => setRedeemError(boundCtx, message),
                "会员授权已保存到原账号，但当前登录账号已变化。请切回原账号并重新打开会员设置，不要重新购买或重复兑换。",
            ))) {
                return;
            }

            // 服务器字段只作协议展示；不一致时保留已验签的 SH，也不写管理标记。
            if (!isServerMetadataConsistent(result, response)) {
                await activateIfValid(boundCtx, result);
                setRedeemSuccess(
                    boundCtx,
                    "会员授权已保存，但服务器返回的展示信息不一致，请保留当前兑换码并联系作者。",
                );
                return;
            }

            const markerSaved = await advanced.markCurrentLicenseServerManaged(
                plugin,
                response.license,
                "redemption",
                serviceBaseUrl,
            );

            if (!isForegroundContextValid(boundCtx)) return;

            if (!(await requireLiveIdentityContext(
                boundCtx,
                (message) => setRedeemError(boundCtx, message),
                "会员授权已保存到原账号，但当前登录账号已变化。请切回原账号并重新打开会员设置，不要重新购买或重复兑换。",
            ))) {
                return;
            }

            await activateIfValid(boundCtx, result);
            if (isForegroundContextValid(boundCtx)) {
                redemptionCode = "";
                showRenewal = false;
            }

            let successMessage = "";
            if (response.reused) {
                successMessage = "已恢复当前账号的会员授权。";
            } else if (result.userInfo.isLifetime) {
                successMessage = "永久会员兑换并激活成功。";
            } else if (response.isRenewal && response.addedDays) {
                successMessage = `会员续费成功，已增加 ${response.addedDays} 天。`;
            } else if (response.addedDays) {
                successMessage = `会员兑换并激活成功，已增加 ${response.addedDays} 天。`;
            } else {
                successMessage = "会员兑换并激活成功";
            }

            if (!markerSaved) {
                successMessage += " 服务器管理标记暂未保存，不影响会员使用，后续刷新时会再次尝试。";
            }
            setRedeemSuccess(boundCtx, successMessage);

            if (!isForegroundContextValid(boundCtx)) return;

            // 本地保存成功后尽力确认，失败不影响本地激活
            await confirmActivationBestEffort(serviceBaseUrl, {
                license: response.license,
                userId: freshIdentity.userId,
                pluginVersion: pluginManifest.version || "unknown",
            });

            // 确认请求期间账号可能切换，只接受结束后的新实时身份结果。
            if (isForegroundContextValid(boundCtx)) {
                const seq = ++identityRefreshSeq;
                void refreshLiveIdentitySnapshot(seq);
            }
        } catch (error) {
            if (isForegroundContextValid(ctx)) {
                if (error instanceof MembershipServiceError) {
                    redeemError = error.message;
                } else {
                    redeemError = "暂时无法连接激活服务器，请稍后重试。";
                }
            }
        } finally {
            redeeming = false;
        }
    }

    interface RegisterSignedLicenseResult {
        attempted: boolean;
        registered: boolean;
        alreadyRegistered: boolean;
        markerSaved: boolean;
        warning?: string;
    }

    async function registerCurrentSignedLicense(
        identity: Awaited<ReturnType<typeof advanced.updateVIP>>,
        localCode: string,
        ctx: OperationContext,
        onRequestStart?: () => void,
    ): Promise<RegisterSignedLicenseResult> {
        const result: RegisterSignedLicenseResult = {
            attempted: false,
            registered: false,
            alreadyRegistered: false,
            markerSaved: false,
        };

        if (!(await isSavedShContextStillValid(ctx, localCode))) return result;
        if (!localCode.startsWith("SH.")) return result;

        const localVerification = await advanced.verifySavedSignedLicenseReadOnly(
            plugin,
            identity.USER_NAME,
            identity.USER_ID,
        );
        if (!(await isSavedShContextStillValid(ctx, localCode))) return result;
        if (!localVerification.valid || localVerification.licenseVersion !== 2) {
            return result;
        }

        const managementState = await advanced.getSavedLicenseManagementState(
            plugin,
            localCode,
            ctx.serviceOrigin,
        );
        if (!(await isSavedShContextStillValid(ctx, localCode))) return result;
        if (!managementState.matchesExpectedLicense || managementState.serverManaged) return result;

        // 所有前置检查通过，即将发送网络请求
        result.attempted = true;
        onRequestStart?.();

        try {
            const response = await registerExistingSignedLicense(ctx.serviceOrigin, {
                userCode: identity.USER_CODE_V2,
                currentLicense: localCode,
                pluginVersion: pluginManifest.version || "unknown",
            });

            if (!(await checkLiveIdentityContext(ctx)).valid) return result;
            if (!(await isSavedShContextStillValid(ctx, localCode))) return result;

            result.registered = response.registered;
            result.alreadyRegistered = response.alreadyRegistered;

            if (!isServerMetadataConsistent(localVerification, response)) {
                throw new MembershipServiceError({
                    code: "SERVER_PROTOCOL_ERROR",
                    message: "服务器会员状态信息异常，本地会员未被修改。",
                });
            }

            const markerSaved = await advanced.markCurrentLicenseServerManaged(
                plugin,
                localCode,
                "existing_signed_sh",
                ctx.serviceOrigin,
            );

            if (!(await checkLiveIdentityContext(ctx)).valid) return result;

            result.markerSaved = markerSaved;

            if (!markerSaved) {
                result.warning = "服务器管理标记暂未保存，不影响会员使用，后续刷新时会再次尝试。";
            }

            return result;
        } catch (error) {
            // 登记异常由调用方决定如何展示；后台自动登记保持静默。
            throw error;
        }
    }

    async function sha256Hex(input: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(input);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    function makeAutoRegistrationAttemptKey(
        userId: string,
        serviceOrigin: string,
        licenseHash: string,
    ): string {
        return `${userId}|${serviceOrigin}|${licenseHash}`;
    }

    async function autoRegisterExistingSignedLicense(): Promise<void> {
        if (!componentAlive || !serviceConfigLoaded || foregroundBusy || autoRegistrationPreparing || registeringExisting) return;

        // 从函数入口即占用准备锁，覆盖读取本地 SH、实时身份、验签、管理状态、计算哈希和实际请求
        autoRegistrationPreparing = true;
        try {
            const saved = await advanced.readSavedActivationCodeState(plugin);
            // 文件读取失败和授权暂缺都可能是临时状态，不能消耗探测机会。
            if (saved.status !== "found") return;
            const localCode = saved.code;

            let identity: Awaited<ReturnType<typeof advanced.updateVIP>>;
            try {
                identity = await advanced.updateVIP();
            } catch {
                return;
            }
            if (!identity.USER_ID) return;

            const ctx = makeBackgroundContext(identity.USER_ID, localCode);
            const licenseHash = await sha256Hex(localCode);
            const probeKey = makeAutoRegistrationAttemptKey(
                identity.USER_ID,
                ctx.serviceOrigin,
                licenseHash,
            );
            if (autoRegistrationProbeCompletedKeys.has(probeKey)) return;

            if (!localCode.startsWith("SH.")) {
                autoRegistrationProbeCompletedKeys.add(probeKey);
                return;
            }

            // 本地验签：只有真正有效的 SH 才尝试登记
            const localVerification = await advanced.verifySavedSignedLicenseReadOnly(
                plugin,
                identity.USER_NAME,
                identity.USER_ID,
            );
            if (!localVerification.valid || localVerification.licenseVersion !== 2) {
                autoRegistrationProbeCompletedKeys.add(probeKey);
                return;
            }

            // 已被当前服务器管理则无需重复登记
            const managementState = await advanced.getSavedLicenseManagementState(
                plugin,
                localCode,
                ctx.serviceOrigin,
            );
            if (!managementState.matchesExpectedLicense) return;
            if (managementState.serverManaged) {
                autoRegistrationProbeCompletedKeys.add(probeKey);
                return;
            }

            // 同一账号、服务器和 SH 在一次页面生命周期内最多自动请求一次
            if (autoRegistrationAttemptedKeys.has(probeKey)) {
                autoRegistrationProbeCompletedKeys.add(probeKey);
                return;
            }

            if (!isForegroundContextValid(ctx)) return;

            // 任何前台操作开始以后，后台上下文应自然失效
            if (foregroundBusy) return;

            registeringExisting = true;
            let registrationResult: RegisterSignedLicenseResult | undefined;
            try {
                // attemptKey 由 registerCurrentSignedLicense 在真正发送网络请求前加入
                registrationResult = await registerCurrentSignedLicense(identity, localCode, ctx, () => {
                    autoRegistrationAttemptedKeys.add(probeKey);
                });
            } catch {
                // 自动登记仅尽力执行；失败不影响本地会员，也不显示阻断提示。
            } finally {
                registeringExisting = false;
                // 仅在请求实际发出后完成探测；前置条件临时失效时保留后续响应式检查机会。
                if (registrationResult?.attempted || autoRegistrationAttemptedKeys.has(probeKey)) {
                    autoRegistrationProbeCompletedKeys.add(probeKey);
                }
            }
        } finally {
            autoRegistrationPreparing = false;
        }
    }

    $effect(() => {
        // 只读取业务触发条件；准备锁和请求锁仅在异步函数内部互斥使用。
        if (
            !serviceConfigLoaded ||
            foregroundBusy ||
            !activated ||
            activationResult?.licenseVersion !== 2 ||
            !liveUserId
        ) {
            return;
        }

        const serviceOrigin = serviceBaseUrl;
        const identitySignal = liveUserId;
        queueMicrotask(() => {
            if (componentAlive && serviceBaseUrl === serviceOrigin && liveUserId === identitySignal) {
                void autoRegisterExistingSignedLicense();
            }
        });
    });

    // ── 恢复已有会员（不读取本地授权，直接按当前思源账号身份恢复） ──
    async function handleRecoverExistingMembership(): Promise<void> {
        if (busy) return;

        const ctx = beginForegroundOperation();
        clearMessages(ctx);
        syncing = true;

        try {
            let identity: Awaited<ReturnType<typeof advanced.updateVIP>>;
            try {
                identity = await advanced.updateVIP();
            } catch {
                setSyncMessage(
                    ctx,
                    "暂时无法确认当前思源账号，请稍后重试。本地会员数据未被修改。",
                );
                return;
            }
            if (!isForegroundContextValid(ctx) || !identity.USER_ID) {
                if (isForegroundContextValid(ctx)) syncMessage = "请先登录。";
                return;
            }

            const boundCtx = bindIdentityContext(ctx, identity.USER_ID);

            const recovery = await recoverMembershipByIdentity(serviceBaseUrl, {
                userCode: identity.USER_CODE_V2,
                pluginVersion: pluginManifest.version || "unknown",
            });

            if (!isForegroundContextValid(boundCtx)) return;

            if (!(await requireLiveIdentityContext(
                boundCtx,
                (message) => setSyncMessage(boundCtx, message),
                ACCOUNT_CHANGED_NO_MUTATION,
            ))) {
                return;
            }

            const result = await advanced.activateLicense(
                plugin,
                recovery.license,
                identity.USER_NAME,
                identity.USER_ID,
            );

            if (!isForegroundContextValid(boundCtx)) return;

            if (!result.valid || !result.userInfo) {
                setSyncMessage(
                    boundCtx,
                    result.code === 51
                        ? "服务器已确认当前账号会员，但本地保存失败，请检查写入权限后再次点击恢复。"
                        : result.error || "服务器恢复的激活码验证失败。",
                );
                return;
            }

            if (!(await requireLiveIdentityContext(
                boundCtx,
                (message) => setSyncMessage(boundCtx, message),
                ACCOUNT_CHANGED_AFTER_SAVE,
            ))) {
                return;
            }

            if (!isServerMetadataConsistent(result, recovery)) {
                await activateIfValid(boundCtx, result);
                setSyncMessage(
                    boundCtx,
                    "会员授权已保存并通过本地验签，但服务器展示信息不一致。本地会员数据已保留，请联系作者。",
                );
                return;
            }

            const markerSaved = await advanced.markCurrentLicenseServerManaged(
                plugin,
                recovery.license,
                "identity_recovery",
                serviceBaseUrl,
            );

            if (!isForegroundContextValid(boundCtx)) return;

            if (!(await requireLiveIdentityContext(
                boundCtx,
                (message) => setSyncMessage(boundCtx, message),
                ACCOUNT_CHANGED_AFTER_SAVE,
            ))) {
                return;
            }

            await activateIfValid(boundCtx, result);
            let successMessage = "已根据当前思源账号从服务器恢复会员授权。";
            if (!markerSaved) {
                successMessage += " 服务器管理标记暂未保存，不影响会员使用，后续刷新时会再次尝试。";
            }
            setSyncMessage(boundCtx, successMessage);

            if (!isForegroundContextValid(boundCtx)) return;

            await confirmActivationBestEffort(serviceBaseUrl, {
                license: recovery.license,
                userId: identity.USER_ID,
                pluginVersion: pluginManifest.version || "unknown",
            });
        } catch (error) {
            if (isForegroundContextValid(ctx)) {
                if (error instanceof MembershipServiceError) {
                    syncMessage = error.message;
                } else {
                    syncMessage = "暂时无法连接激活服务器，本地会员不会受到影响，请稍后重试。";
                }
            }
        } finally {
            syncing = false;
            if (componentAlive && ctx.gen === operationGeneration) {
                const seq = ++identityRefreshSeq;
                void refreshLiveIdentitySnapshot(seq);
            }
        }
    }

    // ── 刷新当前会员状态（仅手动触发，需要本地 SH） ──
    async function handleRefreshMembershipStatus(): Promise<void> {
        if (busy) return;

        const ctx = beginForegroundOperation();
        clearMessages(ctx);
        syncing = true;
        let identity: Awaited<ReturnType<typeof advanced.updateVIP>> | null = null;

        try {
            try {
                identity = await advanced.updateVIP();
            } catch {
                setSyncMessage(
                    ctx,
                    "暂时无法确认当前思源账号，请稍后重试。本地会员数据未被修改。",
                );
                return;
            }
            if (!isForegroundContextValid(ctx) || !identity.USER_ID) {
                if (isForegroundContextValid(ctx)) syncMessage = "请先登录。";
                return;
            }

            const boundCtx = bindIdentityContext(ctx, identity.USER_ID);

            const savedActivation = await advanced.readSavedActivationCodeState(plugin);
            if (savedActivation.status === "error") {
                setSyncMessage(
                    boundCtx,
                    "暂时无法读取本地会员授权，请检查思源数据目录后重试。本地会员数据未被修改。",
                );
                return;
            }
            const localCode = savedActivation.status === "found" ? savedActivation.code : "";

            if (!localCode) {
                setSyncMessage(
                    boundCtx,
                    '未找到本地会员授权，请点击「恢复已有会员」从服务器恢复。',
                );
                return;
            }

            if (!localCode.startsWith("SH.")) {
                setSyncMessage(
                    boundCtx,
                    "当前使用旧版本地授权，仅在现有兼容期内继续使用，不支持自动登记服务器。后续请联系作者获取会员兑换码完成迁移。",
                );
                return;
            }

            const ctxWithSh = deriveOperationContext(boundCtx, localCode);
            let registrationWarning = "";
            try {
                const registrationResult = await registerCurrentSignedLicense(
                    identity,
                    localCode,
                    ctxWithSh,
                );
                if (registrationResult.warning) {
                    registrationWarning = registrationResult.warning;
                }
            } catch (error) {
                if (
                    error instanceof MembershipServiceError &&
                    (error.code === "SERVER_MEMBERSHIP_ALREADY_EXISTS" ||
                        error.code === "LICENSE_NOT_ACTIVE" ||
                        error.code === "LICENSE_EXPIRED" ||
                        error.code === "MEMBERSHIP_REVOKED")
                ) {
                    // 服务器已有其他当前授权、本地 SH 已非活动、自然过期或账号已被标记 revoked 时，
                    // 继续由正式 /api/licenses/sync 给出最终状态，登记阶段不删除本地 SH。
                } else {
                    if (isForegroundContextValid(boundCtx)) {
                        syncMessage =
                            error instanceof MembershipServiceError &&
                            (error.code === "NETWORK_ERROR" || error.code === "TIMEOUT")
                                ? "暂时无法连接激活服务器，本地会员不会受到影响，请稍后重试。"
                                : error instanceof MembershipServiceError
                                    ? error.message
                                    : "暂时无法连接激活服务器，本地会员不会受到影响，请稍后重试。";
                    }
                    return;
                }
            }

            if (!isForegroundContextValid(boundCtx)) return;
            if (!(await isSavedShContextStillValid(ctxWithSh, localCode))) return;

            const response: LicenseSyncResponse = await syncLicenseStatus(serviceBaseUrl, {
                userCode: identity.USER_CODE_V2,
                currentLicense: localCode,
                pluginVersion: pluginManifest.version || "unknown",
            });

            if (!isForegroundContextValid(boundCtx)) return;

            if (response.status === "active") {
                if (!(await requireLiveIdentityContext(
                    boundCtx,
                    (message) => setSyncMessage(boundCtx, message),
                    ACCOUNT_CHANGED_NO_MUTATION,
                ))) {
                    return;
                }

                let result: LicenseVerifyResult;
                let markerLicense: string;

                if (response.changed) {
                    result = await advanced.activateLicense(
                        plugin,
                        response.license,
                        identity.USER_NAME,
                        identity.USER_ID,
                    );
                    markerLicense = response.license;
                } else {
                    result = await advanced.verifySavedSignedLicenseReadOnly(
                        plugin,
                        identity.USER_NAME,
                        identity.USER_ID,
                    );
                    markerLicense = localCode;
                }

                if (!isForegroundContextValid(boundCtx)) return;

                if (!result.valid || !result.userInfo) {
                    setSyncMessage(
                        boundCtx,
                        result.code === 51
                            ? "服务器会员状态已同步，但本地授权保存失败，请检查思源数据目录写入权限后重试。"
                            : result.error || "服务器同步激活失败",
                    );
                    return;
                }

                if (!(await requireLiveIdentityContext(
                    boundCtx,
                    (message) => setSyncMessage(boundCtx, message),
                    response.changed ? ACCOUNT_CHANGED_AFTER_SAVE : ACCOUNT_CHANGED_NO_MUTATION,
                ))) {
                    return;
                }

                if (!isServerMetadataConsistent(result, response)) {
                    await activateIfValid(boundCtx, result);
                    setSyncMessage(
                        boundCtx,
                        "会员授权已保存并通过本地验签，但服务器状态信息异常。本地会员数据已保留，请联系作者。",
                    );
                    return;
                }

                const markerSaved = await advanced.markCurrentLicenseServerManaged(
                    plugin,
                    markerLicense,
                    "license_sync",
                    serviceBaseUrl,
                );

                if (!isForegroundContextValid(boundCtx)) return;

                if (!(await requireLiveIdentityContext(
                    boundCtx,
                    (message) => setSyncMessage(boundCtx, message),
                    response.changed ? ACCOUNT_CHANGED_AFTER_SAVE : ACCOUNT_CHANGED_NO_MUTATION,
                ))) {
                    return;
                }

                await activateIfValid(boundCtx, result);

                let successMessage = "";
                if (response.changed) {
                    successMessage = "已同步管理员调整后的会员状态。";
                } else {
                    successMessage = "当前会员状态已是最新。";
                }

                if (registrationWarning) {
                    successMessage += ` ${registrationWarning}`;
                }
                if (!markerSaved) {
                    successMessage += " 服务器管理标记暂未保存，不影响会员使用，后续刷新时会再次尝试。";
                }
                setSyncMessage(boundCtx, successMessage.trim());

                if (!isForegroundContextValid(boundCtx)) return;

                if (response.changed) {
                    await confirmActivationBestEffort(serviceBaseUrl, {
                        license: response.license,
                        userId: identity.USER_ID,
                        pluginVersion: pluginManifest.version || "unknown",
                    });
                }
            } else if (response.status === "revoked") {
                if (response.clearLocalLicense) {
                    if (!(await requireLiveIdentityContext(
                        boundCtx,
                        (message) => setSyncMessage(boundCtx, message),
                        ACCOUNT_CHANGED_NO_MUTATION,
                    ))) {
                        return;
                    }
                    if (!(await isSavedShContextStillValid(ctxWithSh, localCode))) return;
                    let deleteResult: advanced.DeleteLicenseResult;
                    try {
                        deleteResult = await advanced.deleteLicense(plugin, localCode);
                    } catch {
                        setSyncMessage(
                            boundCtx,
                            "服务器已要求清除旧会员授权，但本地文件删除失败。请检查思源数据目录写入权限后重试。",
                        );
                        return;
                    }
                    if (deleteResult === "license_changed") {
                        setSyncMessage(
                            boundCtx,
                            "本地会员授权已发生变化，旧撤销结果未执行删除。请重新点击刷新会员状态确认当前授权。",
                        );
                        return;
                    }
                    await revokeIfValid(boundCtx);
                    setSyncMessage(boundCtx, "会员授权已由管理员取消，本地激活信息已清除。");
                } else {
                    setSyncMessage(boundCtx, response.message);
                }
            } else if (response.status === "expired") {
                setSyncMessage(boundCtx, response.message);
            } else if (response.status === "unmanaged") {
                setSyncMessage(boundCtx, response.message);
            }
        } catch (error) {
            if (isForegroundContextValid(ctx)) {
                if (error instanceof MembershipServiceError) {
                    syncMessage = error.message;
                } else {
                    syncMessage = "暂时无法连接激活服务器，本地会员不会受到影响，请稍后重试。";
                }
            }
        } finally {
            syncing = false;
            if (componentAlive && ctx.gen === operationGeneration) {
                const seq = ++identityRefreshSeq;
                void refreshLiveIdentitySnapshot(seq);
            }
        }
    }

    // ── 保存服务地址 ──
    async function handleSaveServiceUrl(): Promise<void> {
        if (busy) return;

        const ctx = beginForegroundOperation();
        clearMessages(ctx);
        const normalized = normalizeBaseUrl(serviceBaseUrlInput);
        if (!normalized) {
            if (isForegroundContextValid(ctx)) {
                showMessage(
                    serviceBaseUrlInput.trim()
                        ? "服务器地址格式不正确，请检查协议和地址"
                        : "服务器地址不能为空",
                    3000,
                );
            }
            serviceBaseUrlInput = serviceBaseUrl;
            return;
        }

        savingServiceUrl = true;
        try {
            await plugin.saveData(REDEMPTION_CONFIG_KEY, { baseUrl: normalized });
            serviceBaseUrl = normalized;
            serviceBaseUrlInput = normalized;
            autoRegistrationAttemptedKeys.clear();
            autoRegistrationProbeCompletedKeys.clear();
            // 地址切换后让旧 generation 失效，并清理旧服务器相关提示
            invalidateOldOperations();
            syncMessage = "";
            testConnectionMessage = "";
            testConnectionStatus = "";
            if (componentAlive) showMessage("服务器地址已保存", 2000);
        } catch {
            if (componentAlive) showMessage("保存失败，请稍后重试", 3000);
            serviceBaseUrlInput = serviceBaseUrl;
        } finally {
            savingServiceUrl = false;
        }
    }

    // ── 恢复默认服务地址 ──
    async function handleResetServiceUrl(): Promise<void> {
        if (busy) return;

        const ctx = beginForegroundOperation();
        clearMessages(ctx);
        savingServiceUrl = true;
        try {
            await plugin.saveData(REDEMPTION_CONFIG_KEY, { baseUrl: DEFAULT_BASE_URL });
            serviceBaseUrl = DEFAULT_BASE_URL;
            serviceBaseUrlInput = DEFAULT_BASE_URL;
            autoRegistrationAttemptedKeys.clear();
            autoRegistrationProbeCompletedKeys.clear();
            // 地址切换后让旧 generation 失效，并清理旧服务器相关提示
            invalidateOldOperations();
            syncMessage = "";
            testConnectionMessage = "";
            testConnectionStatus = "";
            if (componentAlive) showMessage("已恢复默认服务器地址", 2000);
        } catch {
            if (componentAlive) showMessage("恢复默认失败，请稍后重试", 3000);
            serviceBaseUrlInput = serviceBaseUrl;
        } finally {
            savingServiceUrl = false;
        }
    }

    // ── 测试服务连接 ──
    async function handleTestConnection(): Promise<void> {
        if (busy) return;

        const ctx = beginForegroundOperation();
        clearMessages(ctx);

        const testedOrigin = normalizeBaseUrl(serviceBaseUrlInput);
        if (!testedOrigin) {
            if (isForegroundContextValid(ctx)) {
                testConnectionStatus = "unreachable";
                testConnectionMessage = serviceBaseUrlInput.trim()
                    ? "服务器地址格式不正确，请检查协议和地址。"
                    : "服务器地址不能为空。";
            }
            return;
        }

        testingService = true;
        try {
            const result: ServiceStatusResult = await testServiceConnection(testedOrigin);
            if (
                !componentAlive ||
                ctx.gen !== operationGeneration ||
                normalizeBaseUrl(serviceBaseUrlInput) !== testedOrigin
            ) {
                return;
            }
            setTestConnection(ctx, result.status, result.message);
        } catch {
            if (
                componentAlive &&
                ctx.gen === operationGeneration &&
                normalizeBaseUrl(serviceBaseUrlInput) === testedOrigin
            ) {
                setTestConnection(ctx, "unreachable", "连接超时或地址错误。");
            }
        } finally {
            testingService = false;
        }
    }

    async function handleDeactivate(): Promise<void> {
        if (busy) return;

        const ctx = beginForegroundOperation();
        clearMessages(ctx);
        deactivating = true;

        try {
            // 本组件只负责忙碌状态和错误捕获；实际删除授权由上层 onDeactivate 执行，
            // 避免 VipSection 与上层重复删除同一份本地授权。
            await onDeactivate();
        } catch (error) {
            if (isForegroundContextValid(ctx)) {
                showMessage("注销激活失败，请稍后重试。", 3000);
            }
        } finally {
            deactivating = false;
        }
    }

    function handleKeyDown(event: KeyboardEvent): void {
        if (event.key === "Enter" && !busy && redemptionCode.trim()) {
            event.preventDefault();
            void handleRedeem();
        }
    }

    // 安全派生：避免 activated 与 activationResult 更新不同步时访问 undefined
    const activationUserInfo = $derived(
        activated && activationResult?.userInfo ? activationResult.userInfo : undefined,
    );
    const activationIsLifetime = $derived(activationUserInfo?.isLifetime === true);
    const activationDue = $derived(activationUserInfo?.due ?? "");
    const activationRemainingDays = $derived(activationUserInfo?.remainingDays ?? 0);

    const isPermanentMember = $derived(activated && activationIsLifetime);

    $effect(() => {
        if (isPermanentMember) {
            showRenewal = false;
        }
    });

    function getRedeemButtonDisabled(): boolean {
        if (!liveUserId) return true;
        if (busy) return true;
        if (!redemptionCode.trim()) return true;
        if (isPermanentMember) return true;
        return false;
    }
</script>

{#snippet membershipPurchaseContent()}
    <div class="purchase-heading">
        <div>
            <SiyuanIcon name="vip" size={22} />
            <h2>{activated ? "续费会员" : "开通会员"}</h2>
        </div>
        {#if activated}
            <button class="heading-close" onclick={() => (showRenewal = false)} aria-label="收起续费">
                <SiyuanIcon name="iconClose" size={16} />
            </button>
        {/if}
    </div>
    <h3>
        <a
            href="https://blog.glaube-ty.top/archives/019d3f20-03d4-70fd-8afe-dff8bb2107ab"
            target="_blank"
            rel="noopener noreferrer"
            class="vip-benefits-link"
        >
            <SiyuanIcon name="vip" size={16} />
            查看会员权益
            <SiyuanIcon name="iconRight" size={14} />
        </a>
    </h3>

    {#if liveUserName || liveUserId}
        <div class="purchase-plan">
            <h4><SiyuanIcon name="iconVIP" size={16} /> 订阅方案</h4>
            <div class="plan-card">
                <div class="plan-item monthly">
                    <div class="plan-price"><span class="new-price">5 元</span></div>
                    <div class="plan-duration">月度会员</div>
                </div>
                <div class="plan-item yearly">
                    <div class="plan-price"><span class="new-price">35 元</span></div>
                    <div class="plan-duration">年度会员</div>
                </div>
                <div class="plan-item permanent">
                    <div class="plan-badge"><SiyuanIcon name="iconInfo" size={12} /> 限时优惠</div>
                    <div class="plan-price">
                        <span class="old-price">128 元</span>
                        <span class="new-price">99 元</span>
                    </div>
                    <div class="plan-duration">永久会员</div>
                    <div class="plan-urgency"><SiyuanIcon name="iconClock" size={13} /> 随时恢复原价</div>
                </div>
            </div>
        </div>

        <div class="purchase-address">
            <h4><SiyuanIcon name="iconLink" size={16} /> 购买地址</h4>
            <div class="address-card">
                <div class="address-item">
                    <SiyuanIcon name="iconLink" size={20} className="icon" />
                    <div class="address-content">
                        <strong>地址：</strong>
                        <a href={AFDIAN_URL} target="_blank" rel="noopener noreferrer">爱发电</a>
                    </div>
                </div>
            </div>
        </div>

        <p class="redemption-desc">在爱发电购买后，复制系统自动发送的会员兑换码，在此完成兑换。</p>
        {#if activated}
            <p class="redemption-renewal-hint">兑换后会在当前剩余天数基础上增加对应套餐时长。</p>
        {/if}

        <div class="redemption-section">
            <div class="redemption-input-row">
                <input
                    type="text"
                    class="redemption-code-input"
                    placeholder="请输入会员兑换码"
                    bind:value={redemptionCode}
                    disabled={busy}
                    onkeydown={handleKeyDown}
                />
                <button
                    class="redeem-btn"
                    onclick={handleRedeem}
                    disabled={getRedeemButtonDisabled()}
                >
                    {redeeming ? "正在兑换……" : "兑换并激活"}
                </button>
            </div>
            {#if !liveUserId}
                <p class="redeem-login-hint">请先登录后再兑换。</p>
            {/if}
            {#if redeemError}
                <div class="redeem-error">{redeemError}</div>
            {/if}
            {#if redeemSuccessMessage}
                <div class="redeem-success">{redeemSuccessMessage}</div>
            {/if}
        </div>

        <div class="purchase-question">
            <h4><SiyuanIcon name="iconInfo" size={16} /> 问题咨询</h4>
            <div class="question-card">
                <div class="question-item">
                    <SiyuanIcon name="iconLink" size={20} className="icon" />
                    <div class="question-content">
                        <strong>邮箱：</strong>
                        <a href="mailto:glaube_ty@qq.com">glaube_ty@qq.com</a>
                    </div>
                </div>
                <div class="question-item">
                    <SiyuanIcon name="iconInfo" size={20} className="icon" />
                    <div class="question-content">
                        <strong>腾讯频道（订阅问题请私信管理员）</strong>
                        <a href="https://pd.qq.com/s/2ks4079x0" target="_blank" rel="noopener noreferrer">SY 插件交流频道</a>
                    </div>
                </div>
            </div>
        </div>
    {:else}
        <p class="redeem-login-hint">会员功能与账号绑定，请先登录后查看或兑换。</p>
    {/if}
{/snippet}

<div class="vip-section">
    {#if serviceConfigLoading}
        <div class="service-config-loading">
            <SiyuanIcon name="iconRefresh" size={18} />
            正在加载激活服务配置……
        </div>
    {/if}

    <!-- ═══ 1. 当前账号 ═══ -->
    <div class="vip-info">
        {#if liveUserName || liveUserId}
            <div class="account-field">
                <SiyuanIcon name="iconAccount" size={16} />
                <span>用户名</span>
                <strong>{liveUserName}</strong>
            </div>
            <div class="account-field">
                <SiyuanIcon name="iconInfo" size={16} />
                <span>用户 ID</span>
                <strong>{liveUserId}</strong>
            </div>
            <div class="sync-status-area">
                <button
                    class="sync-status-btn"
                    onclick={activated ? handleRefreshMembershipStatus : handleRecoverExistingMembership}
                    disabled={busy}
                >
                    <SiyuanIcon name="iconRefresh" size={14} />
                    {syncing ? (activated ? "正在刷新会员状态……" : "正在恢复会员……") : (activated ? "刷新会员状态" : "恢复已有会员")}
                </button>
                <span class="sync-status-hint">会员平时使用本地离线验证；本地授权丢失时，可根据当前思源账号恢复服务器中的有效会员。</span>
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
        {#if activationUserInfo}
        <div
            class="activated"
            class:activated-lifetime={activationIsLifetime}
        >
            <div class="activated-hero">
                <div class="activated-badge">
                    <SiyuanIcon name="vip" size={14} />
                    {activationIsLifetime ? "永久会员" : "会员已激活"}
                </div>
                <h2>
                    {activationIsLifetime ? "尊享永久会员" : "会员服务已启用"}
                </h2>
                <p class="activated-desc">
                    感谢你对主页插件的支持。愿它继续陪你整理灵感、沉淀知识，也欢迎把使用建议反馈给作者。
                </p>
                {#if activationIsLifetime}
                    <p class="activated-desc lifetime-desc">
                        你已获得永久会员资格，后续可持续享受会员功能与更新支持。
                    </p>
                {/if}
            </div>

            <div class="activated-stats">
                <div class="activated-stat">
                    <span>到期时间</span>
                    <strong>{activationDue}</strong>
                </div>
                <div class="activated-stat">
                    <span>剩余天数</span>
                    <strong>
                        {activationIsLifetime ? "永久" : activationRemainingDays}
                    </strong>
                </div>
                <div class="activated-stat">
                    <span>会员类型</span>
                    <strong>{activationIsLifetime ? "永久会员" : "限时会员"}</strong>
                </div>
            </div>

            <div class="member-actions">
                <a
                    class="member-link primary"
                    href={TUTORIAL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <SiyuanIcon name="iconLink" size={15} />
                    查看插件教程
                </a>
                <a
                    class="member-link"
                    href={MEMBER_GROUP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <SiyuanIcon name="iconLink" size={15} />
                    加入主页插件会员群
                </a>
                {#if !isPermanentMember}
                    <button
                        class="member-link renewal-toggle"
                        onclick={() => (showRenewal = !showRenewal)}
                        disabled={busy}
                    >
                        <SiyuanIcon name={showRenewal ? "iconUp" : "iconAdd"} size={15} />
                        {showRenewal ? "收起续费" : "续费会员"}
                    </button>
                {/if}
            </div>

            <div class="member-group-card">
                <div>
                    <span>主页插件会员群</span>
                    <strong>群号：{MEMBER_GROUP_NUMBER}</strong>
                </div>
                <p>群内会同步教程、常见问题和会员相关说明，也欢迎交流你的主页配置思路。</p>
            </div>

            {#if activationResult?.legacyDeprecated}
                <div class="legacy-license-warning">
                    <SiyuanIcon name="iconInfo" size={16} />
                    当前使用旧版本地授权，仅在现有兼容期内继续使用，不支持自动登记服务器。
                    后续请联系作者获取会员兑换码完成迁移。
                </div>
            {/if}
            <button
                class="deactivate-button"
                onclick={handleDeactivate}
                disabled={busy}
            >
                {deactivating ? "正在注销……" : "注销激活"}
            </button>

            {#if showRenewal}
                <div class="purchase-redeem-section renewal-mode">
                    {@render membershipPurchaseContent()}
                </div>
            {/if}
        </div>
        {:else}
            <div class="activated-loading">
                <SiyuanIcon name="iconRefresh" size={18} />
                正在加载会员状态……
            </div>
        {/if}
    {/if}

    <!-- ═══ 3. 开通或续费会员 ═══ -->
    {#if !activated}
    <div class="purchase-redeem-section">
        {@render membershipPurchaseContent()}
    </div>
    {/if}

    <!-- ═══ 4. 激活服务连接设置（折叠） ═══ -->
    <div class="collapsible-section">
        <button
            class="collapsible-toggle"
            onclick={() => (showServiceSettings = !showServiceSettings)}
        >
            <SiyuanIcon name={showServiceSettings ? "iconDown" : "iconRight"} size={14} />
            激活服务连接设置
        </button>
        {#if showServiceSettings}
            <div class="collapsible-content">
                <div class="service-url-row">
                    <label for="service-url-input">服务器地址</label>
                    <span class="service-current-url">当前生效地址：{serviceBaseUrl}</span>
                    <div class="service-url-control">
                        <input
                            id="service-url-input"
                            type="text"
                            class="service-url-input"
                            bind:value={serviceBaseUrlInput}
                            placeholder={DEFAULT_BASE_URL}
                            disabled={busy}
                        />
                        <button
                            class="btn"
                            onclick={handleSaveServiceUrl}
                            disabled={busy}
                        >
                            {savingServiceUrl ? "保存中……" : "保存"}
                        </button>
                        <button
                            class="btn"
                            onclick={handleResetServiceUrl}
                            disabled={busy}
                        >
                            恢复默认
                        </button>
                    </div>
                </div>
                <div class="test-connection-row">
                    <button
                        class="btn test-connection-btn"
                        onclick={handleTestConnection}
                        disabled={busy}
                    >
                        {testingService ? "测试中……" : "测试连接"}
                    </button>
                    {#if testConnectionMessage}
                        <span
                            class="test-connection-message"
                            class:ok={testConnectionStatus === "ok"}
                            class:error={testConnectionStatus === "unreachable" || testConnectionStatus === "incompatible"}
                        >
                            {testConnectionMessage}
                        </span>
                    {/if}
                </div>
            </div>
        {/if}
    </div>
</div>
