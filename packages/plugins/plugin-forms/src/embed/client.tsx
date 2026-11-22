import { Form } from '@frogbotai/ui/forms';
import { createRoot } from 'react-dom/client';

import type { EmbedData, EmbedMessage } from './messages.js';

const post = (message: EmbedMessage) => window.parent.postMessage(message, '*');

const root = document.getElementById('fb-form');
const data = JSON.parse(
  document.getElementById('fb-form-data')?.textContent ?? 'null',
) as EmbedData | null;

if (root && data) {
  createRoot(root).render(
    <Form
      definition={data.definition}
      submitUrl={data.submitUrl}
      eventUrl={data.eventUrl}
      onSubmitted={(confirmation) => post({ type: 'frogbot:form:submitted', confirmation })}
    />,
  );

  new ResizeObserver(() =>
    post({ type: 'frogbot:form:height', height: Math.ceil(root.getBoundingClientRect().height) }),
  ).observe(root);
}
