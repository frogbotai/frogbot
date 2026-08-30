# UI Component Conventions

## Organization

- Keep reusable components flat in `src/components` and name files by intent.
- Components must not import chat, admin, or other domain code.
- Internal file placement and public exports are separate decisions. Add consumer APIs to `src/index.ts` explicitly.

## Components

- Preserve the accessible behavior and DOM structure of the Firmware source.
- Use Radix primitives for headless behavior and add only the package required by that component.
- Keep component props compatible with the underlying element or Radix primitive.
- Use local icon factories instead of external icon libraries.

## Styling

- Add one sibling CSS file per styled component and import it from `src/styles.css`.
- Use `fb-<component>` BEM blocks, `__element` parts, and `--modifier` states.
- Use existing theme, typography, color, and radius tokens whenever they cover a value.
- Do not add Tailwind, variant utilities, styling dependencies, component dark-mode selectors, or media-query theme overrides.
- Preserve external `className` values with plain string concatenation.

## Firmware Ports

- Treat the matching file in Firmware `packages/ui/src/elements` as the visual and interaction specification.
- Re-derive Firmware's utility styles as BEM CSS against FrogBot tokens rather than copying utility classes.
- Record every intentional visual or behavioral deviation in the implementation ticket.

## Verification

- Add focused behavior and class-name coverage.
- Verify keyboard interaction, focus behavior, light and dark theme token usage, package formatting, and the UI test project.
