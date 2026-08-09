import type { RobotKernelHost } from "./kernel-host";
import { isSignedLicense, verifySignedLicense } from "../components/tools/licenseSy2";

const LICENSE_KEY = "license.syhomepage";
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Kernel 会员校验：直接读取与前端相同的签名许可证文件并使用同一公钥验签。
 * 不信任可编辑的 ADVANCED/remainingDays 布尔或展示字段。
 */
export class KernelEntitlementService {
  private cached: { available: boolean; checkedAt: number } | null = null;

  constructor(private readonly host: RobotKernelHost, private readonly now = () => Date.now()) {}

  async isAvailable(): Promise<boolean> {
    const now = this.now();
    if (this.cached && now - this.cached.checkedAt < CACHE_TTL_MS) return this.cached.available;
    const available = await this.verifyLocalLicense();
    this.cached = { available, checkedAt: now };
    return available;
  }

  invalidate(): void {
    this.cached = null;
  }

  private async verifyLocalLicense(): Promise<boolean> {
    const raw = await this.host.storage.get(LICENSE_KEY);
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
