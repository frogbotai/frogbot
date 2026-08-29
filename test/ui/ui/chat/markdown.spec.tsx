import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Markdown } from '../../../../packages/ui/src/chat/markdown';

describe('Markdown', () => {
  it('renders its exact BEM inventory', () => {
    const { container } = render(
      <Markdown>{`# h1
## h2
### h3
#### h4
##### h5
###### h6

Paragraph with **strong**, *emphasis*, ~~removed~~, [link](https://example.com), and \`code\`.

> quote

1. ordered

- unordered

---

| A | B |
| - | - |
| 1 | 2 |`}</Markdown>,
    );

    const inventory = new Set(
      Array.from(container.querySelectorAll('[class]')).map((element) => element.className),
    );

    expect([...inventory].sort()).toEqual(
      [
        'fb-markdown__blockquote',
        'fb-markdown__emphasis',
        'fb-markdown__heading-1',
        'fb-markdown__heading-2',
        'fb-markdown__heading-3',
        'fb-markdown__heading-4',
        'fb-markdown__heading-5',
        'fb-markdown__heading-6',
        'fb-markdown__inline-code',
        'fb-markdown__link',
        'fb-markdown__list-item',
        'fb-markdown__ordered-list',
        'fb-markdown__paragraph',
        'fb-markdown__rule',
        'fb-markdown__strikethrough',
        'fb-markdown__strong',
        'fb-markdown__table',
        'fb-markdown__table-cell',
        'fb-markdown__table-container',
        'fb-markdown__table-head',
        'fb-markdown__table-header',
        'fb-markdown__table-row',
        'fb-markdown__unordered-list',
      ].sort(),
    );
  });

  it('renders basic formatting and blocks raw HTML', () => {
    const { container } = render(
      <Markdown>{'## Title\n\n**bold** `code` <script>alert(1)</script>'}</Markdown>,
    );
    expect(screen.getByRole('heading', { name: 'Title' })).toBeTruthy();
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText(/<script>/)).toBeTruthy();
  });

  it('rejects unsafe link protocols', () => {
    const { container } = render(
      <Markdown>{'[bad](javascript:alert) [good](https://example.com)'}</Markdown>,
    );
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'good' }).getAttribute('href')).toBe(
      'https://example.com',
    );
  });

  it('renders ordered lists', () => {
    const { container } = render(<Markdown>{'1. one\n2. two'}</Markdown>);
    const list = container.querySelector('ol');
    expect(list?.className).toBe('fb-markdown__ordered-list');
    expect(list?.querySelectorAll(':scope > li')).toHaveLength(2);
  });

  it('renders nested lists', () => {
    const { container } = render(<Markdown>{'- outer\n  - inner'}</Markdown>);
    expect(container.querySelector('li > ul')).not.toBeNull();
  });

  it('renders blockquotes', () => {
    const { container } = render(<Markdown>{'> quoted'}</Markdown>);
    const blockquote = container.querySelector('blockquote');
    expect(blockquote?.className).toBe('fb-markdown__blockquote');
    expect(blockquote?.textContent).not.toContain('>');
  });

  it('renders GFM tables', () => {
    const { container } = render(<Markdown>{'| A | B |\n| - | - |\n| 1 | 2 |'}</Markdown>);
    const table = container.querySelector('table');
    expect(table?.querySelector('thead')).not.toBeNull();
    expect(table?.querySelectorAll('th')).toHaveLength(2);
    expect(table?.parentElement?.className).toBe('fb-markdown__table-container');
  });

  it('renders horizontal rules', () => {
    const { container } = render(<Markdown>---</Markdown>);
    expect(container.querySelector('hr')?.className).toBe('fb-markdown__rule');
  });

  it('renders strikethrough', () => {
    const { container } = render(<Markdown>~~removed~~</Markdown>);
    expect(container.querySelector('.fb-markdown__strikethrough')?.textContent).toBe('removed');
  });

  it('renders h4 through h6 typography', () => {
    render(<Markdown>{'#### h4\n\n##### h5\n\n###### h6'}</Markdown>);
    expect(screen.getByRole('heading', { level: 4 }).className).toBe('fb-markdown__heading-4');
    expect(screen.getByRole('heading', { level: 5 }).className).toBe('fb-markdown__heading-5');
    expect(screen.getByRole('heading', { level: 6 }).className).toBe('fb-markdown__heading-6');
  });

  it('rejects data link protocols', () => {
    const { container } = render(<Markdown>{'[bad](data:text/html,hello)'}</Markdown>);
    expect(container.querySelector('a')).toBeNull();
  });

  it('renders safe links with Firmware typography', () => {
    render(<Markdown>{'[safe](https://example.com)'}</Markdown>);
    const link = screen.getByRole('link', { name: 'safe' });
    expect(link.className).toBe('fb-markdown__link');
  });

  it('renders inline code without a code block wrapper', () => {
    const { container } = render(<Markdown>{'Use `x` here'}</Markdown>);
    expect(container.querySelector('pre')).toBeNull();
    expect(container.querySelector('code')?.className).toBe('fb-markdown__inline-code');
  });

  it('preserves plain text line breaks', () => {
    const { container } = render(<Markdown>{'first\nsecond'}</Markdown>);
    expect(container.querySelector('br')).not.toBeNull();
  });
});
