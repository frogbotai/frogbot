'use client';

import { createContext, type ReactNode, type RefObject, use } from 'react';

import type { ComposerHistory } from './history.js';

/** A `/` command. Picking one without `arguments` runs it; with `arguments`, `/id rest` runs it on send. */
export interface ComposerCommand {
  id: string;
  title: string;
  description?: string;
  arguments?: boolean;
  disabled?: boolean;
  /** Mid-turn, waits in the chat's queue as its `/` text instead of running at once. */
  queue?: boolean;
  execute: (input: string) => void | Promise<void>;
}

/** One result an `@` mention source offers. */
export interface MentionItem {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  data?: Record<string, unknown>;
}

/** Where `@` mentions come from; `search` runs on each keystroke and is aborted by the next. */
export interface MentionSource {
  id: string;
  search: (
    query: string,
    options: { signal: AbortSignal },
  ) => readonly MentionItem[] | Promise<readonly MentionItem[]>;
}

export interface ComposerEditorContextValue {
  submit: () => void;
  escape: () => boolean;
  commands?: readonly ComposerCommand[];
  runCommand?: (command: ComposerCommand, input: string) => void;
  mentionSources?: readonly MentionSource[];
  history?: ComposerHistory;
  attachments?: {
    add: (files: File[]) => void;
    addPaste: (text: string) => void;
    storage: boolean;
  };
}

export const ComposerEditorContext = createContext<RefObject<ComposerEditorContextValue>>({
  current: { submit: () => undefined, escape: () => false },
});

export function useComposerEditor() {
  return use(ComposerEditorContext);
}
