import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
    // 全局忽略
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            'dev/**',
            'scripts/elevate.ps1',
            '**/*.svelte',
            '**/*.d.ts',
        ],
    },

    // 基础 JS 配置（适用于所有 JS 文件，宽松规则）
    {
        files: ['**/*.js'],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es2021,
            },
        },
        rules: {
            ...js.configs.recommended.rules,
            // JS 文件宽松处理
            'no-undef': 'off',
            'no-unused-vars': 'warn',
            'no-empty': 'warn',
        },
    },

    // 基础 JS 配置（适用于所有 JS/TS 文件）
    js.configs.recommended,

    // TypeScript 配置（适用于 src 目录下的 TS 文件）
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                project: './tsconfig.json',
                tsconfigRootDir: import.meta.dirname,
            },
            globals: {
                ...globals.browser,
                ...globals.es2021,
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            // 保守规则：先不强制要求处理所有 any
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            // 历史代码兼容：允许 this 别名
            '@typescript-eslint/no-this-alias': 'off',
            // 历史代码兼容：允许 case 块中的声明
            'no-case-declarations': 'off',
            // TypeScript 项目不需要 no-undef，类型检查会处理
            'no-undef': 'off',
            // 历史代码兼容：允许 @ts-ignore
            '@typescript-eslint/ban-ts-comment': 'off',
            // 历史代码兼容：允许 Object 类型
            '@typescript-eslint/no-wrapper-object-types': 'off',
            // 历史代码兼容：宽松处理正则
            'no-misleading-character-class': 'off',
            'no-useless-escape': 'off',
        },
    },

    // Node 脚本配置（scripts 目录使用 Node 环境，不启用 TS type-aware linting）
    {
        files: ['scripts/**/*.js', 'yaml-plugin.js'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.es2021,
            },
        },
    },

    // Vite 配置文件（不启用 TS type-aware linting）
    {
        files: ['vite.config.ts'],
        languageOptions: {
            parser: tsParser,
            globals: {
                ...globals.node,
                ...globals.es2021,
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },
];
