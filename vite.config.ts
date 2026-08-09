import { resolve } from "path"
import fs from "node:fs"
import { builtinModules } from "module"
import { defineConfig } from "vite"
import { viteStaticCopy } from "vite-plugin-static-copy"
import livereload from "rollup-plugin-livereload"
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte"
import zipPack from "vite-plugin-zip-pack";
import fg from 'fast-glob';

import vitePluginYamlI18n from './yaml-plugin';
import { loadLocalEnvFile } from './scripts/utils.js';
import { syncDevDeployment } from './scripts/dev_deploy.js';

loadLocalEnvFile();
const env = process.env;
const isSrcmap = env.VITE_SOURCEMAP === 'inline';
const isDev = env.NODE_ENV === 'development';
const isKernel = env.VITE_BUILD_TARGET === 'kernel';
const livereloadClientUrl = env.VITE_LIVERELOAD_CLIENT_URL?.trim() || '';

const outputDir = isDev ? "dev" : "dist";
const nodeBuiltins = Array.from(new Set([
    ...builtinModules,
    ...builtinModules.map((name) => `node:${name}`),
]));

console.log("isDev=>", isDev);
console.log("isSrcmap=>", isSrcmap);
console.log("outputDir=>", outputDir);
console.log("buildTarget=>", isKernel ? "kernel" : "app");

export default defineConfig(isKernel ? kernelConfig() : appConfig());

/**
 * Kernel target：src/kernel.ts → kernel.js（iife，无 dynamic chunks / hash 文件名）。
 * 与 app target 先后写入同一个 dev / dist 目录，因此 emptyOutDir=false。
 * 不引入 Svelte / DOM / Electron SDK。
 */
function kernelConfig() {
    return {
        resolve: {
            alias: {
                "@": resolve(__dirname, "src"),
            },
        },
        build: {
            outDir: outputDir,
            emptyOutDir: false,
            // SiYuan Kernel Plugin 由 Goja 执行。把异步生成器降级，避免
            // `for await` / `async function*` 导致 kernel.js 在启动阶段解析失败。
            target: "es2017",
            minify: true,
            sourcemap: isSrcmap ? 'inline' : false,
            reportCompressedSize: !isDev,

            lib: {
                entry: resolve(__dirname, "src/kernel.ts"),
                name: "KernelPlugin",
                fileName: () => "kernel.js",
                formats: ["iife"],
            },
            rollupOptions: {
                plugins: isDev ? [
                    persistKernelArtifact(),
                    watchExternalFiles(["src/kernel.ts", "src/kernel/**"])
                ] : [
                    persistKernelArtifact(),
                    // Clean up unnecessary files under dist dir（kernel 最后构建，zip 包含 kernel.js）
                    cleanupDistFiles({
                        patterns: ['i18n/*.yaml', 'i18n/*.md'],
                        distDir: outputDir
                    }),
                    zipPack({
                        inDir: './dist',
                        outDir: './',
                        outFileName: 'package.zip'
                    })
                ],

                // Kernel bundle 全部内联（仅 type-only `siyuan/kernel` 会被擦除）。
                external: [],

                output: {
                    entryFileNames: "kernel.js",
                },
            },
        },
        plugins: [
            rejectKernelRuntimeImports(),
            ...(isDev && env.SIYUAN_SKIP_DEV_DEPLOY !== '1' ? [devDeploymentMirror()] : []),
        ],
    };
}

/** Kernel bundle 只能使用 type-only `siyuan/kernel`，不得带入前端 SDK 或 Node builtin。 */
function rejectKernelRuntimeImports() {
    return {
        name: 'reject-kernel-runtime-imports',
        enforce: 'pre' as const,
        resolveId(id: string, importer?: string) {
            const ownSource = Boolean(importer && !importer.replace(/\\/g, '/').includes('/node_modules/'));
            if (id === 'siyuan' || (ownSource && nodeBuiltins.includes(id))) {
                throw new Error(`Kernel bundle cannot import runtime module "${id}" from ${importer ?? '<entry>'}`);
            }
            return null;
        }
    };
}

/**
 * App target：保留当前全部行为（src/index.ts / Svelte / yaml i18n / dev 部署 / CJS index.js /
 * inlineDynamicImports / assets / README / plugin.json / preview/icon / runtime/robot）。
 */
function appConfig() {
    return {
        resolve: {
            alias: {
                "@": resolve(__dirname, "src"),
            }
        },

        plugins: [
            ...(isDev ? [commonjsWatchCacheGuard()] : []),

            svelte({
                preprocess: vitePreprocess()
            }),

            vitePluginYamlI18n({
                inDir: 'public/i18n',
                outDir: `${outputDir}/i18n`
            }),

            viteStaticCopy({
                targets: [
                    { src: "asset", dest: "." },
                    {
                        src: "build/robot-electron/feishu-provider.cjs",
                        dest: "runtime/robot",
                        rename: { stripBase: true },
                    },
                    {
                        src: "build/robot-electron/qq-provider.cjs",
                        dest: "runtime/robot",
                        rename: { stripBase: true },
                    },
                    { src: "README*.md", dest: "." },
                    { src: "plugin.json", dest: "." },
                    { src: "preview.png", dest: "." },
                    { src: "icon.png", dest: "." }
                ],
            }),

            restoreKernelArtifact(),

            ...(isDev && env.SIYUAN_SKIP_DEV_DEPLOY !== '1' ? [devDeploymentMirror()] : []),
        ],

        define: {
            "process.env.DEV_MODE": JSON.stringify(isDev),
            "process.env.NODE_ENV": JSON.stringify(env.NODE_ENV)
        },

        build: {
            outDir: outputDir,
            // kernel.js 由 kernel target 写入同一目录，app target 不能清空它。
            emptyOutDir: false,
            minify: true,
            sourcemap: isSrcmap ? 'inline' : false,
            reportCompressedSize: !isDev,
            commonjsOptions: {
                transformMixedEsModules: true,
            },

            lib: {
                entry: resolve(__dirname, "src/index.ts"),
                fileName: "index",
                formats: ["cjs"],
            },
            rollupOptions: {
                plugins: [
                    ...(isDev ? [
                        ...(livereloadClientUrl ? [livereload({
                            watch: outputDir,
                            clientUrl: livereloadClientUrl,
                        })] : []),
                        {
                            name: 'watch-external',
                            async buildStart() {
                                const files = await fg([
                                    'public/i18n/**',
                                    './README*.md',
                                    './plugin.json'
                                ]);
                                for (let file of files) {
                                    this.addWatchFile(file);
                                }
                            }
                        }
                    ] : [])
                ],

                external: ["siyuan", "process", ...nodeBuiltins],

                output: {
                    entryFileNames: "[name].js",
                    // 思源插件 index.js 可能通过 data url/eval 注入渲染进程，
                    // 动态分块的 require 相对路径会失效，因此强制内联所有动态 import。
                    inlineDynamicImports: true,
                    assetFileNames: (assetInfo) => {
                        if (assetInfo.name === "style.css") {
                            return "index.css";
                        }
                        return assetInfo.name ?? "[name]-[hash][extname]";
                    },
                },
            },
        }
    };
}

const stableKernelArtifact = resolve(__dirname, "build/kernel/kernel.js");

/** Cache every successful Kernel bundle outside Vite's shared output directory. */
function persistKernelArtifact() {
    return {
        name: 'persist-kernel-artifact',
        writeBundle: {
            sequential: true,
            order: 'pre' as const,
            handler() {
                const generated = resolve(__dirname, outputDir, 'kernel.js');
                if (!fs.existsSync(generated)) return;
                fs.mkdirSync(resolve(__dirname, 'build/kernel'), { recursive: true });
                fs.copyFileSync(generated, stableKernelArtifact);
            },
        },
    };
}

/** App builds may prune kernel.js; restore the last successful Kernel artifact before dev deployment. */
function restoreKernelArtifact() {
    return {
        name: 'restore-kernel-artifact',
        writeBundle: {
            sequential: true,
            order: 'pre' as const,
            handler() {
                if (!fs.existsSync(stableKernelArtifact)) return;
                const target = resolve(__dirname, outputDir, 'kernel.js');
                fs.copyFileSync(stableKernelArtifact, target);
            },
        },
    };
}

function devDeploymentMirror() {
    let missingTargetLogged = false;
    return {
        name: 'dev-real-directory-deployment',
        enforce: 'post' as const,
        apply: 'build' as const,
        writeBundle: {
            sequential: true,
            order: 'post' as const,
            handler() {
                const result = syncDevDeployment();
                if (!result) {
                    if (!missingTargetLogged) {
                        console.log('[dev-deploy] No target configured; run pnpm dev:setup once.');
                        missingTargetLogged = true;
                    }
                    return;
                }
                missingTargetLogged = false;
                console.log(
                    `[dev-deploy] Synced real directory ${result.targetDir} `
                    + `(copied ${result.copied}, unchanged ${result.unchanged}, deleted ${result.deleted})`
                );
            }
        }
    };
}

function watchExternalFiles(patterns: string[]) {
    return {
        name: 'watch-external',
        async buildStart() {
            const files = await fg(patterns);
            for (const file of files) {
                this.addWatchFile(file);
            }
        }
    };
}

/**
 * @rollup/plugin-commonjs can restore a cached parent module before its virtual
 * `?commonjs-es-import` dependency's plugin metadata is restored.
 * Preload those virtual dependencies first, and only invalidate a parent when
 * the metadata is still absent. The rest of the watch cache remains reusable.
 */
function commonjsWatchCacheGuard() {
    return {
        name: 'commonjs-watch-cache-guard',
        enforce: 'pre' as const,
        apply: 'build' as const,
        async shouldTransformCachedModule(moduleInfo: {
            resolvedSources?: Record<string, { id?: string }>;
        }) {
            for (const resolved of Object.values(moduleInfo.resolvedSources ?? {})) {
                if (!resolved.id?.endsWith('?commonjs-es-import')) {
                    continue;
                }
                const wrappedModule = await this.load({ id: resolved.id });
                const commonjsMeta = (wrappedModule.meta as {
                    commonjs?: { resolved?: unknown };
                })?.commonjs;
                if (!commonjsMeta?.resolved) {
                    return true;
                }
            }
            return false;
        }
    };
}


/**
 * Clean up some dist files after compiled
 * @author frostime
 * @param options:
 * @returns 
 */
function cleanupDistFiles(options: { patterns: string[], distDir: string }) {
    const {
        patterns,
        distDir
    } = options;

    return {
        name: 'rollup-plugin-cleanup',
        enforce: 'post',
        writeBundle: {
            sequential: true,
            order: 'post' as const,
            async handler() {
                const fg = await import('fast-glob');
                const fs = await import('fs');
                // const path = await import('path');

                // 使用 glob 语法，确保能匹配到文件
                const distPatterns = patterns.map(pat => `${distDir}/${pat}`);
                console.debug('Cleanup searching patterns:', distPatterns);

                const files = await fg.default(distPatterns, {
                    dot: true,
                    absolute: true,
                    onlyFiles: false
                });

                // console.info('Files to be cleaned up:', files);

                for (const file of files) {
                    try {
                        if (fs.default.existsSync(file)) {
                            const stat = fs.default.statSync(file);
                            if (stat.isDirectory()) {
                                fs.default.rmSync(file, { recursive: true });
                            } else {
                                fs.default.unlinkSync(file);
                            }
                            console.log(`Cleaned up: ${file}`);
                        }
                    } catch (error) {
                        console.error(`Failed to clean up ${file}:`, error);
                    }
                }
            }
        }
    };
}
