import {
  ROBOT_MASTER_SECRET_KEY,
  ROBOT_RUNTIME_SECRETS_KEY,
  decryptRobotSecret,
  encryptRobotSecret,
  generateRobotMasterSecret,
  normalizeRobotMasterSecret,
} from "./robot-secret-vault";

/**
 * Robot Secret Vault 持久化（环境无关）。
 * master secret 与运行时 secrets 都存于 plugin scoped storage（同一 storage root），
 * Kernel restart 后可解密；不返回前端 reveal、不进日志、不写 Robot history。
 */
export interface RobotSecretStoragePort {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

/** 同一 Kernel 进程内所有 Vault 实例共用串行队列，避免模型密钥与微信凭据 RMW 覆盖。 */
let vaultMutationQueue: Promise<void> = Promise.resolve();

function enqueueVaultMutation<T>(mutation: () => Promise<T>): Promise<T> {
  let resolveValue!: (value: T | PromiseLike<T>) => void;
  let rejectValue!: (reason?: unknown) => void;
  const result = new Promise<T>((resolve, reject) => {
    resolveValue = resolve;
    rejectValue = reject;
  });
  const task = vaultMutationQueue.catch(() => undefined).then(async () => {
    try {
      resolveValue(await mutation());
    } catch (error) {
      rejectValue(error);
    }
  });
  vaultMutationQueue = task;
  return result;
}

export class RobotSecretVaultStore {
  private cachedMaster: string | null = null;

  constructor(private readonly storage: RobotSecretStoragePort) {}

  async getMasterSecret(): Promise<string> {
    if (this.cachedMaster) return this.cachedMaster;
    return enqueueVaultMutation(async () => {
      if (this.cachedMaster) return this.cachedMaster;
      const existing = await this.storage.get(ROBOT_MASTER_SECRET_KEY);
      if (existing && existing.trim()) {
        const normalized = normalizeRobotMasterSecret(existing);
        if (!normalized) throw new Error("Robot secret vault: invalid master secret");
        this.cachedMaster = normalized;
        // 统一写成 JSON string，使前端 Plugin.loadData 与 Kernel storage.get 都能读取。
        if (existing.trim() !== JSON.stringify(this.cachedMaster)) {
          await this.storage.put(ROBOT_MASTER_SECRET_KEY, JSON.stringify(this.cachedMaster));
        }
        return this.cachedMaster;
      }
      const generated = generateRobotMasterSecret();
      await this.storage.put(ROBOT_MASTER_SECRET_KEY, JSON.stringify(generated));
      this.cachedMaster = generated;
      return generated;
    });
  }

  private async readSecretsMap(): Promise<Record<string, string>> {
    const raw = await this.storage.get(ROBOT_RUNTIME_SECRETS_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    } catch {
      // ignore corrupt map
    }
    return {};
  }

  async saveSecret(secretKey: string, plaintext: string): Promise<void> {
    const master = await this.getMasterSecret();
    const envelope = encryptRobotSecret(master, plaintext);
    await enqueueVaultMutation(async () => {
      const map = await this.readSecretsMap();
      map[secretKey] = envelope;
      await this.storage.put(ROBOT_RUNTIME_SECRETS_KEY, JSON.stringify(map));
    });
  }

  async readSecret(secretKey: string): Promise<string | null> {
    await vaultMutationQueue.catch(() => undefined);
    const master = this.cachedMaster ?? await this.getMasterSecret();
    const map = await this.readSecretsMap();
    const envelope = map[secretKey];
    if (!envelope) return null;
    const result = decryptRobotSecret(master, envelope);
    return result.ok && result.plaintext ? result.plaintext : null;
  }

  async deleteSecret(secretKey: string): Promise<void> {
    await enqueueVaultMutation(async () => {
      const map = await this.readSecretsMap();
      if (!(secretKey in map)) return;
      delete map[secretKey];
      await this.storage.put(ROBOT_RUNTIME_SECRETS_KEY, JSON.stringify(map));
    });
  }
}
