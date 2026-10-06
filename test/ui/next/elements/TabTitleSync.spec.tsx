import { act, cleanup, render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TabTitleSync } from '../../../../packages/next/src/elements/StepNavReset/TabTitleSync';

type StepNavItem = {
  label: ReactElement | Record<string, string> | string | (() => string);
  url?: string;
};

const mocks = vi.hoisted(() => ({
  language: 'en',
  suffix: '- FrogBot',
  StepNavProvider: undefined as unknown as (props: {
    children: ReactNode;
    nav: StepNavItem[];
  }) => ReactNode,
}));

vi.mock('@payloadcms/ui', async () => {
  const { createContext, createElement, useContext } = await import('react');
  const StepNavContext = createContext<StepNavItem[]>([]);

  mocks.StepNavProvider = ({ children, nav }) => {
    return createElement(StepNavContext.Provider, { value: nav }, children);
  };

  return {
    useConfig: () => ({ config: { admin: { meta: { titleSuffix: mocks.suffix } } } }),
    useStepNav: () => ({ stepNav: useContext(StepNavContext) }),
    useTranslation: () => ({
      i18n: { fallbackLanguage: 'en', language: mocks.language, t: (key: string) => key },
    }),
  };
});

function Admin({ nav }: { nav: StepNavItem[] }) {
  const Provider = mocks.StepNavProvider;

  return (
    <Provider nav={nav}>
      <TabTitleSync />
    </Provider>
  );
}

// MutationObserver callbacks run on a microtask; an async act lets them deliver before it returns.
function headChange(change: () => void): Promise<void> {
  return act(() => {
    change();

    return Promise.resolve();
  });
}

function ownedTitle() {
  return document.head.querySelector<HTMLTitleElement>('title[data-frogbot-tab-title]');
}

function nextTitle(text: string) {
  const title = document.createElement('title');

  title.textContent = text;
  document.head.prepend(title);

  return title;
}

describe('TabTitleSync', () => {
  beforeEach(() => {
    mocks.language = 'en';
    mocks.suffix = '- FrogBot';
    nextTitle('Payload - FrogBot');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.head.replaceChildren();
  });

  it('uses the last label and the configured suffix', () => {
    render(<Admin nav={[{ label: 'Chats' }, { label: 'Refund policy' }]} />);

    expect(document.title).toBe('Refund policy - FrogBot');
    expect(document.head.querySelector('title')).toBe(ownedTitle());
  });

  it('translates the last label in the current language', () => {
    mocks.language = 'fr';

    render(<Admin nav={[{ label: { en: 'Reports', fr: 'Rapports' } }]} />);

    expect(document.title).toBe('Rapports - FrogBot');
  });

  it('resolves a function label before setting the title', () => {
    render(<Admin nav={[{ label: () => 'Reports' }]} />);

    expect(document.title).toBe('Reports - FrogBot');
  });

  it.each([
    ['| Custom', 'Reports | Custom'],
    ['', 'Reports'],
  ])('joins the suffix %j without adding an empty separator', (suffix, expected) => {
    mocks.suffix = suffix;

    render(<Admin nav={[{ label: 'Reports' }]} />);

    expect(document.title).toBe(expected);
  });

  it.each([
    ['JSX', [{ label: <span>Reports</span> }]],
    ['empty', [{ label: '' }]],
    ['whitespace', [{ label: ' \n\t ' }]],
    ['missing', []],
  ] satisfies [string, StepNavItem[]][])(
    'leaves the existing title alone for a %s label',
    (_, nav) => {
      const existing = document.head.querySelector('title');

      render(<Admin nav={nav} />);

      expect(ownedTitle()).toBeNull();
      expect(document.head.querySelector('title')).toBe(existing);
      expect(document.title).toBe('Payload - FrogBot');
    },
  );

  it('trims the label before joining the suffix', () => {
    render(<Admin nav={[{ label: '  Reports  ' }]} />);

    expect(document.title).toBe('Reports - FrogBot');
  });

  it('moves its title ahead of a later Next title', async () => {
    render(<Admin nav={[{ label: 'Reports' }]} />);

    const owned = ownedTitle();

    await headChange(() => {
      nextTitle('Editing - Task - FrogBot');
    });

    expect(document.head.querySelector('title')).toBe(owned);
    expect(document.title).toBe('Reports - FrogBot');
  });

  it('wins over a Next title that arrives before the label', () => {
    const existing = nextTitle('Editing - Chat - FrogBot');

    render(<Admin nav={[{ label: 'Refund policy' }]} />);

    expect(document.title).toBe('Refund policy - FrogBot');
    expect(existing.textContent).toBe('Editing - Chat - FrogBot');
  });

  it('corrects another writer changing document.title', async () => {
    render(<Admin nav={[{ label: 'Reports' }]} />);

    await headChange(() => {
      document.title = 'x';
    });

    expect(document.title).toBe('Reports - FrogBot');
  });

  it('corrects a characterData mutation to its title', async () => {
    render(<Admin nav={[{ label: 'Reports' }]} />);

    await headChange(() => {
      ownedTitle()!.firstChild!.nodeValue = 'x';
    });

    expect(document.title).toBe('Reports - FrogBot');
  });

  it('updates the same element without removing or reinserting it', () => {
    const { rerender } = render(<Admin nav={[{ label: 'Placeholder' }]} />);

    const owned = ownedTitle()!;
    const remove = vi.spyOn(owned, 'remove');
    const prepend = vi.spyOn(document.head, 'prepend');

    rerender(<Admin nav={[{ label: 'Generated' }]} />);

    expect(ownedTitle()).toBe(owned);
    expect(document.head.querySelectorAll('[data-frogbot-tab-title]')).toHaveLength(1);
    expect(document.title).toBe('Generated - FrogBot');
    expect(remove).not.toHaveBeenCalled();
    expect(prepend).not.toHaveBeenCalled();
  });

  it('removes its title when the label clears and reveals the current Next title', async () => {
    const { rerender } = render(<Admin nav={[{ label: 'Reports' }]} />);

    await headChange(() => {
      nextTitle('Current Next title');
    });

    rerender(<Admin nav={[]} />);

    expect(ownedTitle()).toBeNull();
    expect(document.title).toBe('Current Next title');
  });

  it.each([<span key="jsx">Reports</span>, '', ' \n\t '])(
    'removes an active title for the non-text or blank label %j',
    async (label) => {
      const { rerender } = render(<Admin nav={[{ label: 'Reports' }]} />);

      rerender(<Admin nav={[{ label }]} />);

      expect(ownedTitle()).toBeNull();
      expect(document.title).toBe('Payload - FrogBot');

      await headChange(() => {
        nextTitle('Dashboard - FrogBot');
      });

      expect(ownedTitle()).toBeNull();
      expect(document.title).toBe('Dashboard - FrogBot');
    },
  );

  it('updates between threads even when Next keeps the same title', () => {
    const existing = nextTitle('Editing - Chat - FrogBot');
    const { rerender } = render(<Admin nav={[{ label: 'First thread' }]} />);

    rerender(<Admin nav={[{ label: 'Second thread' }]} />);

    expect(document.title).toBe('Second thread - FrogBot');
    expect(existing.textContent).toBe('Editing - Chat - FrogBot');
  });

  it('disconnects on unmount and makes no writes after a later head change', async () => {
    const { unmount } = render(<Admin nav={[{ label: 'Reports' }]} />);

    const owned = ownedTitle()!;
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');

    unmount();

    expect(disconnect).toHaveBeenCalledOnce();
    expect(ownedTitle()).toBeNull();

    const writeText = vi.spyOn(owned, 'textContent', 'set');
    const prepend = vi.spyOn(document.head, 'prepend');

    await headChange(() => {
      document.head.append(document.createElement('meta'));
    });

    expect(writeText).not.toHaveBeenCalled();
    expect(prepend).not.toHaveBeenCalled();
    expect(document.title).toBe('Payload - FrogBot');
  });

  it('makes zero writes when a head mutation leaves its title correct', async () => {
    render(<Admin nav={[{ label: 'Reports' }]} />);

    const writeText = vi.spyOn(ownedTitle()!, 'textContent', 'set');
    const prepend = vi.spyOn(document.head, 'prepend');

    await headChange(() => {
      document.head.append(document.createElement('meta'));
    });

    expect(writeText).not.toHaveBeenCalled();
    expect(prepend).not.toHaveBeenCalled();
    expect(document.title).toBe('Reports - FrogBot');
  });

  it('keeps one owned title through Strict Mode effect replay', () => {
    render(
      <StrictMode>
        <Admin nav={[{ label: 'Reports' }]} />
      </StrictMode>,
    );

    expect(document.head.querySelectorAll('[data-frogbot-tab-title]')).toHaveLength(1);
    expect(document.title).toBe('Reports - FrogBot');
  });
});
