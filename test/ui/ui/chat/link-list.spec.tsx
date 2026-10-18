import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LinkList } from '../../../../packages/ui/src/chat/link-list';
import { ChatProvider } from '../../../../packages/ui/src/chat/provider';

const adapter = { loadManifest: () => new Promise(() => undefined) } as never;

const items = [
  { url: 'https://www.frogs.example/north-america', title: 'Frogs of North America' },
  { url: 'https://amphibians.example/tree', title: 'Tree frogs', snippet: 'A care guide.' },
];

describe('LinkList', () => {
  it("shows each host's initial and requests no favicon without faviconUrl", () => {
    const { container } = render(<LinkList items={items} />);

    expect(container.querySelector('img')).toBeNull();
    expect(
      [...container.querySelectorAll('.fb-link-list__initial')].map((item) => item.textContent),
    ).toEqual(['F', 'A']);
    expect(
      [...container.querySelectorAll('.fb-link-list__host')].map((host) => host.textContent),
    ).toEqual(['frogs.example', 'amphibians.example']);
  });

  it('opens every link in a new tab, with its title and snippet', () => {
    render(<LinkList items={items} />);

    const link = screen.getByRole('link', { name: /Tree frogs/ });

    expect(link.getAttribute('href')).toBe('https://amphibians.example/tree');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noreferrer');
    expect(screen.getByText('A care guide.')).toBeTruthy();
  });

  it("shows the provider's favicon, and the initial when it fails to load", () => {
    const faviconUrl = vi.fn((url: string) => `https://icons.example/?page=${url}`);

    const { container } = render(
      <ChatProvider adapter={adapter} faviconUrl={faviconUrl}>
        <LinkList items={items} />
      </ChatProvider>,
    );

    const images = container.querySelectorAll('img');

    expect(images).toHaveLength(2);
    expect(images[0].getAttribute('src')).toBe(
      'https://icons.example/?page=https://www.frogs.example/north-america',
    );
    expect(faviconUrl).toHaveBeenCalledWith('https://amphibians.example/tree');

    fireEvent.error(images[0]);

    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.querySelector('.fb-link-list__initial')?.textContent).toBe('F');
  });

  it('shows the initial when faviconUrl has nothing for a page', () => {
    const { container } = render(
      <ChatProvider adapter={adapter} faviconUrl={() => undefined}>
        <LinkList items={items} />
      </ChatProvider>,
    );

    expect(container.querySelector('img')).toBeNull();
  });

  it('shows the whole URL and its initial for a link with no host', () => {
    const { container } = render(<LinkList items={[{ url: 'mailto:frog@example.com' }]} />);

    expect(container.querySelector('.fb-link-list__host')?.textContent).toBe(
      'mailto:frog@example.com',
    );
    expect(container.querySelector('.fb-link-list__initial')?.textContent).toBe('M');
  });
});
