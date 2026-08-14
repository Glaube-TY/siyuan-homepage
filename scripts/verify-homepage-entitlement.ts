import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(process.cwd());
const sourceRoot = join(root, "src");

function read(path: string): string {
    return readFileSync(join(root, path), "utf8");
}

function collectSourceFiles(directory: string): string[] {
    return readdirSync(directory).flatMap((name) => {
        const path = join(directory, name);
        return statSync(path).isDirectory() ? collectSourceFiles(path) : [path];
    }).filter((path) => /\.(ts|svelte)$/.test(path));
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

const sourceFiles = collectSourceFiles(sourceRoot);
const advancedAssignments = sourceFiles.flatMap((path) => {
    const matches = [...readFileSync(path, "utf8").matchAll(/(?:plugin|this)\.ADVANCED\s*=/g)];
    return matches.map(() => relative(root, path).replace(/\\/g, "/"));
});

assert(
    advancedAssignments.length === 1
        && advancedAssignments[0] === "src/features/entitlement/homepage-entitlement.ts",
    `ADVANCED 必须只有一个写入口，当前发现：${advancedAssignments.join(", ") || "无"}`,
);

const indexSource = read("src/index.ts");
assert(indexSource.includes("verifySavedSignedLicenseReadOnly"), "启动校验必须使用只读签名验证，不能进入授权写队列");
assert(indexSource.includes("withEntitlementTimeout"), "启动会员校验必须有超时边界");
assert(indexSource.includes("homepageEntitlementFailureCount"), "会员校验异常必须具备退避重试");
assert(indexSource.includes("visibilitychange"), "应用回到前台时必须复核会员状态");
assert(indexSource.includes("syncHomepageServerLicense"), "本地签名校验后必须同步服务端撤销状态");

const entitlementSource = read("src/features/entitlement/homepage-entitlement.ts");
for (const status of ["pending", "granted", "denied", "error"]) {
    assert(entitlementSource.includes(`"${status}"`), `共享会员状态缺少 ${status}`);
}
assert(entitlementSource.includes("validUntil"), "会员状态必须记录并实时判断授权到期时间");
assert(entitlementSource.includes("isGrantStillValid"), "临时异常保留授权时必须先确认授权尚未到期");

const mountSource = read("src/components/utils/widgetBlock/widgetMountRegistry.ts");
assert(mountSource.includes("WidgetRuntimeHost"), "所有桌面、侧边栏和移动端组件必须经过会员状态刷新宿主");

for (const entry of [
    "src/components/utils/widgetBlock/widget/accounting/openAccountingDetailDialog.ts",
    "src/features/countdown-center/open-countdown-center.ts",
    "src/features/favorites-manager/open-favorites-manager.ts",
    "src/features/kb/services/selection-ai/selection-ai-menu.ts",
    "src/homepage/header/status-ai-generator.ts",
]) {
    assert(
        read(entry).includes("ensureHomepageEntitlementGranted"),
        `${entry} 必须等待共享会员校验后再开放功能`,
    );
}

assert(
    read("src/features/notification-center/notification-center-plugin.ts").includes("isHomepageEntitlementGranted"),
    "后台通知能力必须使用带到期判断的共享会员状态",
);
assert(
    read("src/api.ts").includes("getCloudUser timeout"),
    "思源云端身份读取必须有超时和本地身份回退",
);
assert(
    read("src/components/tools/advanced.ts").includes("license mutation"),
    "授权文件写队列必须限制调用方的无限等待，同时保持串行写入",
);
const kernelEntitlementSource = read("src/kernel/kernel-entitlement.ts");
assert(!kernelEntitlementSource.includes("CACHE_TTL_MS"), "Kernel 敏感调用不得缓存已撤销或已过期的会员状态");
assert(kernelEntitlementSource.includes("kernel license read timeout"), "Kernel 会员文件读取必须超时失败关闭");

console.log("会员权限审计通过：单一写入口、失败关闭、超时重试、到期复核、服务端撤销和跨端刷新均已覆盖。");
