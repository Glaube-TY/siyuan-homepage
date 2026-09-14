import assert from "node:assert/strict";
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, streamText } from "ai";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function loadBundle(entry) {
  const result = await build({
    entryPoints: [resolve(root, entry)],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node24",
    write: false,
    logLevel: "silent",
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}

async function loadFunctionalBundle() {
  const result = await build({
    stdin: {
      sourcefile: "verify-openai-compatible-text-call-fixture.ts",
      resolveDir: root,
      contents: `
        export { generatePlainText } from "./src/services/ai/plain-text-generation.ts";
        export { setKbSettingsPlugin } from "./src/features/kb/services/settings/kb-settings-service.ts";
        export { generateHomepageStatusText } from "./src/homepage/header/status-ai-generator.ts";
        export { generateDailyQuoteAi } from "./src/components/utils/widgetBlock/widget/dailyQuote/dailyQuoteAi.ts";
        export { runSelectionAiAction } from "./src/features/kb/services/selection-ai/selection-ai-runner.ts";
        export { grantHomepageEntitlement } from "./src/features/entitlement/homepage-entitlement.ts";
        export { createProviderAdapterForKbModel } from "./src/features/kb/services/agent-core/providers/agent-provider-factory.ts";
      `,
    },
    bundle: true,
    format: "esm",
    platform: "browser",
    mainFields: ["browser", "module", "main"],
    target: "node24",
    tsconfig: resolve(root, "tsconfig.json"),
    write: false,
    logLevel: "silent",
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}

function makeProvider(type, compatibility) {
  return {
    id: `fixture-${type}`,
    name: "Fixture Provider",
    type,
    baseUrl: "http://fixture.local/v1",
    apiKey: "fixture-key",
    enabled: true,
    ...(compatibility ? { providerNativeAgentCompatibility: compatibility } : {}),
    models: [],
  };
}

function makeModel(id = "fixture-model", compatibility) {
  return {
    id,
    name: "Fixture Model",
    temperature: 0.3,
    ...(compatibility ? { providerNativeAgentCompatibility: compatibility } : {}),
  };
}

function createFixtureFetch(requests) {
  return async (_input, init = {}) => {
    const body = JSON.parse(String(init.body ?? "{}"));
    requests.push(body);

    if (body.stream === true) {
      const stream = [
        `data: ${JSON.stringify({ choices: [{ delta: { role: "assistant", content: "OK" }, finish_reason: null }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      return new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }

    return new Response(JSON.stringify({
      choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

function createFixtureAgentTransport(requests) {
  return {
    async post(options) {
      requests.push({
        ...JSON.parse(options.body),
        transportStream: options.stream,
      });
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => null },
        async json() {
          return {
            choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          };
        },
        async text() {
          return JSON.stringify({ choices: [] });
        },
        body: null,
      };
    },
  };
}

function assertNoThinking(body, label) {
  assert.equal(body.thinking, undefined, `${label} must not send thinking`);
  assert.equal(body.enable_thinking, undefined, `${label} must not send enable_thinking`);
}

async function callFixture({
  requestConfig,
  providerProfile,
  type,
  modelId = "fixture-model",
  thinkingMode = "off",
  maxOutputTokens = 256,
  temperature = 0.3,
  modelCompatibility,
  providerCompatibility,
  stream = false,
}) {
  const provider = makeProvider(type, providerCompatibility);
  const modelConfig = makeModel(modelId, modelCompatibility);
  const profile = providerProfile.resolveProviderProfile(type, {
    providerNativeAgentCompatibility: provider.providerNativeAgentCompatibility,
    modelNativeAgentCompatibility: modelConfig.providerNativeAgentCompatibility,
  });
  const namespace = requestConfig.resolveOpenAICompatibleAiSdkProviderName(provider);
  const effectiveMaxOutputTokens = thinkingMode === "on"
    ? Math.max(4096, maxOutputTokens)
    : maxOutputTokens;
  const plan = requestConfig.buildOpenAICompatibleTextRequestPlan({
    aiSdkProviderName: namespace,
    thinkingMode,
    compatibility: profile.providerNativeAgentCompatibility,
    maxOutputTokens: effectiveMaxOutputTokens,
  });
  const temperatureForRequest = providerProfile.resolveModelTemperatureForRequest({
    providerType: type,
    modelId,
    modelConfigTemperature: modelConfig.temperature,
    optionsTemperature: temperature,
    providerNativeAgentCompatibility: profile.providerNativeAgentCompatibility,
    fallbackTemperature: 0.3,
  });
  const requests = [];
  const compatible = createOpenAICompatible({
    name: namespace,
    baseURL: provider.baseUrl,
    apiKey: provider.apiKey,
    includeUsage: true,
    fetch: createFixtureFetch(requests),
  });
  const options = {
    model: compatible(modelId),
    prompt: "Return OK.",
    ...(plan.maxOutputTokens !== undefined ? { maxOutputTokens: plan.maxOutputTokens } : {}),
    ...(temperatureForRequest !== undefined ? { temperature: temperatureForRequest } : {}),
    ...(plan.providerOptions ? { providerOptions: plan.providerOptions } : {}),
  };

  if (stream) {
    const result = streamText(options);
    await result.text;
  } else {
    const result = await generateText(options);
    assert.equal(result.text.trim(), "OK", `${type} generateText fixture response`);
  }

  assert.equal(requests.length, 1, `${type} fixture must issue one request`);
  return { body: requests[0], plan, profile, namespace };
}

function makeFunctionalSettings() {
  return {
    selectedChatProviderId: "fixture-provider",
    selectedChatModelId: "fixture-model",
    agentThinkingEnabled: false,
    chatProviders: [{
      id: "fixture-provider",
      name: "Fixture Provider",
      type: "deepseek-api",
      baseUrl: "http://fixture.local/v1",
      apiKey: "fixture-key",
      enabled: true,
      models: [{
        id: "fixture-model",
        name: "Fixture Model",
        temperature: 0.3,
        enabled: true,
        default: true,
      }],
    }],
  };
}

async function verifyFunctionalCallers(functional) {
  const settings = makeFunctionalSettings();
  const data = new Map([["kb-settings", settings]]);
  const plugin = {
    ADVANCED: false,
    async loadData(key) {
      return data.get(key) ?? null;
    },
    async saveData(key, value) {
      data.set(key, value);
    },
    async waitForHomepageEntitlementReady() {},
  };
  functional.setKbSettingsPlugin(plugin);
  functional.grantHomepageEntitlement(plugin, { userId: "fixture", isLifetime: true });

  const requests = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = createFixtureFetch(requests);
  try {
    const status = await functional.generateHomepageStatusText({
      plugin,
      config: {
        prompt: "简洁",
        maxChars: 40,
        providerId: "fixture-provider",
        modelId: "fixture-model",
        thinkingEnabled: false,
        statKeys: [],
      },
      facts: { focus: "1" },
    });
    assert.equal(status.ok, true, "homepage status fixture must succeed");
    assert.deepEqual(requests.at(-1).thinking, { type: "disabled" }, "homepage status must disable thinking");

    const statusThinkingOn = await functional.generateHomepageStatusText({
      plugin,
      config: {
        prompt: "简洁",
        maxChars: 40,
        providerId: "fixture-provider",
        modelId: "fixture-model",
        thinkingEnabled: true,
        statKeys: [],
      },
      facts: { focus: "1" },
    });
    assert.equal(statusThinkingOn.ok, true, "homepage status thinking-on fixture must succeed");
    assert.deepEqual(requests.at(-1).thinking, { type: "enabled" }, "homepage status thinking-on must enable thinking");
    assert.equal(requests.at(-1).max_tokens, 4096, "homepage status thinking-on must keep reasoning budget");

    const quote = await functional.generateDailyQuoteAi({
      plugin,
      instanceId: "fixture-instance",
      prompt: "温和",
      useMemory: false,
      now: new Date("2026-09-14T00:00:00Z"),
    });
    assert.equal(quote.ok, true, "daily quote fixture must succeed");
    assert.deepEqual(requests.at(-1).thinking, { type: "disabled" }, "daily quote must disable thinking");
    assert.equal(requests.at(-1).max_tokens, 192, "daily quote must keep its output budget");

    const selection = await functional.runSelectionAiAction({
      action: "polish",
      context: {
        selectedText: "hello",
        originalSelectedText: "hello",
        truncated: false,
        source: "protyle-toolbar",
        createdAt: Date.now(),
      },
    }, {
      enabled: true,
      confirmBeforeReplace: false,
      skills: [{
        id: "fixture-skill",
        name: "Fixture polish",
        promptTemplate: "润色：{{text}}",
        enabled: true,
        builtin: true,
        order: 0,
        builtInAction: "polish",
        includeDocumentContext: false,
        documentContextMaxChars: 1000,
        placement: "toolbar",
        modelProviderId: "fixture-provider",
        modelId: "fixture-model",
        stream: true,
        maxOutputChars: 100,
        temperature: 0.3,
      }],
    });
    assert.equal(selection.text, "OK", "selection AI fixture must succeed");
    assert.equal(requests.at(-1).stream, true, "selection AI fixture must use stream path");
    assert.deepEqual(requests.at(-1).thinking, { type: "disabled" }, "selection AI must disable thinking");

    const selectionNonStream = await functional.runSelectionAiAction({
      action: "polish",
      context: {
        selectedText: "hello",
        originalSelectedText: "hello",
        truncated: false,
        source: "protyle-toolbar",
        createdAt: Date.now(),
      },
    }, {
      enabled: true,
      confirmBeforeReplace: false,
      skills: [{
        id: "fixture-skill-non-stream",
        name: "Fixture polish non-stream",
        promptTemplate: "润色：{{text}}",
        enabled: true,
        builtin: true,
        order: 0,
        builtInAction: "polish",
        includeDocumentContext: false,
        documentContextMaxChars: 1000,
        placement: "toolbar",
        modelProviderId: "fixture-provider",
        modelId: "fixture-model",
        stream: false,
        maxOutputChars: 100,
        temperature: 0.3,
      }],
    });
    assert.equal(selectionNonStream.text, "OK", "non-stream selection AI fixture must succeed");
    assert.notEqual(requests.at(-1).stream, true, "selection AI fixture must use non-stream path");
    assert.deepEqual(requests.at(-1).thinking, { type: "disabled" }, "non-stream selection AI must disable thinking");
  } finally {
    globalThis.fetch = previousFetch;
  }
}

async function verifyAgentRequestPlan(functional) {
  const requests = [];
  const adapter = functional.createProviderAdapterForKbModel({
    provider: makeProvider("mimo-api"),
    model: { ...makeModel("mimo-agent-model"), maxTokens: 444 },
    thinkingMode: "off",
    agentThinkingEnabled: false,
    overrides: {
      stream: false,
      transport: createFixtureAgentTransport(requests),
    },
  });
  const events = [];
  for await (const event of adapter.streamChat({
    messages: [{ role: "user", content: "Return OK." }],
    tools: [],
  })) {
    events.push(event);
  }

  assert.equal(events.some((event) => event.type === "text_delta" && event.delta === "OK"), true, "Agent fixture must return text");
  assert.equal(requests.length, 1, "Agent fixture must issue one request");
  assert.deepEqual(requests[0].thinking, { type: "disabled" }, "Agent path must share thinking body strategy");
  assert.equal(requests[0].max_completion_tokens, 444, "Agent path must use max_completion_tokens");
  assert.equal(requests[0].max_tokens, undefined, "Agent path must not duplicate max_tokens");
  assert.equal(requests[0].transportStream, false, "Agent fixture must use non-stream transport");
}

async function main() {
  const requestConfig = await loadBundle("src/features/kb/services/qa/openai-compatible-request-config.ts");
  const providerProfile = await loadBundle("src/features/kb/services/qa/provider-profile.ts");

  const deepseekOff = await callFixture({ requestConfig, providerProfile, type: "deepseek-api", maxOutputTokens: 512 });
  assert.equal(deepseekOff.namespace, "deepseekApi");
  assert.deepEqual(deepseekOff.body.thinking, { type: "disabled" }, "DeepSeek off thinking body");
  assert.equal(deepseekOff.body.max_tokens, 512, "DeepSeek off output budget");
  assert.equal(deepseekOff.body.enable_thinking, undefined);

  const deepseekOn = await callFixture({ requestConfig, providerProfile, type: "deepseek-api", thinkingMode: "on", maxOutputTokens: 512 });
  assert.deepEqual(deepseekOn.body.thinking, { type: "enabled" }, "DeepSeek on thinking body");
  assert.equal(deepseekOn.body.max_tokens, 4096, "DeepSeek on minimum reasoning budget");
  assert.equal(deepseekOn.body.enable_thinking, undefined);

  for (const thinkingMode of ["off", "on"]) {
    const mimo = await callFixture({ requestConfig, providerProfile, type: "mimo-api", thinkingMode, maxOutputTokens: 333 });
    assert.equal(mimo.namespace, "mimoApi");
    assert.deepEqual(mimo.body.thinking, { type: thinkingMode === "off" ? "disabled" : "enabled" }, `MiMo ${thinkingMode} thinking body`);
    assert.equal(mimo.body.max_completion_tokens, thinkingMode === "on" ? 4096 : 333, `MiMo ${thinkingMode} completion budget`);
    assert.equal(mimo.body.max_tokens, undefined, `MiMo ${thinkingMode} must not send max_tokens`);
  }

  const kimi = await callFixture({ requestConfig, providerProfile, type: "kimi-api", modelId: "kimi-k2.5", temperature: 0.9 });
  assert.equal(kimi.namespace, "kimiApi");
  assertNoThinking(kimi.body, "Kimi K2");
  assert.equal(kimi.body.temperature, undefined, "Kimi K2 must omit temperature");

  for (const type of ["opencode-go", "opencode-zen"]) {
    const opencode = await callFixture({ requestConfig, providerProfile, type, modelId: "deepseek-v4-flash" });
    assertNoThinking(opencode.body, `${type} deepseek model ID`);
  }

  const custom = await callFixture({ requestConfig, providerProfile, type: "openai-compatible", temperature: 0.3 });
  assert.equal(custom.namespace, "openaiCompatible");
  assertNoThinking(custom.body, "custom default");
  assert.equal(custom.body.max_tokens, 256);
  assert.equal(custom.body.temperature, 0.3);

  const customOverride = await callFixture({
    requestConfig,
    providerProfile,
    type: "openai-compatible",
    maxOutputTokens: 444,
    providerCompatibility: {
      thinkingOffStrategy: "enable_thinking_false",
      tokenParamStrategy: "max_completion_tokens",
    },
  });
  assert.equal(customOverride.body.enable_thinking, false);
  assert.equal(customOverride.body.max_completion_tokens, 444);
  assert.equal(customOverride.body.max_tokens, undefined);

  const nonStream = await callFixture({ requestConfig, providerProfile, type: "deepseek-api", maxOutputTokens: 222 });
  const stream = await callFixture({ requestConfig, providerProfile, type: "deepseek-api", maxOutputTokens: 222, stream: true });
  for (const key of ["thinking", "enable_thinking", "max_tokens", "max_completion_tokens", "temperature"]) {
    assert.deepEqual(stream.body[key], nonStream.body[key], `stream parity for ${key}`);
  }

  const functional = await loadFunctionalBundle();
  await verifyFunctionalCallers(functional);
  await verifyAgentRequestPlan(functional);
  console.log("openai-compatible text call verification passed");
}

try {
  await main();
} catch (error) {
  console.error(`openai-compatible text call verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
