import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StepNavReset } from '../../../../packages/next/src/elements/StepNavReset/index.client';

type StepNavItem = { label: string; url?: string };

const mocks = vi.hoisted(() => ({
  pathname: '/admin',
  StepNavProvider: undefined as unknown as (props: { children: ReactNode }) => ReactNode,
}));

vi.mock('@payloadcms/ui', async () => {
  const { createContext, createElement, useContext, useState } = await import('react');
  const StepNavContext = createContext<{
    setStepNav: (nav: StepNavItem[]) => void;
    stepNav: StepNavItem[];
  }>({ setStepNav: () => undefined, stepNav: [] });

  mocks.StepNavProvider = function StepNavProvider({ children }: { children: ReactNode }) {
    const [stepNav, setStepNav] = useState<StepNavItem[]>([]);

    return createElement(StepNavContext.Provider, { value: { setStepNav, stepNav } }, children);
  };

  return {
    useConfig: () => ({ config: { admin: { meta: { titleSuffix: '- FrogBot' } } } }),
    useStepNav: () => useContext(StepNavContext),
    useTranslation: () => ({
      i18n: { fallbackLanguage: 'en', language: 'en', t: (key: string) => key },
    }),
  };
});

vi.mock('next/navigation.js', () => ({ usePathname: () => mocks.pathname }));

const { useStepNav } = await import('@payloadcms/ui');

function TopBar() {
  const { stepNav } = useStepNav();

  return <output data-testid="step-nav">{stepNav.map(({ label }) => label).join(' / ')}</output>;
}

function LabelledPage({ label }: { label: string }) {
  const { setStepNav } = useStepNav();

  useEffect(() => {
    setStepNav([{ label }]);
  }, [label, setStepNav]);

  return <main>{label} page</main>;
}

function UnlabelledPage() {
  return <main>Reports page</main>;
}

function Admin({ children }: { children: ReactNode }) {
  const Provider = mocks.StepNavProvider;

  return (
    <Provider>
      <StepNavReset>
        <TopBar />
        {children}
      </StepNavReset>
    </Provider>
  );
}

function navigate(pathname: string) {
  mocks.pathname = pathname;
}

describe('StepNavReset', () => {
  beforeEach(() => {
    navigate('/admin/collections/users');
  });

  it('keeps the label the first page sets on mount', () => {
    render(
      <Admin>
        <LabelledPage key="users" label="Users" />
      </Admin>,
    );

    expect(screen.getByTestId('step-nav').textContent).toBe('Users');
  });

  it('clears the previous label when the path changes to a page that sets none', () => {
    const { rerender } = render(
      <Admin>
        <LabelledPage key="users" label="Users" />
      </Admin>,
    );

    navigate('/admin/reports');
    rerender(
      <Admin>
        <UnlabelledPage />
      </Admin>,
    );

    expect(screen.getByTestId('step-nav').textContent).toBe('');
  });

  it('keeps the label a new page sets in a normal effect during the same navigation', () => {
    const { rerender } = render(
      <Admin>
        <LabelledPage key="users" label="Users" />
      </Admin>,
    );

    navigate('/admin/collections/tasks/board');
    rerender(
      <Admin>
        <LabelledPage key="tasks" label="Tasks" />
      </Admin>,
    );

    expect(screen.getByTestId('step-nav').textContent).toBe('Tasks');
  });

  it('keeps the label when a render does not change the path', () => {
    const { rerender } = render(
      <Admin>
        <LabelledPage key="users" label="Users" />
      </Admin>,
    );

    rerender(
      <Admin>
        <UnlabelledPage />
      </Admin>,
    );

    expect(screen.getByTestId('step-nav').textContent).toBe('Users');
  });

  it('renders its children unchanged', () => {
    render(
      <Admin>
        <UnlabelledPage />
      </Admin>,
    );

    expect(screen.getByRole('main').textContent).toBe('Reports page');
  });
});
