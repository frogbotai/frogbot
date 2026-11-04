import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';

import { defineWebhookTrigger } from '../define.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  isArray: (_name, path) => path === 'Envelope.Body.notifications.Notification',
});

const nil = z.object({ '@_nil': z.literal('true') }).transform(() => null);

const field = z.union([z.string(), nil]);

const notifications = z.object({
  Envelope: z.object({
    Body: z.object({
      notifications: z.object({
        OrganizationId: z.string(),
        ActionId: z.string(),
        Notification: z
          .array(
            z.object({
              Id: z.string(),
              sObject: z.looseObject({ '@_type': z.string() }),
            }),
          )
          .default([]),
      }),
    }),
  }),
});

const ack = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <notificationsResponse xmlns="http://soap.sforce.com/2005/09/outbound">
      <Ack>true</Ack>
    </notificationsResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

const sameOrg = (first: string, second: string) => first.slice(0, 15) === second.slice(0, 15);

const message = z.object({
  notificationId: z.string(),
  actionId: z.string(),
  organizationId: z.string(),
  object: z.string().meta({ description: 'The record’s object, such as Account.' }),
  record: z.record(z.string(), z.string().nullable()).meta({
    description: 'The fields the Outbound Message sends, by API name; null when empty.',
  }),
});

export const newOutboundMessage = defineWebhookTrigger({
  slug: 'newOutboundMessage',
  description:
    "Emit each record a Salesforce Outbound Message sends, as soon as Salesforce sends it. In Salesforce, point a Flow's or workflow rule's Outbound Message at this subscription's webhook URL. Messages from other orgs are acknowledged and dropped.",
  type: 'webhook',
  input: z.object({}),
  output: message,
  onEnable({ client }) {
    if (!client.orgId) {
      return Promise.reject(
        new Error(
          'Salesforce Outbound Messages need a connection made through Salesforce sign-in.',
        ),
      );
    }

    return Promise.resolve({ organizationId: client.orgId });
  },
  async onDisable() {},
  async run({ req, state }) {
    if (!req.text) throw new Error('Salesforce Outbound Message body is unavailable.');

    const { notifications: body } = notifications.parse(parser.parse(await req.text())).Envelope
      .Body;

    if (!sameOrg(body.OrganizationId, state.organizationId)) return [];

    return body.Notification.map(({ Id, sObject }) => {
      const { '@_type': type, ...fields } = sObject;
      const record = Object.fromEntries(
        Object.entries(fields)
          .filter(([name]) => !name.startsWith('@_'))
          .map(([name, value]) => [name, field.parse(value)]),
      );

      return {
        dedupeKey: Id,
        data: {
          notificationId: Id,
          actionId: body.ActionId,
          organizationId: body.OrganizationId,
          object: type.replace(/^\w+:/, ''),
          record,
        },
      };
    });
  },
  reply() {
    return new Response(ack, { headers: { 'content-type': 'text/xml; charset=utf-8' } });
  },
});
