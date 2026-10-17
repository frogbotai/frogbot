'use client';

import type { ChatManifest } from '@frogbotai/protocol';
import { createContext, type ReactNode, use, useEffect, useState } from 'react';

import type { ChatPlatformAdapter } from './adapter.js';
import { ArtifactProvider } from './artifact.js';
import type { ArtifactPersistence, ArtifactRegistryItem } from './artifact-registry.js';
import type { ComposerCommand, MentionSource } from './composer/context.js';
import type { ComposerFeature } from './composer/features.js';
import type { ComposerHistoryStorage } from './composer/history.js';
import type { DataRenderer } from './data-part.js';
import type { ToolRenderer } from './tool-registry.js';

export type ChatProviderValue = {
  adapter: ChatPlatformAdapter;
  manifest?: ChatManifest | null;
  error?: Error;
  loading: boolean;
  toolRenderers: readonly ToolRenderer[];
  dataRenderers: readonly DataRenderer[];
  commands?: readonly ComposerCommand[];
  mentionSources?: readonly MentionSource[];
  composerFeatures?: readonly ComposerFeature[];
  composerHistory?: ComposerHistoryStorage;
};

const ChatContext = createContext<ChatProviderValue | undefined>(undefined);

export function ChatProvider({
  adapter,
  artifactKinds = [],
  artifactPersistence,
  children,
  commands,
  composerFeatures,
  composerHistory,
  dataRenderers = [],
  mentionSources,
  toolRenderers = [],
}: {
  adapter: ChatPlatformAdapter;
  artifactKinds?: readonly ArtifactRegistryItem[];
  artifactPersistence?: ArtifactPersistence;
  children: ReactNode;
  commands?: readonly ComposerCommand[];
  composerFeatures?: readonly ComposerFeature[];
  composerHistory?: ComposerHistoryStorage;
  dataRenderers?: readonly DataRenderer[];
  mentionSources?: readonly MentionSource[];
  toolRenderers?: readonly ToolRenderer[];
}) {
  const [state, setState] = useState<Pick<ChatProviderValue, 'manifest' | 'error' | 'loading'>>({
    loading: true,
  });

  useEffect(() => {
    const controller = new AbortController();

    void adapter
      .loadManifest({ signal: controller.signal })
      .then((manifest) => {
        if (!controller.signal.aborted) setState({ manifest, loading: false });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            error: error instanceof Error ? error : new Error(String(error)),
            loading: false,
          });
        }
      });

    return () => controller.abort();
  }, [adapter]);

  return (
    <ChatContext
      value={{
        adapter,
        ...state,
        toolRenderers,
        dataRenderers,
        commands,
        mentionSources,
        composerFeatures,
        composerHistory,
      }}
    >
      <ArtifactProvider persistence={artifactPersistence} registry={artifactKinds}>
        {children}
      </ArtifactProvider>
    </ChatContext>
  );
}

export function useChatProvider(): ChatProviderValue | undefined {
  return use(ChatContext);
}
