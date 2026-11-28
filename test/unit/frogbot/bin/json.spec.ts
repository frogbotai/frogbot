import { describe, expect, it } from 'vitest';

import { formatCliError } from '../../../../packages/frogbot/src/bin/formatCliError.js';
import { CliError, exitCodeOf, failureJson } from '../../../../packages/frogbot/src/bin/json.js';
import { frogbotError } from '../../../../packages/frogbot/src/errors/catalog.js';

describe('CLI output for a FrogBotError', () => {
  it('prints the code, detail, Fix and Docs lines', () => {
    const error = frogbotError('request.invalid', '`port` must be a number.');

    expect(formatCliError(error)).toBe(
      [
        '[frogbot] request.invalid: `port` must be a number.',
        '  Fix: Fix the fields named in `errors`, then send the request again.',
        '  Docs: https://docs.frogbot.ai/errors#request.invalid',
      ].join('\n'),
    );
  });

  it("exits with the catalog's exit code", () => {
    expect(exitCodeOf(frogbotError('request.invalid', 'x'))).toBe(2);
    expect(exitCodeOf(frogbotError('internal'))).toBe(1);
  });

  it('keeps a CliError on its own exit code', () => {
    expect(exitCodeOf(new CliError('nope', { exitCode: 4 }))).toBe(4);
  });

  it('sends the Problem as `error` in --json output, with `message` set to the detail', () => {
    const result = failureJson('migrate', frogbotError('request.invalid', 'x'));

    expect(result).toMatchObject({
      command: 'migrate',
      success: false,
      error: {
        code: 'request.invalid',
        detail: 'x',
        message: 'x',
        status: 400,
        retryable: false,
        type: 'https://docs.frogbot.ai/errors#request.invalid',
      },
    });
  });
});
