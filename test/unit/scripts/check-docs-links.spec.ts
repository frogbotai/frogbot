import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const script = new URL('../../../scripts/check-docs-links.mjs', import.meta.url);
const roots: string[] = [];

function createDocs({
  general = ['index', 'configuration/overview'],
  other = ['agents/alternate'],
  redirects = [],
}: {
  general?: string[];
  other?: string[];
  redirects?: { destination: string; source: string }[];
} = {}) {
  const repo = join(tmpdir(), `frogbot-docs-links-${process.pid}-${roots.length}`);
  const root = join(repo, 'docs');

  roots.push(repo);
  mkdirSync(root, { recursive: true });

  writeFileSync(
    join(root, 'docs.json'),
    JSON.stringify({
      navigation: {
        tabs: [
          { tab: 'General', groups: [{ group: 'Guides', pages: general }] },
          { tab: 'Reference', groups: [{ group: 'External', pages: other }] },
        ],
      },
      redirects,
    }),
  );

  return root;
}

function writePage(root: string, id: string, content = '# Page') {
  const file = join(root, `${id}.mdx`);

  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, content);
}

function writeRepoFile(root: string, name: string, content: string) {
  const file = join(root, '..', name);

  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, content);
}

function contributing(link: string) {
  return [
    '# Contributing',
    '',
    '## Design principles',
    '',
    '- **Core is an execution engine.** Decide with [Core or plugin](#core-or-plugin).',
    '',
    '### Core or plugin',
    '',
    `See ${link}.`,
    '',
    '```md',
    '[Ignored](missing-in-fence.md)',
    '```',
  ].join('\n');
}

function repoDocs(link: string) {
  const root = createDocs({ general: ['index'] });

  writePage(root, 'index');
  writeRepoFile(root, 'CONTRIBUTING.md', contributing(link));

  writeRepoFile(
    root,
    'CLAUDE.md',
    'Read [Design principles](CONTRIBUTING.md#design-principles) and [the guide](https://example.com/missing) and `~/code/payload`.',
  );

  writeRepoFile(root, 'test/README.md', '# Tests\n\n## Live tests (real credentials)\n\nRun them.');

  return root;
}

function run(root: string) {
  return spawnSync(process.execPath, [script.pathname, root], { encoding: 'utf8' });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe('check-docs-links', () => {
  it('accepts canonical links, assets, multiline links, references, and code examples', () => {
    const root = createDocs();

    writePage(
      root,
      'index',
      [
        '[Overview](',
        '  /configuration/overview#setup',
        ')',
        '[Reference][overview]',
        '[overview]: https://docs.frogbot.ai/configuration/overview?source=test',
        '<Card href="/configuration/overview" image="/images/card.png" />',
        '<Card href={"/configuration/overview"} image={"/images/card.png"} />',
        '<a href=/configuration/overview>Overview</a>',
        '`[Ignored](/missing-inline)`',
        '````ts',
        '```',
        'const route = "/missing-fence"',
        '````',
      ].join('\n'),
    );

    writePage(root, 'configuration/overview');
    mkdirSync(join(root, 'images'));
    writeFileSync(join(root, 'images/card.png'), 'asset');

    const result = run(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      '[check-docs-links] OK - 2 General pages and 0 repo files scanned.',
    );
  });

  it('reports missing page and asset targets with file and line', () => {
    const root = createDocs({ general: ['index'] });

    writePage(root, 'index', '[Missing](/missing)\n![Image](/images/missing.png)');

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('index.mdx:1: /missing');
    expect(result.stderr).toContain('index.mdx:2: /images/missing.png');
    expect(result.stderr).toContain('[check-docs-links] FAIL - 2 issue(s) found.');
  });

  it('reports unlisted pages, missing nav pages, duplicates, and ownership conflicts', () => {
    const root = createDocs({
      general: ['index', 'index', 'configuration/missing', 'agents/alternate'],
    });

    writePage(root, 'index');
    writePage(root, 'configuration/unlisted');
    writePage(root, 'agents/alternate');

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('duplicate General page: index');
    expect(result.stderr).toContain('missing General page: configuration/missing');
    expect(result.stderr).toContain('non-General page: agents/alternate');
    expect(result.stderr).toContain('unlisted General page: configuration/unlisted');
  });

  it('does not accept redirect sources as canonical destinations', () => {
    const root = createDocs({
      redirects: [{ destination: '/configuration/overview', source: '/configuration/old' }],
    });

    writePage(root, 'index', '[Stale](/configuration/old)');
    writePage(root, 'configuration/overview');

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('index.mdx:1: /configuration/old');
  });

  it('does not scan generic non-General root or shared-folder pages', () => {
    const root = createDocs({ other: ['alternate-root', 'agents/alternate'] });

    writePage(root, 'index', '[Overview](/configuration/overview)');
    writePage(root, 'configuration/overview');
    writePage(root, 'alternate-root', '[Malformed](/missing)');
    writePage(root, 'agents/alternate', '[Malformed](/missing)');

    const result = run(root);

    expect(result.status).toBe(0);
  });

  it('rejects General links into excluded content and paths outside the docs root', () => {
    const root = createDocs();

    writePage(root, 'index', '[Excluded](/agents/alternate)\n[Escape](../outside)');
    writePage(root, 'configuration/overview');
    writePage(root, 'agents/alternate');

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('index.mdx:1: /agents/alternate');
    expect(result.stderr).toContain('index.mdx:2: ../outside');
  });

  it('accepts file links, heading anchors and same-file anchors in CONTRIBUTING.md and CLAUDE.md', () => {
    const result = run(repoDocs('[live tests](test/README.md#live-tests-real-credentials)'));

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      '[check-docs-links] OK - 1 General pages and 2 repo files scanned.',
    );
  });

  it('reports a repo-file link to a missing file', () => {
    const result = run(repoDocs('[missing](test/MISSING.md)'));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('CONTRIBUTING.md:9: test/MISSING.md');
  });

  it('reports anchors whose heading was renamed', () => {
    const root = repoDocs('[live tests](test/README.md#live-tests-real-credentials)');

    writeRepoFile(
      root,
      'CONTRIBUTING.md',
      contributing('it').replace('### Core or plugin', '### Core or plugins'),
    );

    writeRepoFile(root, 'CLAUDE.md', 'Read [Core or plugin](CONTRIBUTING.md#core-or-plugin).');

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('CONTRIBUTING.md:5: #core-or-plugin');
    expect(result.stderr).toContain('CLAUDE.md:1: CONTRIBUTING.md#core-or-plugin');
    expect(result.stderr).toContain('[check-docs-links] FAIL - 2 issue(s) found.');
  });
});
