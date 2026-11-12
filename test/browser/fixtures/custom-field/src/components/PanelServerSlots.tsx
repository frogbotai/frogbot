import type { PanelComponentProps } from 'frogbot';

import { PanelCloseButton } from './PanelSlots';

type ServerProps = PanelComponentProps & { doc?: { title?: string }; payload?: unknown };

export function BeforeFields({ doc, payload }: ServerProps) {
  return (
    <p data-testid="panel-before">
      Before {doc?.title ?? 'new'} {payload ? 'with payload' : 'without payload'}
    </p>
  );
}

export function LinksTab({ doc, payload }: ServerProps) {
  return (
    <p data-testid="panel-tab-links">
      Links of {doc?.title} {payload ? 'with payload' : 'without payload'}
    </p>
  );
}

export function WholePanel({ doc, id }: ServerProps) {
  return (
    <section data-testid="panel-whole">
      <h2>
        Card {String(id)}: {doc?.title}
      </h2>
      <PanelCloseButton />
    </section>
  );
}
