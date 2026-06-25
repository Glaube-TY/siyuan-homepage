/**
 * Runtime tool context — builds context instructions for the Agent
 * about available local runtime tools.
 */

import type { RuntimeToolsSettings } from "./runtime-tool-types";
import { formatRuntimeToolStatusForAgent } from "./runtime-tool-resolver";
import { getNotebrainRuntimeEnvironment } from "../workspace/notebrain-runtime-env";

export interface RuntimeToolContextCapabilities {
  /** Whether the sandbox environment is enabled (master switch on + PC/Electron). */
  sandboxEnabled: boolean;
  /** Whether local command execution is enabled (sandbox on + commandExecutionEnabled). */
  localCommandToolEnabled: boolean;
  /** Whether MCP client is enabled. */
  mcpClientEnabled: boolean;
}

/**
 * Build a context instruction block about available runtime tools
 * and the current runtime environment.
 * Returns empty string if exposeToAgent is false and we're on PC.
 * On non-PC, always returns an environment note even if exposeToAgent is off,
 * so the AI knows not to use local capabilities.
 *
 * On PC/Electron:
 * - Returns empty string if neither sandbox nor MCP is enabled.
 * - If only MCP is enabled, tools are described as MCP stdio helpers only.
 * - If only sandbox is enabled, tools are described as run_notebrain_command reference.
 * - If both are enabled, tools serve both purposes.
 */
export function buildRuntimeToolContextInstructions(
  settings: RuntimeToolsSettings,
  capabilities?: RuntimeToolContextCapabilities,
): string {
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

  const localCmd = capabilities?.localCommandToolEnabled === true;
  const mcp = capabilities?.mcpClientEnabled === true;

  if (!localCmd && !mcp) {
    return "";
  }

  const status = formatRuntimeToolStatusForAgent(settings);
  if (!status) return "";

  const lines = ["# Runtime Environment", "运行在 PC/Electron 桌面端。"];

  if (localCmd && mcp) {
    lines.push("", "# Local Runtime Tools", "The following local tools are available. They can be used as environment reference for run_notebrain_command and MCP stdio command resolution.", status);
  } else if (localCmd) {
    lines.push("", "# Local Runtime Tools", "The following local tools are available on this machine. These commands can be used as environment reference for run_notebrain_command.", status);
  } else if (mcp) {
    lines.push("", "# Local Runtime Tools", "The following local tools are available on this machine. They are used only for MCP stdio command resolution. The Agent cannot execute local commands directly unless run_notebrain_command is in the tool list.", status);
  }

  return lines.join("\n");
}
