import { createPagerduty } from '@frogbotai/piece-pagerduty';
import { expectTypeOf } from 'vitest';

const pagerduty = createPagerduty({ auth: { apiKey: 'key' } });

const _incident = pagerduty.createIncident({
  input: { fromEmail: 'oncall@example.com', serviceId: 'service', title: 'Outage' },
});

expectTypeOf<
  Parameters<typeof pagerduty.createIncident>[0]['input']['serviceId']
>().toEqualTypeOf<string>();
expectTypeOf<Parameters<typeof pagerduty.createIncident>[0]['input']['urgency']>().toEqualTypeOf<
  'high' | 'low' | undefined
>();
expectTypeOf<Awaited<typeof _incident>['id']>().toEqualTypeOf<string>();
expectTypeOf<Awaited<typeof _incident>['status']>().toEqualTypeOf<string | undefined>();

const _createIncidentRejectsGetIncidentInput = () =>
  // @ts-expect-error createIncident does not accept getIncident input
  pagerduty.createIncident({ input: { incidentId: 'incident' } });

const _resolved = pagerduty.resolveIncident({
  input: { incidentId: 'incident', fromEmail: 'oncall@example.com' },
});

expectTypeOf<Awaited<typeof _resolved>['id']>().toEqualTypeOf<string>();

expectTypeOf<keyof typeof pagerduty.triggers>().toEqualTypeOf<
  'newIncident' | 'incidentResolved' | 'incidentAcknowledged'
>();
expectTypeOf(pagerduty.triggers.incidentResolved.type).toEqualTypeOf<'webhook'>();
