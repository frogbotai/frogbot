# M2 Token Inventory

All color tokens contain complete `oklch(...)` values. Tokens are scoped to `[data-fb-ui]`.

## Palette

| Family | Steps | Purpose |
| --- | --- | --- |
| `--fb-neutral-*` | `0`, `50`, `100`, `200`, `300`, `500`, `700`, `900`, `1000` | Surfaces, text, and borders |
| `--fb-brand-*` | `100`, `300`, `500`, `600`, `700`, `900` | Primary actions, focus, and accents |
| `--fb-red-*` | `100`, `500`, `700` | Destructive states |
| `--fb-green-*` | `100`, `500`, `700` | Success states |
| `--fb-yellow-*` | `100`, `500`, `700` | Warning states |

## Semantic

| Group | Tokens |
| --- | --- |
| Core | `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground` |
| Actions | `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--accent`, `--accent-foreground` |
| Supporting | `--muted`, `--muted-foreground`, `--destructive`, `--destructive-foreground`, `--success`, `--success-foreground`, `--warning`, `--warning-foreground` |
| Controls | `--border`, `--input`, `--ring`, `--radius` |
| Sidebar | `--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-ring` |
| Radius | `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl` |

`--primary` and `--sidebar-primary` resolve directly to `--fb-brand-600`. Runtime overrides target semantic tokens; palette overrides are available when a complete scale is needed.

## Component Coverage

| Components | Required groups |
| --- | --- |
| Button, input | Actions, controls |
| Card, skeleton, tooltip | Core, supporting, controls |
| Select, dropdown menu, sheet | Core, actions, controls |
| Sidebar | Sidebar, controls |

No slated M2 component requires firmware's blue, cyan, orange, pink, purple, or teal scales.
