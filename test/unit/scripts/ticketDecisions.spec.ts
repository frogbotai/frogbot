import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseCards, parseReplies, rulingLine } from '../../../scripts/lib/decisions.mjs';
import { commandDecisions, parseArgs } from '../../../scripts/ticket.mjs';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'decisions', '_process');

const DATE = '2026-10-05';

const ALPHA = 'tickets/ticket901_alpha/step2_spec.md';

let main: string;

let log: ReturnType<typeof vi.spyOn>;

const processDir = () => join(main, '.idea', '_process');

const file = (name: string) => join(processDir(), name);

const read = (name: string) => readFileSync(file(name), 'utf8');

const snapshot = () =>
  Object.fromEntries(
    readdirSync(processDir(), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const path = join(entry.parentPath, entry.name);

        return [relative(main, path), readFileSync(path, 'utf8')];
      }),
  );

const run = (input = '') => commandDecisions(main, { date: DATE, input });

const printed = () => log.mock.calls.map((call: unknown[]) => String(call[0])).join('\n');

beforeEach(() => {
  main = mkdtempSync(join(tmpdir(), 'ticket-decisions-'));
  cpSync(FIXTURE, processDir(), { recursive: true });
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(main, { recursive: true, force: true });
});

describe('pnpm ticket decisions', () => {
  it('is a command', () => {
    expect(parseArgs(['decisions'])).toEqual({ command: 'decisions' });
    expect(parseArgs(['decisions', '5'])).toMatchObject({ error: 'decisions takes no arguments' });
  });

  it('with no replies, lists what waits and writes no file', () => {
    const before = snapshot();

    run();

    expect(snapshot()).toEqual(before);
    expect(printed()).toBe(
      [
        'Waiting for the owner (ask in chat, from each spec’s Brief):',
        `901 — Alpha (${ALPHA})`,
        '  D1 — Should alpha keep the old flag?',
        '  D2 — Which colour?',
        '  approve',
        'batch 42: go (902, 903)',
      ].join('\n'),
    );
  });

  it('leaves parked tickets out', () => {
    run();

    expect(printed()).not.toContain('906');
    expect(printed()).not.toContain('batch 44');
    expect(() => run('906 D1: A')).toThrow('906 D1: ticket 906 is parked');
  });

  it('writes replies verbatim, adds a ruling for a topic, and is a no-op when repeated', () => {
    const reply = '901 D1: A, but keep "old" in the docs\n901 d2: B\n  navy, not sky\n';

    run(reply);

    const spec = read(ALPHA);

    expect(spec).toContain('- **Answer:** A, but keep "old" in the docs\n');
    expect(spec).toContain('- **Answer:** B\n  navy, not sky\n');
    expect(spec).toContain('Status: Draft');

    const line = spec.split('\n').indexOf('- **Answer:** A, but keep "old" in the docs') + 1;
    const rulings = read('decisions.md');

    expect(rulings).toContain(
      `- DR-036 "go right to implementation" (2026-10-05) → Process tickets skip the spec. [source](audits/PLAN.md#L68)\n- DR-041 "A, but keep "old" in the docs" (${DATE}) → 901 D1 Should alpha keep the old flag? A: Remove it, simpler. [source](${ALPHA}#L${line})\n\n## Testing`,
    );
    expect(rulings.match(/DR-04\d/g)).toEqual(['DR-041']);
    expect(printed()).toContain(`901 — Alpha (${ALPHA})\n  approve`);

    const after = snapshot();

    run(reply);

    expect(snapshot()).toEqual(after);
  });

  it('approves once every card is answered, in the same message or later', () => {
    expect(() => run('901 D1: A\n901 approve')).toThrow('901 approve: D2 has no answer yet');
    expect(read(ALPHA)).toContain('Status: Draft');

    run('901 approve\n901 D1: A\n901 D2: A');

    expect(read(ALPHA)).toContain(`Status: Approved (${DATE})`);
    expect(printed()).not.toContain('901 — Alpha');
  });

  it('adds a note to Owner notes and keeps the spec Draft', () => {
    run('901 note: drop the Payload line');

    const spec = read(ALPHA);

    expect(spec).toContain('Status: Draft');
    expect(spec.endsWith(`\n\n## Owner notes\n\n- ${DATE}: drop the Payload line\n`)).toBe(true);
  });

  it('sets every plan in the batch to Go', () => {
    run('go 42');

    for (const plan of ['ticket902_beta', 'ticket903_gamma']) {
      expect(read(`tickets/${plan}/step3_plan.md`)).toContain(`Status: Go (${DATE})`);
    }

    expect(read('tickets/ticket904_delta/step3_plan.md')).toContain('Status: Draft');
    expect(printed()).not.toContain('batch 42: go');
    expect(() => run('go 43')).toThrow('go 43: no step3_plan.md yet for 905');
  });

  it('refuses the whole message for one bad line, writing nothing', () => {
    const before = snapshot();

    expect(() => run('901 D1: A\n901 D7: B')).toThrow('901 D7 is not a card in step2_spec.md');
    expect(() => run('901 D1: A\nsounds good')).toThrow('line 2 is not a reply: "sounds good"');
    expect(() => run('901 D1:')).toThrow("901 D1: no text; write the owner's words");
    expect(snapshot()).toEqual(before);
  });

  it('refuses an answer that differs from the one already recorded', () => {
    run('901 D1: A');

    expect(() => run('901 D1: B')).toThrow('901 D1 is already answered differently');
  });
});

describe('decision helpers', () => {
  it('reads cards with or without the ticket number in the heading', () => {
    const cards = parseCards(
      '### D1 — One?\n\n- **Applies to:** this ticket\n- **Answer:** A\n\n### 5 D2 — Two?\n\n- **Applies to:** `Code style`\n- **Answer:**\n\n## Owner notes\n',
    );

    expect(cards.map(({ id, title, answer, topic }) => ({ id, title, answer, topic }))).toEqual([
      { id: 'D1', title: 'One?', answer: 'A', topic: null },
      { id: 'D2', title: 'Two?', answer: '', topic: 'Code style' },
    ]);
  });

  it('reads reply lines, with following lines continuing an answer', () => {
    expect(parseReplies('5 D1: A\n  and more\n\n5 approve\ngo 42\n').replies).toEqual([
      { kind: 'answer', ticket: 5, id: 'D1', text: 'A\nand more' },
      { kind: 'approve', ticket: 5 },
      { kind: 'go', batch: '42' },
    ]);
  });

  it('builds a ruling row from the owner text and the card', () => {
    expect(
      rulingLine({
        id: 7,
        ticket: 5,
        card: { id: 'D2', title: 'Two?', options: '**A.** Yes. **B.** No.' },
        answer: 'free text\nsecond line',
        date: DATE,
        source: 'tickets/x/step2_spec.md#L9',
      }),
    ).toBe(
      `- DR-007 "free text / second line" (${DATE}) → 5 D2 Two? [source](tickets/x/step2_spec.md#L9)`,
    );
  });
});
