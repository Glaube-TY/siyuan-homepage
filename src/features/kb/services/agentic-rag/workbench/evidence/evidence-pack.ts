/**
 * EvidencePack
 *
 * Planner 与真实思源 KB ID 之间的桥。
 * - Planner 只看到 string 句柄（eva_xxx），不接触 docId / blockId / path。
 * - Harness 内部用 EvidencePack 把句柄解析回真实引用。
 */

export interface EvidenceAnchor {
  docId: string;
  blockId: string;
  snippet: string;
  title?: string;
}

export interface DisplayedHandleMeta {
  handle: string;
  anchor: EvidenceAnchor;
}

const HANDLE_PREFIX = "eva_";
let handleCounter = 0;

export class EvidencePack {
  private readonly handles = new Map<string, EvidenceAnchor>();
  private readonly anchorToHandle = new Map<string, string>();

  /**
   * 注册一个真实 anchor，返回不透明的句柄。
   */
  registerAnchor(anchor: EvidenceAnchor): string {
    if (!anchor.docId || !anchor.blockId) {
      throw new Error(`[EvidencePack] anchor must have docId and blockId.`);
    }
    const key = `${anchor.docId}::${anchor.blockId}`;
    const existing = this.anchorToHandle.get(key);
    if (existing) return existing;
    const handle = `${HANDLE_PREFIX}${toBase36(++handleCounter)}_${shortHash(key)}`;
    this.handles.set(handle, anchor);
    this.anchorToHandle.set(key, handle);
    return handle;
  }

  /**
   * 句柄 → 真实 anchor。
   */
  resolveHandle(handle: string): EvidenceAnchor | undefined {
    return this.handles.get(handle);
  }

  /**
   * 句柄 → 真实 anchor。找不到时抛错。
   * 错误信息**不**回显传入 handle 原文，只描述事实类型。
   */
  mustResolveHandle(handle: string): EvidenceAnchor {
    const anchor = this.resolveHandle(handle);
    if (!anchor) {
      throw new Error(`[EvidencePack] planner output handle is not registered in pack.`);
    }
    return anchor;
  }

  /**
   * 列所有已注册句柄。
   */
  listHandles(): DisplayedHandleMeta[] {
    return Array.from(this.handles.entries()).map(([handle, anchor]) => ({
      handle,
      anchor,
    }));
  }

  /**
   * 当前 pack 里有几个 anchor。
   */
  size(): number {
    return this.handles.size;
  }

  /**
   * 清空。
   */
  reset(): void {
    this.handles.clear();
    this.anchorToHandle.clear();
  }

  /**
   * 校验一组 displayed handles 全部在 pack 中注册。
   * Planner 输出的句柄必须能解析，否则视为不可信输入。
   * 错误信息**不**回显传入 handle 原文，只描述事实类型。
   */
  assertAllHandlesValid(handles: readonly string[]): void {
    for (const h of handles) {
      if (!this.handles.has(h)) {
        throw new Error(
          `[EvidencePack] planner output handle is not registered in pack.`,
        );
      }
    }
  }
}

function toBase36(n: number): string {
  return n.toString(36);
}

function shortHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

const SIYUAN_BLOCK_ID_PATTERN = /^\d{14}-[a-z0-9]{7}$/;
const HEX_32_PATTERN = /^[0-9a-f]{32}$/i;

export function assertSafeDisplayedHandle(handle: string): void {
  // 错误信息一律使用"事实类型"形式，**不**回显传入 handle 原文。
  // 真实句柄的形状（思源 block id / 32 位 hex / 路径 / .sy）由 sanitizePlannerVisibleError
  // 兜底二次清洗；此处自身就不写入 handle 原文，避免任何路径透传到 Planner 可见 summary。
  if (SIYUAN_BLOCK_ID_PATTERN.test(handle)) {
    throw new Error(
      `[assertSafeDisplayedHandle] displayed handle matches internal block id pattern.`,
    );
  }
  if (HEX_32_PATTERN.test(handle)) {
    throw new Error(
      `[assertSafeDisplayedHandle] displayed handle matches internal hex id pattern.`,
    );
  }
  if (handle.includes("/") || handle.includes("\\")) {
    throw new Error(
      `[assertSafeDisplayedHandle] displayed handle contains path separator.`,
    );
  }
  if (handle.startsWith("/")) {
    throw new Error(
      `[assertSafeDisplayedHandle] displayed handle starts with path separator.`,
    );
  }
  if (handle.includes(".sy")) {
    throw new Error(
      `[assertSafeDisplayedHandle] displayed handle contains internal file suffix.`,
    );
  }
}
