import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile, stat } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const forbiddenKernelGlobals = new Set(["window", "document", "HTMLElement", "localStorage", "navigator", "location"]);
const nodeBuiltins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));

function assertText(condition, message) {
  assert.ok(condition, message);
}

function parseSource(filePath, source) {
  const kind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : filePath.endsWith(".jsx") ? ts.ScriptKind.JSX :
    filePath.endsWith(".js") || filePath.endsWith(".mjs") || filePath.endsWith(".cjs") ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, kind);
}

function getModuleSpecifiers(sourceFile) {
  const specifiers = [];
  const add = (node) => {
    if (node && ts.isStringLiteralLike(node)) specifiers.push(node.text);
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      if (!node.importClause?.isTypeOnly) add(node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node)) {
      if (!node.isTypeOnly) add(node.moduleSpecifier);
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node.arguments[0]);
      else if (ts.isIdentifier(node.expression) && node.expression.text === "require") add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

async function resolveProjectImport(importer, specifier) {
  let base;
  if (specifier.startsWith("@/")) base = path.join(root, "src", specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(importer), specifier);
  else return null;

  const extension = path.extname(base);
  const candidates = extension
    ? [base]
    : [".ts", ".tsx", ".js", ".mjs", ".cjs"].map((suffix) => `${base}${suffix}`)
      .concat(["index.ts", "index.tsx", "index.js", "index.mjs"].map((name) => path.join(base, name)));
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile() && /\.(?:[cm]?js|tsx?)$/.test(candidate)) return candidate;
    } catch {
      // Try the next standard source extension.
    }
  }
  return null;
}

async function sourceGraph(entry) {
  const pending = [path.join(root, entry)];
  const files = new Map();
  while (pending.length) {
    const filePath = pending.pop();
    if (files.has(filePath)) continue;
    const source = await readFile(filePath, "utf8");
    const sourceFile = parseSource(filePath, source);
    files.set(filePath, { source, sourceFile });
    for (const specifier of getModuleSpecifiers(sourceFile)) {
      const resolved = await resolveProjectImport(filePath, specifier);
      if (resolved) pending.push(resolved);
    }
  }
  return files;
}

function isDeclarationOrPropertyName(node) {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
    return !(ts.isIdentifier(parent.expression) && parent.expression.text === "globalThis"
      && forbiddenKernelGlobals.has(node.text));
  }
  if ((ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent) || ts.isPropertySignature(parent)
      || ts.isMethodDeclaration(parent) || ts.isMethodSignature(parent) || ts.isGetAccessor(parent)
      || ts.isSetAccessor(parent)) && parent.name === node) return true;
  if ((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isFunctionDeclaration(parent)
      || ts.isClassDeclaration(parent) || ts.isTypeParameterDeclaration(parent) || ts.isInterfaceDeclaration(parent)
      || ts.isTypeAliasDeclaration(parent) || ts.isImportClause(parent) || ts.isImportSpecifier(parent)
      || ts.isNamespaceImport(parent) || ts.isExportSpecifier(parent)) && parent.name === node) return true;
  return false;
}

function findKernelDomReferences(filePath, source) {
  const sourceFile = typeof source === "string" ? parseSource(filePath, source) : source;
  const program = ts.createProgram([filePath], {
    allowJs: filePath.endsWith(".js"),
    noResolve: true,
    noLib: true,
    checkJs: false,
  });
  const checker = program.getTypeChecker();
  const findings = [];
  const visit = (node) => {
    const parent = node.parent;
    const globalThisProperty = ts.isIdentifier(node)
      && ts.isPropertyAccessExpression(parent)
      && parent.name === node
      && ts.isIdentifier(parent.expression)
      && parent.expression.text === "globalThis"
      && forbiddenKernelGlobals.has(node.text);
    if (ts.isIdentifier(node) && forbiddenKernelGlobals.has(node.text)
        && (globalThisProperty || (!isDeclarationOrPropertyName(node) && !checker.getSymbolAtLocation(node)))) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      findings.push(`${path.relative(root, filePath)}:${line + 1} ${node.text}`);
    } else if (ts.isStringLiteralLike(node) && ts.isElementAccessExpression(node.parent)
        && node.parent.argumentExpression === node && ts.isIdentifier(node.parent.expression)
        && node.parent.expression.text === "globalThis" && forbiddenKernelGlobals.has(node.text)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      findings.push(`${path.relative(root, filePath)}:${line + 1} globalThis[${node.text}]`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

function testIdentityModule(source, frontend, search, systemId, clientId, storage = new Map()) {
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
  };
  const system = { id: systemId, name: "test", os: "linux", osPlatform: "linux", kernelVersion: "3.8.4" };
  const require = (specifier) => {
    if (specifier.includes("siyuan-runtime-port")) {
      return { getSiyuanRuntimePort: () => ({ getFrontend: () => frontend }) };
    }
    if (specifier.includes("runtime-id")) return { createRuntimeUuid: () => clientId };
    if (specifier.endsWith("/api") || specifier === "@/api") return { getSiyuanSystemConfig: async () => system };
    throw new Error(`Unexpected Device View test import: ${specifier}`);
  };
  const context = vm.createContext({
    module,
    exports: module.exports,
    require,
    localStorage,
    window: { location: { search } },
    URLSearchParams,
    console,
  });
  vm.runInContext(js, context, { filename: "deviceProfile.js" });
  return module.exports.ensureDeviceIdentityReady().then((info) => ({ info, storage }));
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function main() {
  const plugin = JSON.parse(await read("plugin.json"));
  assert.equal(plugin.minAppVersion, "3.8.0", "minAppVersion must remain 3.8.0");
  assert.deepEqual(plugin.kernels, ["windows", "linux", "darwin", "docker"]);
  assert.deepEqual(plugin.backends, ["windows", "linux", "ios", "android", "harmony", "docker", "darwin"]);
  assert.deepEqual(plugin.frontends, ["desktop", "mobile", "browser-desktop", "browser-mobile", "desktop-window"]);

  const kernel = await sourceGraph("src/kernel.ts");
  for (const { sourceFile } of kernel.values()) {
    for (const specifier of getModuleSpecifiers(sourceFile)) {
      assert.ok(!nodeBuiltins.has(specifier) && specifier !== "siyuan",
        `Kernel runtime source imports a Node/Frontend SDK module: ${specifier}`);
    }
  }
  const kernelOwnedSources = [...kernel].filter(([filePath]) => {
    const relative = path.relative(root, filePath).replaceAll("\\", "/");
    return relative === "src/kernel.ts" || relative.startsWith("src/kernel/");
  });
  const kernelSourceDom = kernelOwnedSources.flatMap(([filePath, { sourceFile }]) => findKernelDomReferences(filePath, sourceFile));
  assert.deepEqual(kernelSourceDom, [], `Kernel-owned source contains DOM globals: ${kernelSourceDom.join(", ")}`);
  const kernelArtifacts = [];
  let scannedKernelArtifacts = 0;
  for (const relativePath of ["dist/kernel.js", "build/kernel/kernel.js"]) {
    try {
      const source = await read(relativePath);
      scannedKernelArtifacts += 1;
      kernelArtifacts.push(...findKernelDomReferences(path.join(root, relativePath), source));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  assert.deepEqual(kernelArtifacts, [], `Emitted Kernel bundle contains DOM globals: ${kernelArtifacts.join(", ")}`);

  const app = await sourceGraph("src/index.ts");
  const appFiles = [...app.keys()].map((filePath) => path.relative(root, filePath).replaceAll("\\", "/"));
  assert.ok(!appFiles.some((file) => file.startsWith("src/features/robot-assistant/providers/electron/")),
    "Electron Robot provider was statically reached from the frontend entry");
  for (const { sourceFile } of app.values()) {
    for (const specifier of getModuleSpecifiers(sourceFile)) {
      assert.ok(!nodeBuiltins.has(specifier) && specifier !== "electron" && !specifier.startsWith("electron/"),
        `Browser frontend statically imports a Node/Electron builtin: ${specifier}`);
    }
  }

  const [api, runtimePort, index, kernelHost, kernelEntry, kernelLifecycle, storageAdapter, deviceSource,
    devicePaths, mcpController, electronRuntime, electronBuild, vite, browserTransport, kernelHttp,
    membership, licenseStatus, redemption, musicRelay, sharedSettings, deviceViewStorage, mcpRegistration] = await Promise.all([
    read("src/api.ts"), read("src/runtime/siyuan-runtime-port.ts"), read("src/index.ts"),
    read("src/kernel/siyuan-kernel-host.ts"), read("src/kernel/kernel-entry.ts"), read("src/kernel.ts"),
    read("src/features/kb/services/agent-workbench/storage/notebrain-plugin-storage.ts"),
    read("src/homepage/utils/deviceProfile.ts"), read("src/homepage/deviceView/deviceViewPaths.ts"),
    read("src/kernel/mcp-server/homepage-mcp-runtime-controller.ts"),
    read("src/features/robot-assistant/runtime/robot-client-runtime.ts"),
    read("scripts/build-robot-electron-providers.js"), read("vite.config.ts"),
    read("src/features/kb/services/agent-core/providers/agent-http-transport.ts"),
    read("src/kernel/kernel-http-port.ts"), read("src/services/membershipService.ts"),
    read("src/services/licenseStatusService.ts"), read("src/services/redemptionService.ts"),
    read("src/components/utils/widgetBlock/widget/musicPlayer/musicStreamRelay.ts"),
    read("src/homepage/sharedSettings/homepageSharedSettings.ts"),
    read("src/homepage/deviceView/deviceViewStorage.ts"),
    read("src/kernel/mcp-server/register-homepage-mcp-capabilities.ts"),
  ]);

  assertText(!/https?:\/\/(?:127\.0\.0\.1|localhost):6806/i.test(index + api),
    "Frontend API entry contains a hard-coded local Kernel endpoint");
  assertText(api.includes("getSiyuanRuntimePort().post(url, data)"), "SiYuan API wrapper bypasses the runtime port");
  assertText(runtimePort.includes("setSiyuanRuntimePort") && index.includes("setSiyuanRuntimePort")
    && index.includes("fetchPost") && index.includes("fetchSyncPost")
    && index.includes("post: (path, payload) => fetchSyncPost(path, payload)"),
  "Frontend API port is not initialized through the official SiYuan SDK");
  assertText(api.includes('fetch("/api/notebook/lsNotebooks"'),
    "Expected relative Notebook API fallback changed; it must remain same-origin (including Remote Kernel origin)");

  assertText(storageAdapter.includes("plugin.saveData(key, data)") && storageAdapter.includes("plugin.loadData(key)")
    && storageAdapter.includes("plugin.removeData(key)"), "Plugin data adapter no longer uses SiYuan Plugin Storage");
  assertText(kernelHost.includes("api.storage")
    && kernelHost.includes("agent?: HomepageMcpAgent | null")
    && kernelHost.includes("kernel.ISiyuan") && kernelHost.includes("api.client.fetch"),
  "Kernel host lost official storage/agent/client capabilities");
  assertText(devicePaths.includes("/data/storage/petal/") && sharedSettings.includes("getPluginStorageRoot")
    && sharedSettings.includes("getFileOrNullChecked") && sharedSettings.includes("writeJson")
    && deviceViewStorage.includes("getFileOrNullChecked") && deviceViewStorage.includes("putFileChecked"),
  "Homepage shared settings or Device View no longer use Kernel plugin storage");

  const identityStore = new Map();
  const oldRemoteSharedId = `desktop-${stableHash("remote-kernel-system-id")}`;
  identityStore.set("syhomepage-device-id-desktop", oldRemoteSharedId);
  const localDesktop = await testIdentityModule(deviceSource, "desktop", "", "local-system-id", "unused-local");
  assert.equal(localDesktop.info.physicalDeviceId, `desktop-${stableHash("local-system-id")}`,
    "Local Desktop identity changed");
  const remoteA = await testIdentityModule(deviceSource, "desktop", "?remote=1", "remote-kernel-system-id", "front-a", identityStore);
  const remoteB = await testIdentityModule(deviceSource, "desktop", "?remote=1", "remote-kernel-system-id", "front-b");
  assert.equal(remoteA.info.physicalDeviceId, "desktop-front-a");
  assert.equal(remoteB.info.physicalDeviceId, "desktop-front-b");
  assert.notEqual(remoteA.info.physicalDeviceId, remoteB.info.physicalDeviceId,
    "Different Desktop frontends connected to one Kernel must have separate Device View scopes");
  assert.equal(identityStore.get("syhomepage-device-id-desktop"), oldRemoteSharedId,
    "Remote identity must not overwrite the existing local Desktop identity");
  const remoteRestart = await testIdentityModule(deviceSource, "desktop-window", "?remote=1", "another-kernel-id", "unused-window", remoteA.storage);
  assert.equal(remoteRestart.info.physicalDeviceId, remoteA.info.physicalDeviceId,
    "Remote Desktop identity must persist across windows/restarts and Kernel changes");
  const browserDesktop = await testIdentityModule(deviceSource, "browser-desktop", "", "docker-kernel-id", "browser-a");
  const browserMobile = await testIdentityModule(deviceSource, "browser-mobile", "", "docker-kernel-id", "browser-mobile-a");
  const nativeMobile = await testIdentityModule(deviceSource, "mobile", "", "mobile-kernel-id", "unused-mobile");
  assert.ok(browserDesktop.info.physicalDeviceId.startsWith("browser-"));
  assert.ok(browserMobile.info.physicalDeviceId.startsWith("browser-mobile-"));
  assert.equal(nativeMobile.info.physicalDeviceId, `mobile-${stableHash("mobile-kernel-id")}`);
  assertText(devicePaths.includes('return "mobile-shared"') && devicePaths.includes("return physicalDeviceId"),
    "Device View scope no longer preserves mobile-shared and per-physical-desktop separation");

  assertText(index.includes("typeof (window as unknown as { require?: unknown }).require === \"function\""),
    "Desktop Electron capability detection is missing");
  assertText(electronRuntime.includes("!this.deps.isElectron()") && electronRuntime.includes("loadElectronProvider"),
    "Robot Electron provider loading is not gated by the frontend Electron capability");
  assertText(electronBuild.includes('platform: "node"') && electronBuild.includes('format: "cjs"')
    && electronBuild.includes('"providers", "electron"') && vite.includes("build/robot-electron/feishu-provider.cjs"),
  "Robot Electron providers are no longer built/copied as separate runtime bundles");

  assertText(kernelHost.includes("/api/network/forwardProxy") && kernelHttp.includes("host.httpPostJson"),
    "Kernel outbound HTTP no longer routes through the current Kernel host");
  assertText(browserTransport.includes("fetch(options.url"), "Browser AI transport is no longer frontend-direct");
  assertText(membership.includes("fetch(url") && licenseStatus.includes("fetchWithTimeout")
    && redemption.includes("fetchWithTimeout"), "Membership/license/redemption direct transport changed unexpectedly");
  assertText(musicRelay.includes("new URL(streamUrl)") && musicRelay.includes("electronAvailable")
    && musicRelay.includes("http://127.0.0.1:${this.port}"), "Music NAS stream / Electron loopback relay semantics changed");

  assertText(kernelEntry.includes("agent: host.agent") && kernelEntry.includes("homepageMcpServer.initialize"),
    "Homepage MCP capability controller is not initialized with the Kernel Agent capability");
  assertText(kernelLifecycle.includes("api.plugin.lifecycle.onload") && kernelLifecycle.includes("api.plugin.lifecycle.onunload")
    && mcpController.includes("registerHomepageMcpCapabilities")
    && mcpRegistration.includes("agent.registerCapability") && mcpRegistration.includes("agent.unregisterCapability"),
  "Homepage MCP capability lifecycle is not Kernel-plugin-owned");
  assertText(index.includes("disposeRobotClientRuntime") && !index.includes("disposeRobotKernel"),
    "Frontend unload must not dispose the Kernel-owned Robot/MCP runtime");

  console.log(`remote Kernel compatibility verifier: PASS (kernel source graph: ${kernel.size} files; Kernel-owned files: ${kernelOwnedSources.length}; frontend TS graph: ${app.size} files; emitted Kernel bundles scanned: ${scannedKernelArtifacts})`);
  console.log("matrix: Desktop/local, browser-desktop/Docker, Desktop/remote Docker, browser-mobile/remote, mobile/local: static checks passed");
  console.log("transport: Kernel forwardProxy; frontend browser fetch; Electron-only local provider; membership direct fetch; user-configured NAS direct stream");
  console.log("scope: plugin data and shared settings stay in Kernel workspace; remote Desktop Device View IDs stay frontend-local");
  console.log("runtime note: this verifier does not launch SiYuan, Docker, mobile apps, or a remote Kernel");
}

try {
  await main();
} catch (error) {
  console.error(`remote Kernel compatibility verifier: FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
