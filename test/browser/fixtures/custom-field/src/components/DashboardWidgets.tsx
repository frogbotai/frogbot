import type { WidgetServerProps } from 'frogbot';

import type { ActivityWidget, WelcomeWidget } from '../frogbot-types';

export function WelcomeWidgetComponent({ req, widgetData }: WidgetServerProps<WelcomeWidget>) {
  return (
    <section data-testid="welcome-widget">
      <h2>{widgetData?.heading || 'Welcome'}</h2>
      <p data-testid="welcome-widget-collections">{Object.keys(req.frogbot.collections).length}</p>
    </section>
  );
}

export function ActivityWidgetComponent({ req }: WidgetServerProps<ActivityWidget>) {
  return (
    <section data-testid="activity-widget">
      <h2>Recent activity</h2>
      <p data-testid="activity-widget-collections">{Object.keys(req.frogbot.collections).length}</p>
    </section>
  );
}
