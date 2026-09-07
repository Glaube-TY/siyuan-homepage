import { build } from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

async function loadBundle(entry) {
  const result = await build({
    entryPoints: [resolve(root, entry)],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "es2022",
    write: false,
    logLevel: "silent",
  });
  const code = result.outputFiles?.[0]?.text;
  if (!code) throw new Error(`无法构建 verifier 入口：${entry}`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)}`);
}

class FakeStorage {
  constructor() {
    this.values = new Map();
    this.writes = [];
  }

  async get(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  async getStrict(key) {
    return this.get(key);
  }

  async set(key, value) {
    this.writes.push({ key, value });
    this.values.set(key, value);
  }
}

class FakeAgent {
  constructor() {
    this.failAt = -1;
    this.records = new Map();
    this.configs = new Map();
    this.handlers = new Map();
    this.registeredNames = [];
    this.unregisterCalls = [];
    this.unregisterFailures = new Set();
  }

  async registerCapability(name, config, handler) {
    if (this.registeredNames.length === this.failAt) {
      throw new Error(`fixture registration failed at ${name}`);
    }
    const record = { id: `fixture-${name}`, name, ...config };
    this.registeredNames.push(name);
    this.records.set(name, record);
    this.configs.set(name, config);
    this.handlers.set(name, handler);
    return record;
  }

  async unregisterCapability(name) {
    this.unregisterCalls.push(name);
    if (this.unregisterFailures.has(name)) throw new Error(`fixture unregister failed at ${name}`);
    this.records.delete(name);
    this.configs.delete(name);
    this.handlers.delete(name);
  }
}

class FakeRegistry {
  constructor(tools) {
    this.tools = new Map(tools.map((tool) => [tool.name, tool]));
  }

  get(name) {
    return this.tools.get(name);
  }
}

function createFixtureTool(name, actions, writeAction) {
  const help = Object.fromEntries(actions.map((action) => [
    action,
    {
      readOnly: action !== writeAction,
      argsSchema: {
        type: "object",
        additionalProperties: false,
        properties: { limit: { type: "integer", minimum: 1, maximum: 20 } },
      },
    },
  ]));

  return {
    name,
    title: `${name} fixture`,
    description: "fixture",
    parameters: { type: "object", additionalProperties: false },
    readOnly: false,
    providerVisible: true,
    source: "builtin",
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },
    aggregateActionHelp: help,
    isReadOnlyCall(input) {
      const action = input && typeof input.action === "string" ? input.action : "";
      return help[action]?.readOnly === true;
    },
    preflightValidate(input) {
      const action = input && typeof input.action === "string" ? input.action : "";
      return { ok: help[action]?.readOnly === true };
    },
    async execute() {
      executeCount += 1;
      return {
        ok: true,
        content: "fixture",
        summary: "fixture",
        data: {
          safe: "kept",
          apiKey: "hidden",
          nested: { path: "hidden", senderId: "hidden", value: "kept" },
        },
      };
    },
  };
}

let executeCount = 0;

async function main() {
  const registration = await loadBundle("src/kernel/mcp-server/register-homepage-mcp-capabilities.ts");
  const controllerModule = await loadBundle("src/kernel/mcp-server/homepage-mcp-runtime-controller.ts");
  const {
    buildHomepageMcpCapabilityPolicies,
    EXPECTED_HOMEPAGE_MCP_CAPABILITY_COUNT,
    HOMEPAGE_MCP_CAPABILITY_NAMES,
    HOMEPAGE_MCP_CAPABILITY_POLICY,
  } = registration;
  const { HomepageMcpRuntimeController, HOMEPAGE_MCP_SERVER_SETTINGS_STORAGE_KEY } = controllerModule;

  const writeActions = {
    siyuan_kb: "write_action",
    diary_task: "manage_task",
    siyuan_database: "update_cell",
    homepage_components: "quick_note.write",
  };
  const fixtureTools = Object.entries(HOMEPAGE_MCP_CAPABILITY_POLICY).map(([name, actions]) =>
    createFixtureTool(name, [...actions, writeActions[name]], writeActions[name]));
  const registry = new FakeRegistry(fixtureTools);
  const policies = buildHomepageMcpCapabilityPolicies(registry);

  assertEqual(
    policies.map((policy) => policy.name),
    HOMEPAGE_MCP_CAPABILITY_NAMES,
    "能力名称必须与固定策略一致",
  );
  assertEqual(policies.length, EXPECTED_HOMEPAGE_MCP_CAPABILITY_COUNT, "能力数量必须为四个");
  const diaryPolicy = policies.find((policy) => policy.name === "diary_task");
  assert(diaryPolicy, "diary_task 策略缺失");
  assertEqual(diaryPolicy.actions, ["overview", "query_tasks", "query_records", "find_docs"], "diary_task action 白名单错误");
  const diaryBranches = diaryPolicy.inputSchema.oneOf;
  assert(Array.isArray(diaryBranches), "聚合 Schema 必须使用 oneOf");
  assertEqual(
    diaryBranches.map((branch) => branch.properties.action.const),
    diaryPolicy.actions,
    "聚合 Schema action const 错误",
  );
  assert(diaryBranches.every((branch) => branch.additionalProperties === false), "每个 action 分支必须拒绝额外字段");
  assert(!diaryBranches.some((branch) => branch.properties.action.const === writeActions.diary_task), "写 action 不得进入 Schema");
  const homepagePolicy = policies.find((policy) => policy.name === "homepage_components");
  assert(homepagePolicy, "homepage_components 策略缺失");
  assert(!homepagePolicy.actions.some((action) => action === writeActions.homepage_components), "主页写 action 不得进入白名单");

  const fixture = ({ member = true, raw = undefined, failAt = -1 } = {}) => {
    const storage = new FakeStorage();
    if (raw !== undefined) storage.values.set(HOMEPAGE_MCP_SERVER_SETTINGS_STORAGE_KEY, raw);
    const agent = new FakeAgent();
    agent.failAt = failAt;
    let entitlement = member;
    const timers = [];
    const controller = new HomepageMcpRuntimeController({
      agent,
      registry,
      storage,
      isEntitlementAvailable: async () => entitlement,
      timeout(fn, ms) {
        const timer = { fn, ms, cancelled: false };
        timers.push(timer);
        return () => { timer.cancelled = true; };
      },
    });
    return {
      controller,
      storage,
      agent,
      timers,
      setEntitlement(value) { entitlement = value; },
    };
  };

  const missing = fixture();
  await missing.controller.initialize();
  let snapshot = missing.controller.getSnapshot();
  assert(snapshot.status === "disabled" && snapshot.enabled === false && snapshot.active === false, "缺失设置必须安全关闭");
  assert(!missing.storage.values.has(HOMEPAGE_MCP_SERVER_SETTINGS_STORAGE_KEY), "缺失设置不得被初始化写回");
  assert(missing.agent.records.size === 0, "关闭状态不得注册能力");

  const enabled = fixture();
  await enabled.controller.initialize();
  snapshot = await enabled.controller.setEnabled(true);
  assert(snapshot.status === "enabled" && snapshot.enabled && snapshot.active, "会员用户开启后必须激活");
  assertEqual(snapshot.capabilityCount, 4, "开启后必须注册四项能力");
  assertEqual(enabled.storage.values.get(HOMEPAGE_MCP_SERVER_SETTINGS_STORAGE_KEY), '{"schemaVersion":1,"enabled":true}', "开启设置必须严格持久化");
  assert(enabled.agent.records.size === 4, "开启后 Agent 必须有四项注册记录");
  for (const config of enabled.agent.configs.values()) {
    assert(config.effects?.localRead === true, "能力必须声明 localRead");
    assert(Object.values(config.actionEffects ?? {}).every((effects) => effects.localRead === true), "action 必须声明 localRead");
  }

  const locked = fixture({ member: false });
  await locked.controller.initialize();
  snapshot = await locked.controller.setEnabled(true);
  assert(snapshot.status === "locked" && snapshot.enabled === false && snapshot.active === false, "非会员开启不得注册或保存 enabled=true");
  assert(!locked.storage.values.has(HOMEPAGE_MCP_SERVER_SETTINGS_STORAGE_KEY), "非会员开启不得写入设置");

  const partial = fixture({ raw: '{"schemaVersion":1,"enabled":true}', failAt: 2 });
  await partial.controller.initialize();
  snapshot = partial.controller.getSnapshot();
  assert(snapshot.status === "error" && snapshot.enabled === true && snapshot.active === false, "部分注册失败必须进入错误状态并保留偏好");
  assertEqual(partial.agent.unregisterCalls, [HOMEPAGE_MCP_CAPABILITY_NAMES[1], HOMEPAGE_MCP_CAPABILITY_NAMES[0]], "部分注册失败必须逆序回滚");
  assert(partial.agent.records.size === 0, "部分注册回滚不得留下已注册能力");

  const corrupt = fixture({ raw: "{" });
  await corrupt.controller.initialize();
  snapshot = corrupt.controller.getSnapshot();
  assert(snapshot.status === "error" && snapshot.capabilityCount === 0, "损坏设置必须进入错误状态");
  assert(corrupt.storage.values.get(HOMEPAGE_MCP_SERVER_SETTINGS_STORAGE_KEY) === "{", "损坏设置不得被覆盖");

  const unregisterStart = enabled.agent.unregisterCalls.length;
  snapshot = await enabled.controller.setEnabled(false);
  assert(snapshot.status === "disabled" && snapshot.enabled === false && snapshot.active === false, "关闭后必须注销并进入 disabled");
  assertEqual(enabled.agent.unregisterCalls.slice(unregisterStart), [...HOMEPAGE_MCP_CAPABILITY_NAMES].reverse(), "关闭必须逆序注销");
  assertEqual(enabled.storage.values.get(HOMEPAGE_MCP_SERVER_SETTINGS_STORAGE_KEY), '{"schemaVersion":1,"enabled":false}', "关闭设置必须严格持久化");

  const lifecycle = fixture({ member: true, raw: '{"schemaVersion":1,"enabled":true}' });
  await lifecycle.controller.initialize();
  lifecycle.setEntitlement(false);
  snapshot = await lifecycle.controller.reconcile();
  assert(snapshot.status === "locked" && snapshot.enabled === true && snapshot.active === false, "会员失效时必须锁定但保留开启偏好");
  assert(lifecycle.storage.values.get(HOMEPAGE_MCP_SERVER_SETTINGS_STORAGE_KEY) === '{"schemaVersion":1,"enabled":true}', "会员失效不得覆盖开启偏好");
  lifecycle.setEntitlement(true);
  snapshot = await lifecycle.controller.reconcile();
  assert(snapshot.status === "enabled" && snapshot.active === true && snapshot.capabilityCount === 4, "会员恢复后必须重新注册能力");

  const diaryHandler = lifecycle.agent.handlers.get("diary_task");
  assert(typeof diaryHandler === "function", "diary_task handler 缺失");
  lifecycle.setEntitlement(false);
  const deniedCount = executeCount;
  let result = await diaryHandler({ action: "overview", args: {} });
  assert(result.error?.code === "mcp_entitlement_required" && executeCount === deniedCount, "handler 必须二次检查会员状态");
  lifecycle.setEntitlement(true);
  result = await diaryHandler({ action: "manage_task", args: {} });
  assert(result.error?.code === "mcp_write_not_allowed" && executeCount === deniedCount, "写 action 必须在 handler 再次拒绝");
  const homepageHandler = lifecycle.agent.handlers.get("homepage_components");
  assert(typeof homepageHandler === "function", "homepage_components handler 缺失");
  result = await homepageHandler({ action: "quick_note.write", args: {} });
  assert(result.error?.code === "mcp_write_not_allowed" && executeCount === deniedCount, "主页写 action 必须拒绝");
  result = await diaryHandler({ action: "overview", args: {} });
  assert(result.ok === true && result.data?.safe === "kept", "合法只读 action 必须执行");
  assert(!Object.hasOwn(result.data, "apiKey"), "外部输出不得返回 apiKey");
  assert(!Object.hasOwn(result.data?.nested, "path"), "外部输出不得返回路径");
  assert(!Object.hasOwn(result.data?.nested, "senderId"), "外部输出不得返回 senderId");

  const isolated = fixture({ member: true });
  const existingClientSettings = '{"schemaVersion":1,"enabled":true,"servers":[]}';
  isolated.storage.values.set("mcp_settings", existingClientSettings);
  await isolated.controller.initialize();
  await isolated.controller.setEnabled(true);
  assert(isolated.storage.values.get("mcp_settings") === existingClientSettings, "主页 MCP 设置不得修改既有 MCP Client 设置");

  console.log("homepage MCP verifier: ok");
}

try {
  await main();
} catch (error) {
  console.error(`homepage MCP verifier: failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
