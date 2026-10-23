import {
  getPluginKernelPort,
  KERNEL_STATE_RUNNING,
  RobotKernelClient,
} from "@/features/robot-assistant/runtime/robot-kernel-client";

import type { HomepageMcpWriteRequest } from "@/kernel/mcp-server/homepage-mcp-write-access";
export type { HomepageMcpWriteRequest } from "@/kernel/mcp-server/homepage-mcp-write-access";

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
  writeEnabled: boolean;
  writeActive: boolean;
  pendingWriteCount: number;
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

export async function setHomepageMcpWriteEnabled(plugin: unknown, enabled: boolean): Promise<HomepageMcpServerSnapshot> {
  if (typeof enabled !== "boolean") throw new Error(HOMEPAGE_MCP_RPC_ERROR_MESSAGE);
  return callSnapshot(clientFor(plugin), "homepageMcp.setWriteEnabled", { enabled });
}

export async function decideHomepageMcpWrite(plugin: unknown, confirmationId: string, approved: boolean): Promise<HomepageMcpServerSnapshot> {
  if (!/^[a-f0-9]{64}$/.test(confirmationId) || typeof approved !== "boolean") throw new Error(HOMEPAGE_MCP_RPC_ERROR_MESSAGE);
  return callSnapshot(clientFor(plugin), "homepageMcp.decideWrite", { confirmationId, approved });
}

export async function getHomepageMcpPendingWrites(plugin: unknown): Promise<HomepageMcpWriteRequest[]> {
  const response = await clientFor(plugin).call<unknown>("homepageMcp.getPendingWrites");
  if (!isPlainRecord(response) || response.ok !== true || !Array.isArray(response.requests) || response.requests.length > 20) {
    throw new Error(HOMEPAGE_MCP_RPC_ERROR_MESSAGE);
  }
  return response.requests.map((request: unknown) => {
    if (!isPlainRecord(request) ||
      typeof request.confirmationId !== "string" || !/^[a-f0-9]{64}$/.test(request.confirmationId) ||
      request.toolName !== "homepage_components" || request.action !== "homepage_favorites.add" ||
      typeof request.docId !== "string" || !/^[0-9]{14}-[a-z0-9]{7}$/.test(request.docId) ||
      !isPreviewText(request.docTitle) ||
      (request.groupMode !== "preserve" && request.groupMode !== "ungrouped" && request.groupMode !== "specified") ||
      (request.groupName !== null && !isPreviewText(request.groupName)) ||
      (request.groupMode === "specified" && request.groupName === null) ||
      (request.groupMode === "ungrouped" && request.groupName !== null) ||
      !isNonNegativeInteger(request.requestedAt) || !isNonNegativeInteger(request.expiresAt) ||
      request.expiresAt - request.requestedAt !== 120_000 ||
      (request.status !== "pending" && request.status !== "approved")) throw new Error(HOMEPAGE_MCP_RPC_ERROR_MESSAGE);
    return {
      confirmationId: request.confirmationId, toolName: request.toolName, action: request.action,
      docId: request.docId, docTitle: request.docTitle, groupMode: request.groupMode,
      groupName: typeof request.groupName === "string" ? request.groupName : null,
      requestedAt: request.requestedAt, expiresAt: request.expiresAt, status: request.status,
    };
  });
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
    typeof value.writeEnabled !== "boolean" ||
    typeof value.writeActive !== "boolean" ||
    !isNonNegativeInteger(value.pendingWriteCount) || value.pendingWriteCount > 20 ||
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
    writeEnabled: value.writeEnabled,
    writeActive: value.writeActive,
    pendingWriteCount: value.pendingWriteCount,
    entitlementAvailable: value.entitlementAvailable,
    status: value.status as HomepageMcpServerStatus,
    capabilityCount: value.capabilityCount,
    expectedCapabilityCount: value.expectedCapabilityCount,
    lastError: typeof value.lastError === "string" ? value.lastError : null,
  };
}

function isPreviewText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 1024 &&
    Array.from(value).every((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    });
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
