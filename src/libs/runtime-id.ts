let fallbackCounter = 0;

function formatUuid(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function fallbackUuidBytes(): Uint8Array {
  fallbackCounter += 1;
  const seed = [
    Date.now(),
    fallbackCounter,
    Math.random(),
    Math.random(),
    typeof performance !== "undefined" ? performance.now() : 0,
  ].join("|");
  const bytes = new Uint8Array(16);
  let state = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 0x01000193);
  }
  for (let index = 0; index < bytes.length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[index] = state & 0xff;
  }
  return bytes;
}

/**
 * 跨运行时 UUID：安全上下文用 randomUUID；Docker HTTP 用 getRandomValues；
 * 极旧 WebView / Kernel Goja 最后回退到时间、计数器和随机噪声组合，保证功能不因平台缺失而中断。
 */
export function createRuntimeUuid(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    return formatUuid(bytes);
  }
  return formatUuid(fallbackUuidBytes());
}

export function createRuntimeId(prefix: string): string {
  return prefix ? `${prefix}-${createRuntimeUuid()}` : createRuntimeUuid();
}
