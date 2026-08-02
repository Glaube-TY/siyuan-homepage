import * as CryptoJS from "crypto-js";

export function normalizeGlobalMemoryText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim()
    .replace(/\n{3,}/g, "\n\n");
}

export function digestGlobalMemoryText(text: string): string {
  const module = CryptoJS as unknown as {
    SHA256?: (value: string) => { toString(): string };
    default?: { SHA256?: (value: string) => { toString(): string } };
  };
  const sha256 = module.SHA256 ?? module.default?.SHA256;
  if (!sha256) throw new Error("SHA-256 实现不可用。");
  return sha256(normalizeGlobalMemoryText(text)).toString();
}

export function matchesGlobalMemoryBaseDigest(baseDigest: string, latestText: string): boolean {
  return digestGlobalMemoryText(latestText) === baseDigest;
}

export function matchesExpectedGlobalMemoryWrite(expectedText: string, actualText: string): boolean {
  return normalizeGlobalMemoryText(expectedText) === normalizeGlobalMemoryText(actualText);
}
