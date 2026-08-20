import type { NativeTool } from "./native-tool";
import {
  DEFAULT_MAX_CONTEXT_TOKENS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  estimateValueTokens,
  resolveRuntimeObservationBudget,
} from "../../../types/context-usage";
import { nativeToolToProviderBudgetDefinition } from "./tool-schema-converter";

export const CORE_PROVIDER_TOOL_NAMES = ["agent_tool_help"] as const;

export interface ProviderToolsetState {
  /** The tool names actually sent in the last committed provider request. */
  activeToolNames: string[];
  /** Oldest to newest request order; the newest request has highest priority. */
  requestedToolNames: string[];
  /** Requested names whose activation has already been committed to a provider step. */
  fulfilledToolNames?: string[];
}

export interface ProviderToolsetSelection {
  tools: NativeTool[];
  activeProviderToolNames: Set<string>;
  registeredToolCount: number;
  budgetTokens: number;
  toolsetReduced: boolean;
  activationBudgetExceeded: boolean;
  unavailableToolNames: string[];
}

function sanitizeToolNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((name): name is string => typeof name === "string")
    .map((name) => name.trim())
    .filter(Boolean))];
}

export function sanitizeProviderToolsetState(value: unknown): ProviderToolsetState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const activeToolNames = sanitizeToolNames(raw.activeToolNames);
  const requestedToolNames = sanitizeToolNames(raw.requestedToolNames);
  const requested = new Set(requestedToolNames);
  const fulfilledToolNames = sanitizeToolNames(raw.fulfilledToolNames)
    .filter((name) => requested.has(name));
  if (activeToolNames.length === 0 && requestedToolNames.length === 0 && fulfilledToolNames.length === 0) {
    return undefined;
  }
  return { activeToolNames, requestedToolNames, fulfilledToolNames };
}

function hasExactToolName(question: string, toolName: string): boolean {
  let start = question.indexOf(toolName);
  while (start >= 0) {
    const before = start > 0 ? question[start - 1] : "";
    const after = question[start + toolName.length] ?? "";
    if (!/[A-Za-z0-9_]/.test(before) && !/[A-Za-z0-9_]/.test(after)) return true;
    start = question.indexOf(toolName, start + toolName.length);
  }
  return false;
}

function providerToolDefinitionTokens(tool: NativeTool): number {
  return estimateValueTokens(nativeToolToProviderBudgetDefinition(tool));
}

function resolveProviderToolsetBudget(
  contextWindowTokens: number | undefined,
  maxOutputTokens: number | undefined,
  providerMessageTokens: number,
  fixedPromptTokens: number,
  conversationTokens: number,
  currentUserTokens: number,
  runtimeObservationTokens: number | undefined,
): number {
  const contextWindow = Number.isFinite(contextWindowTokens) && (contextWindowTokens ?? 0) > 0
    ? Math.floor(contextWindowTokens!)
    : DEFAULT_MAX_CONTEXT_TOKENS;
  const maxOutput = Number.isFinite(maxOutputTokens) && (maxOutputTokens ?? 0) > 0
    ? Math.floor(maxOutputTokens!)
    : DEFAULT_MAX_OUTPUT_TOKENS;
  const safetyMargin = Math.max(256, Math.ceil(contextWindow * 0.05));
  const observationReserve = Math.max(0, runtimeObservationTokens ?? resolveRuntimeObservationBudget(contextWindow));
  const effectiveInput = Math.max(
    1,
    contextWindow - maxOutput - observationReserve - safetyMargin,
  );
  const reservedPromptTokens = providerMessageTokens > 0
    ? providerMessageTokens
    : Math.max(0, fixedPromptTokens)
      + Math.max(0, conversationTokens)
      + Math.max(0, currentUserTokens);
  const effectiveToolInput = Math.max(
    1,
    effectiveInput - reservedPromptTokens,
  );
  const ratio = contextWindow < 64_000 ? 0.15 : contextWindow < 128_000 ? 0.2 : 0.25;
  return Math.max(256, Math.floor(Math.max(256, effectiveToolInput) * ratio));
}

/**
 * Pick the provider-visible subset for one turn. The registry remains complete;
 * only schemas sent to the provider are deferred until requested by name/help.
 */
export function selectProviderVisibleTools(params: {
  tools: readonly NativeTool[];
  question: string;
  requestedToolNames?: ReadonlySet<string>;
  activeToolNames?: ReadonlySet<string>;
  /** Explicit Help requests that have not yet been committed to a provider step. */
  pendingActivationToolNames?: ReadonlySet<string>;
  profileSeedToolNames?: ReadonlySet<string>;
  runtimeRequiredToolNames?: ReadonlySet<string>;
  activationOrder?: ReadonlyMap<string, number>;
  coreToolNames?: readonly string[];
  /** Keep only the irreducible core for a prompt that is already over budget. */
  coreOnly?: boolean;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  /** Exact provider message tokens, excluding provider tool definitions. */
  providerMessageTokens?: number;
  fixedPromptTokens?: number;
  conversationTokens?: number;
  currentUserTokens?: number;
  runtimeObservationTokens?: number;
}): ProviderToolsetSelection {
  const visible = params.tools
    .filter((tool) => tool.providerVisible)
    .sort((a, b) => a.name.localeCompare(b.name));
  const visibleNames = new Set(visible.map((tool) => tool.name));
  const coreToolNames = params.coreToolNames ?? CORE_PROVIDER_TOOL_NAMES;
  const active = new Set(params.activeToolNames ?? []);
  const pending = new Set(params.pendingActivationToolNames ?? params.requestedToolNames ?? []);
  const runtimeRequired = new Set(params.runtimeRequiredToolNames ?? []);
  const explicit = new Set<string>();
  for (const tool of visible) if (hasExactToolName(params.question, tool.name)) explicit.add(tool.name);

  const budgetTokens = resolveProviderToolsetBudget(
    params.contextWindowTokens,
    params.maxOutputTokens,
    params.providerMessageTokens ?? 0,
    params.fixedPromptTokens ?? 0,
    params.conversationTokens ?? 0,
    params.currentUserTokens ?? 0,
    params.runtimeObservationTokens,
  );
  const chosen: NativeTool[] = [];
  const chosenNames = new Set<string>();
  const unavailableToolNames = new Set<string>();
  const activationCandidates = new Set([...pending, ...explicit, ...runtimeRequired]);
  let usedTokens = 0;
  let activationBudgetExceeded = false;
  const add = (tool: NativeTool, required: boolean): boolean => {
    if (chosenNames.has(tool.name)) return true;
    const cost = providerToolDefinitionTokens(tool);
    if (!required && usedTokens + cost > budgetTokens) {
      if (activationCandidates.has(tool.name)) unavailableToolNames.add(tool.name);
      return false;
    }
    chosenNames.add(tool.name);
    chosen.push(tool);
    usedTokens += cost;
    if (required && usedTokens > budgetTokens && activationCandidates.has(tool.name)) {
      activationBudgetExceeded = true;
      unavailableToolNames.add(tool.name);
    }
    return true;
  };

  const order = params.activationOrder;
  const byPriority = (names: ReadonlySet<string>): NativeTool[] => visible
    .filter((tool) => names.has(tool.name))
    .sort((a, b) => (order?.get(b.name) ?? 0) - (order?.get(a.name) ?? 0) || a.name.localeCompare(b.name));

  for (const coreToolName of coreToolNames) {
    const tool = visible.find((candidate) => candidate.name === coreToolName);
    if (tool) add(tool, true);
  }
  if (!params.coreOnly) {
    for (const tool of byPriority(runtimeRequired)) add(tool, true);
    const pendingTools = byPriority(pending).filter((tool) => !chosenNames.has(tool.name));
    const explicitTools = byPriority(explicit).filter((tool) => !chosenNames.has(tool.name));
    const activeTools = byPriority(active).filter((tool) => !chosenNames.has(tool.name));
    let firstActivationCandidate = true;
    for (const tool of [...pendingTools, ...explicitTools]) {
      const added = add(tool, false);
      if (!added && firstActivationCandidate) activationBudgetExceeded = true;
      firstActivationCandidate = false;
    }
    for (const tool of activeTools) add(tool, false);
    for (const tool of byPriority(params.profileSeedToolNames ?? new Set())) add(tool, false);
  }

  for (const name of params.coreOnly ? [] : activationCandidates) {
    if (visibleNames.has(name) && !chosenNames.has(name)) unavailableToolNames.add(name);
  }

  return {
    tools: chosen,
    activeProviderToolNames: new Set(chosenNames),
    registeredToolCount: visible.length,
    budgetTokens,
    toolsetReduced: chosen.length < visible.length,
    activationBudgetExceeded,
    unavailableToolNames: [...unavailableToolNames].sort(),
  };
}

export interface ProviderToolActivationResult {
  requested: boolean;
  /** Activation is only a request for the next provider step. */
  status: "requested" | "unavailable";
  reason?: "tool_activation_budget_exceeded" | "tool_activation_not_available";
}

export class ProviderToolsetController {
  private readonly coreToolNames: readonly string[];
  private readonly profileSeedToolNames: ReadonlySet<string>;
  private readonly requestedToolNames = new Set<string>();
  private readonly fulfilledToolNames = new Set<string>();
  private readonly activationOrder = new Map<string, number>();
  private activationSequence = 0;
  private activeToolNames = new Set<string>();

  constructor(options: {
    coreToolNames?: readonly string[];
    profileSeedToolNames?: readonly string[];
    restoredState?: ProviderToolsetState;
  } = {}) {
    this.coreToolNames = [...(options.coreToolNames ?? CORE_PROVIDER_TOOL_NAMES)];
    this.profileSeedToolNames = new Set(options.profileSeedToolNames ?? []);
    this.restoreState(options.restoredState);
  }

  restoreState(value: unknown): void {
    const state = sanitizeProviderToolsetState(value);
    this.activeToolNames = new Set(state?.activeToolNames ?? []);
    this.requestedToolNames.clear();
    this.fulfilledToolNames.clear();
    this.activationOrder.clear();
    this.activationSequence = 0;
    for (const toolName of state?.requestedToolNames ?? []) {
      this.requestedToolNames.add(toolName);
      this.activationOrder.set(toolName, ++this.activationSequence);
    }
    for (const toolName of state?.fulfilledToolNames ?? []) {
      this.fulfilledToolNames.add(toolName);
    }
  }

  getActiveProviderToolNames(): ReadonlySet<string> {
    return new Set(this.activeToolNames);
  }

  snapshotState(): ProviderToolsetState {
    const requestedToolNames = [...this.requestedToolNames]
      .sort((a, b) => (this.activationOrder.get(a) ?? 0) - (this.activationOrder.get(b) ?? 0));
    return {
      activeToolNames: [...this.activeToolNames].sort(),
      requestedToolNames,
      fulfilledToolNames: [...this.fulfilledToolNames].sort(),
    };
  }

  requestActivation(toolName: string): ProviderToolActivationResult {
    const normalized = toolName.trim();
    if (!normalized) {
      return {
        requested: false,
        status: "unavailable",
        reason: "tool_activation_not_available",
      };
    }
    this.requestedToolNames.add(normalized);
    this.fulfilledToolNames.delete(normalized);
    this.activationOrder.set(normalized, ++this.activationSequence);
    return { requested: true, status: "requested" };
  }

  /** Commit only the tool names from the final provider payload, never a provisional resolve. */
  commitProviderStep(tools: readonly NativeTool[] | ReadonlySet<string>): void {
    const names = Array.isArray(tools)
      ? tools.map((tool) => tool.name)
      : [...tools];
    this.activeToolNames = new Set(names);
    for (const toolName of names) {
      if (this.requestedToolNames.has(toolName)) this.fulfilledToolNames.add(toolName);
    }
  }

  resolve(params: {
    tools: readonly NativeTool[];
    question: string;
    contextWindowTokens?: number;
    maxOutputTokens?: number;
    providerMessageTokens?: number;
    fixedPromptTokens?: number;
    conversationTokens?: number;
    currentUserTokens?: number;
    runtimeObservationTokens?: number;
    runtimeRequiredToolNames?: ReadonlySet<string>;
    coreOnly?: boolean;
  }): ProviderToolsetSelection {
    const selection = selectProviderVisibleTools({
      ...params,
      coreToolNames: this.coreToolNames,
      requestedToolNames: this.requestedToolNames,
      activeToolNames: this.activeToolNames,
      pendingActivationToolNames: new Set([...this.requestedToolNames]
        .filter((toolName) => !this.fulfilledToolNames.has(toolName))),
      profileSeedToolNames: this.profileSeedToolNames,
      activationOrder: this.activationOrder,
    });
    return { ...selection, activeProviderToolNames: new Set(selection.activeProviderToolNames) };
  }
}

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

export function resolveNativeToolReadOnly(
  registry: NativeToolRegistry,
  toolName: string,
  args?: Record<string, unknown>,
): boolean | undefined {
  const tool = registry.get(toolName);
  if (!tool) return undefined;
  return tool.isReadOnlyCall?.(args ?? {}) ?? tool.readOnly;
}
