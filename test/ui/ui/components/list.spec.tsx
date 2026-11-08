import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { List, ListItem } from '../../../../packages/ui/src/components/list';

describe('List', () => {
  it('renders the BEM classes and preserves external classes', () => {
    render(
      <List className="custom-list" data-testid="list">
        <ListItem
          className="custom-item"
          data-testid="item"
          leading={<span>L</span>}
          meta={<span>Meta</span>}
          subtitle="Subtitle"
          title="Title"
        />
      </List>,
    );

    const list = screen.getByTestId('list');

    expect(list.tagName).toBe('UL');
    expect(list.className).toBe('fb-list custom-list');

    const item = screen.getByTestId('item');

    expect(item.tagName).toBe('LI');
    expect(item.className).toBe('fb-list__item custom-item');
    expect(item.querySelector('.fb-list__leading')?.textContent).toBe('L');
    expect(item.querySelector('.fb-list__title')?.textContent).toBe('Title');
    expect(item.querySelector('.fb-list__subtitle')?.textContent).toBe('Subtitle');
    expect(item.querySelector('.fb-list__meta')?.textContent).toBe('Meta');
  });

  it('omits empty slots and renders no link without href', () => {
    render(
      <List>
        <ListItem data-testid="item" title="Plain" />
      </List>,
    );

    const item = screen.getByTestId('item');

    expect(item.querySelector('a')).toBeNull();
    expect(item.querySelector('.fb-list__leading')).toBeNull();
    expect(item.querySelector('.fb-list__subtitle')).toBeNull();
    expect(item.querySelector('.fb-list__meta')).toBeNull();
  });

  it('links the title with href and keeps links in meta separate, never nested', () => {
    render(
      <List>
        <ListItem
          data-testid="item"
          href="/rows/1"
          meta={<a href="https://example.com">Open</a>}
          subtitle={<a href="/other">Other</a>}
          title="Row one"
        />
      </List>,
    );

    const item = screen.getByTestId('item');

    expect(item.className).toBe('fb-list__item fb-list__item--link');

    const link = screen.getByRole('link', { name: 'Row one' });

    expect(link.className).toBe('fb-list__link');
    expect(link.getAttribute('href')).toBe('/rows/1');
    expect(screen.getByRole('link', { name: 'Open' }).getAttribute('href')).toBe(
      'https://example.com',
    );
    expect(item.querySelectorAll('a a')).toHaveLength(0);
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });
});
