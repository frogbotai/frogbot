import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  checkOptionTables,
  optionTables,
  optionTypes,
} from '../../../scripts/check-option-tables.mjs';

const declarations = `
export type S3StorageOptions = {
  acl?: string;
  alwaysInsertFields?: boolean;
  bucket: string;
  clientCacheKey?: string;
  clientUploads?: boolean;
  collections: Record<string, boolean | { prefix?: string }>;
  config: { region?: string };
  disableLocalStorage?: boolean;
  enabled?: boolean;
  signedDownloads?: boolean | { expiresIn?: number };
  useCompositePrefixes?: boolean;
};
export type UploadthingStorageOptions = {
  clientUploads?: boolean;
  options: { acl?: string; token: string };
};
export type UIAdmin = { components?: { [key: string]: string } };
export type ResendOptions = { _sanitized?: boolean; oauth?: never; slug?: string };
`;

let directory: string;
let paths: Record<string, string[]>;

beforeAll(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'check-option-tables-'));
  writeFileSync(path.join(directory, 'index.d.ts'), declarations);
  paths = { fixture: [path.join(directory, 'index.d.ts')] };
});

afterAll(() => {
  rmSync(directory, { force: true, recursive: true });
});

function table(rows: string[], header = '| Option | Type | Default | Description |') {
  return [header, '| --- | --- | --- | --- |', ...rows.map((row) => `| ${row} | x | — | x |`)].join(
    '\n',
  );
}

function check(content: string, registry: { heading: string; type: string }[]) {
  return checkOptionTables({
    files: [{ page: 'upload/storage', content }],
    registry: registry.map((entry) => ({ page: 'upload/storage', ...entry })),
    resolve: (entries: { type: string }[]) => optionTypes(entries, { paths }),
  });
}

describe('optionTables', () => {
  it('reads each table under its heading, outside code fences', () => {
    const content = [
      '---',
      'title: Storage',
      '---',
      table(['`bucket`']),
      '## S3',
      '```md',
      table(['`ignored`']),
      '```',
      table(['`bucket`', '**`acl`**', '`a.x`, `b.x`', 'plain']),
      '',
      '| Key | Type |',
      '| --- | --- |',
      '| `other` | x |',
    ].join('\n');

    const tables = optionTables({ page: 'upload/storage', content });

    expect(tables.map(({ heading, line }) => ({ heading, line }))).toEqual([
      { heading: 'Storage', line: 4 },
      { heading: 'S3', line: 13 },
    ]);
    expect(tables[1].rows.map(({ names }) => names)).toEqual([
      ['bucket'],
      ['acl'],
      ['a.x', 'b.x'],
      ['plain'],
    ]);
  });
});

describe('checkOptionTables', () => {
  it('rejects the incomplete S3 table from 565970ce^ docs/upload/storage-adapters.mdx', () => {
    const content = `### Configuration Options#s3-configuration

| Option                 | Description                                                                              | Default     |
| ---------------------- | ---------------------------------------------------------------------------------------- | ----------- |
| \`enabled\`              | Whether or not to enable the plugin                                                      | \`true\`      |
| \`collections\`          | Collections to apply the S3 adapter to                                                   |             |
| \`bucket\`               | The name of the S3 bucket                                                                |             |
| \`config\`               | \`S3ClientConfig\` object passed to the AWS SDK client                                     |             |
| \`acl\`                  | Access control list for uploaded files (e.g. \`'public-read'\`)                            | \`undefined\` |
| \`clientUploads\`        | Do uploads directly on the client to bypass Vercel's 4.5MB server limit                  |             |
| \`signedDownloads\`      | Use presigned URLs for file downloads. Can be overridden per collection                  |             |
| \`useCompositePrefixes\` | Combine collection prefix with document prefix instead of document prefix overriding it. | \`false\`     |
`;

    const problems = check(content, [
      {
        heading: 'Configuration Options#s3-configuration',
        type: "import('fixture').S3StorageOptions",
      },
    ]);

    expect(problems).toEqual([
      { file: 'docs/upload/storage.mdx', line: 3, message: 'missing option alwaysInsertFields' },
      { file: 'docs/upload/storage.mdx', line: 3, message: 'missing option clientCacheKey' },
      { file: 'docs/upload/storage.mdx', line: 3, message: 'missing option disableLocalStorage' },
    ]);
  });

  it('accepts a table that lists every property of a type expression', () => {
    const content = `## S3\n\n${table(['`bucket`', '`config`', '`acl`', '`signedDownloads`', '`clientCacheKey`', '`disableLocalStorage`'])}`;

    const problems = check(content, [
      {
        heading: 'S3',
        type: "Omit<import('fixture').S3StorageOptions, 'collections' | 'enabled' | 'alwaysInsertFields' | 'clientUploads' | 'useCompositePrefixes'>",
      },
    ]);

    expect(problems).toEqual([]);
  });

  it('reports rows that are not in the type at their own line', () => {
    const problems = check(`## R\n\n${table(['`slug`', '`apiKey`'])}`, [
      { heading: 'R', type: "import('fixture').ResendOptions" },
    ]);

    expect(problems).toEqual([
      { file: 'docs/upload/storage.mdx', line: 6, message: 'option apiKey is not in the type' },
    ]);
  });

  it('checks nested rows against the nested type', () => {
    const problems = check(
      `## U\n\n${table(['`options`', '`options.token`', '`options.logLevel`', '`clientUploads`'])}`,
      [{ heading: 'U', type: "import('fixture').UploadthingStorageOptions" }],
    );

    expect(problems).toEqual([
      { file: 'docs/upload/storage.mdx', line: 3, message: 'missing option options.acl' },
      {
        file: 'docs/upload/storage.mdx',
        line: 7,
        message: 'option options.logLevel is not in the type',
      },
    ]);
  });

  it('matches bracketed rows against an index signature', () => {
    const problems = check(`## UI\n\n${table(['`components.[key]`'])}`, [
      { heading: 'UI', type: "import('fixture').UIAdmin" },
    ]);

    expect(problems).toEqual([]);
  });

  it('lets tables leave out underscored and never-typed properties, and accepts them', () => {
    const problems = check(
      `## A\n\n${table(['`slug`'])}\n\n## B\n\n${table(['`slug`', '`oauth`'])}`,
      [
        { heading: 'A', type: "import('fixture').ResendOptions" },
        { heading: 'B', type: "import('fixture').ResendOptions" },
      ],
    );

    expect(problems).toEqual([]);
  });

  it('matches tables under one heading in document order', () => {
    const content = `## Options\n\n${table(['`slug`'])}\n\n${table(['`options`', '`clientUploads`'])}`;

    const problems = check(content, [
      { heading: 'Options', type: "import('fixture').ResendOptions" },
      { heading: 'Options', type: "Omit<import('fixture').UploadthingStorageOptions, never>" },
    ]);

    expect(problems).toEqual([]);
  });

  it('fails an unregistered table and a registry entry without a table', () => {
    const problems = check(`## New\n\n${table(['`slug`'])}`, [
      { heading: 'Gone', type: "import('fixture').ResendOptions" },
    ]);

    expect(problems).toEqual([
      {
        file: 'docs/option-tables.json',
        line: 1,
        message: 'no "| Option |" table under upload/storage "Gone"',
      },
      {
        file: 'docs/upload/storage.mdx',
        line: 3,
        message: 'option table under "New" is not registered in docs/option-tables.json',
      },
    ]);
  });

  it('reports a type expression that does not resolve', () => {
    const problems = check(`## S3\n\n${table(['`bucket`'])}`, [
      { heading: 'S3', type: "import('fixture').Missing" },
    ]);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ line: 3 });
    expect(problems[0].message).toMatch(/^type does not resolve: .*Missing/);
  });
});
