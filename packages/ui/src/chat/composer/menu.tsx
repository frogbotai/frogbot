'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import {
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
} from 'lexical';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { composing } from './keys.js';
import { $caretOffset, $readPrompt } from './prompt.js';

export interface ComposerMenuItem {
  key: string;
  label: ReactNode;
  description?: ReactNode;
  group?: string;
  icon?: ReactNode;
}

export interface ComposerMenuProps<T extends ComposerMenuItem> {
  label: string;
  match: (input: { text: string; before: string }) => string | null;
  search: (query: string, signal: AbortSignal) => readonly T[] | Promise<readonly T[]>;
  pick: (item: T, query: string) => void;
}

type MenuState<T> = { query: string | null; items: readonly T[]; active: number };

function groups<T extends ComposerMenuItem>(items: readonly T[]) {
  const grouped: { group?: string; entries: { item: T; index: number }[] }[] = [];

  items.forEach((item, index) => {
    const last = grouped.at(-1);

    if (last && last.group === item.group) last.entries.push({ item, index });
    else grouped.push({ group: item.group, entries: [{ item, index }] });
  });

  return grouped;
}

export function ComposerMenu<T extends ComposerMenuItem>(props: ComposerMenuProps<T>) {
  const [editor] = useLexicalComposerContext();
  const id = useId();
  const [form, setForm] = useState<HTMLElement | null>(null);
  const [state, setState] = useState<MenuState<T>>({ query: null, items: [], active: 0 });
  const latest = useRef({ props, state });

  latest.current = { props, state };

  const open = state.query !== null && state.items.length > 0;

  useEffect(
    () => editor.registerRootListener((root) => setForm(root?.closest('form') ?? null)),
    [editor],
  );

  useEffect(() => {
    let current: string | null = null;
    let controller: AbortController | undefined;

    const update = () => {
      const query = editor.getEditorState().read(() => {
        const caret = $caretOffset();

        if (caret === undefined) return null;

        const { text } = $readPrompt();

        return latest.current.props.match({ text, before: text.slice(0, caret) });
      });

      if (query === current) return;

      current = query;
      controller?.abort();

      if (query === null) {
        setState({ query: null, items: [], active: 0 });

        return;
      }

      const search = new AbortController();

      controller = search;
      setState((previous) => ({ ...previous, query, active: 0 }));

      void Promise.resolve()
        .then(() => latest.current.props.search(query, search.signal))
        .then(
          (items) => {
            if (!search.signal.aborted) setState({ query, items, active: 0 });
          },
          () => {
            if (!search.signal.aborted) setState({ query, items: [], active: 0 });
          },
        );
    };

    return mergeRegister(editor.registerUpdateListener(update), () => controller?.abort());
  }, [editor]);

  useEffect(() => {
    const root = editor.getRootElement();

    if (!root || !open) return;

    root.setAttribute('aria-controls', id);
    root.setAttribute('aria-activedescendant', `${id}-${state.active}`);

    return () => {
      root.removeAttribute('aria-controls');
      root.removeAttribute('aria-activedescendant');
    };
  }, [editor, id, open, state.active]);

  useEffect(() => {
    const isOpen = () =>
      latest.current.state.query !== null && latest.current.state.items.length > 0;

    const move = (event: KeyboardEvent | null, step: number) => {
      if (!isOpen()) return false;

      event?.preventDefault();

      setState((previous) => ({
        ...previous,
        active: (previous.active + step + previous.items.length) % previous.items.length,
      }));

      return true;
    };

    const choose = (event: KeyboardEvent | null) => {
      const { state: current, props: currentProps } = latest.current;
      const item = current.items[current.active];

      if (!isOpen() || !item || current.query === null || composing(event)) return false;

      event?.preventDefault();
      currentProps.pick(item, current.query);

      return true;
    };

    return mergeRegister(
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (event) => move(event, 1),
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (event) => move(event, -1),
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          const key = event.key.toLowerCase();

          if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
          if (key === 'n') return move(event, 1);
          if (key === 'p') return move(event, -1);

          return false;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(KEY_TAB_COMMAND, choose, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => (event?.shiftKey ? false : choose(event)),
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        (event) => {
          if (!isOpen()) return false;

          event.preventDefault();
          setState((previous) => ({ ...previous, items: [] }));

          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor]);

  if (!form || !open || state.query === null) return null;

  const query = state.query;

  return createPortal(
    <div className="fb-composer-menu" id={id} role="listbox" aria-label={props.label}>
      {groups(state.items).map(({ group, entries }) => (
        <div
          key={`${group ?? ''}-${entries[0]?.index ?? 0}`}
          className="fb-composer-menu__group"
          role="group"
          aria-label={group}
        >
          {group && (
            <div className="fb-composer-menu__heading" aria-hidden>
              {group}
            </div>
          )}
          {entries.map(({ item, index }) => (
            <div
              key={item.key}
              id={`${id}-${index}`}
              role="option"
              tabIndex={-1}
              aria-selected={index === state.active}
              className="fb-composer-menu__option"
              onMouseDown={(event) => {
                event.preventDefault();
                props.pick(item, query);
              }}
              onMouseEnter={() => setState((previous) => ({ ...previous, active: index }))}
            >
              {item.icon && <span className="fb-composer-menu__icon">{item.icon}</span>}
              <span className="fb-composer-menu__label">{item.label}</span>
              {item.description && (
                <span className="fb-composer-menu__description">{item.description}</span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>,
    form,
  );
}
