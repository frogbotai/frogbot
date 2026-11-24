# Admin design

Docs: https://docs.frogbot.ai/custom-components/dashboard and https://docs.frogbot.ai/chat/ui-theming

Read this before you choose a collection's fields, columns and views, or build a dashboard widget, custom view or custom field. The aim is an app that looks like a calm, finished product in light and dark, closer to Asana than to a database browser.

## Start from the person

Before you pick a field type or a component, decide for each screen:

1. **Who opens it, and what for.** One sentence: "The owner checks which invoices wait for approval and approves them."
2. **What they look at first.** That goes at the top: a headline number, the waiting items, or the newest videos.
3. **The one action.** One primary button per screen. Everything else is secondary or in a menu.
4. **What they read but don't edit.** Saved stats, AI results and system facts are shown as text, never as inputs.

Work these out from the request, the data, the collection names and the optional follow-up answer from [FIRST-APP.md](FIRST-APP.md#1-ask-one-question). Don't ask design questions on top of that; pick the sensible default and build it.

## Choose fields by what the text is

| What it holds                                                | Use                                                                                       |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| A name, title or code, under about 60 characters             | `text`                                                                                    |
| A sentence or more: summary, lead, bio, notes                | `textarea`, never `text`                                                                  |
| Formatted prose people write                                 | `richText`                                                                                |
| Markdown an agent writes, such as a report                   | `textarea` hidden from the form, shown with `ReportView` in a custom field or view        |
| Money, percent, rating, duration, URL                        | the field kinds: `moneyField`, `percentField`, `ratingField`, `durationField`, `urlField` |
| A fixed set of states                                        | `select`, shown with `StatusBadge`                                                        |
| A picture that is the point: product, photo, video thumbnail | `upload` with `preview: 'large'`                                                          |
| A thumbnail that is only a URL, such as a YouTube image      | `text` hidden from the form, shown with `Media` in a custom field                         |
| One saved settings record                                    | a global, not a collection with one row                                                   |

## Read-only is display, not a grey input

A number, date or text the system saves and people only read (subscriber counts, scores, last synced, AI summaries) never shows as a disabled input: a `readOnly` field alone still renders its greyed-out input. Give the field a custom `admin.components.Field` that renders `FactList`, `Fact` and `Value`, and keep it in the sidebar with the other facts the system writes:

```tsx
// src/components/SubscribersField.tsx
'use client';

import { Fact, FactList, Value } from '@frogbotai/ui';
import { useField } from '@frogbotai/ui/admin';
import type { NumberFieldClientProps } from 'frogbot';

export const SubscribersField = ({ field, path }: NumberFieldClientProps) => {
  const { value } = useField<number>({ path });

  return (
    <FactList layout="stacked">
      <Fact label={typeof field.label === 'string' ? field.label : 'Subscribers'}>
        <Value format="compact" value={value} />
      </Fact>
    </FactList>
  );
};
```

```ts
{ name: 'subscribers', type: 'number', admin: { readOnly: true, position: 'sidebar', components: { Field: '/components/SubscribersField#SubscribersField' } } }
```

## Pictures

Every image in an upload field opens full size when clicked. The thumbnail beside the file name stays small, which suits logos and attachments. When people open the record to look at the picture (a product, a photo, a video), give the field `preview: 'large'` and put it first in the form:

```ts
{ name: 'thumbnail', type: 'upload', relationTo: 'media', preview: 'large' }
```

A report shows images the app serves (`/api/media/file/...`) inline; an image on another site shows as a link, so opening a report never loads a third-party server.

## Default view fits the job

The first entry in `admin.views` is what people see first, so pick it from what they look at:

- Videos, images, products or anything with a picture: `gallery` first.
- Work moving through stages: `board` first, grouped by the stage.
- Things with dates people plan around: `calendar` or `timeline` first.
- Records people scan and compare: `list` first, with 4 to 6 `defaultFields`.

A list view must still be in `admin.views`; it just doesn't have to be first when another view fits better.

## Components

Use `@frogbotai/ui` before writing markup. Every component reads the theme tokens, so it follows the app's colours and dark mode with no wrapper. Your own CSS is for layout only (grid, gap, alignment).

### Display: show saved data

| Job                                     | Component                   | Example                                                                               |
| --------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------- |
| Format one number, amount, date or time | `Value`                     | `<Value format="currency" value={8500} />` gives $8,500; formats also `formatValue()` |
| A headline number with change and trend | `Stat`                      | `<Stat label="Revenue" value="$48,200" change={0.12} trend={weekly} />`               |
| A row of headline numbers               | `StatGrid`                  | `<StatGrid columns={3} bordered>` around `Stat`s                                      |
| A tiny trend line in a cell or stat     | `Sparkline`                 | `<Sparkline data={[3, 5, 4, 8]} />`                                                   |
| A line or bar chart                     | `Chart`                     | `<Chart type="bar" labels={weeks} series={[{ name: 'Hours', values }]} />`            |
| Label and value pairs for a record      | `FactList`, `Fact`          | `<FactList><Fact label="Owner">…</Fact></FactList>`                                   |
| One state from a fixed set              | `StatusBadge`               | `<StatusBadge tone="warning">Needs approval</StatusBadge>`                            |
| A person or agent                       | `PersonChip`                | `<PersonChip name="Jordan Reyes" email={email} />`, `agent` for an AI agent           |
| A linked record                         | `RecordChip`                | `<RecordChip label="INV-2094" href={url} />`                                          |
| A score or progress                     | `Meter`                     | `<Meter value={82} label="Fit score" showValue />`                                    |
| An image or video thumbnail             | `Media`                     | `<Media src={thumb} alt={title} badge="12:04" />`                                     |
| A long text cut to a few lines          | `ReadMore`                  | `<ReadMore lines={2}>{summary}</ReadMore>`                                            |
| An id, URL or key people copy           | `CopyValue`                 | `<CopyValue value={key} mask />`                                                      |
| A markdown report an agent wrote        | `ReportView`                | `<ReportView>{doc.report}</ReportView>`                                               |
| What happened to a record, newest first | `ActivityFeed`              | `<ActivityFeed items={events} />`                                                     |
| A user or agent picture                 | `UserAvatar`, `AgentAvatar` | `<UserAvatar name={name} email={email} />`                                            |

### Structure: lay out a screen

| Job                                       | Component                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Title, one line of context and the action | `PageHeader`: `<PageHeader title="Invoices" description="Waiting for a person: 2" actions={…} />` |
| A grouped block on a dashboard            | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`                               |
| A short list of rows                      | `List`, `ListItem`                                                                                |
| Nothing to show yet                       | `EmptyState`: says what will appear and the one action that adds it                               |
| Switch between parts of one record        | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`                                                  |
| A message that needs attention            | `Alert`                                                                                           |
| Loading                                   | `Skeleton`                                                                                        |
| Actions                                   | `Button`                                                                                          |

A small label that isn't a status (a tag, a count) is a `Badge`. A status is always a `StatusBadge` with a tone: `success` for done, `warning` for waiting on someone, `danger` for failed, `info` for in progress, `neutral` for draft.

Don't copy FrogBot's `fb-*` class names into your markup: they are internal and change without notice.

## Styling rules

- Colours come from the theme tokens: `--color-bg`, `--color-bg-secondary`, `--color-text`, `--color-text-secondary`, `--color-border`, and for status `--color-text-success`, `--color-text-warning`, `--color-text-danger`. They switch with the theme.
- No hex, `rgb()` or named colours. No font sizes: text is already 14px. A headline number is a `Stat`; if text must be larger, use `font-size: var(--fb-text-2xl)`, never px or rem.
- No hand-drawn cards (a `div` with your own border, radius and shadow): use `Card`.
- When the owner asks for their own brand look, set the tokens on `:root` (dark values on `[data-theme='dark']`) instead of colouring components one by one. Unlayered CSS already beats FrogBot's styles, so never use `!important`. See [override FrogBot styles](https://docs.frogbot.ai/chat/ui-theming#override-frogbot-styles).

## Words on screen

- Give each collection an `admin.description` in plain words for the person, such as "Orders customers placed, newest first". Never developer notes, CLI commands or field names.
- Numbers and dates go through `Value`: "1.2M", "$4,120", "yesterday", not `1203344` or an ISO timestamp.
- An empty value is blank in a list and a dash in a record, never "<No title>" or "null".
- Labels are sentence case and short: "Due", not "Due Date Timestamp".

## Don't

- Gradients, glows, glass panels or emoji as decoration.
- Disabled inputs to show saved values.
- Long text in a one-line `text` field.
- More than one filter bar, or a second toolbar above the view's own.
- A collection that only ever has one record.
- Raw markdown in a textarea for people to read.

## Plumbing fields

Fields code needs but people don't act on (external ids, sync cursors, import batches, AI metadata, internal flags) stay out of sight:

- `admin: { disabled: true }` hides one from every admin surface. To keep it filterable, hide it per area: `admin: { disabled: { field: true, column: true } }`.
- If people must still edit it now and then, put it at the end of the form in a `collapsible` with `admin: { initCollapsed: true }` instead.
- Set `useAsTitle`, and give the list view 4 to 6 `defaultFields`, the columns people scan (see [COLLECTIONS.md](COLLECTIONS.md)). There is no `defaultColumns`.

## Example widget

The week's revenue with its trend, and the three invoices waiting for approval:

```tsx
// src/components/InvoicesThisWeek.tsx
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  List,
  ListItem,
  Stat,
  StatusBadge,
  Value,
} from '@frogbotai/ui';
import type { WidgetServerProps } from 'frogbot';

export async function InvoicesThisWeek({ req }: WidgetServerProps) {
  const waiting = await req.frogbot.find({
    collection: 'invoices',
    where: { status: { equals: 'needs-approval' } },
    sort: '-createdAt',
    limit: 3,
    overrideAccess: false,
    req,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Waiting for approval</CardTitle>
      </CardHeader>
      <CardContent>
        <Stat
          label="Total waiting"
          value={
            <Value
              format="currency"
              value={waiting.docs.reduce(
                (total, invoice) => total + Number(invoice.amount ?? 0),
                0,
              )}
            />
          }
        />
        {waiting.docs.length ? (
          <List>
            {waiting.docs.map((invoice) => (
              <ListItem
                key={invoice.id}
                title={String(invoice.number)}
                meta={<StatusBadge tone="warning">Needs approval</StatusBadge>}
              />
            ))}
          </List>
        ) : (
          <EmptyState
            size="compact"
            title="Nothing waiting"
            description="New invoices over your limit show here."
          />
        )}
      </CardContent>
    </Card>
  );
}
```

Register it in `admin.dashboard.widgets` and place it first in `defaultLayout`:

```ts
widgets: [{ slug: 'invoices-this-week', Component: '/components/InvoicesThisWeek#InvoicesThisWeek', maxWidth: 'medium' }],
defaultLayout: [{ widgetSlug: 'invoices-this-week', width: 'medium' }, { widgetSlug: 'activity', width: 'full' }],
```

For a plain short list, use the built-in `collection-query` widget before writing your own. Its rows show the title, the first select and first number from the list view's `defaultFields`, and the sort field's date when it is one, red once a due date passes. When the collection sets `admin.useAsDone`, each row gets a check circle so people can tick tasks off from the dashboard. Sort by the date people plan around, such as `dueDate` or `closeDate`.
