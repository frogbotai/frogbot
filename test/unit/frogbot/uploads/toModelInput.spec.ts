import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import type { ModelModality } from '../../../../packages/frogbot/src/ai/types.js';
import { toModelInput } from '../../../../packages/frogbot/src/uploads/toModelInput.js';

const MiB = 1024 * 1024;

function payload(size: number, marker: string): string {
  return `${marker.repeat(4)}${'A'.repeat(size - 4)}`;
}

const nine = ['B', 'C', 'D'].map((marker) => payload(9 * MiB, marker));
const thirteen = ['E', 'F'].map((marker) => payload(13 * MiB, marker));
const halfLimit = ['G', 'H'].map((marker) => payload(12.5 * MiB, marker));
const ten = payload(10 * MiB, 'I');
const sixteen = payload(16 * MiB, 'J');

type Part = Record<string, unknown>;

function user(...content: Part[]): ModelMessage {
  return { role: 'user', content } as unknown as ModelMessage;
}

function toolResult(...value: Part[]): ModelMessage {
  return {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: 'call_1',
        toolName: 'read',
        output: { type: 'content', value },
      },
    ],
  } as unknown as ModelMessage;
}

function file(filename: string, mediaType: string, data: unknown = 'aGVsbG8='): Part {
  return { type: 'file', mediaType, filename, data: { type: 'data', data } };
}

function text(value: string): Part {
  return { type: 'text', text: value };
}

function run(
  messages: ModelMessage[],
  { inputs, provider = 'anthropic' }: { inputs?: ModelModality[]; provider?: string } = {},
) {
  return toModelInput({ messages, inputs, provider, hashes: new Map() });
}

function contentOf(messages: ModelMessage[]): unknown[] {
  return messages.flatMap((message) => message.content as unknown[]);
}

function toolValue(message: ModelMessage | undefined): unknown {
  return (message?.content as Array<{ output: { value: unknown } }>)[0]?.output.value;
}

describe('toModelInput: unreadable media', () => {
  it('replaces unsupported user media with a marker', () => {
    const result = run(
      [
        user(
          text('Describe these files'),
          file('logo.png', 'image/png'),
          file('document.pdf', 'application/pdf', 'JVBERg=='),
          { type: 'image', image: 'd29ybGQ=' },
        ),
      ],
      { inputs: ['text'] },
    );

    expect(result[0]?.content).toEqual([
      text('Describe these files'),
      text("[Can't read logo.png: this model doesn't accept images]"),
      text("[Can't read document.pdf: this model doesn't accept PDFs]"),
      text("[Can't read image: this model doesn't accept images]"),
    ]);
  });

  it('replaces unsupported media nested in tool results', () => {
    const result = run(
      [
        toolResult(text('Image read successfully'), {
          type: 'file',
          mediaType: 'image/png',
          filename: 'logo.png',
          data: { type: 'url', url: new URL('data:image/png;base64,aGVsbG8=') },
        }),
      ],
      { inputs: ['text'] },
    );

    expect(toolValue(result[0])).toEqual([
      text('Image read successfully'),
      text("[Can't read logo.png: this model doesn't accept images]"),
    ]);
  });

  it('preserves supported media', () => {
    const messages = [user(file('logo.png', 'image/png'))];

    expect(run(messages, { inputs: ['text', 'image'] })).toBe(messages);
  });

  it('allows every media type when the input types are unknown', () => {
    const messages = [
      user(
        file('logo.png', 'image/png'),
        file('report.pdf', 'application/pdf', 'JVBERg=='),
        file('memo.mp3', 'audio/mpeg', 'AAAA'),
        file('clip.mp4', 'video/mp4', 'AAAB'),
      ),
    ];

    expect(run(messages)).toBe(messages);
  });

  it('marks a URL image the model cannot read without fetching it', () => {
    const result = run(
      [user({ type: 'file', mediaType: 'image/png', data: new URL('https://example.com/a.png') })],
      { inputs: ['text'] },
    );

    expect(result[0]?.content).toEqual([
      text("[Can't read image: this model doesn't accept images]"),
    ]);
  });
});

describe('toModelInput: text and other files', () => {
  it('inlines embedded text files with their label, even for a model without text input', () => {
    const result = run(
      [
        user(
          file('notes.md', 'text/markdown', Buffer.from('# Notes').toString('base64')),
          file('index.ts', 'video/mp2t', new TextEncoder().encode('export {};')),
          {
            type: 'file',
            mediaType: 'text/plain',
            filename: 'a.txt',
            data: { type: 'text', text: 'hi' },
          },
        ),
      ],
      { inputs: ['image'] },
    );

    expect(result[0]?.content).toEqual([
      text('Attached file "notes.md":\n# Notes'),
      text('Attached file "index.ts":\nexport {};'),
      text('Attached file "a.txt":\nhi'),
    ]);
  });

  it('inlines a large text file whole', () => {
    const body = 'x'.repeat(5_000_000);

    const result = run([user(file('big.md', 'text/markdown', new TextEncoder().encode(body)))]);

    expect(result[0]?.content).toEqual([text(`Attached file "big.md":\n${body}`)]);
  });

  it('replaces other binary files with the unsupported marker', () => {
    const result = run([
      user(
        file('archive.zip', 'application/zip', Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0])),
        file('wide.txt', 'text/plain', Uint8Array.from([0xff, 0xfe, 0x68, 0x00])),
      ),
    ]);

    expect(result[0]?.content).toEqual([
      text("[Can't read archive.zip: this file type isn't supported]"),
      text("[Can't read wide.txt: this file type isn't supported]"),
    ]);
  });

  it('inlines invalid UTF-8 with replacement characters', () => {
    const result = run([user(file('latin.txt', 'text/plain', Uint8Array.from([0x63, 0xe9])))]);

    expect(result[0]?.content).toEqual([text('Attached file "latin.txt":\nc\ufffd')]);
  });
});

describe('toModelInput: duplicates', () => {
  it('sends only the newest copy of the same data', () => {
    const result = run([user(file('shot.png', 'image/png')), user(file('shot.png', 'image/png'))]);

    expect(contentOf(result)).toEqual([
      text('[File repeated later: shot.png]'),
      file('shot.png', 'image/png'),
    ]);
  });

  it('matches copies by content hash across encodings and names', () => {
    const bytes = Buffer.from('hello');
    const latest = file('copy.png', 'image/png', Uint8Array.from(bytes));

    const result = run([
      user(file('first.png', 'image/png', bytes.toString('base64'))),
      user({
        type: 'file',
        mediaType: 'image/png',
        filename: 'second.png',
        data: new URL('data:image/png;base64,aGVsbG8='),
      }),
      user(latest),
    ]);

    expect(contentOf(result)).toEqual([
      text('[File repeated later: first.png]'),
      text('[File repeated later: second.png]'),
      latest,
    ]);
  });

  it('sends two different files with the same name', () => {
    const messages = [
      user(file('shot.png', 'image/png', 'aGVsbG8=')),
      user(file('shot.png', 'image/png', 'd29ybGQ=')),
    ];

    expect(run(messages)).toBe(messages);
  });

  it('inlines a duplicated text file once', () => {
    const notes = Buffer.from('# Notes').toString('base64');

    const result = run([
      user(file('notes.md', 'text/markdown', notes)),
      user(file('notes.md', 'text/markdown', notes)),
    ]);

    expect(contentOf(result)).toEqual([
      text('[File repeated later: notes.md]'),
      text('Attached file "notes.md":\n# Notes'),
    ]);
  });

  it('does not count earlier copies towards the size rule', () => {
    const result = run([
      user(file('big.png', 'image/png', thirteen[0])),
      user(file('big.png', 'image/png', thirteen[0])),
    ]);

    expect(contentOf(result)).toEqual([
      text('[File repeated later: big.png]'),
      file('big.png', 'image/png', thirteen[0]),
    ]);
  });

  it('caches hashes by inline data for later steps', () => {
    const hashes = new Map();
    const messages = [
      user(file('a.png', 'image/png', 'aGVsbG8=')),
      user(file('b.png', 'image/png', 'd29ybGQ=')),
    ];

    toModelInput({ messages, inputs: undefined, provider: 'anthropic', hashes });
    toModelInput({ messages, inputs: undefined, provider: 'anthropic', hashes });

    expect([...hashes.keys()]).toEqual(['d29ybGQ=', 'aGVsbG8=']);
  });
});

describe('toModelInput: size rule', () => {
  it('preserves files below the trigger', () => {
    const messages = [user(file('logo.png', 'image/png'))];

    expect(run(messages)).toBe(messages);
  });

  it('passes a request of exactly 25 MiB unchanged', () => {
    const messages = [
      user(file('first.png', 'image/png', halfLimit[0])),
      user(file('second.png', 'image/png', halfLimit[1])),
    ];

    expect(run(messages)).toBe(messages);
  });

  it('replaces oldest files until the retained payload reaches the target', () => {
    const result = run([
      user(file('first.png', 'image/png', nine[0])),
      user(file('second.png', 'image/png', nine[1])),
      user(file('third.png', 'image/png', nine[2])),
    ]);

    expect(result[0]?.content).toEqual([text('[Image removed: first.png]')]);
    expect(result[1]?.content).toEqual([text('[Image removed: second.png]')]);
    expect(result[2]?.content).toEqual([file('third.png', 'image/png', nine[2])]);
  });

  it('replaces files nested in tool results', () => {
    const result = run([
      toolResult(
        { type: 'file-data', mediaType: 'image/png', filename: 'first.png', data: thirteen[0] },
        { type: 'file-data', mediaType: 'image/png', filename: 'second.png', data: thirteen[1] },
      ),
    ]);

    expect(toolValue(result[0])).toEqual([
      text('[Image removed: first.png]'),
      { type: 'file-data', mediaType: 'image/png', filename: 'second.png', data: thirteen[1] },
    ]);
  });

  it('counts every media type together', () => {
    const result = run([
      user(file('report.pdf', 'application/pdf', nine[0])),
      user(file('photo.png', 'image/png', nine[1])),
      user(file('memo.mp3', 'audio/mpeg', nine[2])),
    ]);

    expect(contentOf(result)).toEqual([
      text('[File removed: report.pdf]'),
      text('[Image removed: photo.png]'),
      file('memo.mp3', 'audio/mpeg', nine[2]),
    ]);
  });

  it('replaces a PDF nested in a tool result', () => {
    const result = run([
      toolResult(file('report.pdf', 'application/pdf', thirteen[0]), {
        type: 'image-data',
        mediaType: 'image/png',
        data: thirteen[1],
      }),
    ]);

    expect(toolValue(result[0])).toEqual([
      text('[File removed: report.pdf]'),
      { type: 'image-data', mediaType: 'image/png', data: thirteen[1] },
    ]);
  });

  it('replaces the newest file too when it alone is over the target', () => {
    const result = run([
      user(file('old.png', 'image/png', ten)),
      user(file('new.pdf', 'application/pdf', sixteen)),
    ]);

    expect(contentOf(result)).toEqual([
      text('[Image removed: old.png]'),
      text('[File removed: new.pdf]'),
    ]);
  });

  it('never counts URL files or text', () => {
    const messages = [
      user(
        text('x'.repeat(30 * MiB)),
        {
          type: 'file',
          mediaType: 'image/png',
          filename: 'remote.png',
          data: new URL('https://example.com/a.png'),
        },
        file('photo.png', 'image/png', nine[0]),
      ),
      toolResult({ type: 'image-url', url: 'https://example.com/b.png' }),
    ];

    expect(run(messages)).toBe(messages);
  });

  it('gives the same result when run twice', () => {
    const first = run([
      user(file('first.png', 'image/png', nine[0])),
      user(file('second.png', 'image/png', nine[1])),
      user(file('third.png', 'image/png', nine[2])),
    ]);

    expect(run(first)).toBe(first);
  });
});

describe('toModelInput: provider image count', () => {
  const images = Array.from({ length: 21 }, (_, index) =>
    file(`shot-${index}.png`, 'image/png', Buffer.from(`image ${index}`).toString('base64')),
  );

  it('replaces images older than the newest 20 for Bedrock', () => {
    const result = run([user(...images)], { provider: 'bedrock' });

    expect(result[0]?.content).toEqual([text('[Image removed: shot-0.png]'), ...images.slice(1)]);
  });

  it('keeps 21 images for a provider without a count limit', () => {
    const messages = [user(...images)];

    expect(run(messages, { provider: 'openai' })).toBe(messages);
  });
});

describe('toModelInput: marker wording', () => {
  it('no marker tells the model what to say', () => {
    const result = run(
      [
        user(file('photo.png', 'image/png', 'aGVsbG8=')),
        user(
          file('photo.png', 'image/png', 'aGVsbG8='),
          file('report.pdf', 'application/pdf', nine[0]),
          file('archive.zip', 'application/zip', Uint8Array.from([0x50, 0x4b, 0, 0])),
        ),
        user(file('a.mp3', 'audio/mpeg', nine[1]), file('b.mp3', 'audio/mpeg', nine[2])),
      ],
      { inputs: ['text', 'pdf', 'audio'] },
    );

    const markers = contentOf(result)
      .map((part) => (part as { text?: string }).text)
      .filter((value): value is string => value?.startsWith('[') ?? false);

    expect(markers).toHaveLength(5);
    markers.forEach((marker) => {
      expect(marker).not.toMatch(/inform the user|ask the user|tell the user/i);
    });
  });
});
