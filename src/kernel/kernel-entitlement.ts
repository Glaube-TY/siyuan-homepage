import type { RobotKernelHost } from "./kernel-host";
import { isSignedLicense, verifySignedLicense } from "../components/tools/licenseSy2";

const LICENSE_KEY = "license.syhomepage";
const LICENSE_READ_TIMEOUT_MS = 8_000;

/**
 * Kernel 会员校验：直接读取与前端相同的签名许可证文件并使用同一公钥验签。
 * 不信任可编辑的 ADVANCED/remainingDays 布尔或展示字段。
 */
export class KernelEntitlementService {
  constructor(private readonly host: RobotKernelHost) {}

  async isAvailable(): Promise<boolean> {
    return this.verifyLocalLicense();
  }

  invalidate(): void {
    // 保留兼容接口；授权不再缓存，每次敏感调用都读取并验签当前文件。
  }

  private async verifyLocalLicense(): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const raw = await Promise.race([
      this.host.storage.get(LICENSE_KEY),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("kernel license read timeout")), LICENSE_READ_TIMEOUT_MS);
      }),
    ]).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    }).catch(() => null);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw) as Record<string, unknown>;
      const code = typeof data.ActivationCode === "string" ? data.ActivationCode.trim() : "";
      const name = typeof data.name === "string" ? data.name.trim() : "";
      const userId = typeof data.userId === "string" ? data.userId.trim() : "";
      if (!code || !name || !userId || !isSignedLicense(code)) return false;
      return verifySignedLicense(code, name, userId).valid === true;
    } catch {
      return false;
    }
  }
}
