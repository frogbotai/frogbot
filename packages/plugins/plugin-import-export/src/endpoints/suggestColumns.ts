import { Output } from 'frogbot';
import { attachRegisteredFrogBot } from 'frogbot/internal';
import type { Endpoint } from 'payload';

import type { ImportColumn } from '../columns/columnMap.js';
import { readColumnMap } from '../columns/columnMap.js';
import type { ImportTarget } from '../columns/suggest.js';
import { sanitizeColumns, suggestColumns, toColumn } from '../columns/suggest.js';
import { fail, readColumnsRequest } from './request.js';

/** What `suggest-columns` returns: the mapping with AI picks in its "Skip" columns. */
export type SuggestColumnsResponse = {
  columns: ImportColumn[];
  /** How many "Skip" columns the model filled. */
  suggested: number;
  /** Set when the model call failed; `columns` is then the mapping as sent. */
  error?: string;
};

export const suggestColumnsPath = '/suggest-columns';

const instructions = [
  'You map the columns of a spreadsheet to the fields of a database collection.',
  'You get each column with up to 3 sample values, and the fields it can map to.',
  'Reply with a JSON object whose keys are column headers and whose values are field paths, ',
  'using only the given field paths, at most one column per field. ',
  'Use null for a column that fits no field.',
].join(' ');

/**
 * `POST /api/<imports>/suggest-columns` with `{ collectionSlug, fileData, format, columns }`. Asks
 * the small model, as the user, to fill the mapping's "Skip" columns. Only valid, unused fields
 * are kept; a model error returns the mapping unchanged with a message. Registered only when
 * `ai.smallModel` or `ai.defaultModel` is set.
 */
export const suggestColumnsEndpoint: Endpoint = {
  method: 'post',
  path: suggestColumnsPath,
  handler: async (req) => {
    const request = await readColumnsRequest(req);

    if ('response' in request) return request.response;

    const { headers, samples, targets, fields, body } = request;

    const sent = readColumnMap({ headers, columns: body.columns })?.columns;

    const columns = sent
      ? sanitizeColumns({ headers, columns: sent, targets, fields })
      : suggestColumns({ headers, targets, fields });

    const skipped = columns.filter(({ field }) => field === null).map(({ header }) => header);

    const used = new Set(columns.map(({ field }) => field).filter(Boolean));

    const free = targets.filter(({ field }) => !used.has(field));

    if (skipped.length === 0 || free.length === 0) {
      return Response.json({ columns, suggested: 0 } satisfies SuggestColumnsResponse);
    }

    const frogbotReq = attachRegisteredFrogBot(req);
    const { frogbot } = frogbotReq;
    const model = frogbot.config.ai?.smallModel ?? frogbot.config.ai?.defaultModel;

    if (!model) return fail('No AI model is configured.', 404);

    let picks: Record<string, unknown>;

    try {
      const result = await frogbot.generateText({
        model,
        req: frogbotReq,
        instructions,
        prompt: JSON.stringify({
          columns: skipped.map((header) => ({ header, samples: samples[header] ?? [] })),
          fields: free.map(describeTarget),
        }),
        output: Output.json(),
      });

      picks = readPicks(result.output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return Response.json(
        {
          columns,
          suggested: 0,
          error: `AI suggestion failed: ${message}`,
        } satisfies SuggestColumnsResponse,
        { status: 502 },
      );
    }

    let suggested = 0;

    const filled = columns.map((column) => {
      if (column.field !== null) return column;

      const pick = picks[column.header];
      const target = free.find(({ field }) => field === pick);

      if (!target || used.has(target.field)) return column;

      used.add(target.field);
      suggested += 1;

      return toColumn(column.header, target);
    });

    return Response.json({ columns: filled, suggested } satisfies SuggestColumnsResponse);
  },
};

function describeTarget({ field, label, type, hasMany, relationship }: ImportTarget) {
  return {
    field,
    label,
    type,
    ...(hasMany && { hasMany }),
    ...(relationship && { relatedCollection: relationship.collection }),
  };
}

function readPicks(output: unknown): Record<string, unknown> {
  if (typeof output !== 'object' || output === null || Array.isArray(output)) {
    throw new Error('The model did not return a JSON object.');
  }

  const record = output as Record<string, unknown>;
  const nested = record.columns;

  return typeof nested === 'object' && nested !== null && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : record;
}
