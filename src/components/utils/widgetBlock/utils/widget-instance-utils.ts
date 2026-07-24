/**
 * Widget 实例 ID 与思源块 ID 工具函数。
 *
 * 两种 ID 语义严格区分：
 * - WidgetInstanceId：插件组件实例 ID，格式 `block-<uuid>`，仅用于设备视图层。
 * - SiyuanBlockId：思源内核节点 ID，格式 `YYYYMMDDHHmmss-xxxxxxx`，来自文档树。
 *
 * WidgetInstanceId 永远不得传给思源块 API；SiyuanBlockId 调用块 API 前必须校验。
 */

/** 思源块/节点 ID 正则：YYYYMMDDHHmmss-xxxxxxx */
const SIYUAN_BLOCK_ID_RE = /^\d{14}-[a-z0-9]{7}$/;

/** 校验是否为合法的思源块/节点 ID */
export function isValidSiyuanBlockId(value: unknown): value is string {
    return typeof value === "string" && SIYUAN_BLOCK_ID_RE.test(value);
}

/** 别名，与 isValidSiyuanBlockId 相同 */
export const isValidSiyuanNodeId = isValidSiyuanBlockId;

/** 断言值为合法的思源块 ID，非法时抛出含字段名的错误 */
export function assertValidSiyuanBlockId(value: unknown, fieldName: string): asserts value is string {
    if (!isValidSiyuanBlockId(value)) {
        throw new Error(`${fieldName} 不是合法的思源块ID`);
    }
}

/**
 * 从组件配置中读取 WidgetInstanceId。
 * 新配置优先 instanceId，旧兼容顶层 blockId。
 */
export function readWidgetInstanceId(config: Record<string, unknown>): string | undefined {
    return (config.instanceId as string | undefined) ?? (config.blockId as string | undefined);
}
