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
