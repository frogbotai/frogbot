import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getEditor,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  type LexicalNode,
} from 'lexical';

import type { ComposerAttachment } from '../attachments.js';
import { $createMentionNode, $isMentionNode, MentionNode } from './mention-node.js';

/** A mention chip in a prompt; `start` and `end` are the offsets of its `@label` in `text`. */
export interface ComposerMention {
  source: string;
  id: string;
  label: string;
  start: number;
  end: number;
  data?: Record<string, unknown>;
}

/** What the composer holds: plain text, and the mention chips inside it. */
export interface ComposerPrompt {
  text: string;
  mentions: readonly ComposerMention[];
}

export const emptyPrompt: ComposerPrompt = { text: '', mentions: [] };

function isMention(value: unknown): value is ComposerMention {
  const mention = value as Partial<ComposerMention> | null;

  return (
    typeof mention === 'object' &&
    mention !== null &&
    typeof mention.label === 'string' &&
    typeof mention.start === 'number' &&
    typeof mention.end === 'number'
  );
}

function $walk(visit: (node: LexicalNode, offset: number) => void) {
  let offset = 0;

  $getRoot()
    .getChildren()
    .forEach((block, index) => {
      if (index > 0) offset += 1;

      for (const node of $isElementNode(block) ? block.getChildren() : [block]) {
        visit(node, offset);
        offset += node.getTextContentSize();
      }
    });

  return offset;
}

/** Reads the editor's prompt. Call inside `editor.read` or `editor.update`. */
export function $readPrompt(): ComposerPrompt {
  let text = '';
  const mentions: ComposerMention[] = [];

  $getRoot()
    .getChildren()
    .forEach((block, index) => {
      if (index > 0) text += '\n';

      for (const node of $isElementNode(block) ? block.getChildren() : [block]) {
        const start = text.length;

        text += node.getTextContent();

        if ($isMentionNode(node)) mentions.push({ ...node.getMention(), start, end: text.length });
      }
    });

  return { text, mentions };
}

/** Replaces the editor's content with a prompt, and puts the caret at its end unless `select` is false. */
export function $writePrompt(prompt: ComposerPrompt, select = true) {
  const root = $getRoot();
  const paragraph = $createParagraphNode();
  const chips = $getEditor().hasNodes([MentionNode]);
  let offset = 0;

  const appendText = (text: string) =>
    text.split('\n').forEach((line, index) => {
      if (index > 0) paragraph.append($createLineBreakNode());
      if (line) paragraph.append($createTextNode(line));
    });

  const mentions = prompt.mentions.filter(isMention).sort((a, b) => a.start - b.start);

  for (const { start, end, ...mention } of mentions) {
    const valid = chips && start >= offset && prompt.text.slice(start, end) === `@${mention.label}`;

    if (!valid) continue;

    appendText(prompt.text.slice(offset, start));
    paragraph.append($createMentionNode(mention));
    offset = end;
  }

  appendText(prompt.text.slice(offset));
  root.clear();
  root.append(paragraph);

  if (select) paragraph.selectEnd();
}

/** The caret's offset in the prompt text, or `undefined` without a collapsed selection. */
export function $caretOffset(): number | undefined {
  const selection = $getSelection();

  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return undefined;

  const { anchor } = selection;
  let caret: number | undefined;

  const end = $walk((node, offset) => {
    if (caret !== undefined) return;

    if (anchor.type === 'text' && anchor.key === node.getKey()) caret = offset + anchor.offset;

    const parent = node.getParent();

    if (anchor.type === 'element' && parent?.getKey() === anchor.key) {
      if (node.getIndexWithinParent() === anchor.offset) caret = offset;
    }
  });

  return caret ?? end;
}

/** The message parts a prompt and its attachments send: attachments, the text, then one `data-mention` part per chip. */
export function composerParts(prompt: ComposerPrompt, attachments: readonly ComposerAttachment[]) {
  return [
    ...attachments.map((attachment) =>
      'type' in attachment && attachment.type === 'paste'
        ? {
            type: 'data-paste' as const,
            data: { text: attachment.text, filename: attachment.filename },
          }
        : { type: 'file-reference' as const, ...attachment },
    ),
    ...(prompt.text ? [{ type: 'text' as const, text: prompt.text }] : []),
    ...prompt.mentions.map((mention) => ({ type: 'data-mention' as const, data: mention })),
  ];
}
