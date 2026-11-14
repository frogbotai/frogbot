/** What a side panel bar shows on its left. */
export type SidePanelCrumbs = {
  /** `back` for a link to the record the panel came from, `context` for the collection's name. */
  lead?: 'back' | 'context';
  /** Whether the current title shows in the bar. */
  title: boolean;
};

export type SidePanelCrumbsArgs = {
  /** The panel was opened from inside itself, so it has a parent to go back to. */
  back: boolean;
  /** The panel was opened with nothing behind it, as from a shared link, a reload or the chat page. */
  context: boolean;
  /** The body shows the title large. */
  titleInBody: boolean;
  /** The body's large title has scrolled under the bar. */
  titleScrolledOut: boolean;
};

/**
 * The breadcrumb rule: the bar never repeats what is already visible. The title shows once, in
 * the body or, once that scrolls out of view or when the body has none, in the bar. A back link
 * leads when the panel was drilled into; the collection's name leads when nothing is behind it.
 */
export function sidePanelCrumbs({
  back,
  context,
  titleInBody,
  titleScrolledOut,
}: SidePanelCrumbsArgs): SidePanelCrumbs {
  const title = !titleInBody || titleScrolledOut;

  if (back) return { lead: 'back', title };
  if (context) return { lead: 'context', title };

  return { title };
}
