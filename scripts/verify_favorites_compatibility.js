import assert from "node:assert/strict";
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const storeEntry = resolve(root, "src/features/favorites-manager/favorites-store.ts");

const apiStub = `
export async function getFileOrNullChecked() {
    return globalThis.__favoritesTestData ?? null;
}
export async function putFileChecked(_path, isDirectory, blob) {
    if (isDirectory) return;
    globalThis.__favoritesTestWrites = (globalThis.__favoritesTestWrites ?? 0) + 1;
    globalThis.__favoritesTestData = JSON.parse(await blob.text());
}
`;

const eventsStub = "export function dispatchFavoritesUpdated() {}";

const bundled = await build({
    entryPoints: [storeEntry],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node24",
    write: false,
    plugins: [{
        name: "favorites-compatibility-test-stubs",
        setup(buildContext) {
            buildContext.onResolve({ filter: /^@\/api$/ }, () => ({
                path: "api",
                namespace: "favorites-test",
            }));
            buildContext.onResolve({ filter: /^\.\/favorites-events$/ }, () => ({
                path: "events",
                namespace: "favorites-test",
            }));
            buildContext.onLoad({ filter: /.*/, namespace: "favorites-test" }, ({ path }) => ({
                contents: path === "api" ? apiStub : eventsStub,
                loader: "js",
            }));
        },
    }],
});

const bundleText = new TextDecoder().decode(bundled.outputFiles[0].contents);
const store = await import(`data:text/javascript,${encodeURIComponent(bundleText)}`);

function setFile(value) {
    globalThis.__favoritesTestData = structuredClone(value);
    globalThis.__favoritesTestWrites = 0;
}

function file() {
    return globalThis.__favoritesTestData;
}

async function readIndex() {
    return store.readFavoritesIndexStrict();
}

setFile({
    version: 2,
    updatedAt: "2026-08-29T00:00:00.000Z",
    items: [{ id: "doc-v2", content: "当前收藏", favoriteOrder: 0, customFutureField: "keep" }],
    groups: [],
});
let result = await readIndex();
assert.equal(result.kind, "ok");
assert.equal(result.payload.version, 2);
assert.equal(result.payload.items[0].customFutureField, "keep");
assert.equal(globalThis.__favoritesTestWrites, 0);

const legacyUpdatedAt = "2026-07-01T00:00:00.000Z";
setFile({
    version: 1,
    updatedAt: legacyUpdatedAt,
    items: [
        { id: "doc-old-1", content: "旧收藏 1", favoriteOrder: 3, legacyExtra: "keep-me" },
        { id: "doc-old-2", content: "旧收藏 2" },
    ],
    legacyRootExtra: "root-keep",
});
result = await readIndex();
assert.equal(result.kind, "ok");
assert.equal(result.payload.version, 2);
assert.equal(result.payload.updatedAt, legacyUpdatedAt);
assert.deepEqual(result.payload.groups, []);
assert.equal(result.payload.items.length, 2);
assert.equal(result.payload.items[0].legacyExtra, "keep-me");
assert.equal(result.payload.legacyRootExtra, "root-keep");
assert.equal(globalThis.__favoritesTestWrites, 0);
assert.equal(await store.doesFavoritesIndexExist(), true);
assert.equal(globalThis.__favoritesTestWrites, 0);

setFile({ version: 1, items: [] });
result = await readIndex();
assert.equal(result.kind, "ok");
assert.equal(result.payload.updatedAt, "1970-01-01T00:00:00.000Z");
assert.equal(globalThis.__favoritesTestWrites, 0);

setFile({ items: [] });
result = await readIndex();
assert.equal(result.kind, "corrupt");
assert.match(result.reason, /版本不受支持：undefined/);

setFile([{ id: "doc-array-1", content: "更旧收藏", unknownField: 123 }]);
const firstArrayRead = await readIndex();
const secondArrayRead = await readIndex();
assert.equal(firstArrayRead.kind, "ok");
assert.equal(secondArrayRead.kind, "ok");
assert.equal(firstArrayRead.payload.version, 2);
assert.equal(firstArrayRead.payload.updatedAt, "1970-01-01T00:00:00.000Z");
assert.equal(secondArrayRead.payload.updatedAt, firstArrayRead.payload.updatedAt);
assert.equal(firstArrayRead.payload.items[0].unknownField, 123);
assert.equal(globalThis.__favoritesTestWrites, 0);

setFile({ version: 3, updatedAt: "2026-08-29T00:00:00.000Z", items: [], groups: [] });
result = await readIndex();
assert.equal(result.kind, "corrupt");
assert.match(result.reason, /版本不受支持：3/);

setFile({ version: 1, items: "not-array" });
result = await readIndex();
assert.equal(result.kind, "corrupt");
setFile({ version: 1, items: [], groups: {} });
result = await readIndex();
assert.equal(result.kind, "corrupt");

const legacyGroup = {
    id: "group-1",
    name: "工作",
    order: 0,
    createdAt: legacyUpdatedAt,
    updatedAt: legacyUpdatedAt,
};
setFile({
    version: 1,
    items: [
        { id: "old1", content: "旧一", favoriteOrder: 0, legacyExtra: "keep" },
        { id: "old2", content: "旧二", favoriteOrder: 1 },
    ],
    groups: [legacyGroup],
});
await store.addFavoriteItem({ id: "new1", content: "新收藏" });
assert.equal(file().version, 2);
assert.deepEqual(file().groups, [legacyGroup]);
assert.deepEqual(file().items.map((item) => item.id), ["old1", "old2", "new1"]);
assert.equal(file().items.find((item) => item.id === "old1").legacyExtra, "keep");

setFile({ version: 1, items: [{ id: "old1" }, { id: "old2" }] });
await store.removeFavoriteItem("old1");
assert.equal(file().version, 2);
assert.deepEqual(file().items.map((item) => item.id), ["old2"]);

setFile({ version: 1, items: [{ id: "old1" }, { id: "old2" }] });
await store.removeFavoriteItemsByIds(["old1"]);
assert.equal(file().version, 2);
assert.deepEqual(file().items.map((item) => item.id), ["old2"]);

setFile({ version: 1, items: [{ id: "old1" }], groups: [legacyGroup] });
await store.setItemGroup("old1", "group-1");
assert.equal(file().version, 2);
assert.equal(file().items[0].favoriteGroupId, "group-1");
assert.deepEqual(file().groups, [legacyGroup]);

setFile({ version: 1, items: [{ id: "old1" }] });
const createdGroup = await store.createGroup("新分组");
assert.equal(file().version, 2);
assert.equal(file().items[0].id, "old1");
assert.equal(file().groups[0].id, createdGroup.id);
assert.equal(file().groups[0].name, "新分组");

setFile({ version: 1, items: [{ id: "old1" }], groups: [legacyGroup] });
await store.renameGroup("group-1", "项目");
assert.equal(file().version, 2);
assert.equal(file().groups[0].name, "项目");

setFile({
    version: 1,
    items: [{ id: "old1", favoriteGroupId: "group-1" }, { id: "old2" }],
    groups: [legacyGroup],
});
await store.deleteGroup("group-1", { expectedItemCount: 1 });
assert.equal(file().version, 2);
assert.deepEqual(file().groups, []);
assert.equal("favoriteGroupId" in file().items[0], false);
assert.equal(file().items[1].id, "old2");

setFile({
    version: 1,
    items: [
        { id: "old1", favoriteOrder: 0 },
        { id: "old2", favoriteOrder: 1 },
        { id: "old3", favoriteOrder: 2 },
    ],
});
await store.reorderFavoriteItems(["old3", "old1", "old2"]);
assert.equal(file().version, 2);
assert.deepEqual(file().items.map((item) => item.id), ["old3", "old1", "old2"]);
assert.deepEqual(file().items.map((item) => item.favoriteOrder), [0, 1, 2]);
