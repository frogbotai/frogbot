import type { DeployEnv } from 'frogbot';

/** What a `ShareError` adds to the `--json` result besides its message. */
export type ShareErrorDetails = {
  /** Stable, for scripts reading `--json`: `DOJO_UNREACHABLE`, or Dojo's own `payment_required`. */
  code?: string;
  /** The HTTP status of Dojo's refusal. */
  status?: number;
  /** The link Dojo sent with its refusal, such as the billing page. */
  url?: string;
  deploymentId?: string | number;
  cause?: unknown;
};

/** A known `frogbot share` or `frogbot dojo` stop: printed as one `[frogbot]` line, exiting with `exitCode`. */
export class ShareError extends Error {
  exitCode: 1 | 2;
  /** The `--json` result's `code`: the details' code, or `USAGE_ERROR` for exit 2 and `FAILED` otherwise. */
  code: string;
  status?: number;
  url?: string;
  deploymentId?: string | number;

  constructor(
    message: string,
    exitCode: 1 | 2 = 1,
    { code, status, url, deploymentId, cause }: ShareErrorDetails = {},
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ShareError';
    this.exitCode = exitCode;
    this.code = code ?? (exitCode === 2 ? 'USAGE_ERROR' : 'FAILED');
    this.status = status;
    this.url = url;
    this.deploymentId = deploymentId;
  }

  /** The fields `--json` prints besides `code` and `error`. */
  get fields(): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries({
        status: this.status,
        url: this.url,
        deploymentId: this.deploymentId,
      }).filter(([, value]) => value !== undefined),
    );
  }
}

/** The stop for a request that never reached Dojo, naming `FROGBOT_DOJO_URL` when it set the address. */
export function unreachableStop(url: string, env: DeployEnv, cause?: unknown): ShareError {
  const from = env.FROGBOT_DOJO_URL ? ' (set by FROGBOT_DOJO_URL)' : '';

  return new ShareError(
    `Couldn't reach Dojo at ${url}${from}. Check the URL or your network and rerun.`,
    1,
    { code: 'DOJO_UNREACHABLE', cause },
  );
}

/** A failed Dojo reply: Payload's `errors` (with a `ValidationError`'s field errors or an `APIError`'s `code`), or an OAuth-style `error`. */
export type DojoErrorBody = {
  errors?: {
    message?: string;
    data?: { code?: string; url?: string; errors?: { path?: string; message?: string }[] };
  }[];
  error?: string;
  message?: string;
};

/** A failed reply's body and Dojo's own words for it, or the status. */
export async function dojoError(
  response: Response,
): Promise<{ body?: DojoErrorBody; message: string }> {
  const body = (await response.json().catch(() => undefined)) as DojoErrorBody | undefined;

  return {
    body,
    message:
      body?.errors?.find((error) => error.message)?.message ||
      body?.message ||
      body?.error ||
      `Dojo answered ${response.status}.`,
  };
}

/** Dojo's own words for a failed reply. */
export async function dojoMessage(response: Response): Promise<string> {
  return (await dojoError(response)).message;
}

/** The stop for a failed reply: `<lead>: <Dojo's words><after>`, carrying its status and Dojo's `code` and `url`. */
export async function dojoStop(response: Response, lead?: string, after = ''): Promise<ShareError> {
  const { body, message } = await dojoError(response);
  const data = body?.errors?.find((error) => error.data?.code)?.data;

  return new ShareError(`${lead ? `${lead}: ` : ''}${message}${after}`, 1, {
    status: response.status,
    ...(typeof data?.code === 'string' && { code: data.code }),
    ...(typeof data?.url === 'string' && { url: data.url }),
  });
}

/** Sends a request to Dojo; a network failure becomes `DOJO_UNREACHABLE`, and an abort stays an abort. */
export async function reachDojo(
  url: string,
  env: DeployEnv,
  send: () => Promise<Response>,
): Promise<Response> {
  try {
    return await send();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;

    throw unreachableStop(url, env, error);
  }
}

type StopIO = {
  stderr: { write: (text: string) => unknown };
  json?: { write: (text: string) => unknown };
};

/**
 * Ends a command that stopped: one `[frogbot]` line on stderr and, with `--json`, one
 * `{ ok: false, code, error }` value on stdout. Returns the exit code. Without `--json`, an error that
 * isn't a `ShareError` is thrown on for the CLI to print.
 */
export async function reportStop(io: StopIO, error: unknown): Promise<number> {
  const result = (value: Record<string, unknown>) =>
    io.json?.write(`${JSON.stringify({ ok: false, ...value }, null, 2)}\n`);

  if (error instanceof ShareError) {
    io.stderr.write(`[frogbot] ${error.message}\n`);
    result({ code: error.code, error: error.message, ...error.fields });

    return error.exitCode;
  }

  if (!io.json) throw error;

  const { formatCliError } = await import('frogbot/internal');
  const text = formatCliError(error);

  io.stderr.write(`${text}\n`);
  result({ code: 'UNEXPECTED_ERROR', error: text.replace(/^\[frogbot\] /, '') });

  return 1;
}
