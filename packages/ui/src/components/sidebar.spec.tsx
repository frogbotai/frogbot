import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Sidebar, SidebarInset, SidebarProvider, SidebarTrigger } from '../index';

describe('Sidebar', () => {
  it('toggles from its trigger', () => {
    vi.stubGlobal('matchMedia', () => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }));
    render(
      <SidebarProvider>
        <SidebarTrigger />
        <Sidebar>Navigation</Sidebar>
      </SidebarProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }));
    expect(screen.getByText('Navigation').getAttribute('data-closed')).toBe('true');
  });

  it('renders its BEM classes and preserves custom classes', () => {
    vi.stubGlobal('matchMedia', () => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }));
    render(
      <SidebarProvider className="provider-custom">
        <Sidebar className="sidebar-custom">Navigation</Sidebar>
        <SidebarInset className="inset-custom" data-testid="inset" />
      </SidebarProvider>,
    );
    expect(screen.getByText('Navigation').className.split(' ')).toEqual(
      expect.arrayContaining(['fb-sidebar', 'fb-sidebar--desktop', 'sidebar-custom']),
    );
    expect(screen.getByText('Navigation').parentElement?.className.split(' ')).toEqual(
      expect.arrayContaining(['fb-sidebar-provider', 'provider-custom']),
    );
    expect(screen.getByTestId('inset').className.split(' ')).toEqual(
      expect.arrayContaining(['fb-sidebar__inset', 'inset-custom']),
    );
  });

  it('toggles with the platform hotkey', () => {
    vi.stubGlobal('matchMedia', () => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }));
    render(
      <SidebarProvider>
        <Sidebar>Navigation</Sidebar>
      </SidebarProvider>,
    );
    fireEvent.keyDown(document, { key: 'b', ctrlKey: true });
    expect(screen.getByText('Navigation').getAttribute('data-closed')).toBe('true');
  });
});
