import { describe, expect, it } from 'vitest';

import {
  catalogDefinitions,
  catalogProblems,
  checkErrors,
  codePrefix,
  errorsPage,
} from '../../../scripts/check-errors.mjs';

const CORE_CATALOG = `
const SIGN_IN = 'Sign in, then retry.';

const authErrors = {
  'auth.unauthenticated': { status: 401, title: 'Sign-in required.', hint: SIGN_IN, exit: 3 },
  internal: { status: 500, title: 'Something went wrong.', hint: 'Retry once.' },
} satisfies Record<string, ErrorDefinition>;

export const frogbotError = defineErrors({ ...authErrors });
`;

const FORMS_CATALOG = `
export const formError = defineErrors({
  'forms.busy': { status: 503, title: 'This form is busy.', hint: 'Try again.', retryable: true },
  'busy': { status: 503, title: 'Busy.', hint: 'Try again.' },
  'forms.closed': { status: 410, title: 'This form is closed.' },
});
`;

const core = catalogDefinitions({
  file: 'packages/frogbot/src/errors/catalog.ts',
  source: CORE_CATALOG,
  packageName: 'frogbot',
});

const forms = catalogDefinitions({
  file: 'packages/plugins/plugin-forms/src/errors.ts',
  source: FORMS_CATALOG,
  packageName: '@frogbotai/plugin-forms',
});

const raisesAll = [
  "throw frogbotError('auth.unauthenticated'); frogbotError('internal');",
  "formError('forms.busy'); formError('busy'); formError('forms.closed');",
];

describe('catalogDefinitions', () => {
  it('reads each code with its status, title, hint and retryable, resolving local constants', () => {
    expect(core).toEqual([
      expect.objectContaining({
        code: 'auth.unauthenticated',
        status: 401,
        title: 'Sign-in required.',
        hint: 'Sign in, then retry.',
        retryable: false,
        package: 'frogbot',
        line: 5,
      }),
      expect.objectContaining({ code: 'internal', status: 500, hint: 'Retry once.' }),
    ]);
    expect(forms[0]).toMatchObject({ code: 'forms.busy', retryable: true });
  });
});

describe('codePrefix', () => {
  it("is the plugin's short name for a plugin and nothing for core", () => {
    expect(codePrefix('@frogbotai/plugin-import-export')).toBe('import-export.');
    expect(codePrefix('@frogbotai/plugin-mcp')).toBe('mcp.');
    expect(codePrefix('frogbot')).toBeUndefined();
  });
});

describe('catalogProblems', () => {
  it('names a definition without a hint and a plugin code without its prefix', () => {
    const messages = catalogProblems({ definitions: [...core, ...forms], sources: raisesAll }).map(
      ({ message }) => message,
    );

    expect(messages).toEqual(['busy must start with forms.', 'forms.closed has no hint.']);
  });

  it('names a code no source raises', () => {
    const messages = catalogProblems({
      definitions: core,
      sources: ["throw frogbotError('auth.unauthenticated');"],
    }).map(({ message }) => message);

    expect(messages).toEqual(['internal is never raised; remove it or throw it.']);
  });

  it('counts a code raised from a template when its reason is named elsewhere', () => {
    const [notReady] = catalogDefinitions({
      file: 'packages/frogbot/src/errors/catalog.ts',
      source:
        "const e = { 'search.not-ready': { status: 503, title: 'Building.', hint: 'Wait.' } };",
      packageName: 'frogbot',
    });

    const sources = ['frogbotError(`search.${reason}`);', "return 'not-ready';"];

    expect(catalogProblems({ definitions: [notReady], sources })).toEqual([]);
    expect(catalogProblems({ definitions: [notReady], sources: sources.slice(0, 1) })).toHaveLength(
      1,
    );
  });

  it('names a code two catalogs define', () => {
    const messages = catalogProblems({
      definitions: [...core, ...core.slice(0, 1)],
      sources: raisesAll,
    }).map(({ message }) => message);

    expect(messages).toEqual([
      'auth.unauthenticated is also defined at packages/frogbot/src/errors/catalog.ts:5.',
    ]);
  });
});

describe('errorsPage', () => {
  it('lists core first, then each plugin, with one anchored row per code', () => {
    const page = errorsPage([...forms.slice(0, 1), ...core]);

    expect(page.indexOf('## `frogbot`')).toBeLessThan(page.indexOf('## `@frogbotai/plugin-forms`'));
    expect(page).toContain(
      '| <code id="auth.unauthenticated">auth.unauthenticated</code> | 401 | Sign-in required. | Sign in, then retry. | No |',
    );
    expect(page).toContain(
      '| <code id="forms.busy">forms.busy</code> | 503 | This form is busy. | Try again. | Yes |',
    );
  });
});

describe('checkErrors', () => {
  const definitions = core;
  const sources = raisesAll;

  it('passes when the page matches the catalogs', () => {
    const current = errorsPage(definitions);

    expect(checkErrors({ definitions, sources, current }).problems).toEqual([]);
  });

  it('fails on a stale page', () => {
    const current = errorsPage(definitions.slice(0, 1));

    expect(checkErrors({ definitions, sources, current }).problems).toEqual([
      expect.objectContaining({
        file: 'docs/errors.mdx',
        message: 'is stale; run `pnpm check errors --write`.',
      }),
    ]);
  });
});
