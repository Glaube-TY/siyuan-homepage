import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(root, path), "utf8");

async function loadSubsonicFrontendRequest() {
  const result = await build({
    entryPoints: [resolve(root, "src/components/utils/widgetBlock/widget/musicPlayer/subsonic/subsonicFrontendRequest.ts")],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "node24",
    write: false,
    logLevel: "silent",
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}

async function sourceFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await sourceFiles(path));
    else if (/\.(?:ts|svelte|js|cjs|mjs)$/.test(entry.name)) result.push(path);
  }
  return result;
}

async function verifySources() {
  const [api, bing, agentHttp, kernelHttp, kernelHost, kernelRuntime, webSearch, notification,
    subsonicClient, cover, playback, relay, membership, mcp, modelDiscovery, remoteVerifier,
    robotRegistry] = await Promise.all([
    read("src/api.ts"),
    read("src/homepage/banner/bingDailyImage.ts"),
    read("src/features/kb/services/agent-core/providers/agent-http-transport.ts"),
    read("src/kernel/kernel-http-port.ts"),
    read("src/kernel/siyuan-kernel-host.ts"),
    read("src/kernel/kernel-runtime.ts"),
    read("src/features/kb/services/agent-workbench/tools/web-search/impl/siyuan-proxy-request.ts"),
    read("src/features/notification-center/channels/external-http.ts"),
    read("src/components/utils/widgetBlock/widget/musicPlayer/subsonic/subsonicClient.ts"),
    read("src/components/utils/widgetBlock/widget/musicPlayer/subsonic/subsonicCoverService.ts"),
    read("src/components/utils/widgetBlock/widget/musicPlayer/subsonic/subsonicPlayback.ts"),
    read("src/components/utils/widgetBlock/widget/musicPlayer/musicStreamRelay.ts"),
    read("src/services/membershipService.ts"),
    read("src/features/kb/services/agent-workbench/mcp/mcp-client-manager.ts"),
    read("src/features/kb/services/qa/model-list-discovery.ts"),
    read("scripts/verify-remote-kernel-compat.mjs"),
    read("src/features/robot-assistant/agent/build-robot-kernel-tool-registry.ts"),
  ]);

  assert.match(api, /export async function forwardProxyGetText[\s\S]*?forwardProxyChecked\(/);
  assert.match(api, /if \(typeof redirect === "boolean"\)[\s\S]*?data\.redirect = redirect/);
  assert.match(bing, /forwardProxyGetText/);
  assert.doesNotMatch(api, /\/api\/network\/proxy/);

  assert.match(agentHttp, /class KernelAgentHttpTransport[\s\S]*?this\.port\.postJson/);
  assert.match(kernelHttp, /host\.httpPostJson/);
  assert.match(kernelHost, /api\.client\.fetch\("\/api\/network\/forwardProxy"/);
  assert.match(kernelRuntime, /new KernelAgentHttpTransport\(createKernelHttpPort\(host\)\)/);
  assert.match(agentHttp, /class BrowserAgentHttpTransport[\s\S]*?fetch\(options\.url/);
  assert.match(agentHttp, /carriesSensitiveHeaders \|\| carriesSensitiveQuery \? "error" : "follow"/);
  assert.match(agentHttp, /carriesSensitiveQuery = \/\[\?&\].*\(\?:key\|token\|secret\|auth\|credential\|password\|sig/);
  assert.match(agentHttp, /credentials: "omit"/);
  assert.match(kernelHost, /responseEncoding: "text",\s*redirect: false/);

  assert.match(webSearch, /forwardProxyChecked\(/);
  assert.match(webSearch, /headers:\s*options\.headers|headers\s*,/);
  assert.match(webSearch, /opts\.headers[\s\S]*?"text",\s*false/);
  assert.match(webSearch, /proxyResult\.status >= 300/);
  assert.match(notification, /forwardProxy\(url, "POST", payload, headerArray,[\s\S]*?undefined, "text", false\)/);
  assert.match(notification, /Object\.entries\(\{ "Content-Type": "application\/json", \.\.\.headers \}\)/);
  assert.match(notification, /status >= 300/);

  assert.match(subsonicClient, /endpointKind === "local"[\s\S]*?fetchSubsonicFrontend/);
  assert.match(subsonicClient, /forwardProxyChecked\([\s\S]*?"text", false/);
  assert.match(cover, /ctx\.kind === "local"[\s\S]*?fetchSubsonicFrontend/);
  assert.match(cover, /"application\/octet-stream"[\s\S]*?"base64", false/);
  assert.match(cover, /base64ToObjectUrl\(response\.body/);
  assert.match(await read("src/components/utils/widgetBlock/widget/musicPlayer/subsonic/subsonicFrontendRequest.ts"), /redirect: "error"/);
  assert.match(playback, /resolveSubsonicPlaybackSource/);
  assert.match(relay, /needsDesktopMusicStreamRelay[\s\S]*electronAvailable/);

  assert.match(membership, /fetch\(url,\s*\{\s*\.\.\.init,\s*signal:\s*controller\.signal/);
  assert.doesNotMatch(membership, /forwardProxy/);
  assert.match(mcp, /new EventSource\(/);
  assert.match(mcp, /fetch\(this\.url/);
  assert.match(modelDiscovery, /fetch\(/);

  assert.doesNotMatch(robotRegistry, /createHomepageMusicActionTools|homepage-music\.tool/);
  assert.match(remoteVerifier, /appFiles\.some\(\(file\) => file\.startsWith\("src\/features\/robot-assistant\/providers\/electron\/"\)\)/);
  assert.match(remoteVerifier, /Robot Electron provider loading is not gated/);

  const files = await sourceFiles(resolve(root, "src"));
  for (const file of files) {
    assert.doesNotMatch(await readFile(file, "utf8"), /127\.0\.0\.1:6806/,
      `hard-coded SiYuan Kernel address found in ${file}`);
  }
}

async function verifySubsonicFrontendRequest() {
  const transport = await loadSubsonicFrontendRequest();
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response("{\"subsonic-response\":{\"status\":\"ok\"}}", {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  };
  try {
    const text = await transport.fetchSubsonicFrontend("http://192.168.1.20:4533/rest/ping", 1000, "text");
    assert.equal(text.status, 200);
    assert.equal(text.bodyEncoding, "text");
    assert.match(text.body, /subsonic-response/);
    assert.equal(text.contentType, "application/json; charset=utf-8");
    assert.equal(requests[0].options.method, "GET");
    assert.equal(requests[0].options.credentials, "omit");
    assert.equal(requests[0].options.referrerPolicy, "no-referrer");
    assert.equal(requests[0].options.redirect, "error");
    assert.equal(requests[0].options.headers, undefined);

    globalThis.fetch = async (url, options) => {
      requests.push({ url, options });
      return new Response(new Uint8Array([0, 255, 128, 1]), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    };
    const cover = await transport.fetchSubsonicFrontend("http://192.168.1.20:4533/rest/getCoverArt", 1000, "base64");
    assert.equal(cover.body, Buffer.from([0, 255, 128, 1]).toString("base64"));
    assert.equal(cover.bodyEncoding, "base64");
    assert.equal(cover.contentType, "image/jpeg");

    const aborted = new AbortController();
    aborted.abort();
    await assert.rejects(
      () => transport.fetchSubsonicFrontend("http://192.168.1.20:4533/rest/ping", 1000, "text", aborted.signal),
      (error) => error.category === "request_aborted",
    );

    globalThis.fetch = (_url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
    await assert.rejects(
      () => transport.fetchSubsonicFrontend("http://192.168.1.20:4533/rest/ping", 1, "text"),
      /timed out/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

await verifySources();
await verifySubsonicFrontendRequest();
console.log("external HTTP transport verification passed: Kernel proxy, frontend/NAS split, headers, binary response, membership, Electron gate");
