import { createRoot } from 'react-dom/client';

import { Markdown } from '../../../../packages/ui/src/chat/markdown';
import { Message } from '../../../../packages/ui/src/chat/message';
import { MessageActions } from '../../../../packages/ui/src/chat/message-actions';

const noop = () => {};

const timestamp = new Date('2026-10-29T12:00:00Z');

createRoot(document.getElementById('root')!).render(
  <div id="g" style={{ display: 'grid', gap: 16, padding: 16 }}>
    <Message
      role="user"
      actions={<MessageActions onCopy={noop} onEdit={noop} timestamp={timestamp} />}
    >
      <Markdown role="user">Hello there</Markdown>
    </Message>
    <Message
      role="assistant"
      actions={<MessageActions onCopy={noop} onBranch={noop} timestamp={timestamp} />}
    >
      <Markdown role="assistant">Hi, how can I help?</Markdown>
    </Message>
  </div>,
);
