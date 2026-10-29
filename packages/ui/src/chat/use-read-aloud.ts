'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChatPlatformAdapter } from './adapter.js';
import { speechChunks, speechText } from './speech-text.js';

export type ReadAloudStatus = 'idle' | 'loading' | 'playing';

export type ReadAloud = {
  activeId?: string;
  status: ReadAloudStatus;
  error?: { id: string; message: string };
  toggle: (id: string, markdown: string) => void;
  stop: () => void;
};

const ERROR_MESSAGE = "Couldn't read this message aloud.";

type Session = { id: string; controller: AbortController; urls: Set<string> };

function playThrough(audio: HTMLAudioElement, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener('ended', done);
      audio.removeEventListener('error', fail);
      signal.removeEventListener('abort', done);
    };

    const done = () => {
      cleanup();
      resolve();
    };

    const fail = () => {
      cleanup();
      reject(new Error('Audio playback failed'));
    };

    audio.addEventListener('ended', done);
    audio.addEventListener('error', fail);
    signal.addEventListener('abort', done);
  });
}

/**
 * Reads one message aloud at a time: chunks its speakable text, fetches each chunk while the one
 * before it plays, and keeps the last message's audio for an instant replay.
 */
export function useReadAloud({ speak }: { speak?: ChatPlatformAdapter['speak'] }): ReadAloud {
  const [activeId, setActiveId] = useState<string>();
  const [status, setStatus] = useState<ReadAloudStatus>('idle');
  const [error, setError] = useState<ReadAloud['error']>();
  const session = useRef<Session | undefined>(undefined);
  const audioRef = useRef<HTMLAudioElement | undefined>(undefined);
  const cache = useRef<{ key: string; blobs: Blob[] } | undefined>(undefined);

  const stop = useCallback(() => {
    const current = session.current;

    session.current = undefined;
    current?.controller.abort();
    current?.urls.forEach((url) => URL.revokeObjectURL(url));

    const audio = audioRef.current;

    if (audio && current) {
      audio.pause();
      audio.removeAttribute('src');
    }

    setActiveId(undefined);
    setStatus('idle');
  }, []);

  const play = useCallback(
    async (id: string, markdown: string, current: Session) => {
      if (!speak) return;

      const text = speechText(markdown);
      const chunks = speechChunks(text);
      const key = `${id}\u0000${text}`;
      const cached = cache.current?.key === key ? cache.current.blobs : undefined;
      const { signal } = current.controller;
      const fetchChunk = (index: number): Promise<Blob> => {
        const request = cached ? Promise.resolve(cached[index]) : speak(chunks[index], { signal });

        request.catch(() => undefined);

        return request;
      };

      const blobs: Blob[] = [];

      try {
        let next = fetchChunk(0);

        for (let index = 0; index < chunks.length; index++) {
          const blob = await next;

          if (signal.aborted) return;

          blobs.push(blob);

          if (blobs.length === chunks.length) cache.current = { key, blobs };

          const url = URL.createObjectURL(blob);
          const audio = (audioRef.current ??= new Audio());

          current.urls.add(url);
          audio.src = url;
          await audio.play();

          if (signal.aborted) return;

          if (index + 1 < chunks.length) next = fetchChunk(index + 1);

          setStatus('playing');
          await playThrough(audio, signal);
          current.urls.delete(url);
          URL.revokeObjectURL(url);

          if (signal.aborted) return;
        }

        if (session.current === current) stop();
      } catch {
        if (signal.aborted || session.current !== current) return;

        stop();
        setError({ id, message: ERROR_MESSAGE });
      }
    },
    [speak, stop],
  );

  const toggle = useCallback(
    (id: string, markdown: string) => {
      const wasActive = session.current?.id === id;

      stop();
      setError(undefined);

      if (wasActive || !speak) return;

      const current: Session = { id, controller: new AbortController(), urls: new Set() };

      session.current = current;
      setActiveId(id);
      setStatus('loading');
      void play(id, markdown, current);
    },
    [play, speak, stop],
  );

  useEffect(
    () => () => {
      stop();
      cache.current = undefined;
    },
    [stop],
  );

  return { activeId, status, error, toggle, stop };
}
