# Design system snapshot

FrogBot's theme matches the designer's Figma file, [FrogBot Design System](https://www.figma.com/design/SX483mR8PAHG5zZ1GL4pgi). `figma.json` is a snapshot of its variables (primitives, color roles in light and dark, spacing, radius) and text styles. `test/unit/ui/figmaParity.spec.ts` fails when `src/theme.css` stops matching it.

| Figma                           | theme.css                                                   |
| ------------------------------- | ----------------------------------------------------------- |
| `Primitives/green/400`          | `--green-400`                                               |
| `Color/primary`, Light and Dark | `--primary` in the light block and in `[data-theme="dark"]` |
| `App/H1` to `App/Small`         | `--text-4xl` to `--text-xs` and `--fb-text-*--line-height`  |
| `Spacing/spacing/1`             | `--spacing`                                                 |
| `Radius/radius/*`               | `--fb-radius-*`                                             |

`Marketing/*` text styles are for the marketing site, not core.

## When the designer changes Figma

1. Run `export-figma.js` with the Figma MCP `use_figma` tool on file `SX483mR8PAHG5zZ1GL4pgi`, and save its result as `figma.json`.
2. Run `pnpm test:unit test/unit/ui/figmaParity.spec.ts`. Each failure names the token and the Figma value.
3. Update `src/theme.css` until the test passes. A Figma role that theme.css lacks is new: add it, and point the admin tokens that fit at it.
4. A difference kept on purpose goes in `knownDifferences` in the test, with its reason. The test fails if the list is out of date.
