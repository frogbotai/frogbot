import { createHash } from 'node:crypto';

import type { Endpoint } from '../../endpoints/types.js';
import { frogbotError, type FrogBotErrorCode } from '../../errors/catalog.js';
import { isFrogBotError } from '../../errors/FrogBotError.js';
import { toPayloadRequest } from '../../seams/request.js';
import type { FrogBotRequest } from '../../types/request.js';
import { findWaitpoint, resumeWaitpoint } from '../waitpoints/operations.js';

const styles = `body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; }
main { max-width: 32rem; margin: 4rem auto; }
button { font: inherit; padding: 0.75rem 1.25rem; cursor: pointer; }`;

const headers = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': `default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; style-src 'sha256-${createHash('sha256').update(styles).digest('base64')}'`,
};

const errors = {
  400: { title: 'Invalid response', message: 'The response body is invalid.' },
  404: { title: 'Link not found', message: 'This resume link is not available.' },
  409: { title: 'Link already used', message: 'This resume link has already been used.' },
  410: { title: 'Link expired', message: 'This resume link has expired.' },
  415: {
    title: 'Unsupported response format',
    message: 'Send application/json or submit the confirmation form.',
  },
  500: {
    title: 'Unable to process response',
    message: 'FrogBot could not process this request. Please try again later.',
  },
};

function page({
  title,
  message,
  status = 200,
  confirm = false,
  head = false,
}: {
  title: string;
  message: string;
  status?: number;
  confirm?: boolean;
  head?: boolean;
}): Response {
  return new Response(
    head
      ? null
      : `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${title} · FrogBot</title>
<style>${styles}</style>
</head>
<body>
<main>
<p>FrogBot</p>
<h1>${title}</h1>
<p>${message}</p>
${confirm ? '<form method="post"><button type="submit">Resume workflow</button></form>' : ''}
</main>
</body>
</html>`,
    { status, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

const statuses: Partial<Record<FrogBotErrorCode, keyof typeof errors>> = {
  'job.waitpoint-not-found': 404,
  'job.waitpoint-consumed': 409,
  'job.waitpoint-expired': 410,
  'request.invalid': 400,
  'request.invalid-json': 400,
  'request.unsupported-media-type': 415,
};

function failure({
  code,
  detail,
  html,
  head = false,
}: {
  code: FrogBotErrorCode;
  detail?: string;
  html: boolean;
  head?: boolean;
}): Response {
  if (!html) throw frogbotError(code, { detail, headers });

  const { title, message } = errors[statuses[code] ?? 500];

  return page({ title, message, status: statuses[code] ?? 500, head });
}

async function confirmation(req: FrogBotRequest): Promise<Response> {
  const head = req.method?.toUpperCase() === 'HEAD';
  const token = req.routeParams?.token;

  if (typeof token !== 'string' || !token) {
    return failure({ code: 'job.waitpoint-not-found', html: true, head });
  }

  try {
    const waitpoint = await findWaitpoint({ req: toPayloadRequest(req), token });

    if (!waitpoint || waitpoint.kind !== 'resumable') {
      return failure({ code: 'job.waitpoint-not-found', html: true, head });
    }

    if (waitpoint.status === 'resumed') {
      return failure({ code: 'job.waitpoint-consumed', html: true, head });
    }

    if (waitpoint.status === 'expired') {
      return failure({ code: 'job.waitpoint-expired', html: true, head });
    }

    const expiresAt = Date.parse(waitpoint.expiresAt ?? '');

    if (!Number.isFinite(expiresAt)) {
      return failure({ code: 'internal', html: true, head });
    }

    if (expiresAt <= Date.now()) {
      return failure({ code: 'job.waitpoint-expired', html: true, head });
    }

    return page({
      title: 'Resume workflow',
      message: 'Confirm to continue this workflow. Opening this link does not resume it.',
      confirm: true,
      head,
    });
  } catch {
    return failure({ code: 'internal', html: true, head });
  }
}

async function resume(req: FrogBotRequest): Promise<Response> {
  const contentType = req.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  const form = contentType === 'application/x-www-form-urlencoded';
  const token = req.routeParams?.token;

  if (typeof token !== 'string' || !token) {
    return failure({ code: 'job.waitpoint-not-found', html: form });
  }

  if (!form && contentType !== 'application/json') {
    return failure({ code: 'request.unsupported-media-type', html: false });
  }

  try {
    let data: unknown;

    if (form) {
      const fields = new URLSearchParams(await req.text!());

      if (fields.size) {
        return failure({
          code: 'request.invalid',
          detail: 'The confirmation form takes no fields.',
          html: true,
        });
      }

      data = {};
    } else {
      const body = await req.text!();

      try {
        data = JSON.parse(body);
      } catch {
        return failure({ code: 'request.invalid-json', html: false });
      }
    }

    await resumeWaitpoint({ req: toPayloadRequest(req), token, data });

    if (form) {
      return page({
        title: 'Response recorded',
        message: 'Your response has been recorded. You can close this page now.',
      });
    }

    return Response.json({ ok: true }, { headers });
  } catch (error) {
    const known = isFrogBotError(error) && error.code !== 'internal';

    return failure({
      code: known ? (error.code as FrogBotErrorCode) : 'internal',
      detail: known ? error.message : undefined,
      html: form,
    });
  }
}

export function buildResumeEndpoints(): Endpoint[] {
  return [
    { path: '/jobs/:token/resume', method: 'get', handler: confirmation },
    { path: '/jobs/:token/resume', method: 'head', handler: confirmation },
    { path: '/jobs/:token/resume', method: 'post', handler: resume },
  ];
}
