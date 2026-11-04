import { z } from 'zod';

const optional = {
  string: z.string().nullish(),
  number: z.number().nullish(),
};

const timestamps = { created_at: optional.string, updated_at: optional.string };

export const attachment = z.looseObject({
  id: z.number(),
  file_name: z.string(),
  content_url: z.string(),
  content_type: optional.string,
  size: optional.number,
});

export const ticket = z.looseObject({
  id: z.number(),
  subject: optional.string,
  description: optional.string,
  status: optional.string,
  priority: optional.string,
  type: optional.string,
  requester_id: optional.number,
  assignee_id: optional.number,
  organization_id: optional.number,
  group_id: optional.number,
  tags: z.array(z.string()).optional(),
  ...timestamps,
});

export const comment = z.looseObject({
  id: z.number(),
  type: optional.string,
  body: optional.string,
  html_body: optional.string,
  public: z.boolean(),
  author_id: optional.number,
  attachments: z.array(attachment).default([]),
  created_at: optional.string,
});

export const user = z.looseObject({
  id: z.number(),
  name: optional.string,
  email: optional.string,
  role: optional.string,
  organization_id: optional.number,
  active: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  ...timestamps,
});

export const organization = z.looseObject({
  id: z.number(),
  name: optional.string,
  domain_names: z.array(z.string()).optional(),
  external_id: optional.string,
  tags: z.array(z.string()).optional(),
  ...timestamps,
});

export const ticketEvent = z.looseObject({
  id: z.number(),
  ticket_id: z.number(),
  timestamp: optional.number,
  event_type: optional.string,
  updater_id: optional.number,
  child_events: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const article = z.looseObject({
  id: z.number(),
  title: optional.string,
  body: optional.string,
  locale: optional.string,
  section_id: optional.number,
  draft: z.boolean().optional(),
  html_url: optional.string,
  ...timestamps,
});

export const group = z.looseObject({
  id: z.number(),
  name: optional.string,
  deleted: z.boolean().optional(),
  ...timestamps,
});

export const field = z.looseObject({
  id: z.number(),
  type: optional.string,
  title: optional.string,
  key: optional.string,
  active: z.boolean().optional(),
});

/** Categories, sections, macros, views and SLA policies: an id and a name or title. */
export const named = z.looseObject({
  id: z.number(),
  name: optional.string,
  title: optional.string,
  ...timestamps,
});
