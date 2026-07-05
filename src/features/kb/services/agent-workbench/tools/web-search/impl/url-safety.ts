/**
 * URL safety validator for web_fetch.read_page.
 * Pure function — no side effects, no network calls, no DNS resolution.
 * This is a plugin-side first-line defense; it does not claim to block all possible
 * internal network access (e.g. DNS rebinding), but rejects obvious unsafe targets.
 */

export type ValidatePublicHttpUrlResult =
  | { ok: true; normalizedUrl: string }
  | { ok: false; reason: string };

const FORBIDDEN_LOCAL_SUFFIXES = new Set([".local", ".lan", ".internal"]);

/** Parse dotted-decimal IPv4 into four octets; return null if invalid. */
function parseIPv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    if (p === "" || p.length > 3 || !/^\d+$/.test(p)) return null;
    const n = parseInt(p, 10);
    if (n > 255) return null;
    nums.push(n);
  }
  return nums;
}

/** Check whether an IPv4 address falls into a forbidden range.
 *  Uses simple octet checks to avoid signed 32-bit bitwise pitfalls in JS.
 */
function isForbiddenIPv4(nums: number[]): boolean {
  const [a, b] = nums;
  if (a === 0) return true;                       // 0.0.0.0/8
  if (a === 10) return true;                      // 10.0.0.0/8
  if (a === 127) return true;                     // 127.0.0.0/8
  if (a === 169 && b === 254) return true;        // 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true;        // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
  if (a >= 224) return true;                      // 224.0.0.0/4 and above
  return false;
}

/** Normalize IPv6 hostname for checking: strip brackets, remove zone id. */
function normalizeHostForIpCheck(host: string): string {
  let h = host.trim().toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) {
    h = h.slice(1, -1);
  }
  const zoneIndex = h.indexOf("%");
  if (zoneIndex !== -1) {
    h = h.slice(0, zoneIndex);
  }
  return h;
}

/** Parse an IPv6 address into eight 16-bit groups; return null if invalid.
 *  Supports compressed (::) notation, dotted IPv4-mapped tail, and hex groups.
 */
function parseIPv6(host: string): { groups: number[]; mappedIPv4: number[] | null } | null {
  if (!host.includes(":")) return null;

  let h = host;

  // Try dotted IPv4-mapped tail first: e.g. ::ffff:192.168.1.1
  let tailIPv4: number[] | null = null;
  const lastColon = h.lastIndexOf(":");
  if (lastColon > 0) {
    const after = h.slice(lastColon + 1);
    const ipv4 = parseIPv4(after);
    if (ipv4) {
      tailIPv4 = ipv4;
      h = h.slice(0, lastColon + 1);
    }
  }

  const parts = h.split(":");
  const groups: number[] = [];
  let compressionIndex = -1;

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p === "") {
      if (compressionIndex !== -1) return null;
      compressionIndex = i;
      continue;
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(p)) return null;
    groups.push(parseInt(p, 16));
  }

  if (compressionIndex !== -1) {
    const totalExpected = tailIPv4 ? 6 : 8;
    const missingCount = totalExpected - groups.length;
    if (missingCount < 0) return null;
    const reconstructed: number[] = [];
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === "") {
        const padCount = totalExpected - groups.length;
        for (let j = 0; j < padCount; j++) reconstructed.push(0);
      } else {
        reconstructed.push(parseInt(parts[i], 16));
      }
    }
    if (reconstructed.length !== totalExpected) return null;
    if (tailIPv4) {
      reconstructed.push((tailIPv4[0] << 8) | tailIPv4[1]);
      reconstructed.push((tailIPv4[2] << 8) | tailIPv4[3]);
    }
    return { groups: reconstructed, mappedIPv4: tailIPv4 };
  }

  // No compression
  const totalExpected = tailIPv4 ? 10 : 8;
  if (groups.length !== totalExpected) return null;
  if (tailIPv4) {
    groups.push((tailIPv4[0] << 8) | tailIPv4[1]);
    groups.push((tailIPv4[2] << 8) | tailIPv4[3]);
  }
  return { groups, mappedIPv4: tailIPv4 };
}

/** Extract IPv4 address from the last two hex groups of an IPv4-mapped IPv6 address.
 *  E.g. ::ffff:c0a8:0101 -> [192, 168, 1, 1]
 */
function extractHexMappedIPv4(groups: number[]): number[] | null {
  if (groups.length !== 8) return null;
  // IPv4-mapped: prefix ::ffff:<ipv4>
  if (groups[5] !== 0xffff) return null;
  const a = (groups[6] >> 8) & 0xff;
  const b = groups[6] & 0xff;
  const c = (groups[7] >> 8) & 0xff;
  const d = groups[7] & 0xff;
  return [a, b, c, d];
}

/** Check whether an IPv6 address is forbidden. */
function isForbiddenIPv6(host: string): boolean {
  const parsed = parseIPv6(host);
  if (!parsed) return false;

  const { groups, mappedIPv4 } = parsed;

  // ::1 (loopback)
  if (
    groups.length === 8 &&
    groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 &&
    groups[4] === 0 && groups[5] === 0 && groups[6] === 0 && groups[7] === 1
  ) {
    return true;
  }

  // :: (unspecified)
  if (groups.every((g) => g === 0)) return true;

  // fc00::/7 (unique local)
  if ((groups[0] & 0xfe00) === 0xfc00) return true;

  // fe80::/10 (link-local)
  if ((groups[0] & 0xffc0) === 0xfe80) return true;

  // ff00::/8 (multicast)
  if ((groups[0] & 0xff00) === 0xff00) return true;

  // Dotted IPv4-mapped tail: ::ffff:192.168.1.1
  if (mappedIPv4 && isForbiddenIPv4(mappedIPv4)) return true;

  // Hex IPv4-mapped tail: ::ffff:c0a8:0101
  const hexMapped = extractHexMappedIPv4(groups);
  if (hexMapped && isForbiddenIPv4(hexMapped)) return true;

  return false;
}

/**
 * Validate that a URL is a safe, public HTTP(S) URL.
 * Rejects localhost, private networks, link-local, cloud metadata, etc.
 */
export function validatePublicHttpUrl(url: string): ValidatePublicHttpUrlResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "URL 格式无效。" };
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    return { ok: false, reason: "只支持 http: 和 https: 协议。" };
  }

  // Reject URLs with embedded credentials
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "不允许包含用户名或密码的 URL。" };
  }

  const hostname = parsed.hostname.trim().toLowerCase();
  if (!hostname) {
    return { ok: false, reason: "URL 的 hostname 为空。" };
  }

  // Reject localhost variants
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { ok: false, reason: "不允许读取 localhost 地址。" };
  }

  // Reject obvious local domain suffixes
  for (const suffix of FORBIDDEN_LOCAL_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      return { ok: false, reason: `不允许读取 ${suffix} 本地域名。` };
    }
  }

  // IPv4 check
  const ipv4 = parseIPv4(hostname);
  if (ipv4) {
    if (isForbiddenIPv4(ipv4)) {
      return { ok: false, reason: "不允许读取本机、内网、链路本地或保留 IP 地址。" };
    }
  }

  // IPv6 check
  const normalizedV6 = normalizeHostForIpCheck(hostname);
  if (isForbiddenIPv6(normalizedV6)) {
    return { ok: false, reason: "不允许读取本机、链路本地、唯一本地或组播 IPv6 地址。" };
  }

  // Normalize: use the parsed URL string (it trims, lowercases host, etc.)
  return { ok: true, normalizedUrl: parsed.toString() };
}
