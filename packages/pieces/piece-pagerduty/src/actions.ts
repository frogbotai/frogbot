import { type PieceActionDefinition, type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { PagerdutyClient } from './client.js';

const incident = z.object({ id: z.string(), status: z.string().optional() }).passthrough();
const incidentOutput = incident;
const incidentResponse = z.object({ incident: incidentOutput });
const servicesResponse = z.object({
  services: z.array(z.object({ id: z.string(), name: z.string() })),
  more: z.boolean(),
});
const fromEmail = z.email().meta({ label: 'From email' });
const incidentId = z.string().min(1).meta({ label: 'Incident ID' });

const createIncidentInput = z.object({
  fromEmail,
  serviceId: z.string().min(1).meta({ label: 'Service' }),
  title: z.string().min(1),
  urgency: z.enum(['high', 'low']).default('high'),
  details: z.string().optional(),
  incidentKey: z.string().optional(),
  assigneeIds: z.array(z.string()).optional(),
  priorityId: z.string().optional(),
  conferenceNumber: z.string().optional(),
  conferenceUrl: z.url().optional(),
});

export const createIncident = {
  slug: 'createIncident',
  description: 'Create a PagerDuty incident.',
  input: createIncidentInput,
  output: incidentOutput,
  idempotent: false,
  options: {
    serviceId: async ({ client }: { client: PagerdutyClient }) => {
      const services: Array<{ id: string; name: string }> = [];
      let offset = 0;
      let more = true;

      while (more) {
        const response = servicesResponse.parse(
          await client.request({
            method: 'GET',
            path: '/services',
            query: { limit: '100', offset: String(offset) },
          }),
        );

        services.push(...response.services);
        more = response.more;
        offset += 100;
      }

      return services.map(({ id, name }) => ({ label: name, value: id }));
    },
  },
  async run({
    input,
    client,
  }: PieceRunArgs<z.output<typeof createIncidentInput>, object, PagerdutyClient>) {
    const payload: Record<string, unknown> = {
      type: 'incident',
      title: input.title,
      service: { id: input.serviceId, type: 'service_reference' },
      urgency: input.urgency,
    };

    if (input.details) payload.body = { type: 'incident_body', details: input.details };
    if (input.incidentKey) payload.incident_key = input.incidentKey;
    if (input.assigneeIds?.length) {
      payload.assignments = input.assigneeIds.map((id) => ({
        assignee: { id, type: 'user_reference' },
      }));
    }
    if (input.priorityId) payload.priority = { id: input.priorityId, type: 'priority_reference' };
    if (input.conferenceNumber || input.conferenceUrl) {
      payload.conference_bridge = {
        ...(input.conferenceNumber ? { conference_number: input.conferenceNumber } : {}),
        ...(input.conferenceUrl ? { conference_url: input.conferenceUrl } : {}),
      };
    }

    const response = incidentResponse.parse(
      await client.request({
        method: 'POST',
        path: '/incidents',
        fromEmail: input.fromEmail,
        body: { incident: payload },
      }),
    );

    return response.incident;
  },
} satisfies PieceActionDefinition<
  typeof createIncidentInput,
  typeof incidentOutput,
  object,
  PagerdutyClient
>;

const listIncidentsInput = z.object({
  statuses: z.array(z.enum(['triggered', 'acknowledged', 'resolved'])).optional(),
  urgency: z.enum(['high', 'low']).optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  limit: z.number().int().default(25),
  offset: z.number().int().default(0),
});
const listIncidentsOutput = z
  .object({
    incidents: z.array(incident),
    limit: z.number().optional(),
    offset: z.number().optional(),
    more: z.boolean().optional(),
  })
  .passthrough();

export const listIncidents = {
  slug: 'listIncidents',
  description: 'List PagerDuty incidents with optional filters and pagination.',
  input: listIncidentsInput,
  output: listIncidentsOutput,
  idempotent: true,
  async run({
    input,
    client,
  }: PieceRunArgs<z.output<typeof listIncidentsInput>, object, PagerdutyClient>) {
    const response = await client.request({
      method: 'GET',
      path: '/incidents',
      query: {
        'statuses[]': input.statuses,
        'urgencies[]': input.urgency ? [input.urgency] : undefined,
        since: input.since,
        until: input.until,
        limit: String(Math.max(1, Math.min(100, input.limit))),
        offset: String(Math.max(0, input.offset)),
      },
    });

    return listIncidentsOutput.parse(response);
  },
} satisfies PieceActionDefinition<
  typeof listIncidentsInput,
  typeof listIncidentsOutput,
  object,
  PagerdutyClient
>;

function updateIncident(
  slug: 'acknowledgeIncident' | 'resolveIncident',
  status: 'acknowledged' | 'resolved',
) {
  const input = z.object({
    incidentId,
    fromEmail,
    ...(status === 'resolved' ? { resolution: z.string().optional() } : {}),
  });

  return {
    slug,
    description: `${status === 'resolved' ? 'Resolve' : 'Acknowledge'} a PagerDuty incident.`,
    input,
    output: incidentOutput,
    idempotent: true,
    async run({
      input: values,
      client,
    }: PieceRunArgs<z.output<typeof input>, object, PagerdutyClient>) {
      const resolution = 'resolution' in values ? values.resolution : undefined;
      const response = incidentResponse.parse(
        await client.request({
          method: 'PUT',
          path: `/incidents/${encodeURIComponent(values.incidentId)}`,
          fromEmail: values.fromEmail,
          body: {
            incident: {
              type: 'incident',
              status,
              ...(resolution ? { body: { type: 'incident_body', details: resolution } } : {}),
            },
          },
        }),
      );

      return response.incident;
    },
  } satisfies PieceActionDefinition<typeof input, typeof incidentOutput, object, PagerdutyClient>;
}

const getIncidentInput = z.object({ incidentId });

export const getIncident = {
  slug: 'getIncident',
  description: 'Get a PagerDuty incident by ID.',
  input: getIncidentInput,
  output: incidentOutput,
  idempotent: true,
  async run({
    input,
    client,
  }: PieceRunArgs<z.output<typeof getIncidentInput>, object, PagerdutyClient>) {
    const response = incidentResponse.parse(
      await client.request({
        method: 'GET',
        path: `/incidents/${encodeURIComponent(input.incidentId)}`,
      }),
    );

    return response.incident;
  },
} satisfies PieceActionDefinition<
  typeof getIncidentInput,
  typeof incidentOutput,
  object,
  PagerdutyClient
>;

export const acknowledgeIncident = updateIncident('acknowledgeIncident', 'acknowledged');
export const resolveIncident = updateIncident('resolveIncident', 'resolved');

const customApiCallInput = z.object({
  method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']),
  path: z.string().startsWith('/'),
  queryParams: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),
  body: z.json().optional(),
});
const customApiCallOutput = z.json();

export const customApiCall = {
  slug: 'customApiCall',
  description: 'Make a custom PagerDuty REST API v2 call.',
  input: customApiCallInput,
  output: customApiCallOutput,
  async run({
    input,
    client,
  }: PieceRunArgs<z.output<typeof customApiCallInput>, object, PagerdutyClient>) {
    const response = await client.request({
      method: input.method,
      path: input.path,
      query: input.queryParams,
      body: input.body,
    });

    return customApiCallOutput.parse(response);
  },
} satisfies PieceActionDefinition<
  typeof customApiCallInput,
  typeof customApiCallOutput,
  object,
  PagerdutyClient
>;
