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
        <Stat label="Total waiting" value={<Value format="currency" value={sum(waiting.docs)} />} />
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

function sum(docs: Record<string, unknown>[]) {
  return docs.reduce((total, doc) => total + Number(doc.amount ?? 0), 0);
}
