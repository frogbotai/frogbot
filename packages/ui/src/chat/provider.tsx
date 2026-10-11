'use client';

import type { ChatManifest } from '@frogbotai/protocol';
import { createContext, type ReactNode, use, useEffect, useState } from 'react';

import type { ChatPlatformAdapter } from './adapter.js';
import { ArtifactProvider } from './artifact.js';
import type { ArtifactPersistence, ArtifactRegistryItem } from './artifact-registry.js';
import type { ToolRenderer } from './tool-registry.js';

export type ChatProviderValue = {
  adapter: ChatPlatformAdapter;
  manifest?: ChatManifest | null;
  error?: Error;
  loading: boolean;
  toolRenderers: readonly ToolRenderer[];
};

const ChatContext = createContext<ChatProviderValue | undefined>(undefined);

export function ChatProvider({
  adapter,
  artifactKinds = [],
  artifactPersistence,
  children,
  toolRenderers = [],
}: {
  adapter: ChatPlatformAdapter;
  artifactKinds?: readonly ArtifactRegistryItem[];
  artifactPersistence?: ArtifactPersistence;
  children: ReactNode;
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
    <ChatContext value={{ adapter, ...state, toolRenderers }}>
      <ArtifactProvider persistence={artifactPersistence} registry={artifactKinds}>
        {children}
      </ArtifactProvider>
    </ChatContext>
  );
}

export function useChatProvider(): ChatProviderValue | undefined {
  return use(ChatContext);
}
