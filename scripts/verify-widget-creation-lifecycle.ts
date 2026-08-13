import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const homepage = readFileSync("src/homepage/homepage.svelte", "utf8");
const widgetBlock = readFileSync("src/components/utils/widgetBlock/WidgetBlock.ts", "utf8");
const blockCreator = readFileSync("src/components/utils/widgetBlock/utils/block-creator.ts", "utf8");

assert.match(homepage, /loadLayoutSnapshotForContext\(deviceViewContext,\s*\{\s*assumeReady:\s*true\s*\}\)/);
assert.match(homepage, /hasSameJsonSemantic\(persistedItems,\s*currentItems\)/);
assert.match(homepage, /saveLayoutWithResult\([\s\S]*committedWidgetIds:\s*\[widgetId\][\s\S]*expectedLayoutRevision,?/);
assert.match(homepage, /setSectionRuntimeState\(sectionId,\s*\{\s*\.\.\.current,\s*layoutRevision:\s*result\.layoutRevision\s*\}\)/);
assert.match(blockCreator, /widget\.persistInitialEmptyContent\(\)/);
assert.match(widgetBlock, /type:\s*"custom-text"[\s\S]*customText:\s*""/);
assert.match(widgetBlock, /dragHandle\.disabled\s*=\s*true/);

console.log("Widget creation lifecycle verification passed.");
