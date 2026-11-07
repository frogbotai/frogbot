# UI Component Conventions

Read the [root contribution guide](../../CONTRIBUTING.md) first for shared coding, blank-line, Firmware parity, color-token, and verification rules. This file adds package-specific conventions.

## Organization

- Keep reusable components flat in `src/components` and name files by intent.
- Components must not import chat, admin, or other domain code.
- Internal file placement and public exports are separate decisions. Add consumer APIs to `src/index.ts` explicitly.
- The classification test governs the Payload re-exports in `src/admin/exports/{client,shared,rsc}.ts`.
- `src/nav` holds the app sidebar and never imports Payload. It reads links, the current path, navigation and preferences from `NavAdapterProvider`; `src/admin/elements/Nav` fills that adapter from Payload and keeps the Payload-only sections and restyles.

## Admin

- `src/admin` holds FrogBot's admin and the curated Payload names, mirroring Payload's folders (`elements`, `fields`, `graphics`, `views`). Only it imports `@payloadcms/*`, `payload` or `frogbot` values, and nothing outside it imports it.
- Admin code never imports `next`, `@payloadcms/next` or `@frogbotai/next`. Read the URL with Payload's `useRouter()`, `usePathname()` and `useSearchParams()`, and on the server call the view's `server.notFound()` or `server.redirect()` (`req.server` where only the request reaches).
- Export client components from `src/admin/exports/client.ts` (`./admin`) and server components from `src/admin/exports/rsc.ts` (`./admin/rsc`). Inside `packages/ui`, import other UI modules by relative path.
- Admin CSS may also use Payload's `--spacer-*` and `--radius-*` and style Payload's markup. Files imported only from CSS (Nav, Sign-in, Settings, Connections) are listed in `src/admin/styles.css`.

## Components

- Preserve the accessible behavior and DOM structure of the Firmware source.
- Use Radix primitives for headless behavior and add only the package required by that component.
- Keep component props compatible with the underlying element or Radix primitive.

## Styling

- Add one sibling CSS file per styled component and import it from `src/styles.css`.
- Use `fb-<component>` BEM blocks, `__element` parts, and `--modifier` states.
- Use existing theme, typography, color, and radius tokens whenever they cover a value.
- Do not add Tailwind, variant utilities, styling dependencies, component dark-mode selectors, or media-query theme overrides.
- Preserve external `className` values with plain string concatenation.
- Wrap every rule in a new CSS file in `@layer frogbot { … }`.
- Define non-color tokens only in the `@layer theme.frogbot` `:root` block in `src/styles.css`. Colors use the [color tokens](../../CONTRIBUTING.md#domain-rules); dark mode comes from them, never from `light-dark()` or `[data-theme]` selectors in component CSS.
- Don't add top-level `@layer` order statements outside `src/layers.css`.

## Firmware Ports

- Treat the matching file in Firmware `packages/ui/src/elements` as the visual and interaction specification.
- Re-derive Firmware's utility styles as BEM CSS against FrogBot tokens rather than copying utility classes.
- Record every intentional visual or behavioral deviation in the implementation ticket.

## Verification

- Add focused behavior and class-name coverage.
- Verify keyboard interaction, focus behavior, light and dark theme token usage, package formatting, and the UI test project.

## Icons

The set in `src/icons/icons/` is one style. A new icon matches it, and a designer's redraw keeps the export name, because the kebab name (`calendar`, `shopping-cart`) is public API in `admin.icon`.

### Style

- Open strokes in `currentColor`, round caps and joins, no fills. Filled icons are brand marks or a recorded exception in `test/__helpers/shared/icons.ts`.
- New icons use a 20×20 grid (`viewBox="0 0 20 20"`). The stroke comes from the grid: `IconBase` draws 10% of it, so 2 at 20. Don't pass a stroke width.
- Keep the path's centre line inside 1.67 to 18.33, so the painted edge leaves 0.67 on every side and the shape is centred.
- Draw with `path` only, never `circle` or `rect`, and round corners with continuous curves, as in `FolderIcon` and `HomeIcon`.
- Most line icons start from [Hugeicons](https://github.com/hugeicons/hugeicons)' free stroke-rounded set (MIT, see `src/icons/LICENSE-hugeicons.md`): its 24-grid paths scaled by 5/6 land on this grid and weight. Draw your own in the same style when it has no fit.
- Check a new icon at 16, 20 and 48px, light and dark. Details that close up at 16px need simplifying: drop the detail (dots, inner bands, extra legs) rather than shrink the shape.

### Adding an icon

1. Add `src/icons/icons/<Name>Icon.ts`: export the `IconNode` as `<name>Icon` and default-export `createLucideIcon('<Name>Icon', <name>Icon, undefined, '0 0 20 20')`.
2. Export it from `src/icons/index.ts`, in alphabetical order.
3. Add `'<Name>Icon'` to `adminIconExports` in `packages/frogbot/src/admin/icons.ts`, so `admin.icon: '<name>'` validates. The registry test fails until both lists match.
4. Add the name to `iconNames` in `test/ui/ui/icons/icons.spec.tsx`. The line-weight test then checks it, and `test/browser/iconGeometry.browser.spec.ts` checks it stays inside its box and is centred. The few older icons drawn off-centre on purpose are recorded in `offCentreIcons` in `test/__helpers/shared/icons.ts`; a new icon doesn't go there, it gets centred.
