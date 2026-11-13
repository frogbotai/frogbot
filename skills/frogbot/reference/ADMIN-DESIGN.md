# Admin design

Docs: https://docs.frogbot.ai/custom-components/dashboard and https://docs.frogbot.ai/chat/ui-theming

Read this before you build a dashboard widget, a custom view or field, or decide what a collection shows. The aim is an app that looks like a product, not a database browser, in light and dark.

## Build order

1. A built-in widget or view: the `collection-query` widget for a short filtered list, a `board`, `gallery`, `calendar` or `timeline` view for a collection. See [ADVANCED.md](ADVANCED.md#first-screen-and-navigation) and [COLLECTIONS.md](COLLECTIONS.md).
2. A custom component built from `@frogbotai/ui`: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `List`, `ListItem`, `Badge`, `Button`, `Tabs`, `Alert`, `Avatar` and `Skeleton`. They follow the admin's theme with no wrapper.
3. Your own CSS, for layout only (grid, gap, alignment).

Don't copy FrogBot's `fb-*` class names into your markup: they are internal and change without notice. Use the component instead.

## Styling rules

- Colours come from the semantic tokens: `--color-bg`, `--color-bg-secondary`, `--color-text`, `--color-text-secondary`, `--color-border`, and for status `--color-text-success`, `--color-text-warning`, `--color-text-danger`. They switch with the theme.
- No hex, `rgb()` or named colours. No font sizes: text is already 14px. For a headline number, put it in `CardTitle`; if it must be larger, use `font-size: var(--fb-text-2xl)`, never px or rem.
- No hand-drawn cards (a `div` with your own border, radius and shadow): use `Card`.
- A status is a `Badge` (`success`, `destructive`, `outline`), not coloured text.
- When the owner asks for their own brand look, set the tokens on `:root` (dark values on `[data-theme='dark']`) instead of colouring components one by one. Unlayered CSS already beats FrogBot's styles, so never use `!important`. See [override FrogBot styles](https://docs.frogbot.ai/chat/ui-theming#override-frogbot-styles).

## Plumbing fields

Fields code needs but people don't act on (external ids, sync cursors, import batches, AI scores and metadata, internal flags) stay out of sight:

- `admin: { disabled: true }` hides one from every admin surface. To keep it filterable, hide it per area: `admin: { disabled: { field: true, column: true } }`.
- If people must still edit it now and then, put it at the end of the form in a `collapsible` with `admin: { initCollapsed: true }` instead.
- Set `useAsTitle`, and give a list 4 to 6 `defaultColumns`, the ones people scan.

## First screen

- Ask what people open the app to do, and put that first in `admin.dashboard.defaultLayout`.
- One primary action per screen.
- Give each collection an `admin.description` in plain words, such as "Orders customers placed, newest first".

## Example widget

A count and the three newest rows, with no stylesheet:

```tsx
// src/components/OrdersThisWeek.tsx
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  List,
  ListItem,
} from '@frogbotai/ui';
import type { WidgetServerProps } from 'frogbot';

export async function OrdersThisWeek({ req }: WidgetServerProps) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const orders = await req.frogbot.find({
    collection: 'orders',
    where: { createdAt: { greater_than: weekAgo } },
    sort: '-createdAt',
    limit: 3,
    overrideAccess: false,
    req,
  });

  return (
    <Card>
      <CardHeader>
        <CardDescription>Orders this week</CardDescription>
        <CardTitle>{orders.totalDocs}</CardTitle>
      </CardHeader>
      <CardContent>
        <List>
          {orders.docs.map((order) => (
            <ListItem
              key={order.id}
              title={String(order.customer)}
              meta={
                <Badge variant={order.status === 'paid' ? 'success' : 'outline'}>
                  {String(order.status)}
                </Badge>
              }
            />
          ))}
        </List>
      </CardContent>
    </Card>
  );
}
```

Register it in `admin.dashboard.widgets` and place it in `defaultLayout`:

```ts
widgets: [{ slug: 'orders-this-week', Component: '/components/OrdersThisWeek#OrdersThisWeek', maxWidth: 'medium' }],
defaultLayout: [{ widgetSlug: 'orders-this-week', width: 'medium' }, { widgetSlug: 'activity', width: 'full' }],
```
