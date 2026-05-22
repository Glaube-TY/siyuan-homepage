# Tech Stack

## Runtime & Platform
- **SiYuan Plugin API** (`siyuan` npm package) — the host environment; all plugin lifecycle, storage, tabs, and event bus come from this API
- **Target**: CommonJS bundle (`formats: ["cjs"]`) loaded by SiYuan's plugin loader

## Language & Framework
- **TypeScript** (strict mode off, `noUnusedLocals/Parameters` on) with ESNext target
- **Svelte 5** — UI components use `.svelte` files with `vitePreprocess()`; runes/reactivity follow Svelte 5 conventions
- **SCSS** — component styles use `.scss` files (sass-embedded); scoped per component

## Build System
- **Vite 6** with `@sveltejs/vite-plugin-svelte`
- Output: `dev/` (development) or `dist/` (production)
- Path alias: `@` → `src/`
- i18n YAML files processed by custom `yaml-plugin.js` → output as JSON
- Static assets copied via `vite-plugin-static-copy`
- Production build zips `dist/` into `package.zip` via `vite-plugin-zip-pack`

## Key Runtime Dependencies
| Library | Purpose |
|---|---|
| `echarts` + `echarts-wordcloud` | Charts and word cloud widgets |
| `howler` | Music player audio |
| `sortablejs` | Drag-and-drop widget layout |
| `swiper` | Carousel/slideshow widget |
| `quill` | Rich text sticky note widget |
| `mousetrap` | Keyboard shortcut handling |
| `dompurify` | HTML sanitization |
| `@floating-ui/dom` | Floating doc preview positioning |
| `tyme4ts` | Chinese calendar / lunar date calculations |
| `uapi-sdk-typescript` | Hot search / trending topics API |
| `crypto-js` | License/VIP verification |
| `svelte-multiselect` | Multi-select form component |

## Linting
- ESLint 9 flat config (`eslint.config.js`)
- `@typescript-eslint` for `src/**/*.ts`; `.svelte` and `.d.ts` files are excluded from linting
- `@typescript-eslint/no-explicit-any` is **off** (any is used freely throughout)

## Common Commands

```bash
# Development build with watch + livereload
npm run dev

# Production build → dist/ + package.zip
npm run build

# Lint
npm run lint
npm run lint:fix

# Create symlink from dist/ into SiYuan plugins folder (Windows, requires elevation)
npm run make-link-win

# Build + copy directly into SiYuan plugins folder
npm run make-install

# Bump version in package.json and plugin.json
npm run update-version
```

## i18n
- Source files: `public/i18n/zh_CN.json` and `en_US.json`
- Accessed at runtime via SiYuan's `this.i18n` plugin property
- Always add keys to **both** locale files when adding user-visible strings

## Plugin Data Storage
- All persistent data uses `plugin.saveData(filename, data)` / `plugin.loadData(filename)`
- Main config file: `homepageSettingConfig.json` (typed as `HomepageSettingConfig`)
- Widget configs: `widget-{id}.json` per widget block
- Layout: `widgetLayout.json`
