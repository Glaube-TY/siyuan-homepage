export const ENCRYPTED_SECRET_PREFIX = "enc:v1:";

const SENSITIVE_SECRET_STORAGE_KEY = "kb-sensitive-secret-v1";
const SENSITIVE_SECRET_BYTES = 32;
const SENSITIVE_SECRET_IV_BYTES = 12;

const PLAINTEXT_STORAGE_SECRET_WARNING = "检测到未加密的 API Key，将在下次保存时自动迁移为加密存储。";
const DECRYPT_STORAGE_SECRET_WARNING = "API Key 解密失败，请重新填写。";
const ENCRYPT_SECRET_FAILURE_MESSAGE = "API Key 加密失败，设置未保存。";

type SecretLocation = "chatProviderApiKey" | "webSearchApiKey";
type SecretTransform = (value: string, location: SecretLocation) => Promise<string>;

let cryptoPlugin: any = null;

export function setKbSensitiveSecretCryptoPlugin(plugin: any): void {
  cryptoPlugin = plugin;
}

export function isEncryptedSecret(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(ENCRYPTED_SECRET_PREFIX);
}

function getCrypto(): Crypto {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle || typeof cryptoApi.getRandomValues !== "function") {
    throw new Error("当前环境不支持 Web Crypto，API Key 无法加密保存。");
  }
  return cryptoApi;
}

function getPlugin(): any {
  if (!cryptoPlugin) {
    throw new Error("API Key 加密存储尚未初始化。");
  }
  return cryptoPlugin;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function loadOrCreateSensitiveSecret(): Promise<string> {
  const cryptoApi = getCrypto();
  const plugin = getPlugin();
  const stored = await plugin.loadData(SENSITIVE_SECRET_STORAGE_KEY);

  if (typeof stored === "string" && stored.trim()) {
    return stored.trim();
  }

  const secretBytes = new Uint8Array(SENSITIVE_SECRET_BYTES);
  cryptoApi.getRandomValues(secretBytes);
  const secret = bytesToBase64(secretBytes);
  await plugin.saveData(SENSITIVE_SECRET_STORAGE_KEY, secret);
  return secret;
}

async function importAesGcmKey(): Promise<CryptoKey> {
  const cryptoApi = getCrypto();
  const secret = await loadOrCreateSensitiveSecret();
  const secretBytes = base64ToBytes(secret);
  if (secretBytes.length !== SENSITIVE_SECRET_BYTES) {
    throw new Error("API Key 本地加密密钥无效。");
  }

  return cryptoApi.subtle.importKey(
    "raw",
    bytesToArrayBuffer(secretBytes),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSecretPlainText(value: string): Promise<string> {
  const plainText = typeof value === "string" ? value : "";
  if (!plainText) return "";
  if (isEncryptedSecret(plainText)) return plainText;

  try {
    const cryptoApi = getCrypto();
    const key = await importAesGcmKey();
    const iv = new Uint8Array(SENSITIVE_SECRET_IV_BYTES);
    cryptoApi.getRandomValues(iv);

    const encoded = new TextEncoder().encode(plainText);
    const cipherBuffer = await cryptoApi.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoded,
    );

    return `${ENCRYPTED_SECRET_PREFIX}${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(cipherBuffer))}`;
  } catch {
    console.warn(ENCRYPT_SECRET_FAILURE_MESSAGE);
    throw new Error(ENCRYPT_SECRET_FAILURE_MESSAGE);
  }
}

export async function decryptSecretCipherText(value: string): Promise<string> {
  if (!value) return "";
  if (!isEncryptedSecret(value)) {
    throw new Error("API Key 不是加密密文。");
  }

  try {
    const encryptedBody = value.slice(ENCRYPTED_SECRET_PREFIX.length);
    const [ivBase64, cipherBase64] = encryptedBody.split(":");
    if (!ivBase64 || !cipherBase64) {
      throw new Error("API Key 密文格式无效。");
    }

    const key = await importAesGcmKey();
    const plainBuffer = await getCrypto().subtle.decrypt(
      { name: "AES-GCM", iv: bytesToArrayBuffer(base64ToBytes(ivBase64)) },
      key,
      bytesToArrayBuffer(base64ToBytes(cipherBase64)),
    );

    return new TextDecoder().decode(plainBuffer);
  } catch {
    throw new Error("API Key 解密失败。");
  }
}

async function transformSensitiveSecrets<T extends Record<string, unknown>>(
  settings: T,
  transform: SecretTransform,
): Promise<T> {
  const cloned = { ...settings } as Record<string, unknown>;
  const providers = cloned.chatProviders;
  if (Array.isArray(providers)) {
    cloned.chatProviders = await Promise.all(
      providers.map(async (provider) => {
        if (!provider || typeof provider !== "object") return provider;

        const providerRecord = { ...(provider as Record<string, unknown>) };
        const rawApiKey = typeof providerRecord.apiKey === "string" ? providerRecord.apiKey : "";
        providerRecord.apiKey = await transform(rawApiKey, "chatProviderApiKey");
        return providerRecord;
      }),
    );
  }

  if (cloned.webSearch && typeof cloned.webSearch === "object") {
    const webSearchRecord = { ...(cloned.webSearch as Record<string, unknown>) };
    const rawApiKey = typeof webSearchRecord.apiKey === "string" ? webSearchRecord.apiKey : "";
    const transformedApiKey = await transform(rawApiKey, "webSearchApiKey");
    if (transformedApiKey) {
      webSearchRecord.apiKey = transformedApiKey;
    } else {
      delete webSearchRecord.apiKey;
    }
    cloned.webSearch = webSearchRecord;
  }

  return cloned as T;
}

export async function decryptSensitiveSecretsFromStorage<T extends Record<string, unknown>>(
  settings: T,
): Promise<T> {
  let hasPlaintextStorageSecret = false;
  let hasDecryptFailure = false;

  const transformed = await transformSensitiveSecrets(settings, async (secret) => {
    if (!secret) return "";
    if (!isEncryptedSecret(secret)) {
      hasPlaintextStorageSecret = true;
      return secret;
    }

    try {
      return await decryptSecretCipherText(secret);
    } catch {
      hasDecryptFailure = true;
      return "";
    }
  });

  if (hasPlaintextStorageSecret) {
    console.warn(PLAINTEXT_STORAGE_SECRET_WARNING);
  }
  if (hasDecryptFailure) {
    console.warn(DECRYPT_STORAGE_SECRET_WARNING);
  }

  return transformed;
}

export async function normalizeSensitiveSecretsFromRuntime<T extends Record<string, unknown>>(
  settings: T,
): Promise<T> {
  return transformSensitiveSecrets(settings, async (secret) => {
    if (!secret) return "";
    if (isEncryptedSecret(secret)) {
      return decryptSecretCipherText(secret);
    }
    return secret;
  });
}

export async function encryptSensitiveSecretsForStorage<T extends Record<string, unknown>>(
  settings: T,
): Promise<T> {
  return transformSensitiveSecrets(settings, async (secret) => encryptSecretPlainText(secret));
}
