import type { NativeTool } from "./native-tool";

export class NativeToolRegistry {
  private readonly tools = new Map<string, NativeTool>();

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
    return this.list().filter((tool) => tool.providerVisible);
  }
}
