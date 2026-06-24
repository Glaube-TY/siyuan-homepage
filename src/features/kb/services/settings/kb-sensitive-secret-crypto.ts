export const ENCRYPTED_SECRET_PREFIX = "enc:v1:";

const SENSITIVE_SECRET_STORAGE_KEY = "kb-sensitive-secret-v1";
const SENSITIVE_SECRET_BYTES = 32;
const SENSITIVE_SECRET_IV_BYTES = 12;

type SecretLocation = "chatProviderApiKey" | "webSearchApiKey";
type SecretTransform = (value: string, location: SecretLocation) => Promise<string>;

export interface SecretDecryptDiagnostics {
  hasDecryptFailure: boolean;
  /** Provider IDs whose apiKey is enc:v1 but could not be decrypted. */
  failedChatProviderIds: string[];
  /** Which locations (chatProviderApiKey / webSearchApiKey) had decrypt failures. */
  failedLocations: SecretLocation[];
  /** How many apiKey fields are enc:v1 in storage. */
  encryptedSecretCount: number;
  /** How many apiKey fields are plaintext (not enc:v1) in storage. */
  plaintextSecretCount: number;
  /** Whether kb-sensitive-secret-v1 exists in plugin storage. */
  secretStoragePresent: boolean;
  /** Byte length of the stored secret key (0 if absent). */
  secretStorageValidLength: number;
}

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
    throw new Error("API Key 加密失败，设置未保存。");
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

export function createEmptySecretDecryptDiagnostics(): SecretDecryptDiagnostics {
  return {
    hasDecryptFailure: false,
    failedChatProviderIds: [],
    failedLocations: [],
    encryptedSecretCount: 0,
    plaintextSecretCount: 0,
    secretStoragePresent: false,
    secretStorageValidLength: 0,
  };
}

async function readSecretStorageDiagnostics(): Promise<{ present: boolean; validLength: number }> {
  try {
    const plugin = getPlugin();
    const stored = await plugin.loadData(SENSITIVE_SECRET_STORAGE_KEY);
    const present = typeof stored === "string" && stored.trim().length > 0;
    const validLength = present ? base64ToBytes(stored.trim()).length : 0;
    return { present, validLength };
  } catch {
    return { present: false, validLength: 0 };
  }
}

export async function decryptSensitiveSecretsFromStorage<T extends Record<string, unknown>>(
  settings: T,
): Promise<{ settings: T; diagnostics: SecretDecryptDiagnostics }> {
  const diagnostics = createEmptySecretDecryptDiagnostics();
  const secretInfo = await readSecretStorageDiagnostics();
  diagnostics.secretStoragePresent = secretInfo.present;
  diagnostics.secretStorageValidLength = secretInfo.validLength;

  const failedProviderIds: string[] = [];
  const failedLocations: Set<SecretLocation> = new Set();

  const transformed = await transformSensitiveSecrets(settings, async (secret, location) => {
    if (!secret) return "";
    if (!isEncryptedSecret(secret)) {
      diagnostics.plaintextSecretCount += 1;
      return secret;
    }

    diagnostics.encryptedSecretCount += 1;

    try {
      return await decryptSecretCipherText(secret);
    } catch {
      diagnostics.hasDecryptFailure = true;
      failedLocations.add(location);
      return "";
    }
  });

  // Collect failed provider IDs from chatProviders
  if (Array.isArray(settings.chatProviders)) {
    for (const rawProvider of settings.chatProviders) {
      if (!rawProvider || typeof rawProvider !== "object") continue;
      const provider = rawProvider as Record<string, unknown>;
      const apiKey = typeof provider.apiKey === "string" ? provider.apiKey : "";
      if (isEncryptedSecret(apiKey)) {
        // Check if the decrypted result ended up empty (indicating failure)
        // Find the corresponding decrypted provider
        const providerId = typeof provider.id === "string" ? provider.id : "";
        if (providerId && Array.isArray(transformed.chatProviders)) {
          const decryptedProvider = (transformed.chatProviders as Record<string, unknown>[]).find(
            (p) => p && typeof p === "object" && (p as Record<string, unknown>).id === providerId,
          );
          if (decryptedProvider && typeof (decryptedProvider as Record<string, unknown>).apiKey === "string") {
            const decryptedKey = (decryptedProvider as Record<string, unknown>).apiKey as string;
            if (decryptedKey === "") {
              failedProviderIds.push(providerId);
            }
          } else if (!decryptedProvider) {
            failedProviderIds.push(providerId);
          }
        }
      }
    }
  }

  diagnostics.failedChatProviderIds = failedProviderIds;
  diagnostics.failedLocations = [...failedLocations];

  return { settings: transformed, diagnostics };
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
