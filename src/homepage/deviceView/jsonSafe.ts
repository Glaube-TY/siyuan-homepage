export function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function cloneJsonValue(
    value: unknown,
    ancestors: Set<object>,
    path: string,
    omitUndefinedObjectProperties = false,
): unknown {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new Error(`${path} 包含非有限数字`);
        return value;
    }
    if (typeof value !== "object") throw new Error(`${path} 包含 JSON 不支持的 ${typeof value}`);
    if (ancestors.has(value)) throw new Error(`${path} 包含循环引用`);
    ancestors.add(value);
    try {
        if (Array.isArray(value)) {
            return value.map((item, index) => cloneJsonValue(
                item,
                ancestors,
                `${path}[${index}]`,
                omitUndefinedObjectProperties,
            ));
        }
        if (!isPlainJsonObject(value)) throw new Error(`${path} 包含非普通对象`);
        const result: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value)) {
            if (item === undefined && omitUndefinedObjectProperties) continue;
            result[key] = cloneJsonValue(item, ancestors, `${path}.${key}`, omitUndefinedObjectProperties);
        }
        return result;
    } finally {
        ancestors.delete(value);
    }
}

export function cloneJsonSafe<T>(value: T, label = "JSON 数据"): T {
    const cloned = cloneJsonValue(value, new Set<object>(), label) as T;
    const encoded = JSON.stringify(cloned);
    if (encoded === undefined) throw new Error(`${label} 无法序列化`);
    const roundTripped = JSON.parse(encoded) as T;
    if (!hasSameJsonSemantic(cloned, roundTripped)) throw new Error(`${label} 无法安全往返 JSON`);
    return roundTripped;
}

/**
 * 严格克隆 JSON 数据，并递归省略普通对象中值为 undefined 的属性。
 * 数组元素中的 undefined 及其他 JSON 非法值仍会被拒绝，不能静默转换为 null。
 */
export function cloneJsonSafeOmittingUndefinedObjectProperties<T>(value: T, label = "JSON 数据"): T {
    const cloned = cloneJsonValue(value, new Set<object>(), label, true) as T;
    const encoded = JSON.stringify(cloned);
    if (encoded === undefined) throw new Error(`${label} 无法序列化`);
    const roundTripped = JSON.parse(encoded) as T;
    if (!hasSameJsonSemantic(cloned, roundTripped)) throw new Error(`${label} 无法安全往返 JSON`);
    return roundTripped;
}

function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isPlainJsonObject(value)) return value;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) result[key] = canonicalize(value[key]);
    return result;
}

export function hasSameJsonSemantic(left: unknown, right: unknown): boolean {
    try {
        const safeLeft = cloneJsonValue(left, new Set<object>(), "左侧 JSON 数据");
        const safeRight = cloneJsonValue(right, new Set<object>(), "右侧 JSON 数据");
        return JSON.stringify(canonicalize(safeLeft)) === JSON.stringify(canonicalize(safeRight));
    } catch {
        return false;
    }
}

export function isJsonSafe(value: unknown): boolean {
    try {
        cloneJsonSafe(value);
        return true;
    } catch {
        return false;
    }
}
