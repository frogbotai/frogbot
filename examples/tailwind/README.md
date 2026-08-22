# FrogBot Example: Tailwind CSS 4

This example adds Tailwind CSS 4 utilities to custom admin components while preserving the admin panel's base styles.

## Quick Start

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Open [http://localhost:3000/admin](http://localhost:3000/admin). The custom logo and navigation icon use Tailwind utilities and follow the admin panel's light and dark themes.

## How It Works

[`postcss.config.js`](./postcss.config.js) enables Tailwind's PostCSS plugin. [`tailwind.css`](<./src/app/(frogbot)/tailwind.css>) imports the theme and utility layers without preflight, then maps admin semantic tokens to Tailwind color utilities.

The custom components in [`TailwindBrand.tsx`](./src/components/TailwindBrand.tsx) use utilities such as `bg-admin-bg`, `text-admin-text`, and `border-admin-border`. The semantic token values change with the selected admin theme, so no separate dark-mode classes are required.

[`frogbot.config.ts`](./src/frogbot.config.ts) registers the components as the admin logo and icon. Run `pnpm generate:importmap` after changing component paths or exports.
