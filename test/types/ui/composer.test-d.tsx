import {
  type ChatPlatformAdapter,
  ChatProvider,
  Composer,
  type ComposerFeature,
  type ComposerHistoryStorage,
  type ComposerPrompt,
  defaultComposerFeatures,
} from '@frogbotai/ui/chat';
import {
  $getRoot,
  COMMAND_PRIORITY_LOW,
  KEY_TAB_COMMAND,
  TextNode,
  useLexicalComposerContext,
} from '@frogbotai/ui/lexical';
import { useEffect } from 'react';

declare const adapter: ChatPlatformAdapter;

function TabToSpaces() {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      editor.registerCommand(
        KEY_TAB_COMMAND,
        () => {
          editor.update(() => $getRoot().selectEnd().insertText('  '));

          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor],
  );

  return null;
}

export const tabs: ComposerFeature = { key: 'tabs', nodes: [TextNode], plugin: TabToSpaces };

export const memory: ComposerHistoryStorage = {
  load: () => [],
  save: (entries: readonly ComposerPrompt[]) => void entries,
};

export const provided = (
  <ChatProvider
    adapter={adapter}
    composerFeatures={[...defaultComposerFeatures, tabs]}
    composerHistory={memory}
  >
    <Composer
      aria-label="Ask"
      onSubmit={(prompt, attachments) => void [prompt.text, prompt.mentions, attachments]}
      submitContent="Send"
      stopContent="Stop"
    />
  </ChatProvider>
);

export const textarea = (
  // @ts-expect-error Composer is no longer a textarea and has no controlled value.
  <Composer value="Hello" onSubmit={() => {}} submitContent="Send" stopContent="Stop" />
);
