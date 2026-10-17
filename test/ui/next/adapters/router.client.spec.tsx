import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation.js', () => ({
  usePathname: () => '/admin/collections/chats/create',
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(),
}));

const { shallowRouteState } = await import('../../../../packages/ui/src/admin/adapters/router.js');
const { NextRouterAdapter } =
  await import('../../../../packages/next/src/adapters/router.client.js');

const nextListener = vi.fn();

window.addEventListener('popstate', nextListener);

describe('NextRouterAdapter', () => {
  it('turns Back to an entry the admin moved to another page into a client navigation', () => {
    render(<NextRouterAdapter>{null}</NextRouterAdapter>);
    window.history.pushState(null, '', '/admin/collections/chats/7?tab=1');

    window.dispatchEvent(new PopStateEvent('popstate', { state: { [shallowRouteState]: true } }));

    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/admin/collections/chats/7?tab=1', {
      scroll: false,
    });
    expect(nextListener).not.toHaveBeenCalled();
  });

  it('leaves every other entry to Next', () => {
    mocks.replace.mockClear();
    render(<NextRouterAdapter>{null}</NextRouterAdapter>);

    window.dispatchEvent(new PopStateEvent('popstate', { state: { __NA: true } }));

    expect(mocks.replace).not.toHaveBeenCalled();
    expect(nextListener).toHaveBeenCalledOnce();
  });
});
