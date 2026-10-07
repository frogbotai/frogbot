import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseCards, rulingLine } from '../../../scripts/lib/decisions.mjs';
import { commandDecisions, parseArgs } from '../../../scripts/ticket.mjs';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'decisions', '_process');

const DATE = '2026-10-05';

const ALPHA = 'tickets/ticket901_alpha/step2_spec.md';

let main: string;

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

const run = () => commandDecisions(main, { date: DATE });

const answer = (open: string, card: string, text: string) =>
  open.replace(new RegExp(`(### 901 ${card} [\\s\\S]*?- \\*\\*Answer:\\*\\*)`), `$1 ${text}`);

const editOpen = (edit: (open: string) => string) =>
  writeFileSync(file('open_decisions.md'), edit(read('open_decisions.md')));

beforeEach(() => {
  main = mkdtempSync(join(tmpdir(), 'ticket-decisions-'));
  cpSync(FIXTURE, processDir(), { recursive: true });
  vi.spyOn(console, 'log').mockImplementation(() => {});
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

  it('lists open cards verbatim, Following Payload, Approve and ready batches', () => {
    run();

    const open = read('open_decisions.md');
    const spec = read(ALPHA);
    const card = spec.slice(spec.indexOf('### 901 D1'), spec.indexOf('### 901 D2')).trimEnd();

    expect(open).toContain('## 901 — Alpha');
    expect(open).toContain('Spec: [step2_spec.md](tickets/ticket901_alpha/step2_spec.md)');
    expect(open).toContain(card);
    expect(open).toContain('### 901 D2 — Which colour?');
    expect(open).toContain(
      '- Fields keep their order (`~/code/payload/packages/payload/src/fields/config/types.ts:10`).',
    );
    expect(open).toContain('\nApprove:\n');
    expect(open).toContain('## Batch 42 plans');
    expect(open).toContain('- 902: [step3_plan.md](tickets/ticket902_beta/step3_plan.md)');
    expect(open).toContain('\nGo:\n');
    expect(open).not.toContain('Batch 41');
    expect(open).not.toContain('Batch 43');
  });

  it('changes no file on a rerun with no new answers', () => {
    run();

    const before = snapshot();

    run();

    expect(snapshot()).toEqual(before);
  });

  it('writes answers back verbatim, adds a ruling for a topic, and drops the cards', () => {
    run();

    editOpen((open) =>
      answer(answer(open, 'D1', 'A, but keep "old" in the docs'), 'D2', 'B\nnavy, not sky'),
    );

    run();

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

    const open = read('open_decisions.md');

    expect(open).not.toContain('### 901 D1');
    expect(open).not.toContain('### 901 D2');
    expect(open).toContain('## 901 — Alpha');

    const after = snapshot();

    run();

    expect(snapshot()).toEqual(after);
  });

  it('approves with Approve: yes once every card is answered', () => {
    run();
    editOpen((open) => answer(open, 'D1', 'A').replace('\nApprove:\n', '\nApprove: yes\n'));
    run();

    expect(read(ALPHA)).toContain('Status: Draft');
    expect(read('open_decisions.md')).toContain('\nApprove: yes\n');

    editOpen((open) => answer(open, 'D2', 'A'));
    run();

    expect(read(ALPHA)).toContain(`Status: Approved (${DATE})`);
    expect(read('open_decisions.md')).not.toContain('## 901');
  });

  it('copies any other Approve text into Owner notes and keeps the spec Draft', () => {
    run();
    editOpen((open) => open.replace('\nApprove:\n', '\nApprove: drop the Payload line\n'));
    run();

    const spec = read(ALPHA);

    expect(spec).toContain('Status: Draft');
    expect(spec.endsWith(`\n\n## Owner notes\n\n- ${DATE}: drop the Payload line\n`)).toBe(true);
    expect(read('open_decisions.md')).toContain('\nApprove:\n');
  });

  it('sets every plan in the batch to Go with Go: yes', () => {
    run();
    editOpen((open) => open.replace('\nGo:\n', '\nGo: yes\n'));
    run();

    for (const plan of ['ticket902_beta', 'ticket903_gamma']) {
      expect(read(`tickets/${plan}/step3_plan.md`)).toContain(`Status: Go (${DATE})`);
    }

    expect(read('tickets/ticket904_delta/step3_plan.md')).toContain('Status: Draft');
    expect(read('open_decisions.md')).not.toContain('Batch 42');
  });

  it('matches cards by ticket and ID, refusing an answer to a card that is gone', () => {
    run();
    editOpen((open) => answer(open, 'D1', 'A'));
    writeFileSync(file(ALPHA), read(ALPHA).replace('### 901 D1', '### 901 D7'));

    const before = snapshot();

    expect(run).toThrow('901 D1 is not a card in step2_spec.md');
    expect(snapshot()).toEqual(before);
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
