import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { markdownToAdf, toAdf } from '../../../packages/pieces/piece-jira/src/adf.js';
import { createJira } from '../../../packages/pieces/piece-jira/src/index.js';
import { body, calls, json, req, site, stubJira } from './fixtures.js';

const t = (text: string, ...marks: object[]) =>
  marks.length ? { type: 'text', text, marks } : { type: 'text', text };

const p = (...content: object[]) => ({ type: 'paragraph', content });

function doc(markdown: string) {
  return markdownToAdf(markdown).content;
}

afterEach(() => vi.unstubAllGlobals());

describe('markdown to ADF', () => {
  it('gives an empty document for an empty string', () => {
    expect(markdownToAdf('')).toEqual({ type: 'doc', version: 1, content: [] });
  });

  it('splits paragraphs on blank lines and keeps line breaks', () => {
    expect(doc('one\ntwo\n\nthree')).toEqual([
      p(t('one'), { type: 'hardBreak' }, t('two')),
      p(t('three')),
    ]);
  });

  it('reads headings at each level', () => {
    expect(doc('# One\n###### Six ##')).toEqual([
      { type: 'heading', attrs: { level: 1 }, content: [t('One')] },
      { type: 'heading', attrs: { level: 6 }, content: [t('Six')] },
    ]);
  });

  it('reads bold, italic, strike, code and links', () => {
    expect(
      doc('**Blocked** by `api`, see [PR](https://x.test/1) _now_ ~~later~~ *soon* __very__'),
    ).toEqual([
      p(
        t('Blocked', { type: 'strong' }),
        t(' by '),
        t('api', { type: 'code' }),
        t(', see '),
        t('PR', { type: 'link', attrs: { href: 'https://x.test/1' } }),
        t(' '),
        t('now', { type: 'em' }),
        t(' '),
        t('later', { type: 'strike' }),
        t(' '),
        t('soon', { type: 'em' }),
        t(' '),
        t('very', { type: 'strong' }),
      ),
    ]);
  });

  it('nests marks', () => {
    expect(doc('**bold _both_** *a **b** c*')).toEqual([
      p(
        t('bold ', { type: 'strong' }),
        t('both', { type: 'strong' }, { type: 'em' }),
        t(' '),
        t('a ', { type: 'em' }),
        t('b', { type: 'em' }, { type: 'strong' }),
        t(' c', { type: 'em' }),
      ),
    ]);
  });

  it('keeps snake_case, escapes, unclosed marks and unsafe links as text', () => {
    expect(doc('snake_case_name \\*not\\* **open [x](javascript:alert(1))')).toEqual([
      p(t('snake_case_name *not* **open [x](javascript:alert(1))')),
    ]);
  });

  it('reads fenced code blocks with a language', () => {
    expect(doc('```ts\nconst a = 1;\n\nconst b = **2**;\n```\nafter')).toEqual([
      {
        type: 'codeBlock',
        attrs: { language: 'ts' },
        content: [t('const a = 1;\n\nconst b = **2**;')],
      },
      p(t('after')),
    ]);
  });

  it('reads bullet and ordered lists, nested', () => {
    expect(doc('- one\n  - inner\n- two\n\n3. three\n4. four')).toEqual([
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              p(t('one')),
              { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('inner'))] }] },
            ],
          },
          { type: 'listItem', content: [p(t('two'))] },
        ],
      },
      {
        type: 'orderedList',
        attrs: { order: 3 },
        content: [
          { type: 'listItem', content: [p(t('three'))] },
          { type: 'listItem', content: [p(t('four'))] },
        ],
      },
    ]);
  });

  it('reads quotes and rules', () => {
    expect(doc('> quoted **text**\n> more\n\n---')).toEqual([
      {
        type: 'blockquote',
        content: [p(t('quoted '), t('text', { type: 'strong' }), { type: 'hardBreak' }, t('more'))],
      },
      { type: 'rule' },
    ]);
  });

  it('keeps tables and other syntax as text', () => {
    expect(doc('| a | b |\n| - | - |\n![img](https://x.test/i.png)')).toEqual([
      p(
        t('| a | b |'),
        { type: 'hardBreak' },
        t('| - | - |'),
        { type: 'hardBreak' },
        t('!'),
        t('img', { type: 'link', attrs: { href: 'https://x.test/i.png' } }),
      ),
    ]);
  });

  it('passes an ADF document through, as an object or a JSON string', () => {
    const adf = { type: 'doc' as const, version: 1 as const, content: [{ type: 'rule' }] };

    expect(toAdf(adf)).toBe(adf);
    expect(toAdf(JSON.stringify(adf))).toEqual(adf);
    expect(toAdf('{ not json')).toEqual({ type: 'doc', version: 1, content: [p(t('{ not json'))] });
  });
});

describe('Jira rich-text inputs', () => {
  const jira = createJira({ siteUrl: site });

  it('addComment sends markdown converted to ADF', async () => {
    stubJira(() => json({ id: '10', body: {} }));

    await jira.addComment({
      input: { issueKey: 'OPS-12', body: '**Blocked** by `api`' },
      req: req(),
    });

    expect(body(calls[0])).toEqual({
      body: {
        type: 'doc',
        version: 1,
        content: [p(t('Blocked', { type: 'strong' }), t(' by '), t('api', { type: 'code' }))],
      },
    });
  });

  it('markdownToAdf converts without calling Jira', async () => {
    stubJira(() => json({}));

    await expect(jira.markdownToAdf({ input: { markdown: '# Hi' }, req: req() })).resolves.toEqual({
      type: 'doc',
      version: 1,
      content: [{ type: 'heading', attrs: { level: 1 }, content: [t('Hi')] }],
    });
    expect(calls).toEqual([]);
  });
});
