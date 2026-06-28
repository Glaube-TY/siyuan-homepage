import { resolve } from "path"
import { builtinModules } from "module"
import { defineConfig } from "vite"
import { viteStaticCopy } from "vite-plugin-static-copy"
import livereload from "rollup-plugin-livereload"
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte"
import zipPack from "vite-plugin-zip-pack";
import fg from 'fast-glob';

import vitePluginYamlI18n from './yaml-plugin';

const env = process.env;
const isSrcmap = env.VITE_SOURCEMAP === 'inline';
const isDev = env.NODE_ENV === 'development';

const outputDir = isDev ? "dev" : "dist";
const nodeBuiltins = Array.from(new Set([
    ...builtinModules,
    ...builtinModules.map((name) => `node:${name}`),
]));

console.log("isDev=>", isDev);
console.log("isSrcmap=>", isSrcmap);
console.log("outputDir=>", outputDir);

export default defineConfig({
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),
        }
    },

    plugins: [
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
                    src: "build/chat-action-feishu-gateway/feishu-gateway.mjs",
                    dest: "scripts/chat-action-feishu-gateway",
                    rename: { stripBase: true },
                },
                { src: "README*.md", dest: "." },
                { src: "plugin.json", dest: "." },
                { src: "preview.png", dest: "." },
                { src: "icon.png", dest: "." }
            ],
        }),

    ],

    define: {
        "process.env.DEV_MODE": JSON.stringify(isDev),
        "process.env.NODE_ENV": JSON.stringify(env.NODE_ENV)
    },

    build: {
        outDir: outputDir,
        emptyOutDir: false,
        minify: true,
        sourcemap: isSrcmap ? 'inline' : false,
        commonjsOptions: {
            transformMixedEsModules: true,
        },

        lib: {
            entry: resolve(__dirname, "src/index.ts"),
            fileName: "index",
            formats: ["cjs"],
        },
        rollupOptions: {
            // Vite/Rollup watch cache can corrupt CommonJS transform state for the Feishu SDK's nested axios files.
            cache: isDev ? false : undefined,
            plugins: [
                ...(isDev ? [
                    livereload(outputDir),
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
                ] : [
                    // Clean up unnecessary files under dist dir
                    cleanupDistFiles({
                        patterns: ['i18n/*.yaml', 'i18n/*.md'],
                        distDir: outputDir
                    }),
                    zipPack({
                        inDir: './dist',
                        outDir: './',
                        outFileName: 'package.zip'
                    })
                ])
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
});


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
