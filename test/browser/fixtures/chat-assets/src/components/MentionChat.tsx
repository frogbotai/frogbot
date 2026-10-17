'use client';

import {
  Chat,
  type ChatProps,
  ChatProvider,
  type MentionSource,
  useChatProvider,
} from '@frogbotai/ui/chat';

const pages: MentionSource = {
  id: 'pages',
  search: (query) =>
    [
      { id: 'pricing', label: 'Pricing page', data: { url: '/pricing' } },
      { id: 'docs', label: 'Docs' },
    ].filter(({ label }) => label.toLowerCase().startsWith(query.toLowerCase())),
};

export function MentionChat(props: ChatProps) {
  const provider = useChatProvider();

  if (!provider) return null;

  return (
    <ChatProvider
      adapter={provider.adapter}
      dataRenderers={provider.dataRenderers}
      mentionSources={[pages]}
      toolRenderers={provider.toolRenderers}
    >
      <Chat {...props} />
    </ChatProvider>
  );
}
