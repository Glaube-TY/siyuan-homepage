/**
 * ts-node/esm 的 `@/` 路径别名解析 loader（项目内零依赖方案）。
 * Node 不支持 tsconfig paths，此 loader 在模块解析阶段把 `@/` 与 `@/libs/`
 * 映射到仓库 src 目录的绝对路径。仅在验证脚本启动命令中使用。
 *
 * 用法：node --loader ./scripts/ts-node-alias-loader.mjs --loader ts-node/esm ...
 */
import { pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = resolvePath(fileURLToPath(new URL("../src", import.meta.url)));

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/libs/")) {
    return nextResolve(pathToFileURL(resolvePath(SRC_DIR, "libs", specifier.slice("@/libs/".length))).href, context);
  }
  if (specifier.startsWith("@/")) {
    return nextResolve(pathToFileURL(resolvePath(SRC_DIR, specifier.slice("@/".length))).href, context);
  }
  return nextResolve(specifier, context);
}
