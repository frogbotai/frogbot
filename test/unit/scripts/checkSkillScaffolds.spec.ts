import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  checkScaffolds,
  scaffoldCopies,
  scaffoldFences,
} from '../../../scripts/check-skill-scaffolds.mjs';

let directory: string | undefined;

afterEach(() => {
  if (directory) rmSync(directory, { force: true, recursive: true });

  directory = undefined;
});

function check(files: Record<string, string>) {
  directory = mkdtempSync(path.join(os.tmpdir(), 'check-skill-scaffolds-'));

  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    writeFileSync(path.join(directory, file), content);
  }

  return checkScaffolds({
    fences: scaffoldFences({ root: directory }),
    copies: scaffoldCopies({ root: directory }),
  });
}

const workflow = "// src/jobs/approvalWorkflow.ts\nexport const slug = 'approval';\n";

const jobsMd = (body: string) =>
  `# Jobs\n\nCopy this file.\n\n\`\`\`ts\n${body}\`\`\`\n\nThen register it.\n`;

const md = 'skills/frogbot/reference/JOBS.md';

const copy = 'test/types/skill/scaffolds/jobs/src/jobs/approvalWorkflow.ts';

describe('checkScaffolds', () => {
  it('passes a fence and its copy, with or without a host file beside them', () => {
    expect(check({ [md]: jobsMd(workflow), [copy]: workflow })).toEqual([]);
    expect(
      check({
        [md]: jobsMd(workflow),
        [copy]: workflow,
        'test/types/skill/scaffolds/jobs/src/frogbot.config.ts':
          '// host: stands in for the app config\nexport default {};\n',
      }),
    ).toEqual([]);
  });

  it('passes with no scaffolds, and skips fences that are not path-headed ts', () => {
    expect(check({})).toEqual([]);
    expect(
      check({
        [md]: '```ts\nconst a = 1;\n```\n\n```bash\n// src/x.ts\n```\n\n````md\n```ts\n// src/y.ts\n```\n````\n',
      }),
    ).toEqual([]);
  });

  it('names the Markdown line, the copy and the first differing line on a one-character change', () => {
    expect(
      check({ [md]: jobsMd(workflow.replace("'approval'", "'approvaL'")), [copy]: workflow }),
    ).toEqual([
      `${md}:5 scaffold src/jobs/approvalWorkflow.ts differs from ${copy} (first difference at line 2)`,
    ]);
  });

  it('names the copy and the expected Markdown file when a copy has no fence', () => {
    expect(check({ [md]: '# Jobs\n', [copy]: workflow })).toEqual([
      `${copy} has no scaffold fence (expected a fence starting "// src/jobs/approvalWorkflow.ts" in ${md})`,
    ]);
  });

  it('names the fence and the expected copy when a fence has no copy', () => {
    expect(check({ [md]: jobsMd(workflow) })).toEqual([
      `${md}:5 scaffold src/jobs/approvalWorkflow.ts has no copy (expected ${copy})`,
    ]);
  });

  it('rejects a copy whose path comment does not match where it sits', () => {
    const moved = 'test/types/skill/scaffolds/jobs/src/jobs/other.ts';

    expect(check({ [md]: jobsMd(workflow), [copy]: workflow, [moved]: workflow })).toEqual([
      `${moved} says // src/jobs/approvalWorkflow.ts but sits at src/jobs/other.ts`,
    ]);
  });

  it('rejects two fences with one key', () => {
    expect(check({ [md]: `${jobsMd(workflow)}\n${jobsMd(workflow)}`, [copy]: workflow })).toEqual([
      `${md}:16 scaffold src/jobs/approvalWorkflow.ts repeats ${md}:5 (both map to ${copy})`,
    ]);
  });
});
