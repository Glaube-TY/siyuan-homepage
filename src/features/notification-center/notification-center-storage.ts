import { ZodError, type ZodSchema } from "zod";
import { readDirChecked } from "@/api";
import { getNotificationCenterPlugin } from "./notification-center-plugin";

export class NotificationCenterStorageError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "NotificationCenterStorageError";
  }
}

function splitStorageKey(key: string): string[] {
  const segments = key.replace(/\\/g, "/").split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    throw new NotificationCenterStorageError(`通知数据路径无效：${key}`);
  }
  return segments;
}

export async function notificationCenterDataFileExists(key: string): Promise<boolean> {
  const plugin = getNotificationCenterPlugin();
  const pluginName = typeof plugin?.name === "string" && plugin.name.trim()
    ? plugin.name.trim()
    : "siyuan-homepage";
  const segments = [pluginName, ...splitStorageKey(key)];
  let parentPath = "data/storage/petal";

  for (let index = 0; index < segments.length; index += 1) {
    let entries: IResReadDir[];
    try {
      entries = await readDirChecked(parentPath);
    } catch (error) {
      throw new NotificationCenterStorageError(`读取通知数据目录失败：${parentPath}`, error);
    }
    if (!Array.isArray(entries)) {
      throw new NotificationCenterStorageError(`通知数据目录读取结果异常：${parentPath}`);
    }
    const entry = entries.find((item) => item.name === segments[index]);
    if (!entry) return false;

    const isLast = index === segments.length - 1;
    if (isLast) {
      if (entry.isDir === true) {
        throw new NotificationCenterStorageError(`通知数据目录结构异常，目标文件是目录：${key}`);
      }
      return true;
    }
    if (entry.isDir !== true) {
      throw new NotificationCenterStorageError(`通知数据目录结构异常，中间路径不是目录：${key}`);
    }
    parentPath = `${parentPath}/${segments[index]}`;
  }
  return false;
}

export async function readJSON<T>(key: string, schema: ZodSchema<T>): Promise<T | null> {
  let raw: unknown;
  try {
    raw = await getNotificationCenterPlugin().loadData(key);
  } catch (error) {
    if (!(await notificationCenterDataFileExists(key))) return null;
    throw new NotificationCenterStorageError(`读取通知数据失败：${key}`, error);
  }

  if (raw === null || raw === undefined) return null;

  if (typeof raw === "string") {
    if (raw.trim() === "") {
      if (!(await notificationCenterDataFileExists(key))) return null;
      throw new NotificationCenterStorageError(`通知数据文件为空或损坏：${key}`);
    }
    try {
      raw = JSON.parse(raw);
    } catch (error) {
      throw new NotificationCenterStorageError(`通知数据格式验证失败：${key}，内容不是有效的 JSON。`, error);
    }
  }

  try {
    return schema.parse(raw);
  } catch (error) {
    if (error instanceof ZodError) {
      if (!(await notificationCenterDataFileExists(key))) return null;
      throw new NotificationCenterStorageError(
        `通知数据格式验证失败：${key}，${error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")}`,
        error,
      );
    }
    throw new NotificationCenterStorageError(`通知数据解析失败：${key}`, error);
  }
}

export async function writeJSON<T>(key: string, data: T, schema: ZodSchema<T>): Promise<T> {
  let validated: T;
  try {
    validated = schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new NotificationCenterStorageError(
        `通知数据保存前验证失败：${key}，${error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")}`,
        error,
      );
    }
    throw new NotificationCenterStorageError(`通知数据保存前验证失败：${key}`, error);
  }

  try {
    await getNotificationCenterPlugin().saveData(key, validated);
  } catch (error) {
    throw new NotificationCenterStorageError(`通知数据保存失败：${key}`, error);
  }

  const saved = await readJSON(key, schema);
  if (saved === null) {
    throw new NotificationCenterStorageError(`通知数据保存后验证失败：${key} 读取为空。`);
  }

  return saved;
}
