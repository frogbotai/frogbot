import { createRoot } from 'react-dom/client';

import { Composer } from '../../../../packages/ui/src/chat/composer/composer';
import { ComposerSelect } from '../../../../packages/ui/src/chat/composer-select';
import { ModelSelector } from '../../../../packages/ui/src/chat/model-selector';
import { PageContextButton } from '../../../../packages/ui/src/chat/page-context-button';
import { ChatProvider } from '../../../../packages/ui/src/chat/provider';
import { ToolSelector } from '../../../../packages/ui/src/chat/tool-selector';

const noop = () => {};

const adapter = {
  loadManifest: () => Promise.resolve({ defaultAgent: 'build', agents: [], transcribe: true }),
  transcribe: () => Promise.resolve(''),
  uploadAttachment: () => new Promise(() => undefined),
} as never;

if (!navigator.mediaDevices?.getUserMedia) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: () => new Promise(() => undefined) },
  });
}

const startSlot = (
  <>
    <ModelSelector
      models={[{ id: 'gpt', name: 'GPT' }]}
      selectedModelId="gpt"
      onModelChange={noop}
      onReasoningChange={noop}
    />
    <ComposerSelect
      aria-label="Agent"
      value="build"
      options={[
        { value: 'build', label: 'Build', icon: 'wrench' },
        { value: 'plan', label: 'Plan', icon: 'check-list' },
      ]}
      onChange={noop}
    />
    <ToolSelector tools={[{ id: 'search', name: 'Search' }]} selected={[]} onToolsChange={noop} />
    <PageContextButton
      addPageContext={() => Promise.resolve()}
      getOpenTabs={() => Promise.resolve({ success: true, tabs: [] })}
      isLoading={false}
      removePageContext={noop}
      selectedTabIds={new Set()}
    />
  </>
);

createRoot(document.getElementById('root')!).render(
  <ChatProvider adapter={adapter}>
    <div id="g" style={{ display: 'grid', gap: 16, padding: 16 }}>
      <Composer
        adapter={adapter}
        onSubmit={noop}
        submitContent="Send"
        stopContent="Stop"
        defaultValue="Hello"
        startSlot={startSlot}
      />
      <Composer
        adapter={adapter}
        onSubmit={noop}
        submitContent="Send"
        stopContent="Stop"
        pending
        onStop={noop}
        startSlot={startSlot}
      />
    </div>
  </ChatProvider>,
);
