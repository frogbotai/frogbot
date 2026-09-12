export type NavShellState =
  'desktop-nav-open' | 'desktop-nav-closed' | 'mobile-nav-open' | 'mobile-nav-closed';

export function getNavShellState(isMobile: boolean, navOpen: boolean): NavShellState {
  if (isMobile) return navOpen ? 'mobile-nav-open' : 'mobile-nav-closed';
  return navOpen ? 'desktop-nav-open' : 'desktop-nav-closed';
}
