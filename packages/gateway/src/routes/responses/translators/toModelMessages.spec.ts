import { describe, expect, it } from 'vitest';

import { RequestValidationError, UnsupportedModalityError } from '../../../errors/gatewayError.js';
import { toModelMessages } from './toModelMessages.js';

describe('toModelMessages', () => {
  it('maps Responses text, image, file, and audio input parts to AI SDK messages', () => {
    const messages = toModelMessages([
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'describe this' },
          { type: 'input_image', image_url: 'https://example.com/frog.png' },
          { type: 'input_file', filename: 'frog.txt', file_data: 'data:text/plain;base64,aGVsbG8=' },
          { type: 'input_audio', input_audio: { data: 'AAAA', format: 'wav' } },
        ],
      },
    ]);

    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'describe this' },
          { type: 'file', mediaType: 'image/*', data: { type: 'url', url: new URL('https://example.com/frog.png') } },
          { type: 'file', mediaType: 'text/plain', filename: 'frog.txt', data: { type: 'data', data: 'aGVsbG8=' } },
          { type: 'file', mediaType: 'audio/wav', data: { type: 'data', data: 'AAAA' } },
        ],
      },
    ]);
  });

  it('preserves roles across a multi-turn conversation with array content', () => {
    const messages = toModelMessages([
      { role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
      { role: 'assistant', content: [{ type: 'output_text', text: 'hello' }] },
      { role: 'user', content: [{ type: 'input_text', text: 'again' }] },
    ]);

    expect(messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
      { role: 'user', content: [{ type: 'text', text: 'again' }] },
    ]);
  });

  it('maps developer array content to a system message', () => {
    const messages = toModelMessages([
      { role: 'developer', content: 'be terse' },
    ]);

    expect(messages).toEqual([{ role: 'system', content: 'be terse' }]);
  });

  it('rejects unsupported part types in assistant array content', () => {
    expect(() => toModelMessages([
      { role: 'assistant', content: [{ type: 'input_image', image_url: 'https://example.com/x.png' }] },
    ])).toThrow(UnsupportedModalityError);
  });

  it('rejects provider file references instead of inventing file lookup semantics', () => {
    expect(() => toModelMessages([
      { role: 'user', content: [{ type: 'input_file', file_id: 'file_123' }] },
    ])).toThrow(UnsupportedModalityError);
  });

  it('throws a 400 RequestValidationError for a malformed image_url', () => {
    let caught: unknown;
    try {
      toModelMessages([
        { role: 'user', content: [{ type: 'input_image', image_url: 'not a url' }] },
      ]);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(RequestValidationError);
    expect(caught).toMatchObject({ status: 400, code: 'invalid_request_body', param: 'input[0].content[0].image_url' });
  });

  it('throws a 400 RequestValidationError for a malformed file_url', () => {
    let caught: unknown;
    try {
      toModelMessages([
        { role: 'user', content: [{ type: 'input_file', file_url: '::bad::' }] },
      ]);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(RequestValidationError);
    expect(caught).toMatchObject({ status: 400, code: 'invalid_request_body', param: 'input[0].content[0].file_url' });
  });
});
