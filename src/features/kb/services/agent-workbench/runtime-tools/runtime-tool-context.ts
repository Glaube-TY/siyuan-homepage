/**
 * Runtime tool context — builds context instructions for the Agent
 * about available local runtime tools.
 */

import type { RuntimeToolsSettings } from "./runtime-tool-types";
import { formatRuntimeToolStatusForAgent } from "./runtime-tool-resolver";
import { getNotebrainRuntimeEnvironment } from "../workspace/notebrain-runtime-env";

/**
 * Build a context instruction block about available runtime tools
 * and the current runtime environment.
 * Returns empty string if exposeToAgent is false and we're on PC.
 * On non-PC, always returns an environment note even if exposeToAgent is off,
 * so the AI knows not to use local capabilities.
 */
export function buildRuntimeToolContextInstructions(settings: RuntimeToolsSettings): string {
  const env = getNotebrainRuntimeEnvironment();

  if (!env.isPcElectron) {
    return [
      "# Runtime Environment",
      env.aiHint,
    ].join("\n");
  }

  if (!settings.enabled || !settings.exposeToAgent) {
    return "";
  }

  const status = formatRuntimeToolStatusForAgent(settings);
  if (!status) return "";

  return [
    "# Runtime Environment",
    "运行在 PC/Electron 桌面端，支持本地命令和 MCP stdio。",
    "",
    "# Local Runtime Tools",
    "The following local tools are available on this machine. Do NOT use tools marked as NOT AVAILABLE.",
    status,
  ].join("\n");
}
