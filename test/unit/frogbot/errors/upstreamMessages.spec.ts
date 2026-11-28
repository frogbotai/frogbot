import { describe, expect, it } from 'vitest';

import { formatCliError } from '../../../../packages/frogbot/src/bin/formatCliError.js';
import { toProblem } from '../../../../packages/frogbot/src/errors/toProblem.js';
import { toFrogBotMessage } from '../../../../packages/frogbot/src/errors/upstreamMessages.js';

const SHARP_ERROR =
  'Collection "pins" uses the removed `upload.imageSizes` option. Run `npx @payloadcms/codemod --transform migrate-sharp-to-transformer` to migrate automatically, or see https://payloadcms.com/docs/upload/transformers.';

const SAFE_FETCH_ERROR =
  'Blocked unsafe attempt to 10.0.0.1. This host resolves to a private or internal address. If this is a trusted destination, allowlist it via the upload collection\'s "skipSafeFetch" option (https://payloadcms.com/docs/upload/overview#skip-safe-fetch).';

describe('toFrogBotMessage', () => {
  it('drops the codemod hint and links the FrogBot image sizes docs', () => {
    expect(toFrogBotMessage(SHARP_ERROR)).toBe(
      'Collection "pins" uses the removed `upload.imageSizes` option. See https://docs.frogbot.ai/upload/overview#image-sizes.',
    );
  });

  it('maps a Payload anchor to the FrogBot section that answers it', () => {
    expect(toFrogBotMessage(SAFE_FETCH_ERROR)).toContain(
      '(https://docs.frogbot.ai/upload/overview#uploading-files-from-remote-urls).',
    );
  });

  it.each([
    [
      'See https://payloadcms.com/docs/upload/storage-adapters for more info.',
      'See https://docs.frogbot.ai/upload/storage-adapters for more info.',
    ],
    [
      'See https://payloadcms.com/docs/typescript/generating-types#block-interface-name-collisions',
      'See https://docs.frogbot.ai/typescript/generating-types#block-interface-name-collisions',
    ],
    [
      'More info at https://payloadcms.com/docs/email/overview.',
      'More info at https://docs.frogbot.ai/email/overview.',
    ],
    [
      'See https://payloadcms.com/docs/email/overview#unknown',
      'See https://docs.frogbot.ai/email/overview',
    ],
    ['See https://payloadcms.com/docs/some/new-page.', 'See https://docs.frogbot.ai.'],
    ['Install @payloadcms/storage-s3.', 'Install @frogbotai/storage-s3.'],
    ["from '@payloadcms/richtext-lexical'", "from '@frogbotai/richtext-lexical'"],
  ])('rewrites %j', (message, expected) => {
    expect(toFrogBotMessage(message)).toBe(expected);
  });

  it('leaves a FrogBot message alone', () => {
    expect(toFrogBotMessage('[frogbot] `secret` is required.')).toBe(
      '[frogbot] `secret` is required.',
    );
  });

  it('rewrites the message and causes frogbot prints', () => {
    const output = formatCliError(new Error('load failed', { cause: new Error(SAFE_FETCH_ERROR) }));

    expect(output).not.toContain('payloadcms.com');
    expect(output).toContain(
      'https://docs.frogbot.ai/upload/overview#uploading-files-from-remote-urls',
    );
  });

  it('rewrites the detail of an error sent over the API', () => {
    const problem = toProblem(new Error(SAFE_FETCH_ERROR), { debug: true });

    expect(problem.detail).not.toContain('payloadcms.com');
  });
});
