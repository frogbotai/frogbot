import { describe, expect, it } from 'vitest';

import { speechChunks, speechText } from '../../../../packages/ui/src/chat/speech-text.js';

describe('speechText', () => {
  it('removes emphasis, heading and list markers', () => {
    expect(speechText('# Plan\n\nThis is **bold** and *soft*.\n\n- one\n- two')).toBe(
      'Plan\n\nThis is bold and soft.\n\none\n\ntwo',
    );
  });

  it('keeps link text and drops images', () => {
    expect(speechText('See [the docs](https://example.com) ![chart](chart.png) now.')).toBe(
      'See the docs now.',
    );
  });

  it('skips inline code, fenced code and html', () => {
    expect(
      speechText('Run `pnpm test` first.\n\n```ts\nconst x = 1;\n```\n\n<div>raw</div>\n\nDone.'),
    ).toBe('Run first.\n\nDone.');
  });

  it('joins soft line breaks with a space', () => {
    expect(speechText('one\ntwo')).toBe('one two');
  });

  it('reads an html line break as a space', () => {
    expect(speechText('one<br>two<BR/>three')).toBe('one two three');
  });

  it('returns nothing for a code-only reply', () => {
    expect(speechText('```js\nconsole.log(1);\n```')).toBe('');
  });
});

describe('speechChunks', () => {
  const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

  it('keeps short text in one chunk and empty text in none', () => {
    expect(speechChunks('Hello there.')).toEqual(['Hello there.']);
    expect(speechChunks('')).toEqual([]);
  });

  it('splits a long reply into chunks of at most 4,000 characters that join back', () => {
    const sentence = 'The frog sat on a lily pad and watched the pond. ';
    const text = Array.from({ length: 5 }, () => sentence.repeat(90).trim()).join('\n\n');

    expect(text.length).toBeGreaterThan(10_000);

    const chunks = speechChunks(text);

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.length <= 4000)).toBe(true);
    expect(normalize(chunks.join(' '))).toBe(normalize(text));
  });

  it('prefers sentence boundaries inside a long paragraph', () => {
    const text = 'Short sentence here. '.repeat(30).trim();

    const chunks = speechChunks(text, 100);

    expect(chunks.every((chunk) => chunk.length <= 100)).toBe(true);
    expect(chunks.every((chunk) => chunk.endsWith('.'))).toBe(true);
    expect(normalize(chunks.join(' '))).toBe(text);
  });

  it('packs whole paragraphs together while they fit', () => {
    expect(speechChunks('aaa\n\nbbb\n\nccc', 8)).toEqual(['aaa\n\nbbb', 'ccc']);
  });

  it('hard-cuts a single word longer than the limit', () => {
    const chunks = speechChunks('x'.repeat(5000));

    expect(chunks.map((chunk) => chunk.length)).toEqual([4000, 1000]);
  });
});
