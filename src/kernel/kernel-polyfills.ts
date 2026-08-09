/** Install the minimal globals required by shared JSON business services. */
if (typeof globalThis.structuredClone !== "function") {
  (globalThis as typeof globalThis & { structuredClone<T>(value: T): T }).structuredClone = <T>(value: T): T => (
    JSON.parse(JSON.stringify(value)) as T
  );
}

/** Goja 不保证提供 DOMException；共享 Provider 的 abort 分支会直接引用它。 */
if (typeof globalThis.DOMException !== "function") {
  class KernelDOMException extends Error {
    readonly code = 0;

    constructor(message = "", name = "Error") {
      super(message);
      this.name = name;
    }
  }
  (globalThis as typeof globalThis & { DOMException: typeof DOMException }).DOMException = KernelDOMException as unknown as typeof DOMException;
}

/**
 * Kernel Agent 需要可取消的整轮 timeout，但 Goja 没有浏览器 AbortController。
 * 这里只实现共享 Agent / 工具实际使用的标准子集。
 */
if (typeof globalThis.AbortController !== "function" || typeof globalThis.AbortSignal !== "function") {
  type AbortListener = ((event: Event) => void) | { handleEvent(event: Event): void };

  class KernelAbortSignal {
    aborted = false;
    reason: unknown = undefined;
    onabort: ((this: AbortSignal, ev: Event) => unknown) | null = null;
    private readonly listeners = new Set<AbortListener>();

    addEventListener(type: string, listener: AbortListener | null): void {
      if (type === "abort" && listener) this.listeners.add(listener);
    }

    removeEventListener(type: string, listener: AbortListener | null): void {
      if (type === "abort" && listener) this.listeners.delete(listener);
    }

    throwIfAborted(): void {
      if (!this.aborted) return;
      throw this.reason instanceof Error
        ? this.reason
        : new globalThis.DOMException("The operation was aborted.", "AbortError");
    }

    dispatchAbort(reason?: unknown): void {
      if (this.aborted) return;
      this.aborted = true;
      this.reason = reason ?? new globalThis.DOMException("The operation was aborted.", "AbortError");
      const event = { type: "abort", target: this, currentTarget: this } as unknown as Event;
      this.onabort?.call(this as unknown as AbortSignal, event);
      for (const listener of [...this.listeners]) {
        if (typeof listener === "function") listener(event);
        else listener.handleEvent(event);
      }
      this.listeners.clear();
    }
  }

  class KernelAbortController {
    readonly signal = new KernelAbortSignal() as unknown as AbortSignal;

    abort(reason?: unknown): void {
      (this.signal as unknown as KernelAbortSignal).dispatchAbort(reason);
    }
  }

  const target = globalThis as typeof globalThis & {
    AbortController: typeof AbortController;
    AbortSignal: typeof AbortSignal;
  };
  target.AbortSignal = KernelAbortSignal as unknown as typeof AbortSignal;
  target.AbortController = KernelAbortController as unknown as typeof AbortController;
}

function encodeUtf8(value: string): Uint8Array {
  if (typeof globalThis.TextEncoder === "function") return new globalThis.TextEncoder().encode(value);
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const code = value.codePointAt(index) ?? 0;
    if (code > 0xffff) index += 1;
    if (code <= 0x7f) bytes.push(code);
    else if (code <= 0x7ff) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code <= 0xffff) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return new Uint8Array(bytes);
}

function decodeUtf8(bytes: Uint8Array): string {
  if (typeof globalThis.TextDecoder === "function") return new globalThis.TextDecoder().decode(bytes);
  let out = "";
  for (let index = 0; index < bytes.length;) {
    const first = bytes[index++];
    let code = first;
    if ((first & 0xe0) === 0xc0) code = ((first & 0x1f) << 6) | (bytes[index++] & 0x3f);
    else if ((first & 0xf0) === 0xe0) code = ((first & 0x0f) << 12) | ((bytes[index++] & 0x3f) << 6) | (bytes[index++] & 0x3f);
    else if ((first & 0xf8) === 0xf0) code = ((first & 0x07) << 18) | ((bytes[index++] & 0x3f) << 12) | ((bytes[index++] & 0x3f) << 6) | (bytes[index++] & 0x3f);
    out += String.fromCodePoint(code);
  }
  return out;
}

/** Goja 尚未提供浏览器 Blob；共享业务层只需要构造、text 与 arrayBuffer。 */
if (typeof globalThis.Blob !== "function") {
  class KernelBlob {
    readonly type: string;
    readonly size: number;
    private readonly bytes: Uint8Array;

    constructor(parts: unknown[] = [], options: { type?: string } = {}) {
      const chunks = parts.map((part) => {
        if (typeof part === "string") return encodeUtf8(part);
        if (part instanceof ArrayBuffer) return new Uint8Array(part);
        if (ArrayBuffer.isView(part)) {
          const view = part as ArrayBufferView;
          const copy = new Uint8Array(view.byteLength);
          copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
          return copy;
        }
        return encodeUtf8(String(part ?? ""));
      });
      this.size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      this.bytes = new Uint8Array(this.size);
      let offset = 0;
      for (const chunk of chunks) {
        this.bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      this.type = String(options.type ?? "").toLowerCase();
    }

    async arrayBuffer(): Promise<ArrayBuffer> {
      const copy = new Uint8Array(this.bytes.byteLength);
      copy.set(this.bytes);
      return copy.buffer;
    }

    async text(): Promise<string> {
      return decodeUtf8(this.bytes);
    }
  }

  (globalThis as typeof globalThis & { Blob: typeof Blob }).Blob = KernelBlob as unknown as typeof Blob;
}
