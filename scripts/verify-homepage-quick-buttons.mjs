import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFile(resolve(root, path), "utf8");
const [quickButtonSource, homepageSource, registrySource, packageSource, lockSource, readmeSource] = await Promise.all([
  read("src/homepage/header/quick-button.ts"),
  read("src/homepage/homepage.svelte"),
  read("src/homepage/buttonRegistry.ts"),
  read("package.json"),
  read("pnpm-lock.yaml"),
  read("README.md"),
]);

assert.doesNotMatch(quickButtonSource, /Mousetrap/i);
assert.doesNotMatch(homepageSource, /reRegisterAllShortcuts|unregisterAllShortcuts/);
assert.doesNotMatch(quickButtonSource, /document\.dispatchEvent\s*\(\s*keyEvent\s*\)/);
assert.doesNotMatch(lockSource, /mousetrap/i);
assert.doesNotMatch(readmeSource, /mousetrap/i);

const packageJson = JSON.parse(packageSource);
assert.equal(packageJson.dependencies?.mousetrap, undefined);
assert.equal(packageJson.devDependencies?.mousetrap, undefined);

assert.match(registrySource, /search:\s*\{[^}]*shortcut:\s*"Ctrl\+P"/s);
assert.match(registrySource, /diary:\s*\{[^}]*shortcut:\s*"Alt\+5"/s);
const buttonItem = quickButtonSource.match(/export type ButtonItem = \{([\s\S]*?)^\};/m);
assert.ok(buttonItem, "ButtonItem schema must remain present");
assert.deepEqual(
  Array.from(buttonItem[1].matchAll(/^\s{4}(\w+)\??:/gm), (match) => match[1]),
  ["id", "label", "checked", "shortcut", "order", "action"],
);

const executableSource = quickButtonSource
  .replace(/^import .*;$/gm, "")
  .replace(/^export\s+/gm, "")
  + String.fromCharCode(10) + "globalThis.quickButtonFixture = { handleButtonClick, normalizeShortcut, codeFor, keyCodeMap };" + String.fromCharCode(10);
const { code } = await transform(executableSource, { loader: "ts", target: "node24" });

function createFixture() {
  const keyboardEvents = [];
  const calls = {
    commands: [],
    knowledgeBase: 0,
    addWidget: [],
    settings: [],
    clean: [],
    templates: [],
  };

  class FakeHTMLElement {
    constructor(isConnected = true) {
      this.isConnected = isConnected;
      this.listeners = new Map();
      this.closestCalls = [];
    }

    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }

    dispatchEvent(event) {
      event.target = this;
      for (const listener of this.listeners.get(event.type) ?? []) listener(event);
      return true;
    }

    closest(selector) {
      this.closestCalls.push(selector);
      return null;
    }
  }

  class FakeKeyboardEvent {
    constructor(type, init) {
      this.type = type;
      this.target = null;
      Object.assign(this, init);
      keyboardEvents.push(this);
    }
  }

  const document = {
    activeElement: null,
    body: new FakeHTMLElement(),
    documentElement: new FakeHTMLElement(),
  };
  const sandbox = {
    document,
    HTMLElement: FakeHTMLElement,
    KeyboardEvent: FakeKeyboardEvent,
    globalCommand(command, app) {
      calls.commands.push([command, app]);
    },
    addCustomBlock(...args) {
      calls.addWidget.push(args);
    },
    svelteDialog(options) {
      calls.settings.push(options);
      return { dialog: { element: { classList: { add() {} } } } };
    },
    HomepageSetting: {},
    mount() {},
    openEmptyDocCleanerDialog(plugin) {
      calls.clean.push(plugin);
    },
    openTemplateCenterDialog(plugin) {
      calls.templates.push(plugin);
    },
    console,
  };
  runInNewContext(code, sandbox);

  return {
    ...sandbox.quickButtonFixture,
    calls,
    document,
    keyboardEvents,
    HTMLElement: FakeHTMLElement,
  };
}

function pluginFor(fixture) {
  return {
    app: { fixtureApp: true },
    openKbChatTab() {
      fixture.calls.knowledgeBase += 1;
    },
  };
}

function click(fixture, item, plugin = pluginFor(fixture)) {
  fixture.handleButtonClick(item, plugin, { value: null });
}

{
  const fixture = createFixture();
  const plugin = pluginFor(fixture);
  click(fixture, { id: 1, label: "搜索笔记", checked: true, shortcut: "Ctrl+P", order: 0, action: "search" }, plugin);
  assert.deepEqual(fixture.calls.commands, [["globalSearch", plugin.app]]);
  assert.equal(fixture.keyboardEvents.length, 0, "search must call globalCommand without synthesizing a key");
}

{
  const fixture = createFixture();
  const plugin = pluginFor(fixture);
  click(fixture, { id: 2, label: "今日日记", checked: true, shortcut: "Alt+5", order: 1, action: "diary" }, plugin);
  assert.deepEqual(fixture.calls.commands, [["dailyNote", plugin.app]]);
  assert.equal(fixture.keyboardEvents.length, 0, "daily note must call globalCommand without synthesizing a key");
}

{
  const fixture = createFixture();
  const plugin = pluginFor(fixture);
  click(fixture, { id: 3, label: "AI 知识库", checked: true, shortcut: "Ctrl+K", order: 2, action: "aiKnowledgeBase" }, plugin);
  assert.equal(fixture.calls.knowledgeBase, 1);
  assert.equal(fixture.calls.commands.length, 0);
  assert.equal(fixture.keyboardEvents.length, 0);

  click(fixture, { id: 4, label: "添加组件", checked: true, order: 3, action: "addWidget" }, plugin);
  click(fixture, { id: 5, label: "主页设置", checked: true, order: 4, action: "settings" }, plugin);
  click(fixture, { id: 6, label: "清理空文档", checked: true, order: 5, action: "cleanEmptyDocs" }, plugin);
  click(fixture, { id: 7, label: "布局模板", checked: true, order: 6, action: "templateCenter" }, plugin);
  assert.equal(fixture.calls.addWidget.length, 1);
  assert.equal(fixture.calls.addWidget[0][0], plugin);
  assert.equal(fixture.calls.addWidget[0][1].value, null);
  assert.equal(fixture.calls.settings.length, 1);
  assert.deepEqual(fixture.calls.clean, [plugin]);
  assert.deepEqual(fixture.calls.templates, [plugin]);
  assert.equal(fixture.keyboardEvents.length, 0);
}

{
  const fixture = createFixture();
  const target = new fixture.HTMLElement();
  fixture.document.activeElement = target;
  target.addEventListener("keydown", (event) => event.target.closest(".siyuan-shortcut-context"));
  click(fixture, { id: 8, label: "自定义按钮", checked: true, shortcut: "Ctrl+Shift+K", order: 7 });
  assert.equal(fixture.keyboardEvents.length, 1);
  const event = fixture.keyboardEvents[0];
  assert.equal(event.type, "keydown");
  assert.equal(event.bubbles, true);
  assert.equal(event.cancelable, true);
  assert.equal(event.ctrlKey, true);
  assert.equal(event.shiftKey, true);
  assert.equal(event.altKey, false);
  assert.equal(event.metaKey, false);
  assert.equal(event.key, "k");
  assert.equal(event.code, "KeyK");
  assert.equal(event.keyCode, 75);
  assert.equal(event.which, 75);
  assert.equal(event.target, target);
  assert.deepEqual(target.closestCalls, [".siyuan-shortcut-context"]);
}

for (const activeIsConnected of [true, false]) {
  const fixture = createFixture();
  const activeElement = new fixture.HTMLElement(activeIsConnected);
  fixture.document.activeElement = activeElement;
  click(fixture, { id: 9, label: "fallback", checked: true, shortcut: "Ctrl+K", order: 8 });
  assert.equal(
    fixture.keyboardEvents[0].target,
    activeIsConnected ? activeElement : fixture.document.body,
  );
}

{
  const fixture = createFixture();
  fixture.document.body = null;
  click(fixture, { id: 10, label: "root fallback", checked: true, shortcut: "Ctrl+K", order: 9 });
  assert.equal(fixture.keyboardEvents[0].target, fixture.document.documentElement);
}

const specialKeys = [
  ["space", " ", "Space", 32],
  ["enter", "Enter", "Enter", 13],
  ["tab", "Tab", "Tab", 9],
  ["backspace", "Backspace", "Backspace", 8],
  ["delete", "Delete", "Delete", 46],
  ["arrowup", "ArrowUp", "ArrowUp", 38],
  ["arrowdown", "ArrowDown", "ArrowDown", 40],
  ["arrowleft", "ArrowLeft", "ArrowLeft", 37],
  ["arrowright", "ArrowRight", "ArrowRight", 39],
  ["home", "Home", "Home", 36],
  ["end", "End", "End", 35],
  ["pageup", "PageUp", "PageUp", 33],
  ["pagedown", "PageDown", "PageDown", 34],
  ["escape", "Escape", "Escape", 27],
  ["insert", "Insert", "Insert", 45],
  ...Array.from({ length: 20 }, (_, index) => {
    const key = "f" + (index + 1);
    return [key, key.toUpperCase(), key.toUpperCase(), 112 + index];
  }),
];
for (const [shortcut, expectedKey, expectedCode, expectedKeyCode] of specialKeys) {
  const fixture = createFixture();
  click(fixture, { id: 11, label: "special", checked: true, shortcut, order: 10 });
  const event = fixture.keyboardEvents[0];
  assert.equal(event.key, expectedKey, shortcut + " key");
  assert.equal(event.code, expectedCode, shortcut + " code");
  assert.equal(event.keyCode, expectedKeyCode, shortcut + " keyCode");
  assert.equal(event.which, expectedKeyCode, shortcut + " which");
}

for (const [shortcut, expectedCode, expectedKeyCode] of [
  ["[", "BracketLeft", 219],
  ["]", "BracketRight", 221],
  ["'", "Quote", 222],
  [";", "Semicolon", 186],
  [",", "Comma", 188],
  [".", "Period", 190],
  ["/", "Slash", 191],
  ["-", "Minus", 189],
  ["=", "Equal", 187],
]) {
  const fixture = createFixture();
  click(fixture, { id: 12, label: "punctuation", checked: true, shortcut, order: 11 });
  assert.equal(fixture.keyboardEvents[0].code, expectedCode, shortcut + " punctuation code");
  assert.equal(fixture.keyboardEvents[0].keyCode, expectedKeyCode, shortcut + " punctuation keyCode");
}

function modifierSnapshot(shortcut) {
  const fixture = createFixture();
  click(fixture, { id: 13, label: "alias", checked: true, shortcut, order: 12 });
  const { ctrlKey, altKey, shiftKey, metaKey, key, code, keyCode, which } = fixture.keyboardEvents[0];
  return { ctrlKey, altKey, shiftKey, metaKey, key, code, keyCode, which };
}
assert.deepEqual(modifierSnapshot("Control+Shift+K"), modifierSnapshot("Ctrl+Shift+K"));
assert.deepEqual(modifierSnapshot("Command+Option+K"), modifierSnapshot("Cmd+Opt+K"));
assert.equal(createFixture().normalizeShortcut("Control+Shift+K"), "ctrl+shift+k");
assert.equal(createFixture().normalizeShortcut("Ctrl+Shift+K"), "ctrl+shift+k");

console.log("Homepage quick-button verification passed.");
