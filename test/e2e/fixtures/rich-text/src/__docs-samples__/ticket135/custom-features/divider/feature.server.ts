import { createNode, createServerFeature } from '@frogbotai/richtext-lexical';
import type { Field } from 'frogbot';

import { DividerMarkdownTransformer } from './markdownTransformer';
import { DividerNode, type SerializedDividerNode } from './nodes/DividerNode';

type DividerFeatureInput = {
  enableGraphQLPopulation?: boolean;
  style?: 'solid' | 'dashed';
};

type DividerFeatureProps = {
  style: 'solid' | 'dashed';
};

type DividerClientProps = DividerFeatureProps;

const dividerFields: Field[] = [
  {
    name: 'title',
    type: 'text',
    required: true,
  },
];

export const DividerFeature = createServerFeature<
  DividerFeatureInput,
  DividerFeatureProps,
  DividerClientProps
>({
  feature: ({ props, featureProviderMap }) => {
    if (!featureProviderMap.has('paragraph')) {
      throw new Error('DividerFeature requires the paragraph feature');
    }

    const sanitizedProps: DividerFeatureProps = {
      style: props?.style ?? 'solid',
    };

    return {
      ClientFeature:
        '/__docs-samples__/ticket135/custom-features/divider/feature.client#DividerClientFeature',
      clientFeatureProps: sanitizedProps,
      i18n: {
        de: { label: 'Trennlinie' },
        en: { label: 'Divider' },
      },
      markdownTransformers: [DividerMarkdownTransformer],
      nodes: [
        createNode<DividerNode, SerializedDividerNode>({
          converters: {
            html: {
              converter: () => '<hr>',
              nodeTypes: [DividerNode.getType()],
            },
          },
          getSubFields: () => dividerFields,
          getSubFieldsData: ({ node }) => node.fields,
          ...(props?.enableGraphQLPopulation
            ? {
                graphQLPopulationPromises: [
                  ({ node, populationPromises }) => {
                    populationPromises.push(
                      Promise.resolve().then(() => {
                        node.fields.title = node.fields.title.trim();
                      }),
                    );
                  },
                ],
              }
            : {}),
          hooks: {
            beforeValidate: [
              ({ node }) => ({
                ...node,
                fields: {
                  ...node.fields,
                  title: node.fields.title.trim(),
                },
              }),
            ],
          },
          node: DividerNode,
          validations: [
            ({ node }) => node.fields.title.length > 0 || 'Divider title must not be empty',
          ],
        }),
      ],
      sanitizedServerFeatureProps: sanitizedProps,
    };
  },
  key: 'divider',
});

export const LoadOrderDividerFeature = createServerFeature({
  feature: ({ featureProviderMap }) => {
    const fixedToolbarEnabled = featureProviderMap.has('toolbarFixed');

    return {
      i18n: {
        en: {
          label: fixedToolbarEnabled ? 'Insert divider' : 'Divider',
        },
      },
    };
  },
  key: 'dividerLoadOrder',
});
