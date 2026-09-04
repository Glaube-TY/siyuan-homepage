import assert from "node:assert/strict";
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundled = await build({
    entryPoints: [resolve(root, "src/features/robot-assistant/core/robot-command-service.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node24",
    write: false,
});
const commandService = await import(
    `data:text/javascript,${encodeURIComponent(new TextDecoder().decode(bundled.outputFiles[0].contents))}`,
);

for (const [text, expected] of [
    ["确认", "confirm"],
    [" 确认 ", "confirm"],
    ["1", "confirm"],
    [" 1 ", "confirm"],
    ["Y", "confirm"],
    ["y", "confirm"],
    ["取消", "cancel"],
    [" 取消 ", "cancel"],
    ["0", "cancel"],
    [" 0 ", "cancel"],
    ["F", "cancel"],
    ["f", "cancel"],
]) {
    assert.equal(commandService.parseRobotConfirmationReply(text), expected, `unexpected result for ${JSON.stringify(text)}`);
}

for (const text of ["", "   ", "x", "10", "1 0"]) {
    assert.equal(commandService.parseRobotConfirmationReply(text), null, `accepted invalid input ${JSON.stringify(text)}`);
}

for (const text of ["1", "0", "Y", "y", "F", "f"]) {
    assert.equal(commandService.parseRobotCommand(text), null, `normal command parser consumed ${JSON.stringify(text)}`);
}
assert.equal(commandService.parseRobotCommand("确认").kind, "confirm");
assert.equal(commandService.parseRobotCommand("取消").kind, "cancel");
assert.equal(commandService.parseRobotCommand("#confirm").kind, "confirm");
assert.equal(commandService.parseRobotCommand("#cancel").kind, "cancel");

console.log("robot confirmation input verification passed");
