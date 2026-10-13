# @frogbotai/ui

Reusable themed components for FrogBot interfaces.

Import primitives and composites from `@frogbotai/ui`, and load `@frogbotai/ui/styles.css` once in the application. Components support light and dark themes without a styling framework. All styles are in the `frogbot` cascade layer, so application CSS and Tailwind CSS utilities override them; see the [installation](../../docs/chat/ui-installation.mdx) and [theming](../../docs/chat/ui-theming.mdx) docs.

Inside a FrogBot admin, import admin hooks, fields and components (`useField`, `FieldLabel`, `MoneyField`) from `@frogbotai/ui/admin` and server components from `@frogbotai/ui/admin/rsc`; `@frogbotai/next/css` loads their styles. Only these entries need the admin's optional peers, including `frogbot`; the rest of the package needs none of them.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for component organization, styling, dependency, and Firmware-port conventions.
