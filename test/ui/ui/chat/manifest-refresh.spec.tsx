import type { ChatManifest } from '@frogbotai/protocol';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChatPlatformAdapter } from '../../../../packages/ui/src/chat/adapter';
import { ChatProvider, useChatProvider } from '../../../../packages/ui/src/chat/provider';

function manifestWith(...models: string[]): ChatManifest {
  return {
    defaultAgent: 'general',
    agents: [
      {
        slug: 'general',
        label: 'General',
        source: 'config',
        defaultModel: models[0],
        models,
      },
    ],
    transcribe: false,
  };
}

function adapterLoading(loadManifest: ChatPlatformAdapter['loadManifest']): ChatPlatformAdapter {
  return { loadManifest } as ChatPlatformAdapter;
}

const renders = vi.fn();

function Models() {
  const provider = useChatProvider();

  renders(provider);

  if (provider?.loading) return <p>loading</p>;

  return <p>{provider?.manifest?.agents[0].models.join(', ') ?? 'none'}</p>;
}

async function focusWindow() {
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  cleanup();
  renders.mockClear();
});

describe('ChatProvider manifest refresh', () => {
  it('refetches the manifest on focus and shows a newly enabled model', async () => {
    const loadManifest = vi
      .fn<ChatPlatformAdapter['loadManifest']>()
      .mockResolvedValueOnce(manifestWith('openai/gpt-5'))
      .mockResolvedValueOnce(manifestWith('openai/gpt-5', 'google/gemini'));

    render(
      <ChatProvider adapter={adapterLoading(loadManifest)}>
        <Models />
      </ChatProvider>,
    );

    expect(await screen.findByText('openai/gpt-5')).toBeTruthy();

    await focusWindow();

    expect(loadManifest).toHaveBeenCalledTimes(2);
    expect(screen.getByText('openai/gpt-5, google/gemini')).toBeTruthy();
    expect(renders.mock.calls.filter(([value]) => value?.loading).length).toBe(1);
  });

  it('keeps the old manifest while the refetch is pending and when it fails', async () => {
    let rejectRefetch: (error: Error) => void = () => undefined;
    const loadManifest = vi
      .fn<ChatPlatformAdapter['loadManifest']>()
      .mockResolvedValueOnce(manifestWith('openai/gpt-5'))
      .mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectRefetch = reject;
        }),
      );

    render(
      <ChatProvider adapter={adapterLoading(loadManifest)}>
        <Models />
      </ChatProvider>,
    );

    await screen.findByText('openai/gpt-5');
    await focusWindow();

    expect(screen.getByText('openai/gpt-5')).toBeTruthy();

    await act(async () => {
      rejectRefetch(new Error('offline'));
      await Promise.resolve();
    });

    expect(screen.getByText('openai/gpt-5')).toBeTruthy();
    expect(renders.mock.calls.at(-1)?.[0]?.error).toBeUndefined();
  });

  it('keeps the same manifest object when the refetch is unchanged', async () => {
    const loadManifest = vi
      .fn<ChatPlatformAdapter['loadManifest']>()
      .mockImplementation(() => Promise.resolve(manifestWith('openai/gpt-5')));

    render(
      <ChatProvider adapter={adapterLoading(loadManifest)}>
        <Models />
      </ChatProvider>,
    );

    await screen.findByText('openai/gpt-5');

    const before = renders.mock.calls.at(-1)?.[0]?.manifest;

    await focusWindow();

    expect(loadManifest).toHaveBeenCalledTimes(2);
    expect(renders.mock.calls.at(-1)?.[0]?.manifest).toBe(before);
  });

  it('aborts a pending refetch when the provider unmounts', async () => {
    const signals: AbortSignal[] = [];
    const loadManifest = vi.fn<ChatPlatformAdapter['loadManifest']>(({ signal }) => {
      signals.push(signal);

      return signals.length === 1
        ? Promise.resolve(manifestWith('openai/gpt-5'))
        : new Promise(() => undefined);
    });

    const { unmount } = render(
      <ChatProvider adapter={adapterLoading(loadManifest)}>
        <Models />
      </ChatProvider>,
    );

    await screen.findByText('openai/gpt-5');
    await focusWindow();
    unmount();

    expect(signals[1].aborted).toBe(true);
  });
});
