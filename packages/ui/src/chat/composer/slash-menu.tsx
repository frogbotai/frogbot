'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

import { type ComposerCommand, useComposerEditor } from './context.js';
import { ComposerMenu, type ComposerMenuItem } from './menu.js';
import { $writePrompt, emptyPrompt } from './prompt.js';

const SLASH = /^\/(\S*)$/;

const COMMAND = /^\/(\S+)(?:\s+([\s\S]*))?$/;

type CommandItem = ComposerMenuItem & { command: ComposerCommand };

export function matchCommand(text: string, commands: readonly ComposerCommand[] = []) {
  const [, id, rest = ''] = COMMAND.exec(text.trim()) ?? [];
  const command = commands.find((candidate) => candidate.id === id);

  return command?.arguments && !command.disabled ? { command, input: rest.trim() } : undefined;
}

export function SlashMenuPlugin() {
  const [editor] = useLexicalComposerContext();
  const context = useComposerEditor();

  return (
    <ComposerMenu<CommandItem>
      label="Commands"
      match={({ text }) => SLASH.exec(text)?.[1] ?? null}
      search={(query) => {
        const needle = query.toLowerCase();

        return (context.current.commands ?? [])
          .filter((command) => !command.disabled)
          .filter(
            (command) =>
              command.id.toLowerCase().includes(needle) ||
              command.title.toLowerCase().includes(needle),
          )
          .map((command) => ({
            key: command.id,
            label: `/${command.id}`,
            description: command.description
              ? `${command.title}: ${command.description}`
              : command.title,
            command,
          }));
      }}
      pick={({ command }) => {
        if (command.arguments) {
          editor.update(() => $writePrompt({ text: `/${command.id} `, mentions: [] }));

          return;
        }

        editor.update(() => $writePrompt(emptyPrompt));
        context.current.runCommand?.(command, '');
      }}
    />
  );
}
