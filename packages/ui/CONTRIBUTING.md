# UI Component Conventions

Read the [root contribution guide](../../CONTRIBUTING.md) first for shared coding, blank-line, Firmware parity, color-token, and verification rules. This file adds package-specific conventions.

## Organization

- Keep reusable components flat in `src/components` and name files by intent.
- Components must not import chat, admin, or other domain code.
- Internal file placement and public exports are separate decisions. Add consumer APIs to `src/index.ts` explicitly.
- The classification test governs the contents of `src/exports/{client,shared,rsc}/index.ts`.

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
- Define tokens only in the `@layer theme.frogbot` `:root` block in `src/styles.css`, with `light-dark()` for values that change with the mode. Don't declare tokens on `[data-fb-ui]` or any other wrapper.
- Don't add top-level `@layer` order statements outside `src/layers.css`.

## Firmware Ports

- Treat the matching file in Firmware `packages/ui/src/elements` as the visual and interaction specification.
- Re-derive Firmware's utility styles as BEM CSS against FrogBot tokens rather than copying utility classes.
- Record every intentional visual or behavioral deviation in the implementation ticket.

## Verification

- Add focused behavior and class-name coverage.
- Verify keyboard interaction, focus behavior, light and dark theme token usage, package formatting, and the UI test project.
