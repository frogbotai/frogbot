import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { run } from '../../../scripts/check-ticket-docs.mjs';

const FIXTURES = path.join(import.meta.dirname, 'fixtures', 'ticketDocs');
const GOOD = '_process/tickets/ticket900_good';
const RESEARCH = `${GOOD}/step1_research.md`;
const SPEC = `${GOOD}/step2_spec.md`;
const PLAN = `${GOOD}/step3_plan.md`;
const ROW_1 =
  '- DR-001 "keep it simple" → Prefer the smallest change. [source](archive/notes.md#L1)';

const ROW_2 =
  '- DR-002 (summary) new tests fail first → Every new test fails before the change. [source](archive/notes.md#L2)';

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(file: string) {
  return readFileSync(path.join(FIXTURES, 'idea', file), 'utf8');
}

function edit(file: string, from: string, to: string) {
  const text = fixture(file);

  expect(text).toContain(from);

  return { [file]: text.replace(from, to) };
}

function check(
  files: Record<string, string> = {},
  { argv = [], copy = [] }: { argv?: string[]; copy?: string[] } = {},
) {
  const idea = mkdtempSync(path.join(os.tmpdir(), 'ticket-docs-'));

  temps.push(idea);
  cpSync(path.join(FIXTURES, 'idea'), idea, { recursive: true });

  for (const folder of copy) {
    cpSync(path.join(FIXTURES, 'broken', folder), path.join(idea, '_process', 'tickets', folder), {
      recursive: true,
    });
  }

  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(idea, file)), { recursive: true });
    writeFileSync(path.join(idea, file), text);
  }

  return run({
    idea,
    root: path.join(FIXTURES, 'repo'),
    home: path.join(FIXTURES, 'home'),
    argv,
  });
}

function problems(files: Record<string, string>) {
  const result = check(files);

  expect(result.code).toBe(1);

  return result.lines;
}

describe('check ticket-docs', () => {
  it('passes a ticket that follows every template', () => {
    expect(check()).toEqual({ code: 0, lines: ['ticket-docs: OK · 1 ticket'] });
  });

  it('prints one skip line outside the main checkout, where .idea/ holds only tmp/', () => {
    const idea = mkdtempSync(path.join(os.tmpdir(), 'ticket-docs-'));

    temps.push(idea);
    mkdirSync(path.join(idea, 'tmp'));

    expect(run({ idea, root: FIXTURES, home: FIXTURES })).toEqual({
      code: 0,
      lines: [
        'ticket-docs: skipped, no .idea/_process/tickets/ here (run it in the main checkout)',
      ],
    });
  });

  it('reports every problem in a broken folder as file:line message and exits 1', () => {
    const folder = '.idea/_process/tickets/ticket901_broken';

    expect(check({}, { copy: ['ticket901_broken'] })).toEqual({
      code: 1,
      lines: [
        `${folder}/issue.md:3 Batch: "soon" is not a number, none or deferred`,
        `${folder}/step1_research.md:3 Status: "research, 2026-10-04. Copied from the process audit; no new…" is not Draft or Done (<date>)`,
        `${folder}/step1_research.md:7 bare "none": write "none (read: <topic>, …)" with the decisions.md headings read`,
        `${folder}/step1_research.md:8 \`src/example.ts:40\`: line 40 is out of range (3 lines)`,
        `${folder}/step2_spec.md:1 missing "## Rulings" (right after "## Problem")`,
        `${folder}/step2_spec.md:11 banned phrase "legacy path" (allowed only under Out of scope or in a > quote)`,
        `${folder}/step3_plan.md:7 \`src/missing.ts:3\`: no such file`,
        `${folder}/step3_plan.md:9 "touches:" must come first, right after Status:`,
        `${folder}/step3_plan.md:15 stage 1: missing "Verify:" and "Evidence:"`,
      ],
    });
  });

  it('checks only the named tickets', () => {
    const result = check(
      { '_process/found.md': '- F-1 broken row\n' },
      { argv: ['.idea/_process/tickets/ticket900_good/'], copy: ['ticket901_broken'] },
    );

    expect(result).toEqual({ code: 0, lines: ['ticket-docs: OK · 1 ticket'] });
  });

  it('refuses an argument that is not a ticket', () => {
    expect(check({}, { argv: ['--all'] }).code).toBe(2);
  });

  describe('status', () => {
    it('rejects a research Status that is not Draft or Done', () => {
      const lines = problems(
        edit(
          RESEARCH,
          'Status: Done (2026-10-05)',
          'Status: research, 2026-10-04. Copied from the process audit',
        ),
      );

      expect(lines).toEqual([
        `.idea/${RESEARCH}:3 Status: "research, 2026-10-04. Copied from the process audit" is not Draft or Done (<date>)`,
      ]);
    });

    it('rejects a plan with no Status line', () => {
      expect(problems(edit(PLAN, 'Status: Go (2026-10-05)\n\n', ''))).toEqual([
        `.idea/${PLAN}:1 missing "Status: Draft or Go (<date>)"`,
      ]);
    });
  });

  describe('rulings', () => {
    it('rejects a rulings line that differs from its decisions.md row', () => {
      const lines = problems(
        edit(
          RESEARCH,
          ROW_1,
          '- DR-001 "keep it simple" → Prefer small changes. [source](archive/notes.md#L1)',
        ),
      );

      expect(lines).toEqual([
        `.idea/${RESEARCH}:8 DR-001 differs from decisions.md:5; copy the row whole`,
      ]);
    });

    it('rejects a ruling that is not in decisions.md', () => {
      const lines = problems({
        ...edit(RESEARCH, ROW_1, ROW_1.replace('DR-001', 'DR-099')),
        ...edit(SPEC, ROW_1, ROW_1.replace('DR-001', 'DR-099')),
      });

      expect(lines).toEqual([
        `.idea/${RESEARCH}:8 DR-099 is not in decisions.md`,
        `.idea/${SPEC}:11 DR-099 is not in decisions.md`,
      ]);
    });

    it('rejects a spec ## Rulings set that differs from the research', () => {
      const lines = problems(edit(SPEC, ROW_1, `${ROW_1}\n${ROW_2}`));

      expect(lines).toEqual([
        `.idea/${SPEC}:9 rulings differ from the research Summary (not in the research: DR-002)`,
      ]);
    });

    it('accepts none (read: …) naming decisions.md headings', () => {
      const result = check({
        ...edit(
          RESEARCH,
          `- **Rulings:**\n  ${ROW_1}`,
          '- **Rulings:** none (read: Process, Testing)',
        ),
        ...edit(SPEC, ROW_1, 'none (read: Process)'),
      });

      expect(result.code).toBe(0);
    });

    it('rejects none (read: …) naming a heading decisions.md does not have', () => {
      const lines = problems(
        edit(RESEARCH, `- **Rulings:**\n  ${ROW_1}`, '- **Rulings:** none (read: Process, Gates)'),
      );

      expect(lines).toEqual([
        `.idea/${RESEARCH}:7 "Gates" is not a decisions.md heading`,
        `.idea/${SPEC}:9 rulings differ from the research Summary (not in the research: DR-001)`,
      ]);
    });

    it('rejects a bare none', () => {
      const lines = problems({
        ...edit(RESEARCH, `- **Rulings:**\n  ${ROW_1}`, '- **Rulings:** none (read: Process)'),
        ...edit(SPEC, ROW_1, 'none'),
      });

      expect(lines).toEqual([
        `.idea/${SPEC}:11 bare "none": write "none (read: <topic>, …)" with the decisions.md headings read`,
      ]);
    });

    it('rejects a research Summary with no rulings', () => {
      const lines = problems({
        ...edit(RESEARCH, `- **Rulings:**\n  ${ROW_1}\n`, ''),
        ...edit(SPEC, ROW_1, 'none (read: Process)'),
      });

      expect(lines).toEqual([
        `.idea/${RESEARCH}:5 no rulings: copy each applying decisions.md row whole, or write "Rulings: none (read: <topic>, …)"`,
      ]);
    });

    it('rejects a spec from the 419b8c12 template, which has no ## Rulings', () => {
      const lines = problems(edit(SPEC, `## Rulings\n\n${ROW_1}\n\n`, ''));

      expect(lines).toEqual([`.idea/${SPEC}:1 missing "## Rulings" (right after "## Problem")`]);
    });

    it('rejects ## Rulings anywhere but right after ## Problem', () => {
      const text = fixture(SPEC)
        .replace(`## Rulings\n\n${ROW_1}\n\n`, '')
        .replace('## Out of scope', `## Rulings\n\n${ROW_1}\n\n## Out of scope`);

      expect(problems({ [SPEC]: text })).toEqual([
        `.idea/${SPEC}:17 "## Rulings" must come right after "## Problem"`,
      ]);
    });
  });

  describe('cards', () => {
    it('rejects a card written from the 55e7e942 D-block template', () => {
      const card = [
        '### D1 — Save on create or on update?',
        '',
        '- Status: Open; blocks Step 2.',
        '- Context: An asset is written on create and again on update.',
        '- A — On create: one write.',
        '- B — On update: one write, later.',
        '- Recommendation: A, because it is simpler.',
        '- Decision impact: Requirement 1.',
        '- Owner answer: Pending. Ask for “D1: A” or “D1: B”.',
        '',
      ].join('\n');

      const text = fixture(SPEC).replace(/### 900 D1[\s\S]*$/, card);

      expect(problems({ [SPEC]: text })).toEqual([
        `.idea/${SPEC}:31 card D1: missing "Situation", "Example", "Payload does", "Options", "Applies to", "Reply", "Answer"`,
      ]);
    });

    it('rejects "Payload does:" with no path:line or searched note', () => {
      const lines = problems(
        edit(
          SPEC,
          '- **Payload does:** saves in `afterChange` (`~/code/payload/src/config.ts:2`).',
          '- **Payload does:** the same thing.',
        ),
      );

      expect(lines).toEqual([
        `.idea/${SPEC}:38 card D1: "Payload does:" needs a \`path:line\` or "no equivalent (searched …)"`,
      ]);
    });

    it('accepts "Payload does: no equivalent (searched …)"', () => {
      const result = check(
        edit(
          SPEC,
          '- **Payload does:** saves in `afterChange` (`~/code/payload/src/config.ts:2`).',
          '- **Payload does:** no equivalent (searched `afterChange`, `beforeChange`).',
        ),
      );

      expect(result.code).toBe(0);
    });

    it('rejects "Applies to:" naming neither this ticket nor a decisions.md heading', () => {
      const lines = problems(edit(SPEC, '- **Applies to:** Process', '- **Applies to:** Gates'));

      expect(lines).toEqual([
        `.idea/${SPEC}:41 card D1: "Applies to:" is "Gates", not "this ticket" or a decisions.md heading`,
      ]);
    });
  });

  describe('plans', () => {
    it('rejects a plan stage written from the 419b8c12 template (no Verify: or Evidence:)', () => {
      const lines = problems(
        edit(
          PLAN,
          '   - Verify: `pnpm test:unit test/unit/assets.spec.ts`\n   - Evidence: unit',
          '   - Tests: <spec files and commands>.',
        ),
      );

      expect(lines).toEqual([`.idea/${PLAN}:21 stage 1: missing "Verify:" and "Evidence:"`]);
    });

    it('rejects a stage with Verify: but no Evidence:', () => {
      expect(problems(edit(PLAN, '\n   - Evidence: unit', ''))).toEqual([
        `.idea/${PLAN}:21 stage 1: missing "Evidence:"`,
      ]);
    });

    it('rejects a plan with more than 3 stages', () => {
      const stage = (n: number) =>
        `${n}. Step ${n}.\n   - Verify: \`pnpm test:unit test/unit/assets.spec.ts\`\n   - Evidence: unit\n`;

      const lines = problems({
        [PLAN]: `${fixture(PLAN)}${[2, 3, 4].map(stage).join('')}`,
      });

      expect(lines).toEqual([`.idea/${PLAN}:30 4 stages (max 3); split the ticket`]);
    });

    it('rejects a plan with no touches:', () => {
      expect(problems(edit(PLAN, 'touches:\n\n- src/example.ts\n\n', ''))).toEqual([
        `.idea/${PLAN}:1 missing "touches:"`,
      ]);
    });
  });

  describe('banned phrases', () => {
    it('rejects wording from 50a6a03d ("exists for backward compat") in a plan', () => {
      const lines = problems(
        edit(
          PLAN,
          '- Save twice: wasteful.',
          '- Keep `request.ts`: this module exists for backward compat and testing.',
        ),
      );

      expect(lines).toEqual([
        `.idea/${PLAN}:17 banned phrase "backward compat" (allowed only under Out of scope or in a > quote)`,
      ]);
    });

    it('rejects each phrase outside Out of scope and > quotes', () => {
      const lines = problems(
        edit(
          SPEC,
          '1. Saving an asset writes it once.',
          '1. Write a migration guide and a release note for deprecated options.',
        ),
      );

      expect(lines).toEqual([
        `.idea/${SPEC}:15 banned phrase "migration guide" (allowed only under Out of scope or in a > quote)`,
        `.idea/${SPEC}:15 banned phrase "deprecat" (allowed only under Out of scope or in a > quote)`,
        `.idea/${SPEC}:15 banned phrase "release note" (allowed only under Out of scope or in a > quote)`,
      ]);
    });
  });

  describe('budgets', () => {
    it('rejects a research Summary over 40 lines', () => {
      const extra = Array.from({ length: 35 }, (_, index) => `- Fact ${index + 1}.`).join('\n');

      expect(
        problems(edit(RESEARCH, '- **Risks:** none.', `- **Risks:** none.\n${extra}`)),
      ).toEqual([`.idea/${RESEARCH}:5 Summary is 41 lines (max 40)`]);
    });

    it('rejects a spec over 1,500 words and a plan over 2,000', () => {
      const words = (count: number) => Array.from({ length: count }, () => 'word').join(' ');
      const length = (text: string) =>
        text.split(/\s+/).filter(Boolean).length.toLocaleString('en-US');

      const files = {
        ...edit(SPEC, '## Requirements', `${words(1500)}\n\n## Requirements`),
        ...edit(PLAN, '## Alternatives', `${words(2000)}\n\n## Alternatives`),
      };

      expect(problems(files)).toEqual([
        `.idea/${SPEC}:1 spec is ${length(files[SPEC])} words (max 1,500)`,
        `.idea/${PLAN}:1 plan is ${length(files[PLAN])} words (max 2,000)`,
      ]);
    });
  });

  describe('citations', () => {
    it('rejects a citation of a file 419b8c12 deleted', () => {
      const lines = problems(
        edit(
          RESEARCH,
          '- **Risks:** none.',
          '- **Risks:** the D-block template has no Payload field (`.github/feature-process/step1_feature_description.md:26-36`).',
        ),
      );

      expect(lines).toEqual([
        `.idea/${RESEARCH}:12 \`.github/feature-process/step1_feature_description.md:26-36\`: no such file`,
      ]);
    });

    it('rejects a follow-on :line past the end of the cited file', () => {
      const lines = problems(edit(PLAN, '(`src/example.ts:1`)', '(`src/example.ts:1`, `:2-9`)'));

      expect(lines).toEqual([`.idea/${PLAN}:11 \`:2-9\`: line 9 is out of range (3 lines)`]);
    });

    it('rejects a symbol that is not within 3 lines of its citation', () => {
      const lines = problems(edit(RESEARCH, '`afterChange` hooks (', '`beforeValidate` ('));

      expect(lines).toEqual([
        `.idea/${RESEARCH}:10 \`beforeValidate\` is not within 3 lines of \`~/code/payload/src/config.ts:2\``,
      ]);
    });

    it('warns once and passes when a reference repo is missing', () => {
      const result = check(
        edit(
          RESEARCH,
          '- **Risks:** none.',
          '- **Risks:** see `~/code/opencode-v2/a.ts:1` and `~/code/opencode-v2/b.ts:2`.',
        ),
      );

      expect(result).toEqual({
        code: 0,
        lines: [
          `.idea/${RESEARCH}:12 warning: reference repo ~/code/opencode-v2 is missing; its citations are not checked`,
          'ticket-docs: OK · 1 ticket',
        ],
      });
    });
  });

  describe('issue.md and the PLAN table', () => {
    it('rejects an issue.md whose title, section and depends differ from PLAN', () => {
      const lines = problems({
        [`${GOOD}/issue.md`]: fixture(`${GOOD}/issue.md`)
          .replace('Good ticket', 'Great ticket')
          .replace('PLAN.md P1', 'PLAN.md P3')
          .replace('Depends on: none', 'Depends on: 899'),
      });

      expect(lines).toEqual([
        `.idea/${GOOD}/issue.md:1 title "Great ticket" is "Good ticket" in audits/process/PLAN.md:7`,
        `.idea/${GOOD}/issue.md:3 Plan: P3, but audits/process/PLAN.md:7 says P1`,
        `.idea/${GOOD}/issue.md:3 Depends on: 899, but audits/process/PLAN.md:7 says none`,
      ]);
    });

    it('rejects an issue.md with no header line', () => {
      expect(
        problems({ [`${GOOD}/issue.md`]: '# Ticket 900 — Good ticket\n\nNo header.\n' }),
      ).toEqual([
        `.idea/${GOOD}/issue.md:1 missing the "Plan: … · Depends on: … · Batch: …" header line`,
      ]);
    });

    it('rejects a folder for a cut ticket and a live ticket with no folder', () => {
      const lines = problems({
        '_process/tickets/ticket902_idea/issue.md': '# Ticket 902 — cut\n',
        'audits/process/PLAN.md': `${fixture('audits/process/PLAN.md')}| 903 | Later | P2 | 900 | 2 |\n`,
      });

      expect(lines).toEqual([
        '.idea/audits/process/PLAN.md:8 ticket 902 is cut or merged but has a folder: _process/tickets/ticket902_idea',
        '.idea/audits/process/PLAN.md:9 ticket 903 has no folder in _process/tickets/',
      ]);
    });

    it('counts an archived folder as present and does not check it', () => {
      const result = check({
        '_process/archive/tickets/ticket903_later/issue.md': '# Ticket 903 — no header\n',
        '_process/archive/tickets/ticket903_later/step3_plan.md': '# Plan\n',
        'audits/process/PLAN.md': `${fixture('audits/process/PLAN.md')}| 903 | Later | P2 | 900 | 2 |\n`,
      });

      expect(result).toEqual({ code: 0, lines: ['ticket-docs: OK · 1 ticket'] });
    });
  });

  describe('decisions.md and found.md', () => {
    it('rejects malformed and duplicate rows', () => {
      const lines = problems({
        '_process/decisions.md': `${fixture('_process/decisions.md')}- DR-003 keep it simple, Prefer the smallest change.\n${ROW_2}\n`,
        '_process/found.md': `${fixture('_process/found.md')}- F-002 cleanup · repo · Untracked folders. [source](x.md)\n`,
      });

      expect(lines).toEqual([
        '.idea/_process/decisions.md:10 row is not `- DR-nnn "quote" → rule. [source](link)` (or `(summary)` for the quote)',
        '.idea/_process/decisions.md:11 DR-002 is also on line 9',
        '.idea/_process/found.md:4 row is not `- F-nnn <bug|pre-existing failure|test gap|docs|idea> · area · description. [source](link)`',
      ]);
    });

    it('rejects more than 60 rulings', () => {
      const rows = Array.from(
        { length: 59 },
        (_, index) =>
          `- DR-${String(index + 3).padStart(3, '0')} (summary) rule ${index} → Do it. [source](x.md)`,
      );

      expect(
        problems({
          '_process/decisions.md': `${fixture('_process/decisions.md')}${rows.join('\n')}\n`,
        }),
      ).toEqual([
        '.idea/_process/decisions.md:1 61 rulings (max 60); move enforced rows to the archive',
      ]);
    });
  });
});
