import type { NativeTool } from "./native-tool";

export class NativeToolRegistry {
  private readonly tools = new Map<string, NativeTool>();
  private _providerVisibleAllowList: Set<string> | null = null;

  register(tool: NativeTool): void {
    if (!tool.name) {
      throw new Error("[NativeToolRegistry] Tool name is required.");
    }
    if (this.tools.has(tool.name)) {
      throw new Error(`[NativeToolRegistry] Duplicate tool: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): NativeTool | undefined {
    return this.tools.get(name);
  }

  list(): NativeTool[] {
    return Array.from(this.tools.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  listProviderVisible(): NativeTool[] {
    const visible = this.list().filter((tool) => tool.providerVisible);
    if (this._providerVisibleAllowList) {
      return visible.filter((tool) => this._providerVisibleAllowList!.has(tool.name));
    }
    return visible;
  }

  /**
   * Set an allowList of tool names. When set, listProviderVisible only returns
   * tools whose names are in the allowList (in addition to providerVisible=true).
   * Pass null to clear the filter. Used for strict skill test mode.
   */
  setProviderVisibleAllowList(names: Set<string> | null): void {
    this._providerVisibleAllowList = names;
  }

  /** Get the current allowList (null if no filter). */
  getProviderVisibleAllowList(): Set<string> | null {
    return this._providerVisibleAllowList;
  }
}

