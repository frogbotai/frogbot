'use client';

import { useRichTextView } from '@frogbotai/richtext-lexical/client';

export function ActiveView() {
  const { currentView, views } = useRichTextView();

  return (
    <p>
      {currentView} ({Object.keys(views ?? {}).length} views)
      {views?.[currentView]?.admin?.hideGutter ? ', gutter hidden' : ''}
    </p>
  );
}
