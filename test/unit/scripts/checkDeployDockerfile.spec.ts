import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { bundledDockerfile, dockerfileProblem } from '../../../scripts/check-deploy-dockerfile.mjs';

const root = path.resolve(import.meta.dirname, '../../..');

const source = (text: string) => `export const dockerfile = \`${text}\`;\n`;

describe('check-deploy-dockerfile', () => {
  it('unescapes backslashes, backticks and ${ in the constant', () => {
    expect(bundledDockerfile(source('ARG A\\${B} \\` \\\\n'))).toBe('ARG A${B} ` \\n');
  });

  it('passes when the constant matches the template and fails when it drifts', () => {
    expect(
      dockerfileProblem({ template: 'FROM node\n', source: source('FROM node\n') }),
    ).toBeUndefined();
    expect(dockerfileProblem({ template: 'FROM node\n', source: source('FROM bun\n') })).toBe(
      'packages/frogbot/src/bin/deploy/dockerfile.ts differs from templates/blank/Dockerfile',
    );
    expect(dockerfileProblem({ template: '', source: 'nothing' })).toContain('has no');
  });

  it('passes on the repository', () => {
    expect(
      dockerfileProblem({
        template: readFileSync(path.join(root, 'templates/blank/Dockerfile'), 'utf8'),
        source: readFileSync(
          path.join(root, 'packages/frogbot/src/bin/deploy/dockerfile.ts'),
          'utf8',
        ),
      }),
    ).toBeUndefined();
  });
});
