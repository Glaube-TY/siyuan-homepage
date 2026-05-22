# Project Structure

## Top-Level Layout

```
siyuan-homepage/
├── src/                  # All source code
├── public/i18n/          # Locale files (zh_CN.json, en_US.json)
├── asset/                # Static assets copied verbatim into dist/
│   ├── bannerImg/        # Default banner images
│   ├── clockImg/         # Clock face images
│   ├── fallingIcon/      # Falling particle images
│   ├── Icon/             # Weather and misc SVG icons
│   ├── mouseIcon/        # Custom cursor files
│   ├── music/            # Bundled audio files
│   └── musicPlayerIcon/  # Music player UI icons
├── scripts/              # Node.js build/dev helper scripts
├── dist/                 # Production build output (gitignored)
├── dev/                  # Development build output (gitignored)
├── plugin.json           # SiYuan plugin manifest
├── vite.config.ts        # Build configuration
├── svelte.config.js      # Svelte preprocessor config
├── eslint.config.js      # ESLint flat config
└── yaml-plugin.js        # Custom Vite plugin for i18n YAML→JSON
```

## Source Tree (`src/`)

```
src/
├── index.ts                        # Plugin entry point — PluginHomepage class
├── api.ts                          # Thin wrappers around SiYuan HTTP API calls
├── types/                          # Global TypeScript type declarations
│   ├── api.d.ts
│   └── index.d.ts
├── libs/                           # Shared utilities (not homepage-specific)
│   ├── const.ts                    # SiYuan block type constants
│   ├── dialog.ts                   # svelteDialog() helper
│   ├── promise-pool.ts             # Concurrency utility
│   ├── setting-utils.ts            # Plugin settings helpers
│   └── components/                 # Reusable UI components
│       ├── Form/                   # Form field components
│       ├── setting-panel.svelte
│       ├── SettingRow.svelte
│       └── SettingSection.svelte
├── components/
│   ├── tools/                      # Utility modules (no UI)
│   │   ├── advanced.ts             # VIP/license verification
│   │   ├── calendarCalculation.ts
│   │   ├── docIcon.ts
│   │   ├── floatingDoc.ts          # Floating preview singleton
│   │   ├── formatDate.ts
│   │   ├── getImage.ts
│   │   ├── getNotebooks.ts
│   │   ├── MD2HTML.ts
│   │   ├── openDocs.ts
│   │   ├── runtimeEnv.ts
│   │   └── statisticalAPI.ts
│   └── utils/
│       ├── sidebar/                # Dock sidebar panel
│       └── widgetBlock/            # Widget system (see below)
└── homepage/                       # Homepage UI
    ├── homepage.svelte             # Root homepage component
    ├── configLoader.ts             # Loads homepageSettingConfig.json
    ├── buttonRegistry.ts           # Quick-action button definitions
    ├── effects/                    # Visual effects (falling, mouse trails)
    ├── features/
    │   ├── emptyDocCleaner/        # Empty document cleanup feature
    │   └── templateCenter/         # Layout template management
    ├── header/                     # Stats bar and quick buttons
    ├── homepageSetting/            # Settings dialog (tabbed UI)
    │   ├── config.ts               # HomepageSettingConfig type + load/save
    │   ├── homepageSetting.svelte  # Settings root component
    │   ├── tabDefs.ts              # Tab definitions
    │   ├── types.ts
    │   └── sections/ tabs/ layout/ # Settings sub-panels
    ├── mobileHomepage/             # Mobile-specific homepage layout
    ├── style/                      # Global SCSS partials for homepage
    ├── templates/                  # Layout template types and defaults
    ├── topBanner/                  # Banner image drag and image handling
    └── utils/
        └── deviceProfile.ts        # Per-device profile management
```

## Widget System (`src/components/utils/widgetBlock/`)

```
widgetBlock/
├── WidgetBlock.ts              # WidgetBlock class — creates DOM block with 🎨⚙️ buttons
├── widgetMountRegistry.ts      # Registry mapping widget type keys → Svelte components
├── contentSetting.svelte       # "Content" settings dialog for a block
├── styleSetting.svelte         # "Style" settings dialog for a block
├── styleUtils.ts
├── shared/                     # Shared sub-components used across widgets
├── utils/
│   ├── block-creator.ts        # Creates new WidgetBlock instances
│   ├── block-size-handler.ts   # Handles col/row span sizing
│   ├── layout-handler.ts       # Drag-and-drop layout persistence
│   └── layout-shared.ts        # loadWidgetLayoutSettings() shared helper
└── widget/                     # One folder per widget type
    ├── {widgetName}/
    │   ├── {widgetName}.svelte  # Main widget component
    │   └── ...                  # Supporting .ts / .svelte / .scss files
    └── ...
```

### Adding a New Widget
1. Create `src/components/utils/widgetBlock/widget/{widgetName}/` with a root `.svelte` component
2. Register it in `widgetMountRegistry.ts` — add to `widgetRegistry` and `widgetNeedsPlugin` if it needs the plugin instance
3. Add the widget type key to the content-setting UI so users can select it
4. Add i18n display name to both locale files

## Conventions

- **Plugin entry**: `src/index.ts` exports `default class PluginHomepage extends Plugin`
- **Svelte components** receive `plugin` as a prop when they need SiYuan API access
- **Data persistence**: always use `plugin.saveData` / `plugin.loadData`; never use `localStorage` for plugin config
- **SiYuan API calls**: go through `src/api.ts` wrappers, not direct `fetch` calls
- **SCSS**: component-scoped styles live in the `.svelte` file's `<style lang="scss">` block; shared/global styles go in `src/homepage/style/`
- **Mobile vs desktop**: check `plugin.isMobile` or use `getFrontend()` from `siyuan`; mobile homepage is a separate component (`mobileHomepage.svelte`)
- **VIP gating**: check `plugin.ADVANCED` before enabling premium features; dispatch `homepage-advanced-ready` / `homepage-advanced-unavailable` custom events
