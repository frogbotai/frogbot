import { createHash } from 'node:crypto';

import { APIError, type PayloadRequest } from 'payload';

import type { Endpoint } from '../../endpoints/types.js';
import type { FrogbotRequest } from '../../types/request.js';
import { findWaitpoint, resumeWaitpoint, WaitpointResumeError } from '../waitpoints/operations.js';

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

function failure({
  status,
  code,
  html,
  head = false,
}: {
  status: keyof typeof errors;
  code: string;
  html: boolean;
  head?: boolean;
}): Response {
  const { title, message } = errors[status];

  if (html) return page({ title, message, status, head });

  return Response.json({ error: { code, message } }, { status, headers });
}

async function confirmation(req: FrogbotRequest): Promise<Response> {
  const head = req.method?.toUpperCase() === 'HEAD';
  const token = req.routeParams?.token;

  if (typeof token !== 'string' || !token) {
    return failure({ status: 404, code: 'WAITPOINT_NOT_FOUND', html: true, head });
  }

  try {
    const waitpoint = await findWaitpoint({ req: req as unknown as PayloadRequest, token });

    if (!waitpoint || waitpoint.kind !== 'resumable') {
      return failure({ status: 404, code: 'WAITPOINT_NOT_FOUND', html: true, head });
    }

    if (waitpoint.status === 'resumed') {
      return failure({ status: 409, code: 'WAITPOINT_CONSUMED', html: true, head });
    }

    if (waitpoint.status === 'expired') {
      return failure({ status: 410, code: 'WAITPOINT_EXPIRED', html: true, head });
    }

    const expiresAt = Date.parse(waitpoint.expiresAt ?? '');

    if (!Number.isFinite(expiresAt)) {
      return failure({ status: 500, code: 'INTERNAL_ERROR', html: true, head });
    }

    if (expiresAt <= Date.now()) {
      return failure({ status: 410, code: 'WAITPOINT_EXPIRED', html: true, head });
    }

    return page({
      title: 'Resume workflow',
      message: 'Confirm to continue this workflow. Opening this link does not resume it.',
      confirm: true,
      head,
    });
  } catch {
    return failure({ status: 500, code: 'INTERNAL_ERROR', html: true, head });
  }
}

async function resume(req: FrogbotRequest): Promise<Response> {
  const contentType = req.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  const form = contentType === 'application/x-www-form-urlencoded';
  const token = req.routeParams?.token;

  if (typeof token !== 'string' || !token) {
    return failure({ status: 404, code: 'WAITPOINT_NOT_FOUND', html: form });
  }

  if (!form && contentType !== 'application/json') {
    return failure({ status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', html: false });
  }

  try {
    let data: unknown;

    if (form) {
      const fields = new URLSearchParams(await req.text!());

      if (fields.size) {
        return failure({ status: 400, code: 'INVALID_FORM', html: true });
      }

      data = {};
    } else {
      const body = await req.text!();

      try {
        data = JSON.parse(body);
      } catch {
        return failure({ status: 400, code: 'INVALID_JSON', html: false });
      }
    }

    await resumeWaitpoint({ req: req as unknown as PayloadRequest, token, data });

    if (form) {
      return page({
        title: 'Response recorded',
        message: 'Your response has been recorded. You can close this page now.',
      });
    }

    return Response.json({ ok: true }, { headers });
  } catch (error) {
    if (error instanceof WaitpointResumeError) {
      return failure({ status: error.status, code: error.code, html: form });
    }

    if (error instanceof APIError && error.status === 400) {
      return failure({ status: 400, code: 'INVALID_DATA', html: form });
    }

    return failure({ status: 500, code: 'INTERNAL_ERROR', html: form });
  }
}

export function buildResumeEndpoints(): Endpoint[] {
  return [
    { path: '/jobs/:token/resume', method: 'get', handler: confirmation },
    { path: '/jobs/:token/resume', method: 'head', handler: confirmation },
    { path: '/jobs/:token/resume', method: 'post', handler: resume },
  ];
}
