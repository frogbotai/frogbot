import type { SanitizedConfig } from 'payload';

import { createServerFeature } from '../../../utilities/createServerFeature.js';
import { createNode } from '../../typeUtilities.js';
import { MentionNode } from '../node.js';
import type { MentionFeatureClientProps, SerializedMentionNode } from '../shared.js';

/** Options for `MentionFeature()`. */
export type MentionFeatureProps = {
  /** The auth collection people are mentioned from. Default `admin.user`, else the only auth collection. */
  relationTo?: string;
};

function peopleOf(config: SanitizedConfig, relationTo: string | undefined) {
  const slug =
    relationTo ??
    config.admin?.user ??
    config.collections.find((collection) => collection.auth)?.slug ??
    'users';

  const collection = config.collections.find((candidate) => candidate.slug === slug);

  if (!collection) throw new Error(`[MentionFeature] Collection '${slug}' does not exist.`);

  return {
    api: `${config.serverURL ?? ''}${config.routes?.api ?? '/api'}`,
    relationTo: slug,
    titleField: collection.admin?.useAsTitle ?? 'email',
  };
}

/**
 * Mentions in any rich text field. Typing `@` lists the people the signed-in user may read, and
 * picking one inserts an inline node that stores the person's id and name: `@Sam`.
 */
export const MentionFeature = createServerFeature<
  MentionFeatureProps,
  MentionFeatureClientProps,
  MentionFeatureClientProps
>({
  feature: ({ config, props }) => {
    const people = peopleOf(config, props?.relationTo);

    return {
      ClientFeature: '@frogbotai/richtext-lexical/client#MentionFeatureClient',
      clientFeatureProps: people,
      nodes: [
        createNode<MentionNode, SerializedMentionNode>({
          node: MentionNode,
          validations: [
            ({ node }) =>
              node.relationTo === people.relationTo &&
              (typeof node.value === 'number' ||
                (typeof node.value === 'string' && node.value !== ''))
                ? true
                : 'A mention must name a person.',
          ],
        }),
      ],
      sanitizedServerFeatureProps: people,
    };
  },
  key: 'mention',
});
