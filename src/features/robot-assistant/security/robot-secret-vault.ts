import CryptoJS from "crypto-js";

/**
 * Robot Kernel 运行时内部 Secret Vault（环境无关，可在 Kernel Goja 运行）。
 *
 * 威胁模型与当前本地 API Key 加密一致：防止配置文件直接肉眼明文泄露，
 * 不宣称抵御拥有完整工作空间读权限的攻击者。
 *
 * 不修改现有 `kb-sensitive-secret-v1` AES-GCM 格式（其依赖浏览器 Web Crypto）。
 *
 * Envelope：`robot:enc:v1:<iv>:<ciphertext>:<mac>`
 * - 随机 256-bit master secret（存储于 plugin scoped storage）
 * - AES-CBC 加密
 * - HMAC-SHA256 完整性
 * - 独立 enc/mac derivation label
 *
 * 用户界面不可见，不返回前端 reveal，不写入 Robot history，不在日志输出明文。
 */

export const ROBOT_MASTER_SECRET_KEY = "robot-secret-key-v1";
export const ROBOT_RUNTIME_SECRETS_KEY = "robot-runtime-secrets-v1";
const ENVELOPE_PREFIX = "robot:enc:v1:";
const ENC_LABEL = "robot-envelope-enc";
const MAC_LABEL = "robot-envelope-mac";

/**
 * 统一 Plugin.loadData 与 Kernel storage.get 的主密钥格式：
 * - Plugin.loadData 通常返回已解析的 64 位 hex 字符串；
 * - Kernel storage.get 返回 JSON string 原文（形如 `"abc..."`）；
 * - 早期开发包还可能保存为 `{ value }`。
 */
export function normalizeRobotMasterSecret(raw: unknown): string | null {
  let candidate: unknown = raw;
  for (let depth = 0; depth < 3; depth += 1) {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      candidate = (candidate as Record<string, unknown>).value;
      continue;
    }
    if (typeof candidate !== "string") return null;
    const trimmed = candidate.trim();
    if (/^[a-f0-9]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed === candidate) return null;
      candidate = parsed;
    } catch {
      return null;
    }
  }
  return null;
}

function bytesToHex(bytes: CryptoJS.lib.WordArray): string {
  return bytes.toString(CryptoJS.enc.Hex);
}

function hexToBytes(hex: string): CryptoJS.lib.WordArray {
  return CryptoJS.enc.Hex.parse(hex);
}

let fallbackEntropyCounter = 0;

/**
 * 生成随机字节。浏览器/Node 中优先使用 crypto-js 对系统 CSPRNG 的封装；
 * SiYuan Kernel 的 Goja 没有 native crypto 时，用运行时噪声经多轮 SHA-256 扩展。
 * 本 Vault 的威胁模型是避免配置明文落盘，不把此回退宣称为系统级密钥保护。
 */
function randomWordArray(byteLength: number): CryptoJS.lib.WordArray {
  try {
    return CryptoJS.lib.WordArray.random(byteLength);
  } catch {
    const chunks: CryptoJS.lib.WordArray[] = [];
    let produced = 0;
    let previous = "";
    while (produced < byteLength) {
      fallbackEntropyCounter += 1;
      const noise: string[] = [
        String(Date.now()),
        String(fallbackEntropyCounter),
        String(Math.random()),
        String(Math.random()),
        previous,
      ];
      for (let index = 0; index < 32; index += 1) {
        noise.push(String(Math.random()), String(Date.now()));
      }
      const digest = CryptoJS.SHA256(noise.join("|"));
      chunks.push(digest);
      previous = digest.toString(CryptoJS.enc.Hex);
      produced += 32;
    }
    const combined = chunks.reduce(
      (result, chunk) => result.concat(chunk),
      CryptoJS.lib.WordArray.create(),
    );
    combined.sigBytes = byteLength;
    combined.clamp();
    return combined;
  }
}

/** 生成 32 字节 master secret（hex）。 */
export function generateRobotMasterSecret(): string {
  const random = randomWordArray(32);
  return bytesToHex(random);
}

/** 用 label 派生 enc/mac 子密钥，避免同一密钥用于加解密与完整性校验。 */
function deriveKey(masterSecretHex: string, label: string): CryptoJS.lib.WordArray {
  return CryptoJS.HmacSHA256(label, hexToBytes(masterSecretHex));
}

export interface RobotSecretEnvelopeResult {
  ok: true;
  envelope: string;
}

/** 加密并返回 envelope。任何异常都抛出，调用方负责不泄漏明文。 */
export function encryptRobotSecret(masterSecretHex: string, plaintext: string): string {
  if (!masterSecretHex || typeof plaintext !== "string") {
    throw new Error("Robot secret vault: invalid input");
  }
  const encKey = deriveKey(masterSecretHex, ENC_LABEL);
  const macKey = deriveKey(masterSecretHex, MAC_LABEL);
  const iv = randomWordArray(16);
  const ciphertext = CryptoJS.AES.encrypt(plaintext, encKey, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  }).ciphertext;
  const mac = CryptoJS.HmacSHA256(ciphertext, macKey);
  return `${ENVELOPE_PREFIX}${bytesToHex(iv)}:${bytesToHex(ciphertext)}:${bytesToHex(mac)}`;
}

export interface RobotSecretDecryptResult {
  ok: boolean;
  plaintext?: string;
  /** 解密失败原因分类（仅用于提示，不含敏感信息）。 */
  reason?: "invalid_format" | "mac_mismatch" | "decrypt_failed";
}

/** 解密 envelope。MAC 不匹配返回 ok:false，绝不返回错误明文。 */
export function decryptRobotSecret(masterSecretHex: string, envelope: string): RobotSecretDecryptResult {
  if (!masterSecretHex || typeof envelope !== "string" || !envelope.startsWith(ENVELOPE_PREFIX)) {
    return { ok: false, reason: "invalid_format" };
  }
  const body = envelope.slice(ENVELOPE_PREFIX.length);
  const parts = body.split(":");
  if (parts.length !== 3) return { ok: false, reason: "invalid_format" };
  const [ivHex, cipherHex, macHex] = parts;
  if (!ivHex || !cipherHex || !macHex) return { ok: false, reason: "invalid_format" };
  const ciphertext = hexToBytes(cipherHex);
  const encKey = deriveKey(masterSecretHex, ENC_LABEL);
  const macKey = deriveKey(masterSecretHex, MAC_LABEL);
  const expectedMac = CryptoJS.HmacSHA256(ciphertext, macKey);
  if (bytesToHex(expectedMac) !== macHex.toLowerCase()) return { ok: false, reason: "mac_mismatch" };
  try {
    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext, salt: undefined as never } as unknown as CryptoJS.lib.CipherParams,
      encKey,
      { iv: hexToBytes(ivHex), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 },
    );
    const plaintext = decrypted.toString(CryptoJS.enc.Utf8);
    if (plaintext) return { ok: true, plaintext };
  } catch {
    return { ok: false, reason: "mac_mismatch" };
  }
  return { ok: false, reason: "mac_mismatch" };
}

export function isRobotEnvelope(value: string): boolean {
  return typeof value === "string" && value.startsWith(ENVELOPE_PREFIX);
}
