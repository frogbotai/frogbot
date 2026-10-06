import path from 'node:path';

import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, it } from 'vitest';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

export const root = path.resolve(import.meta.dirname, '../../..');

export const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser } });

export function file(relative: string) {
  return path.join(root, relative);
}
