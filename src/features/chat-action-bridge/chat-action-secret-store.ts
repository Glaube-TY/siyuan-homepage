import {
  decryptSecretCipherText,
  encryptSecretPlainText,
  isEncryptedSecret,
  setKbSensitiveSecretCryptoPlugin,
} from "@/features/kb/services/settings/kb-sensitive-secret-crypto";

export function setChatActionSecretPlugin(plugin: any): void {
  setKbSensitiveSecretCryptoPlugin(plugin);
}

export async function encryptChatActionSecret(value: string): Promise<string> {
  const text = value.trim();
  if (!text || isEncryptedSecret(text)) return text;
  return encryptSecretPlainText(text);
}

export async function decryptChatActionSecret(value: string): Promise<string> {
  const text = value.trim();
  if (!text) return "";
  if (!isEncryptedSecret(text)) return text;
  return decryptSecretCipherText(text);
}

