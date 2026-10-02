import { describe, expect, it } from 'vitest';

import { limitText } from '../../../../../packages/frogbot/src/uploads/office/limitText.js';

const filename = 'report.docx';

describe('limitText', () => {
  it('keeps text of exactly 60,000 characters whole', () => {
    const text = `${'x'.repeat(99)}\n`.repeat(600);

    expect(limitText({ text, filename })).toBe(text);
  });

  it('cuts text one character over at the last line break and says what is shown', () => {
    const text = `${`${'x'.repeat(99)}\n`.repeat(600)}y`;

    const limited = limitText({ text, filename });

    expect(limited).toBe(
      `${text.slice(0, 59_999)}\n[report.docx: showing the first 59,999 of 60,001 characters]`,
    );
  });

  it('cuts a single long line at the limit', () => {
    const limited = limitText({ text: 'a'.repeat(70_000), filename });

    expect(limited).toBe(
      `${'a'.repeat(60_000)}\n[report.docx: showing the first 60,000 of 70,000 characters]`,
    );
  });

  it('never splits a surrogate pair at the limit', () => {
    const text = `${'a'.repeat(59_999)}😀${'b'.repeat(10)}`;

    const limited = limitText({ text, filename });

    expect(limited).toBe(
      `${'a'.repeat(59_999)}\n[report.docx: showing the first 59,999 of 60,011 characters]`,
    );
  });
});
