import { describe, expect, it } from 'vitest';

import { sidePanelCrumbs } from '../../../packages/ui/src/components/side-panel-crumbs.js';

const base = { back: false, context: false, titleInBody: true, titleScrolledOut: false };

describe('sidePanelCrumbs', () => {
  it('shows nothing at rest when opened from a view whose body shows the title', () => {
    expect(sidePanelCrumbs(base)).toEqual({ title: false });
  });

  it('shows the title once the body title scrolls out', () => {
    expect(sidePanelCrumbs({ ...base, titleScrolledOut: true })).toEqual({ title: true });
  });

  it('leads with the way back when drilled in, and the title joins it after scrolling', () => {
    expect(sidePanelCrumbs({ ...base, back: true })).toEqual({ lead: 'back', title: false });
    expect(sidePanelCrumbs({ ...base, back: true, titleScrolledOut: true })).toEqual({
      lead: 'back',
      title: true,
    });
  });

  it('leads with the collection name when nothing is behind the panel', () => {
    expect(sidePanelCrumbs({ ...base, context: true })).toEqual({ lead: 'context', title: false });
  });

  it('prefers the way back over the collection name', () => {
    expect(sidePanelCrumbs({ ...base, back: true, context: true }).lead).toBe('back');
  });

  it('always shows the title when the body has no big title', () => {
    expect(sidePanelCrumbs({ ...base, titleInBody: false })).toEqual({ title: true });
    expect(sidePanelCrumbs({ ...base, back: true, titleInBody: false })).toEqual({
      lead: 'back',
      title: true,
    });
  });
});
