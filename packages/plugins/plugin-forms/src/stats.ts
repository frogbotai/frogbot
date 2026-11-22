import type { Access, CollectionConfig, Endpoint, FrogBot } from 'frogbot';

import { formIsClosed } from './closing.js';
import { findForm, type FormsRuntime } from './lookup.js';
import type { FormDocument, FormEvent } from './types.js';

export const FORM_STATS_SLUG = 'form-stats';

const COUNTERS = { view: 'views', start: 'starts', completion: 'completions' } as const;

const never = () => false;
const signedIn: Access = ({ req }) => Boolean(req.user);

/** The UTC day a count lands on, as `YYYY-MM-DD`. */
export function statsDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Adds one to the form's counter for `event` on today's row in a single atomic statement, with
 * no lock, so a burst of pings can never block or drop a completion. The unique (form, day) index
 * settles two requests that both create the day's row: the loser increments the winner's row.
 */
export async function countEvent(
  frogbot: FrogBot,
  form: Pick<FormDocument, 'id'>,
  event: FormEvent,
  now = new Date(),
): Promise<void> {
  const { db } = frogbot;
  const day = statsDay(now);
  const counter = COUNTERS[event];

  const bump = () =>
    db.updateOne({
      collection: FORM_STATS_SLUG,
      where: { and: [{ form: { equals: form.id } }, { day: { equals: day } }] },
      data: { [counter]: { $inc: 1 } },
      options: { atomic: true },
    });

  const create = () =>
    db
      .create({
        collection: FORM_STATS_SLUG,
        data: { form: form.id, day, views: 0, starts: 0, completions: 0, [counter]: 1 },
      })
      .then(() => true)
      .catch(() => false);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if ((await bump()) || (await create())) return;
  }

  throw new Error(`[plugin-forms] Could not count a ${event} on form ${String(form.id)}.`);
}

function isPing(value: unknown): value is 'start' | 'view' {
  return value === 'view' || value === 'start';
}

/** `POST /api/forms/:slug/events` with `{ type: 'view' | 'start' }`. Added only with `analytics`. */
export function createEventsEndpoint(runtime: FormsRuntime): Endpoint {
  return {
    method: 'post',
    path: '/:slug/events',
    handler: async (req) => {
      const body = (await req.json?.().catch(() => null)) as { type?: unknown } | null;
      const type = body?.type;

      if (!isPing(type)) {
        return Response.json({ error: 'The request body is invalid.' }, { status: 400 });
      }

      const found = await findForm(req, runtime, req.routeParams?.slug);

      if (!found || found.form.mode === 'update') {
        return Response.json({ error: 'Not found' }, { status: 404 });
      }

      if (!(await formIsClosed(req.frogbot, found.form))) {
        await countEvent(req.frogbot, found.form, type);
      }

      return new Response(null, { status: 204 });
    },
  };
}

/** One row per form per UTC day. Views and starts come from browser pings, so they are estimates. */
export function createFormStatsCollection(): CollectionConfig {
  return {
    slug: FORM_STATS_SLUG,
    labels: { singular: 'Form stats', plural: 'Form stats' },
    disableDuplicate: true,
    versions: false,
    admin: {
      icon: 'chart-bar',
      description:
        'Views, starts and completions per form per day (UTC). Completions are exact; views and starts come from visitors’ browsers, so they are estimates.',
      views: [{ type: 'list', defaultFields: ['form', 'day', 'views', 'starts', 'completions'] }],
    },
    defaultSort: '-day',
    access: { read: signedIn, delete: signedIn, create: never, update: never },
    indexes: [{ fields: ['form', 'day'], unique: true }],
    fields: [
      {
        name: 'form',
        type: 'relationship',
        relationTo: 'forms',
        required: true,
        index: true,
      },
      { name: 'day', type: 'text', required: true, index: true },
      { name: 'views', type: 'number', label: 'Views (estimate)', defaultValue: 0 },
      { name: 'starts', type: 'number', label: 'Starts (estimate)', defaultValue: 0 },
      { name: 'completions', type: 'number', defaultValue: 0 },
    ],
  };
}
