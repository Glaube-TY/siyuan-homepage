import type { DeviceViewContext, DeviceWidgetDocument } from "./deviceViewTypes";
import { readDeviceWidget, removeDeviceWidget, writeDeviceWidget } from "./deviceViewStorage";

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function createWidgetInstanceId(): string {
    if (typeof globalThis.crypto?.randomUUID !== "function") {
        throw new Error("当前运行环境不支持 crypto.randomUUID，无法安全创建组件实例");
    }
    return `block-${globalThis.crypto.randomUUID()}`;
}

export async function loadWidgetInstanceConfig(
    context: DeviceViewContext,
    instanceId: string,
): Promise<Record<string, unknown> | null> {
    return (await readDeviceWidget(context, instanceId))?.config ?? null;
}

export async function readWidgetInstanceDocument(
    context: DeviceViewContext,
    instanceId: string,
): Promise<DeviceWidgetDocument | null> {
    return readDeviceWidget(context, instanceId);
}

export async function saveWidgetInstanceConfig(
    context: DeviceViewContext,
    instanceId: string,
    config: Record<string, unknown>,
): Promise<void> {
    if (!isPlainObject(config)) throw new Error(`组件 ${instanceId} 配置不是普通对象`);
    const current = await readDeviceWidget(context, instanceId);
    if (!current) throw new Error(`组件 ${instanceId} 配置不存在`);
    await writeDeviceWidget(context, instanceId, config, { expectedRevision: current.revision });
}

export async function createWidgetInstanceConfig(
    context: DeviceViewContext,
    instanceId: string,
    config: Record<string, unknown>,
): Promise<DeviceWidgetDocument> {
    if (!isPlainObject(config)) throw new Error(`组件 ${instanceId} 配置不是普通对象`);
    return await writeDeviceWidget(context, instanceId, config, { mode: "create", expectedRevision: 0 });
}

export async function updateWidgetInstanceConfig(
    context: DeviceViewContext,
    instanceId: string,
    mutate: (config: Record<string, unknown>) => Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const current = await readDeviceWidget(context, instanceId);
    if (!current) throw new Error(`组件 ${instanceId} 配置不存在`);
    const next = mutate({ ...current.config });
    const written = await writeDeviceWidget(context, instanceId, next, { expectedRevision: current.revision });
    return written.config;
}

/**
 * 使用调用方读取到的 revision 更新组件配置。
 * 供需要显式乐观并发控制的服务使用；现有 UI 调用继续使用 updateWidgetInstanceConfig。
 */
export async function updateWidgetInstanceConfigExpected(
    context: DeviceViewContext,
    instanceId: string,
    expectedRevision: number,
    mutate: (config: Record<string, unknown>) => Record<string, unknown>,
): Promise<DeviceWidgetDocument> {
    const current = await readDeviceWidget(context, instanceId);
    if (!current) throw new Error(`组件 ${instanceId} 配置不存在`);
    if (current.revision !== expectedRevision) {
        throw new Error(`组件 ${instanceId} revision 冲突：预期 ${expectedRevision}，当前 ${current.revision}`);
    }
    const next = mutate({ ...current.config });
    if (!isPlainObject(next)) throw new Error(`组件 ${instanceId} 更新结果不是普通对象`);
    return writeDeviceWidget(context, instanceId, next, { expectedRevision });
}

export async function deleteWidgetInstance(
    context: DeviceViewContext,
    instanceId: string,
    expectedRevision: number,
): Promise<void> {
    await removeDeviceWidget(context, instanceId, { expectedRevision });
}
