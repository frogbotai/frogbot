import { type ChatPlatformAdapter, ChatProvider, ComposerSelect } from '@frogbotai/ui/chat';
import { LinkList, ToolCard, toolCard, type ToolRenderer } from '@frogbotai/ui/chat/tools';

declare const adapter: ChatPlatformAdapter;

export const search: ToolRenderer = toolCard('web_search', (part) => ({
  icon: 'web',
  title: String((part.input as { query?: string } | undefined)?.query),
  links: [{ url: 'https://frogs.example', title: 'Frogs' }],
}));

// @ts-expect-error: card icons come from FrogBot's icon registry
toolCard('click', () => ({ icon: 'lucide-mouse-pointer', title: 'Clicked' }));

export const app = (
  <ChatProvider
    adapter={adapter}
    toolRenderers={[search]}
    faviconUrl={(url) => `${url}/favicon.ico`}
  >
    <ToolCard icon="keyboard" status="done" title="Pressed Enter" />
    {/* @ts-expect-error: a status is required */}
    <ToolCard icon="keyboard" title="Pressed Enter" />
    <LinkList items={[{ url: 'https://frogs.example' }]} />
    <ComposerSelect
      value="build"
      options={[{ value: 'build', label: 'Build', icon: 'wrench' }]}
      onChange={() => undefined}
    />
  </ChatProvider>
);
