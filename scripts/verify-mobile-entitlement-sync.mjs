import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const bundled = await build({
    stdin: {
        contents: `export { recoverHomepageMembershipByIdentity } from "./src/features/entitlement/homepage-membership-recovery";`,
        loader: "ts",
        resolveDir: root,
        sourcefile: "verify-mobile-entitlement-sync.ts",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node24",
    write: false,
    logLevel: "silent",
});
const recoveryModule = await import(
    `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`,
);

const indexSource = await readFile(resolve(root, "src/index.ts"), "utf8");
const advancedSource = await readFile(resolve(root, "src/components/tools/advanced.ts"), "utf8");

assert.match(indexSource, /onDataChanged\(reason\?: TPluginDataChangeReason\)/);
const dataChangedSource = indexSource.slice(
    indexSource.indexOf("public override onDataChanged"),
    indexSource.indexOf("private ensureDeviceIdentityForRuntime"),
);
assert(!dataChangedSource.includes("super.onDataChanged") && !dataChangedSource.includes("location.reload"));
const mobileHomepageSource = indexSource.slice(
    indexSource.indexOf("private async openMobileHomepage"),
    indexSource.indexOf("private openMobileKbChat"),
);
assert(!mobileHomepageSource.includes("startHomepageMembershipRecovery"));
for (const event of ["sync-start", "sync-end", "sync-fail"]) {
    assert.match(indexSource, new RegExp(`eventBus\\.on\\(\\"${event}\\"`));
    assert.match(indexSource, new RegExp(`eventBus\\.off\\(\\"${event}\\"`));
}
assert.match(indexSource, /HOMEPAGE_ENTITLEMENT_EXTERNAL_REFRESH_DEBOUNCE_MS = 300/);
assert.match(indexSource, /MOBILE_ENTITLEMENT_SYNC_GRACE_MS = 8_000/);
assert.match(indexSource, /HOMEPAGE_ENTITLEMENT_RECOVERY_COOLDOWN_MS = 5 \* 60_000/);
assert.match(indexSource, /homepageEntitlementExternalRefreshTimer !== null/);
assert.match(indexSource, /clearTimeout\(this\.homepageEntitlementExternalRefreshTimer\)/);
assert.match(indexSource, /verifyLicense\(\{ syncServer: false \}\)/);
assert.match(indexSource, /startHomepageMembershipRecovery\(\s*vipInfo,\s*null/);
assert.match(indexSource, /startHomepageMembershipRecovery\(\s*vipInfo,\s*saved\.code/);
assert.match(indexSource, /if \(!this\.isMobileFrontend\(\)\)/);
for (const code of [
    "ACTIVE_MEMBERSHIP_NOT_FOUND",
    "RECOVERY_LICENSE_UNAVAILABLE",
    "MEMBERSHIP_REVOKED",
    "LICENSE_EXPIRED",
    "LICENSE_NOT_ACTIVE",
]) {
    assert.match(indexSource, new RegExp(`\\"${code}\\"`));
}
assert.match(advancedSource, /expectedCurrentLicense\?: string \| null/);
assert.match(advancedSource, /hasOwnProperty\.call\(serverManagement, "expectedCurrentLicense"\)/);
assert.match(advancedSource, /expectedCurrentLicense === null/);
assert.match(advancedSource, /invalid\(53, "本地会员授权已发生变化，未覆盖新的授权。"\)/);

const casBundle = await build({
    stdin: {
        contents: `export { activateLicense } from "./src/components/tools/advanced";`,
        loader: "ts",
        resolveDir: root,
        sourcefile: "verify-mobile-entitlement-cas.ts",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node24",
    write: false,
    logLevel: "silent",
    plugins: [{
        name: "mobile-entitlement-cas-stubs",
        setup(buildApi) {
            buildApi.onResolve({ filter: /^@\/api$/ }, () => ({ path: "fixture-api", namespace: "fixture" }));
            buildApi.onResolve({ filter: /^\.\/licenseSy2$/ }, () => ({ path: "fixture-license", namespace: "fixture" }));
            buildApi.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => {
                if (args.path === "fixture-api") {
                    return { contents: "export function getSiyuanCloudIdentity() { return Promise.resolve({ userId: 'fixture', userName: 'Fixture', source: 'fixture' }); }", loader: "js" };
                }
                return {
                    contents: `
                        export function invalid(code, error) { return { valid: false, code, error }; }
                        export function isSignedLicense(code) { return typeof code === "string" && code.startsWith("SH."); }
                        export function verifySignedLicense(code, name, userId) { return { valid: true, code: 0, userInfo: { name, userId, due: "永久", remainingDays: 999999, isExpired: false, isLifetime: true } }; }
                        export function makeUserCodeV2(name, userId) { return "SYHPU1." + name + userId; }
                    `,
                    loader: "js",
                };
            });
        },
    }],
});
const casRuntime = await import(
    `data:text/javascript;base64,${Buffer.from(casBundle.outputFiles[0].text).toString("base64")}`,
);

{
    let stored = {};
    let injectSyncWrite = false;
    const plugin = {
        async loadData() {
            if (injectSyncWrite) {
                injectSyncWrite = false;
                stored = { ActivationCode: "sync-license" };
            }
            return stored;
        },
        async saveData(_key, value) {
            stored = value;
        },
    };
    const options = {
        serverManagedSource: "identity_recovery",
        serverManagedServiceOrigin: "https://license.glaube-ty.top",
    };
    const missingCas = await casRuntime.activateLicense(plugin, "SH.server-license", "Fixture", "fixture", {
        ...options,
        expectedCurrentLicense: null,
    });
    assert.equal(missingCas.valid, true, "null CAS should allow a genuinely missing license");

    stored = { ActivationCode: "old-license" };
    const mismatchedCas = await casRuntime.activateLicense(plugin, "SH.server-license", "Fixture", "fixture", {
        ...options,
        expectedCurrentLicense: "other-license",
    });
    assert.equal(mismatchedCas.code, 53, "string CAS must reject a changed license");
    assert.equal(stored.ActivationCode, "old-license");

    stored = { ActivationCode: "existing-license" };
    const noCas = await casRuntime.activateLicense(plugin, "SH.server-license", "Fixture", "fixture", options);
    assert.equal(noCas.valid, true, "undefined CAS must preserve existing callers without a guard");

    stored = {};
    injectSyncWrite = true;
    const racedNullCas = await casRuntime.activateLicense(plugin, "SH.server-license", "Fixture", "fixture", {
        ...options,
        expectedCurrentLicense: null,
    });
    assert.equal(racedNullCas.code, 53, "null CAS must reject a license appearing before the write lock");
    assert.equal(stored.ActivationCode, "sync-license");
}

const GRACE_MS = 8_000;
const COOLDOWN_MS = 5 * 60_000;
const ABSENCE_CODES = new Set([
    "ACTIVE_MEMBERSHIP_NOT_FOUND",
    "RECOVERY_LICENSE_UNAVAILABLE",
    "MEMBERSHIP_REVOKED",
    "LICENSE_EXPIRED",
    "LICENSE_NOT_ACTIVE",
]);

function userInfo(userId = "user-a") {
    return {
        name: "User",
        userId,
        due: "永久",
        remainingDays: 999999,
        isExpired: false,
        isLifetime: true,
        durationDays: 0,
        issuedDate: "20260919",
    };
}

function serviceError(code) {
    return Object.assign(new Error(code), { code });
}

function createFixture({
    mobile = true,
    initialLicense = null,
    recovery = { license: "server-license" },
    identities = [{ id: "user-a" }],
    now = 100_000,
} = {}) {
    let clock = now;
    let currentLicense = initialLicense;
    let syncInProgress = false;
    let externalRefreshPending = false;
    let disposed = false;
    let recoveryInFlight = null;
    let cooldownUntil = 0;
    let identityIndex = 0;
    let activationRace = null;
    const state = {
        status: "pending",
        advanced: false,
        refreshCount: 0,
        recoveryCalls: 0,
        activationCalls: 0,
        messages: [],
    };
    const startupAt = clock;

    function identity() {
        const entry = identities[Math.min(identityIndex, identities.length - 1)];
        return {
            USER_NAME: "User",
            USER_ID: entry.id,
            USER_CODE: `User-${entry.id}`,
            USER_CODE_V2: entry.id ? `SYHPU1.${entry.id}` : "",
            IDENTITY_SOURCE: "fixture",
        };
    }

    function localResult() {
        if (!currentLicense) return { valid: false, code: 2, error: "missing" };
        if (currentLicense === "expired-old") return { valid: false, code: 31, error: "expired" };
        if (currentLicense === "invalid-local") return { valid: false, code: 30, error: "invalid" };
        if (currentLicense === "read-error") return { valid: false, code: 52, error: "read-error" };
        return { valid: true, code: 0, userInfo: userInfo(identity().USER_ID) };
    }

    function setGranted(info) {
        state.status = "granted";
        state.advanced = true;
        state.messages.push(`granted:${info.userId}`);
    }

    function setError(message) {
        state.status = "error";
        state.advanced = false;
        state.messages.push(`error:${message}`);
    }

    function setDenied(message) {
        state.status = "denied";
        state.advanced = false;
        state.messages.push(`denied:${message}`);
    }

    async function recover() {
        state.recoveryCalls += 1;
        if (recovery instanceof Error) throw recovery;
        if (recovery && typeof recovery.then === "function") {
            return {
                status: "active",
                license: (await recovery).license,
                durationDays: 0,
                issuedDate: "20260919",
                isLifetime: true,
                remainingDays: 0,
                dueDate: null,
                recovered: true,
            };
        }
        if (recovery?.errorCode) throw serviceError(recovery.errorCode);
        return {
            status: "active",
            license: recovery.license,
            durationDays: 0,
            issuedDate: "20260919",
            isLifetime: true,
            remainingDays: 0,
            dueDate: null,
            recovered: true,
        };
    }

    async function readSaved() {
        if (!currentLicense) return { status: "missing" };
        if (currentLicense === "read-error") return { status: "error" };
        return { status: "found", code: currentLicense };
    }

    async function verifySaved(_plugin, userName, userId) {
        const result = localResult();
        if (result.valid) return { ...result, userInfo: { ...result.userInfo, name: userName, userId } };
        return result;
    }

    async function activate(_plugin, code, _userName, userId, options) {
        state.activationCalls += 1;
        if (activationRace) currentLicense = activationRace;
        const hasExpected = options && Object.prototype.hasOwnProperty.call(options, "expectedCurrentLicense");
        const current = currentLicense || "";
        const expected = options?.expectedCurrentLicense;
        const matches = expected === null ? !current : typeof expected === "string" ? current === expected : true;
        if (hasExpected && !matches) return { valid: false, code: 53, error: "license_changed" };
        currentLicense = code;
        return { valid: true, code: 0, userInfo: userInfo(userId) };
    }

    async function runRecovery(expectedCurrentLicense) {
        if (recoveryInFlight) return recoveryInFlight;
        if (cooldownUntil > clock) return { kind: "cooldown", retryAt: cooldownUntil };
        cooldownUntil = clock + COOLDOWN_MS;
        const captured = identity();
        recoveryInFlight = recoveryModule.recoverHomepageMembershipByIdentity({
            plugin: {},
            identity: captured,
            expectedCurrentLicense,
            pluginVersion: "fixture",
            serviceOrigin: "https://license.glaube-ty.top",
            isCurrent: () => !disposed,
            updateVIP: async () => {
                identityIndex += 1;
                return identity();
            },
            readSavedActivationCodeState: readSaved,
            verifySavedSignedLicenseReadOnly: verifySaved,
            recoverMembershipByIdentity: recover,
            activateLicense: activate,
        });
        const result = await recoveryInFlight;
        recoveryInFlight = null;
        return result;
    }

    async function check() {
        state.refreshCount += 1;
        const identitySnapshot = identity();
        const result = await verifySaved({}, identitySnapshot.USER_NAME, identitySnapshot.USER_ID);
        if (result.valid && result.code === 0 && result.userInfo) {
            setGranted(result.userInfo);
            return;
        }
        if (result.code === 1 || result.code === 52) {
            setError(result.error || "temporary");
            return;
        }
        if (result.code === 2) {
            if (!mobile) {
                setDenied(result.error || "invalid");
                return;
            }
            if (syncInProgress || clock - startupAt < GRACE_MS) {
                setError("暂时无法打开移动端主页");
                return;
            }
            if (!identitySnapshot.USER_ID || !identitySnapshot.USER_CODE_V2) {
                setError("identity");
                return;
            }
            const outcome = await runRecovery(null);
            await applyOutcome(outcome, identitySnapshot);
            return;
        }
        if (result.code === 31) {
            if (!mobile) {
                setDenied(result.error || "invalid");
                return;
            }
            const saved = await readSaved();
            if (saved.status !== "found") {
                setError("license changed");
                return;
            }
            const outcome = await runRecovery(saved.code);
            await applyOutcome(outcome, identitySnapshot);
            return;
        }
        setDenied(result.error || "invalid");
    }

    async function applyOutcome(outcome, identitySnapshot) {
        if (disposed) return;
        if (outcome.kind === "recovered" || outcome.kind === "local_valid") {
            cooldownUntil = 0;
            setGranted(outcome.userInfo);
        } else if (outcome.kind === "license_changed") {
            await check();
        } else if (outcome.kind === "identity_changed" || outcome.kind === "cancelled") {
            setError(outcome.kind);
        } else if (outcome.kind === "cooldown") {
            setError("cooldown");
        } else if (outcome.error?.code && ABSENCE_CODES.has(outcome.error.code)) {
            setDenied(outcome.error.code);
        } else {
            setError(outcome.error?.code || outcome.error?.message || "temporary");
        }
        void identitySnapshot;
    }

    return {
        state,
        get currentLicense() { return currentLicense; },
        setCurrentLicense(value) { currentLicense = value; },
        setActivationRace(value) { activationRace = value; },
        advance(ms) { clock += ms; },
        syncStart() { syncInProgress = true; },
        syncEnd() { syncInProgress = false; externalRefreshPending = true; },
        syncFail() { syncInProgress = false; externalRefreshPending = true; },
        onDataChanged(reason) {
            if (reason === undefined || reason === "sync" || reason === "overwrite") externalRefreshPending = true;
        },
        async flushExternal() {
            if (!externalRefreshPending) return;
            externalRefreshPending = false;
            await check();
        },
        check,
        unload() { disposed = true; },
        openMessage() {
            return state.advanced ? "" : state.status === "error" || state.status === "pending"
                ? "暂时无法打开移动端主页"
                : "请开通会员";
        },
    };
}

// A: valid local SH grants without recovery.
{
    const fixture = createFixture({ initialLicense: "valid-local" });
    await fixture.check();
    assert.equal(fixture.state.status, "granted");
    assert.equal(fixture.state.recoveryCalls, 0);
}

// B: mobile startup missing waits for sync and does not show the paid prompt.
{
    const fixture = createFixture({ initialLicense: null });
    fixture.syncStart();
    await fixture.check();
    assert.equal(fixture.state.status, "error");
    assert.equal(fixture.state.advanced, false);
    assert.equal(fixture.state.recoveryCalls, 0);
    assert.equal(fixture.openMessage(), "暂时无法打开移动端主页");
}

// C: sync-end local SH wins before recovery.
{
    const fixture = createFixture({ initialLicense: null });
    fixture.syncStart();
    await fixture.check();
    fixture.syncEnd();
    fixture.setCurrentLicense("valid-local");
    await fixture.flushExternal();
    assert.equal(fixture.state.status, "granted");
    assert.equal(fixture.state.recoveryCalls, 0);
}

// D: after sync, an active server membership is verified and saved.
{
    const fixture = createFixture({ initialLicense: null, now: 100_000 });
    fixture.advance(GRACE_MS);
    await fixture.check();
    assert.equal(fixture.state.status, "granted");
    assert.equal(fixture.state.recoveryCalls, 1);
    assert.equal(fixture.state.activationCalls, 1);
}

// E: an explicit membership-absent code is the only recovery denial path.
{
    const fixture = createFixture({ initialLicense: null, recovery: { errorCode: "ACTIVE_MEMBERSHIP_NOT_FOUND" }, now: 100_000 });
    fixture.advance(GRACE_MS);
    await fixture.check();
    assert.equal(fixture.state.status, "denied");
}

// F: timeout is a retryable error, never a denial.
{
    const fixture = createFixture({ initialLicense: null, recovery: new Error("timeout"), now: 100_000 });
    fixture.advance(GRACE_MS);
    await fixture.check();
    assert.equal(fixture.state.status, "error");
    assert.equal(fixture.openMessage(), "暂时无法打开移动端主页");
}

// F2: the per-account cooldown prevents a transient retry storm.
{
    const fixture = createFixture({ initialLicense: null, recovery: new Error("timeout"), now: 100_000 });
    fixture.advance(GRACE_MS);
    await fixture.check();
    await fixture.check();
    assert.equal(fixture.state.recoveryCalls, 1);
    fixture.advance(COOLDOWN_MS);
    await fixture.check();
    assert.equal(fixture.state.recoveryCalls, 2);
}

// G: sync failure does not revoke an already granted local entitlement.
{
    const fixture = createFixture({ initialLicense: "valid-local" });
    await fixture.check();
    fixture.syncFail();
    assert.equal(fixture.state.status, "granted");
    await fixture.flushExternal();
    assert.equal(fixture.state.status, "granted");
}

// H: sync failure with no local SH remains retryable.
{
    const fixture = createFixture({ initialLicense: null });
    fixture.syncFail();
    await fixture.flushExternal();
    assert.equal(fixture.state.status, "error");
    assert.notEqual(fixture.state.status, "denied");
}

// I: data-change refresh is local-first and sees a SH written by sync.
{
    const fixture = createFixture({ initialLicense: null });
    fixture.syncStart();
    await fixture.check();
    fixture.onDataChanged("sync");
    fixture.setCurrentLicense("valid-local");
    await fixture.flushExternal();
    assert.equal(fixture.state.status, "granted");
    assert.equal(fixture.state.recoveryCalls, 0);
}

// J: five close events collapse into one bounded refresh.
{
    const fixture = createFixture({ initialLicense: "valid-local" });
    await fixture.check();
    for (const reason of ["sync", "overwrite", undefined, "sync", "overwrite"]) fixture.onDataChanged(reason);
    await fixture.flushExternal();
    assert.equal(fixture.state.refreshCount, 2);
}

// K: a valid local SH appearing during recovery wins over the response.
{
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const fixture = createFixture({ initialLicense: null, recovery: pending, now: 100_000 });
    fixture.advance(GRACE_MS);
    const checkPromise = fixture.check();
    fixture.setCurrentLicense("valid-local");
    release({ license: "server-license" });
    await checkPromise;
    assert.equal(fixture.state.status, "granted");
    assert.equal(fixture.currentLicense, "valid-local");
    assert.equal(fixture.state.activationCalls, 0);
}

// K2: an in-flight recovery cannot publish after unload.
{
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const fixture = createFixture({ initialLicense: null, recovery: pending, now: 100_000 });
    fixture.advance(GRACE_MS);
    const checkPromise = fixture.check();
    fixture.unload();
    release({ license: "server-license" });
    await checkPromise;
    assert.equal(fixture.state.status, "pending");
    assert.equal(fixture.state.advanced, false);
}

// L: null-CAS refuses to overwrite a SH that appears before the mutation lock.
{
    const fixture = createFixture({ initialLicense: null, now: 100_000 });
    fixture.setActivationRace("valid-race");
    fixture.advance(GRACE_MS);
    await fixture.check();
    assert.equal(fixture.currentLicense, "valid-race");
    assert.equal(fixture.state.status, "granted");
}

// M: an expired local SH may be replaced by an active renewed SH.
{
    const fixture = createFixture({ initialLicense: "expired-old", now: 100_000 });
    await fixture.check();
    assert.equal(fixture.state.status, "granted");
    assert.equal(fixture.currentLicense, "server-license");
}

// N: expired local SH plus explicit absence is denied.
{
    const fixture = createFixture({ initialLicense: "expired-old", recovery: { errorCode: "LICENSE_NOT_ACTIVE" } });
    await fixture.check();
    assert.equal(fixture.state.status, "denied");
}

// O: expired local SH plus network failure remains an error.
{
    const fixture = createFixture({ initialLicense: "expired-old", recovery: new Error("network") });
    await fixture.check();
    assert.equal(fixture.state.status, "error");
}

// P: an identity change during recovery cannot grant the old account.
{
    const fixture = createFixture({ initialLicense: null, identities: [{ id: "user-a" }, { id: "user-b" }], now: 100_000 });
    fixture.advance(GRACE_MS);
    await fixture.check();
    assert.equal(fixture.state.status, "error");
    assert.equal(fixture.state.activationCalls, 0);
}

// Q: invalid local signature is fail-closed and does not auto-recover.
{
    const fixture = createFixture({ initialLicense: "invalid-local", recovery: { license: "server-license" } });
    await fixture.check();
    assert.equal(fixture.state.status, "denied");
    assert.equal(fixture.state.recoveryCalls, 0);
}

// R: a valid local SH remains granted when the server is unreachable.
{
    const fixture = createFixture({ initialLicense: "valid-local", recovery: new Error("network") });
    await fixture.check();
    assert.equal(fixture.state.status, "granted");
    assert.equal(fixture.state.recoveryCalls, 0);
}

// S: desktop missing local SH is denied immediately without recovery.
{
    const fixture = createFixture({ mobile: false, initialLicense: null });
    await fixture.check();
    assert.equal(fixture.state.status, "denied");
    assert.equal(fixture.state.advanced, false);
    assert.equal(fixture.state.recoveryCalls, 0);
    assert.equal(fixture.state.activationCalls, 0);
}

// T: desktop expired local SH is denied without background recovery.
{
    const fixture = createFixture({ mobile: false, initialLicense: "expired-old" });
    await fixture.check();
    assert.equal(fixture.state.status, "denied");
    assert.equal(fixture.state.recoveryCalls, 0);
    assert.equal(fixture.state.activationCalls, 0);
}

// U: desktop valid local SH remains granted without recovery.
{
    const fixture = createFixture({ mobile: false, initialLicense: "valid-local" });
    await fixture.check();
    assert.equal(fixture.state.status, "granted");
    assert.equal(fixture.state.recoveryCalls, 0);
}

// V: desktop sync can still grant a local SH after the initial denial.
{
    const fixture = createFixture({ mobile: false, initialLicense: null });
    await fixture.check();
    assert.equal(fixture.state.status, "denied");
    assert.equal(fixture.state.recoveryCalls, 0);
    fixture.syncEnd();
    fixture.onDataChanged("sync");
    fixture.setCurrentLicense("valid-local");
    await fixture.flushExternal();
    assert.equal(fixture.state.status, "granted");
    assert.equal(fixture.state.recoveryCalls, 0);
}

// W: mobile missing local SH still uses identity recovery after the grace window.
{
    const fixture = createFixture({ mobile: true, initialLicense: null, now: 100_000 });
    fixture.advance(GRACE_MS);
    await fixture.check();
    assert.equal(fixture.state.recoveryCalls, 1);
    assert.equal(fixture.state.activationCalls, 1);
    assert.equal(fixture.state.status, "granted");
}

console.log("mobile entitlement sync verification passed (A-W)");
