import {
  getPluginKernelPort,
  KERNEL_STATE_RUNNING,
  RobotKernelClient,
} from "@/features/robot-assistant/runtime/robot-kernel-client";

export const HOMEPAGE_MCP_UNSUPPORTED_MESSAGE = "当前环境不支持对外 MCP 服务";
export const HOMEPAGE_MCP_RPC_ERROR_MESSAGE = "对外 MCP 服务 RPC 不可用";

export type HomepageMcpServerStatus =
  | "disabled"
  | "enabled"
  | "locked"
  | "error"
  | "initializing";

export interface HomepageMcpServerSnapshot {
  schemaVersion: 1;
  enabled: boolean;
  active: boolean;
  entitlementAvailable: boolean;
  status: HomepageMcpServerStatus;
  capabilityCount: number;
  expectedCapabilityCount: number;
  lastError: string | null;
}

function clientFor(plugin: unknown): RobotKernelClient {
  const kernel = getPluginKernelPort(plugin);
  if (!kernel || kernel.state?.code !== KERNEL_STATE_RUNNING) {
    throw new Error(HOMEPAGE_MCP_UNSUPPORTED_MESSAGE);
  }
  return new RobotKernelClient(kernel);
}

export async function getHomepageMcpServerState(
  plugin: unknown,
): Promise<HomepageMcpServerSnapshot> {
  return callSnapshot(clientFor(plugin), "homepageMcp.getState");
}

export async function setHomepageMcpServerEnabled(
  plugin: unknown,
  enabled: boolean,
): Promise<HomepageMcpServerSnapshot> {
  if (typeof enabled !== "boolean") throw new Error(HOMEPAGE_MCP_RPC_ERROR_MESSAGE);
  return callSnapshot(clientFor(plugin), "homepageMcp.setEnabled", { enabled });
}

export async function reconcileHomepageMcpServer(
  plugin: unknown,
): Promise<HomepageMcpServerSnapshot> {
  return callSnapshot(clientFor(plugin), "homepageMcp.reconcile");
}

export function isHomepageMcpUnsupportedError(error: unknown): boolean {
  return error instanceof Error && error.message === HOMEPAGE_MCP_UNSUPPORTED_MESSAGE;
}

async function callSnapshot(
  client: RobotKernelClient,
  method: string,
  payload?: unknown,
): Promise<HomepageMcpServerSnapshot> {
  try {
    const response = await client.call<unknown>(method, payload);
    if (!isPlainRecord(response) || response.ok !== true) {
      throw new Error(HOMEPAGE_MCP_RPC_ERROR_MESSAGE);
    }
    return parseSnapshot(response.snapshot);
  } catch (error) {
    if (isHomepageMcpUnsupportedError(error)) throw error;
    throw new Error(HOMEPAGE_MCP_RPC_ERROR_MESSAGE);
  }
}

function parseSnapshot(value: unknown): HomepageMcpServerSnapshot {
  if (!isPlainRecord(value)) throw new Error(HOMEPAGE_MCP_RPC_ERROR_MESSAGE);
  const statuses: HomepageMcpServerStatus[] = [
    "disabled",
    "enabled",
    "locked",
    "error",
    "initializing",
  ];
  if (
    value.schemaVersion !== 1 ||
    typeof value.enabled !== "boolean" ||
    typeof value.active !== "boolean" ||
    typeof value.entitlementAvailable !== "boolean" ||
    typeof value.status !== "string" ||
    !statuses.includes(value.status as HomepageMcpServerStatus) ||
    !isNonNegativeInteger(value.capabilityCount) ||
    !isNonNegativeInteger(value.expectedCapabilityCount) ||
    (value.lastError !== null && typeof value.lastError !== "string")
  ) {
    throw new Error(HOMEPAGE_MCP_RPC_ERROR_MESSAGE);
  }
  return {
    schemaVersion: 1,
    enabled: value.enabled,
    active: value.active,
    entitlementAvailable: value.entitlementAvailable,
    status: value.status as HomepageMcpServerStatus,
    capabilityCount: value.capabilityCount,
    expectedCapabilityCount: value.expectedCapabilityCount,
    lastError: typeof value.lastError === "string" ? value.lastError : null,
  };
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
