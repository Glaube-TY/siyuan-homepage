import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const deviceViewRoot = "/data/storage/petal/siyuan-homepage/device-views";

function viewPath(scope, surface, file) {
  return `${deviceViewRoot}/${scope}/${surface}/${file}`;
}

function viewMetadata(scope, surface, revision = 8) {
  return {
    schema: "siyuan-homepage-device-view",
    version: 2,
    revision,
    updatedAt: "2026-08-01T00:00:00.000Z",
    deviceId: scope,
    surface,
  };
}

function seedDeviceView(scope, surface, { homepageSplit = false, missingWidget = false } = {}) {
  const files = new Map();
  const widgetId = surface === "desktop-homepage" ? "home-widget" : "sidebar-widget";
  const metadata = viewMetadata(scope, surface);
  const layout = {
    ...metadata,
    order: [{ id: widgetId, style: "width: 2fr", index: 0 }],
    ...(surface === "desktop-homepage" && homepageSplit ? {
      componentSectionsModeEnabled: true,
      sections: {
        main: { widgetIds: [widgetId], name: "Old section", createdAt: 10, updatedAt: 11 },
      },
    } : surface === "desktop-homepage" ? { componentSectionsModelVersion: 1 } : {}),
  };
  const settings = surface === "desktop-homepage" ? {
    ...metadata,
    config: {
      theme: "legacy-theme",
      preserved: { density: "comfortable" },
      ...(homepageSplit ? {
        componentSectionsEnabled: true,
        componentSections: [{ id: "main", name: "Main section", createdAt: 10, updatedAt: 11 }],
      } : {}),
    },
  } : undefined;
  files.set(viewPath(scope, surface, "manifest.json"), JSON.stringify({
    ...metadata,
    status: "complete",
    migration: { state: "complete", source: "legacy-root", completedAt: "2026-08-01T00:00:00.000Z" },
  }));
  files.set(viewPath(scope, surface, "layout.json"), JSON.stringify(layout));
  if (settings) files.set(viewPath(scope, surface, "view.json"), JSON.stringify(settings));
  if (!missingWidget) {
    files.set(viewPath(scope, surface, `widgets/${widgetId}.json`), JSON.stringify({
      ...metadata,
      instanceId: widgetId,
      config: { type: "fixture-widget", options: { retained: true } },
    }));
  }
  files.set(`${deviceViewRoot}/${scope}/device.json`, JSON.stringify({
    schema: "siyuan-homepage-device",
    version: 2,
    revision: 8,
    updatedAt: metadata.updatedAt,
    physicalDeviceId: scope,
    deviceName: "Remote Kernel host",
    platform: "linux",
    arch: "unknown",
    hostname: "Remote Kernel host",
    isMobile: false,
  }));
  return files;
}

function fixtureDeviceInfo(info, id) {
  return { ...info, physicalDeviceId: id };
}

function deviceViewContext(info, surface) {
  return {
    plugin: { name: "siyuan-homepage" },
    physicalDeviceId: info.physicalDeviceId,
    scopeId: surface === "mobile-homepage" ? "mobile-shared" : info.physicalDeviceId,
    surface,
    isMobileShared: surface === "mobile-homepage",
  };
}

function createDeviceViewFixture(info, initialFiles = new Map(), shareFiles = false) {
  const files = shareFiles ? initialFiles : new Map(initialFiles);
  const calls = { reads: [], directoryReads: [], writes: [] };
  const api = {
    async getFileOrNullChecked(filePath) {
      calls.reads.push(filePath);
      return files.has(filePath) ? files.get(filePath) : null;
    },
    async putFileChecked(filePath, isDir, file) {
      assert.equal(isDir, false);
      files.set(filePath, await file.text());
      calls.writes.push(filePath);
    },
    async removeFileChecked(filePath) {
      files.delete(filePath);
      calls.writes.push(filePath);
    },
    async readDirOrNullChecked(directoryPath) {
      calls.directoryReads.push(directoryPath);
      const prefix = `${directoryPath.replace(/\/+$/, "")}/`;
      const children = new Set();
      for (const filePath of files.keys()) {
        if (filePath.startsWith(prefix)) children.add(filePath.slice(prefix.length).split("/")[0]);
      }
      return children.size ? [...children].map((name) => ({ name })) : null;
    },
  };
  const mocks = new Map([
    ["@/api", api],
    ["@/homepage/utils/deviceProfile", { getCurrentDeviceInfo: () => info }],
    ["@/homepage/homepageSetting/config", { normalizeComponentSectionsNavAlign: (value) => value ?? "left" }],
  ]);
  const context = vm.createContext({
    Blob: globalThis.Blob,
    TextDecoder,
    ArrayBuffer,
    window: { dispatchEvent() {} },
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    },
  });
  const cache = new Map();
  const resolveFixtureImport = (importer, specifier) => {
    const base = specifier.startsWith("@/")
      ? path.join(root, "src", specifier.slice(2))
      : specifier.startsWith(".") ? path.resolve(path.dirname(importer), specifier) : null;
    if (!base) throw new Error(`Unexpected Device View fixture import: ${specifier}`);
    const extension = path.extname(base);
    const candidates = extension ? [base] : [".ts", ".tsx", ".js", ".mjs"].map((suffix) => `${base}${suffix}`);
    for (const candidate of candidates) {
      try {
        readFileSync(candidate);
        return candidate;
      } catch {
        // Try the next project source extension.
      }
    }
    throw new Error(`Device View fixture module not found: ${specifier} from ${importer}`);
  };
  const load = (filePath) => {
    const normalizedPath = path.resolve(filePath);
    if (cache.has(normalizedPath)) return cache.get(normalizedPath).exports;
    const module = { exports: {} };
    cache.set(normalizedPath, module);
    const source = readFileSync(normalizedPath, "utf8");
    const js = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const localRequire = (specifier) => {
      if (mocks.has(specifier)) return mocks.get(specifier);
      return load(resolveFixtureImport(normalizedPath, specifier));
    };
    const wrapper = new vm.Script(`(function (module, exports, require) {\n${js}\n})`, {
      filename: normalizedPath,
    }).runInContext(context);
    wrapper(module, module.exports, localRequire);
    return module.exports;
  };
  const readiness = load(path.join(root, "src/homepage/deviceView/deviceViewReadiness.ts"));
  const storage = load(path.join(root, "src/homepage/deviceView/deviceViewStorage.ts"));
  return { files, calls, readiness, storage };
}

function assertNoLegacyReads(fixture, legacyId) {
  const legacyRoot = `${deviceViewRoot}/${legacyId}/`;
  assert.ok(![...fixture.calls.reads, ...fixture.calls.directoryReads]
    .some((filePath) => filePath.startsWith(legacyRoot)), `unexpected legacy read under ${legacyRoot}`);
}

function assertOnlyDeviceViewScopes(fixture, scopeIds) {
  const allowed = new Set(scopeIds);
  const prefix = `${deviceViewRoot}/`;
  for (const filePath of [...fixture.calls.reads, ...fixture.calls.directoryReads, ...fixture.calls.writes]) {
    assert.ok(filePath.startsWith(prefix), `unexpected fixture storage path: ${filePath}`);
    const [scope, surface, ...rest] = filePath.slice(prefix.length).split("/");
    assert.ok(allowed.has(scope), `unexpected Device View scope access: ${scope}`);
    if (fixture.calls.directoryReads.includes(filePath)) {
      assert.ok(["desktop-homepage", "desktop-sidebar", "mobile-homepage"].includes(surface));
      assert.equal(rest.length, 0, `directory listing escaped the exact surface: ${filePath}`);
    }
  }
}

function assertMetadata(document, scope, surface) {
  assert.equal(document.schema, "siyuan-homepage-device-view");
  assert.equal(document.deviceId, scope);
  assert.equal(document.surface, surface);
  assert.equal(document.version, 2);
  assert.equal(document.revision, 1);
  assert.ok(Number.isFinite(Date.parse(document.updatedAt)));
}

async function assertIncomplete(promise, missingType) {
  let error;
  try {
    await promise;
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, "expected incomplete Device View recovery to fail");
  assert.equal(error.name, "DeviceViewTemporarilyIncompleteError");
  assert.equal(error.missingType, missingType);
}

async function verifyRemoteDeviceViewRecoveryFixtures({ remoteA, remoteB, localDesktop, browserDesktop, nativeMobile }) {
  const legacyId = remoteA.info.legacyRemotePhysicalDeviceId;
  assert.equal(remoteA.info.isRemoteKernel, true);
  assert.equal(remoteB.info.legacyRemotePhysicalDeviceId, legacyId);

  // A: copy a complete old split-model homepage, normalize metadata/revisions, retain the source.
  const homepageSource = seedDeviceView(legacyId, "desktop-homepage", { homepageSplit: true });
  const homepageSnapshot = [...homepageSource.entries()];
  const homepage = createDeviceViewFixture(remoteA.info, homepageSource);
  const homepageContext = deviceViewContext(remoteA.info, "desktop-homepage");
  await homepage.readiness.ensureCurrentDeviceViewReady(homepageContext);
  const homepageManifest = await homepage.storage.readDeviceViewManifest(homepageContext);
  const homepageLayout = await homepage.storage.readDeviceViewLayout(homepageContext);
  const homepageSettings = await homepage.storage.readDeviceViewSettings(homepageContext);
  const homepageWidget = await homepage.storage.readDeviceWidget(homepageContext, "home-widget");
  const homepageDescriptor = await homepage.storage.readDeviceDescriptor(homepageContext);
  assert.equal(homepageManifest.migration.source, "recovered-target");
  assertMetadata(homepageManifest, remoteA.info.physicalDeviceId, "desktop-homepage");
  assertMetadata(homepageLayout, remoteA.info.physicalDeviceId, "desktop-homepage");
  assertMetadata(homepageSettings, remoteA.info.physicalDeviceId, "desktop-homepage");
  assertMetadata(homepageWidget, remoteA.info.physicalDeviceId, "desktop-homepage");
  assert.equal(homepageDescriptor.physicalDeviceId, remoteA.info.physicalDeviceId);
  assert.equal(homepageLayout.componentSectionsModelVersion, 1);
  assert.equal(homepageLayout.sections.main.name, "Main section");
  assert.equal(homepageLayout.order[0].style, "width: 2fr");
  assert.equal(homepageSettings.config.theme, "legacy-theme");
  assert.deepEqual(JSON.parse(JSON.stringify(homepageSettings.config.preserved)), { density: "comfortable" });
  assert.equal("componentSections" in homepageSettings.config, false);
  assert.deepEqual(JSON.parse(JSON.stringify(homepageWidget.config)), {
    type: "fixture-widget", options: { retained: true },
  });
  assert.equal(homepage.files.get(`${deviceViewRoot}/${remoteA.info.physicalDeviceId}/device.json`) !== undefined, true);
  assert.deepEqual([...homepage.files.entries()].filter(([filePath]) => filePath.startsWith(`${deviceViewRoot}/${legacyId}/`)), homepageSnapshot);
  assertOnlyDeviceViewScopes(homepage, [remoteA.info.physicalDeviceId, legacyId]);

  // A: sidebar layout/widgets recover independently, with no synthesized settings file.
  const sidebarSource = seedDeviceView(legacyId, "desktop-sidebar");
  const sidebarSnapshot = [...sidebarSource.entries()];
  const sidebar = createDeviceViewFixture(remoteA.info, sidebarSource);
  const sidebarContext = deviceViewContext(remoteA.info, "desktop-sidebar");
  await sidebar.readiness.ensureCurrentDeviceViewReady(sidebarContext);
  const sidebarManifest = await sidebar.storage.readDeviceViewManifest(sidebarContext);
  const sidebarLayout = await sidebar.storage.readDeviceViewLayout(sidebarContext);
  const sidebarWidget = await sidebar.storage.readDeviceWidget(sidebarContext, "sidebar-widget");
  assert.equal(sidebarManifest.migration.source, "recovered-target");
  assertMetadata(sidebarManifest, remoteA.info.physicalDeviceId, "desktop-sidebar");
  assertMetadata(sidebarLayout, remoteA.info.physicalDeviceId, "desktop-sidebar");
  assertMetadata(sidebarWidget, remoteA.info.physicalDeviceId, "desktop-sidebar");
  assert.equal(sidebar.files.has(viewPath(remoteA.info.physicalDeviceId, "desktop-sidebar", "view.json")), false);
  assert.deepEqual([...sidebar.files.entries()].filter(([filePath]) => filePath.startsWith(`${deviceViewRoot}/${legacyId}/`)), sidebarSnapshot);
  assert.ok(!sidebar.calls.reads.includes(viewPath(legacyId, "desktop-sidebar", "view.json")));
  assertOnlyDeviceViewScopes(sidebar, [remoteA.info.physicalDeviceId, legacyId]);

  // B: no deterministic legacy surface means ordinary empty initialization.
  const missingInfo = fixtureDeviceInfo(remoteA.info, "desktop-front-b");
  const missingLegacy = createDeviceViewFixture(missingInfo);
  const missingContext = deviceViewContext(missingInfo, "desktop-homepage");
  await missingLegacy.readiness.ensureCurrentDeviceViewReady(missingContext);
  assert.equal((await missingLegacy.storage.readDeviceViewManifest(missingContext)).migration.source, "fresh");
  assert.equal((await missingLegacy.storage.readDeviceViewLayout(missingContext)).order.length, 0);
  assertOnlyDeviceViewScopes(missingLegacy, [missingInfo.physicalDeviceId, legacyId]);

  // C: current manifest is authoritative; no legacy path is touched or overwritten.
  const currentId = "desktop-front-current";
  const existingCurrent = seedDeviceView(currentId, "desktop-homepage");
  const oldSource = seedDeviceView(legacyId, "desktop-homepage", { homepageSplit: true });
  const currentSnapshot = [...existingCurrent.entries()];
  const current = createDeviceViewFixture(
    fixtureDeviceInfo(remoteA.info, currentId),
    new Map([...oldSource.entries(), ...existingCurrent.entries()]),
  );
  await current.readiness.ensureCurrentDeviceViewReady(deviceViewContext(fixtureDeviceInfo(remoteA.info, currentId), "desktop-homepage"));
  assertNoLegacyReads(current, legacyId);
  assert.deepEqual([...current.files.entries()].filter(([filePath]) => filePath.startsWith(`${deviceViewRoot}/${currentId}/`)), currentSnapshot);
  assertOnlyDeviceViewScopes(current, [currentId]);

  // D: an orphan current-scope widget is partial state, not an empty target.
  const partialId = "desktop-front-partial";
  const partialFiles = seedDeviceView(legacyId, "desktop-homepage", { homepageSplit: true });
  partialFiles.set(viewPath(partialId, "desktop-homepage", "widgets/orphan.json"), "not read");
  const partialInfo = fixtureDeviceInfo(remoteA.info, partialId);
  const partial = createDeviceViewFixture(partialInfo, partialFiles);
  await assertIncomplete(partial.readiness.ensureCurrentDeviceViewReady(deviceViewContext(partialInfo, "desktop-homepage")), "manifest");
  assertNoLegacyReads(partial, legacyId);
  assert.equal(partial.files.has(viewPath(partialId, "desktop-homepage", "manifest.json")), false);
  assertOnlyDeviceViewScopes(partial, [partialId]);

  // E: a committed source manifest with a missing referenced widget blocks recovery.
  const missingWidgetSource = seedDeviceView(legacyId, "desktop-homepage", { homepageSplit: true, missingWidget: true });
  const missingWidgetSnapshot = [...missingWidgetSource.entries()];
  const missingWidgetInfo = fixtureDeviceInfo(remoteA.info, "desktop-front-missing-widget");
  const missingWidget = createDeviceViewFixture(missingWidgetInfo, missingWidgetSource);
  await assertIncomplete(missingWidget.readiness.ensureCurrentDeviceViewReady(deviceViewContext(missingWidgetInfo, "desktop-homepage")), "widget");
  assert.equal(missingWidget.files.has(viewPath(missingWidgetInfo.physicalDeviceId, "desktop-homepage", "manifest.json")), false);
  assert.deepEqual([...missingWidget.files.entries()], missingWidgetSnapshot);
  assertOnlyDeviceViewScopes(missingWidget, [missingWidgetInfo.physicalDeviceId, legacyId]);

  // E: a legacy layout without its manifest is an incomplete source, not absence.
  const unmanifestedSource = seedDeviceView(legacyId, "desktop-homepage", { homepageSplit: true });
  unmanifestedSource.delete(viewPath(legacyId, "desktop-homepage", "manifest.json"));
  const unmanifestedSnapshot = [...unmanifestedSource.entries()];
  const unmanifestedInfo = fixtureDeviceInfo(remoteA.info, "desktop-front-unmanifested");
  const unmanifested = createDeviceViewFixture(unmanifestedInfo, unmanifestedSource);
  await assertIncomplete(unmanifested.readiness.ensureCurrentDeviceViewReady(deviceViewContext(unmanifestedInfo, "desktop-homepage")), "manifest");
  assert.equal(unmanifested.files.has(viewPath(unmanifestedInfo.physicalDeviceId, "desktop-homepage", "manifest.json")), false);
  assert.deepEqual([...unmanifested.files.entries()], unmanifestedSnapshot);
  assertOnlyDeviceViewScopes(unmanifested, [unmanifestedInfo.physicalDeviceId, legacyId]);

  // F: corrupt legacy JSON remains untouched and is never replaced by a fresh target.
  const corruptSource = seedDeviceView(legacyId, "desktop-homepage", { homepageSplit: true });
  corruptSource.set(viewPath(legacyId, "desktop-homepage", "layout.json"), "{broken-json");
  const corruptSnapshot = [...corruptSource.entries()];
  const corruptInfo = fixtureDeviceInfo(remoteA.info, "desktop-front-corrupt");
  const corrupt = createDeviceViewFixture(corruptInfo, corruptSource);
  await assert.rejects(corrupt.readiness.ensureCurrentDeviceViewReady(deviceViewContext(corruptInfo, "desktop-homepage")));
  assert.equal(corrupt.files.has(viewPath(corruptInfo.physicalDeviceId, "desktop-homepage", "manifest.json")), false);
  assert.deepEqual([...corrupt.files.entries()], corruptSnapshot);
  assertOnlyDeviceViewScopes(corrupt, [corruptInfo.physicalDeviceId, legacyId]);

  // G: separate frontend-local scopes can both recover the same preserved source.
  const sharedSource = seedDeviceView(legacyId, "desktop-homepage", { homepageSplit: true });
  const sharedSnapshot = [...sharedSource.entries()];
  const sharedStorage = new Map(sharedSource);
  const remoteAStore = createDeviceViewFixture(remoteA.info, sharedStorage, true);
  const remoteBStore = createDeviceViewFixture(remoteB.info, sharedStorage, true);
  await remoteAStore.readiness.ensureCurrentDeviceViewReady(deviceViewContext(remoteA.info, "desktop-homepage"));
  await remoteBStore.readiness.ensureCurrentDeviceViewReady(deviceViewContext(remoteB.info, "desktop-homepage"));
  assert.notEqual(remoteA.info.physicalDeviceId, remoteB.info.physicalDeviceId);
  for (const [fixture, info] of [[remoteAStore, remoteA.info], [remoteBStore, remoteB.info]]) {
    const context = deviceViewContext(info, "desktop-homepage");
    assert.equal((await fixture.storage.readDeviceViewManifest(context)).migration.source, "recovered-target");
    assertMetadata(await fixture.storage.readDeviceViewLayout(context), info.physicalDeviceId, "desktop-homepage");
  }
  assert.deepEqual([...remoteAStore.files.entries()].filter(([filePath]) => filePath.startsWith(`${deviceViewRoot}/${legacyId}/`)), sharedSnapshot);
  assertMetadata(
    await remoteAStore.storage.readDeviceViewLayout(deviceViewContext(remoteA.info, "desktop-homepage")),
    remoteA.info.physicalDeviceId,
    "desktop-homepage",
  );
  assertOnlyDeviceViewScopes(remoteAStore, [remoteA.info.physicalDeviceId, legacyId]);
  assertOnlyDeviceViewScopes(remoteBStore, [remoteB.info.physicalDeviceId, legacyId]);

  // H/I/J: Local Desktop, Browser Desktop, and Mobile never consult the remote legacy scope.
  for (const [name, info, surface] of [
    ["local", localDesktop.info, "desktop-homepage"],
    ["browser", browserDesktop.info, "desktop-homepage"],
    ["mobile", nativeMobile.info, "mobile-homepage"],
  ]) {
    const source = seedDeviceView(legacyId, "desktop-homepage", { homepageSplit: true });
    const fixture = createDeviceViewFixture(info, source);
    const context = deviceViewContext(info, surface);
    await fixture.readiness.ensureCurrentDeviceViewReady(context);
    assertNoLegacyReads(fixture, legacyId);
    const manifest = await fixture.storage.readDeviceViewManifest(context);
    assert.equal(manifest.migration.source, "fresh", `${name} must use ordinary initialization`);
    assert.equal((await fixture.storage.readDeviceViewLayout(context)).order.length, 0);
    assertOnlyDeviceViewScopes(fixture, [context.scopeId, info.physicalDeviceId]);
  }

  console.log("Remote Desktop Device View recovery fixtures: PASS (A-J, legacy missing-manifest, homepage/sidebar, split-model, metadata, revision, preservation, incomplete/corrupt, multi-frontend, local/browser/mobile isolation)");
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
  assert.equal(localDesktop.info.isRemoteKernel, false);
  assert.equal(localDesktop.info.legacyRemotePhysicalDeviceId, undefined);
  const remoteA = await testIdentityModule(deviceSource, "desktop", "?remote=1", "remote-kernel-system-id", "front-a", identityStore);
  const remoteB = await testIdentityModule(deviceSource, "desktop", "?remote=1", "remote-kernel-system-id", "front-b");
  assert.equal(remoteA.info.physicalDeviceId, "desktop-front-a");
  assert.equal(remoteB.info.physicalDeviceId, "desktop-front-b");
  assert.equal(remoteA.info.isRemoteKernel, true);
  assert.equal(remoteA.info.legacyRemotePhysicalDeviceId, oldRemoteSharedId);
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
  await verifyRemoteDeviceViewRecoveryFixtures({ remoteA, remoteB, localDesktop, browserDesktop, nativeMobile });
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
