/**
 * InMemoryDisplayReferenceStore — 通用 DisplayReference 存储的内存实现。
 *
 * - 每 turn 一个新实例，由 createAgenticRagWorkbench 注入到 KbRetrievalRuntimeState
 *   和 ExecutionEngine。
 * - Tool 内部使用此 store 注册 DisplayReference。
 * - 直接暴露 docId/blockId/url 等真实资源 ID，不使用隐藏 identifier 映射层。
 * - UI 通过 store 获取 DisplayReference 用于展示和交互。
 */

import type {
  DisplayReference,
  DisplayReferenceStore,
} from "../contracts/display-reference";

export class InMemoryDisplayReferenceStore implements DisplayReferenceStore {
  private readonly byDocId = new Map<string, DisplayReference>();
  private readonly byBlockKey = new Map<string, DisplayReference>();
  private readonly all: DisplayReference[] = [];

  register(reference: DisplayReference): void {
    if (reference.docId) {
      this.byDocId.set(reference.docId, reference);
    }
    if (reference.docId && reference.blockId) {
      this.byBlockKey.set(`${reference.docId}:${reference.blockId}`, reference);
    }
    this.all.push(reference);
  }

  findByDocId(docId: string): DisplayReference | undefined {
    return this.byDocId.get(docId);
  }

  findByBlockId(docId: string, blockId: string): DisplayReference | undefined {
    return this.byBlockKey.get(`${docId}:${blockId}`);
  }

  getAll(): DisplayReference[] {
    return [...this.all];
  }

  size(): number {
    return this.all.length;
  }

  reset(): void {
    this.byDocId.clear();
    this.byBlockKey.clear();
    this.all.length = 0;
  }
}
