import type { HTMLConverters } from '@payloadcms/richtext-lexical/html';
import type { SerializedLexicalNode } from '@payloadcms/richtext-lexical/lexical';
import type { PlaintextConverters } from '@payloadcms/richtext-lexical/plaintext';

/** What a mention stores: the mentioned user's id and collection, and their name when inserted. */
export type MentionData = {
  label: string;
  relationTo: string;
  value: number | string;
};

/** A mention in saved rich text, for example `{ type: 'mention', value: 7, label: 'Sam' }`. */
export type SerializedMentionNode = MentionData & SerializedLexicalNode & { type: 'mention' };

/** What the client feature receives: the REST API's base URL, where to search for people, and which field names them. */
export type MentionFeatureClientProps = {
  api: string;
  /** Pictures in the @ menu: Gravatar, or initials for `'default'` and custom avatar components. */
  avatar: 'default' | 'gravatar';
  relationTo: string;
  titleField: string;
};

/** A person's display name: their collection's title field, then email, then `#id`. */
export function personName(
  person: Record<string, unknown> & { id: number | string },
  titleField?: string,
): string {
  for (const value of [titleField ? person[titleField] : undefined, person.email]) {
    if (typeof value === 'string' && value.trim()) return value;
  }

  return `#${person.id}`;
}

/** The text a mention renders as, `@Sam`. */
export function mentionText(node: Pick<MentionData, 'label' | 'value'>): string {
  return `@${node.label || node.value}`;
}

/** The ids of every user a rich text value mentions, once each, in order. */
export function mentionedIds(value: unknown): (number | string)[] {
  const ids = new Map<string, number | string>();

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;

    const { children, type, value: id } = node as Record<string, unknown>;

    if (type === 'mention' && (typeof id === 'string' || typeof id === 'number')) {
      ids.set(String(id), id);
    }

    if (Array.isArray(children)) children.forEach(visit);
  };

  visit((value as { root?: unknown } | null | undefined)?.root);

  return [...ids.values()];
}

/** Plain-text converter: `convertLexicalToPlaintext({ converters: { ...MentionPlaintextConverter } })`. */
export const MentionPlaintextConverter: PlaintextConverters = {
  mention: ({ node }: { node: SerializedMentionNode }) => mentionText(node),
};

function escapeHTML(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** HTML converter, sync or async: `<span class="mention" data-id="7">@Sam</span>`. */
export const MentionHTMLConverter: HTMLConverters = {
  mention: ({ node }: { node: SerializedMentionNode }) =>
    `<span class="mention" data-id="${escapeHTML(String(node.value))}">${escapeHTML(mentionText(node))}</span>`,
};
