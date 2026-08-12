# Development workflow

## Locate before reading

- If `.codegraph/` exists, use `codegraph explore` before `rg` or opening files to locate symbols, callers, and blast radius.
- Read the complete execution path touched by the change. Do not browse unrelated modules.

## Ponytail: minimum effective change

Use Ponytail `full` for every coding task. Stop at the first option that works:

1. Skip work that is not required now.
2. Reuse an existing helper, type, component, token, registry, or pattern.
3. Prefer the standard library.
4. Prefer browser, CSS, Svelte, TypeScript, or SiYuan native capabilities.
5. Prefer an already-installed dependency.
6. Only then add the smallest implementation that satisfies the request.

Fix root causes at the shared boundary instead of adding guards to individual callers. Prefer deletion over compatibility layers, wrappers, speculative configuration, and parallel implementations. Do not simplify away validation, write verification, data-loss protection, permissions, security, accessibility, or explicit user requirements.

## Small verification loop

- Run the narrowest existing verification that covers the change first.
- Add at most one small runnable check for new non-trivial logic; reuse an existing verifier when possible.
- Run typecheck, lint, and production build only when their scope is relevant to the change or before handoff.
- Do not launch browser or visual testing unless requested or the result cannot be verified otherwise.
- Before handoff, inspect the diff with Ponytail: remove unused files, one-use wrappers, dead exports, duplicate helpers, and speculative code.

## Performance boundaries

- Keep the production app bundle self-contained; `index.js` may run from a data URL, so do not disable `inlineDynamicImports` without a verified resource loader.
- Import charts from `src/utils/charts/echarts.ts`; register only the ECharts capabilities the project actually uses.
- Prefer modular or core third-party entry points. Do not import full `bundle` entry points when existing behavior uses only named modules.
- Put shared runtime helpers in `src/utils`; do not duplicate them in feature folders or keep internal legacy re-export paths.
- Keep non-critical startup work on the existing idle-task path and preserve unload cancellation, data validation, write verification, and failure isolation.
