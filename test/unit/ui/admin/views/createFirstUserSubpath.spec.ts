import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

const subpath = '@payloadcms/ui/utilities/buildFormState';
const sourcePath = resolve('packages/ui/src');

describe('Payload buildFormState subpath', () => {
  it('still exports buildFormState', async () => {
    const entry = createRequire(resolve('packages/ui/package.json')).resolve(subpath);
    const { buildFormState } = (await import(pathToFileURL(entry).href)) as {
      buildFormState: unknown;
    };

    expect(typeof buildFormState).toBe('function');
  });

  it('is imported only by the FrogBot create-first-user view', () => {
    const importers = readdirSync(sourcePath, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
      .map((entry) => resolve(entry.parentPath, entry.name))
      .filter((file) => readFileSync(file, 'utf8').includes(`'${subpath}'`))
      .map((file) => relative(sourcePath, file));

    expect(importers).toEqual(['admin/views/CreateFirstUser/index.tsx']);
  });
});
