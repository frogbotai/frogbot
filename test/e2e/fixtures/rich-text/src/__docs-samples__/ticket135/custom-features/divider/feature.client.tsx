'use client';

import type {
  SlashMenuGroup,
  SlashMenuItem,
  ToolbarGroup,
  ToolbarGroupItem,
} from '@frogbotai/richtext-lexical';
import {
  createClientFeature,
  slashMenuBasicGroupWithItems,
  toolbarAddDropdownGroupWithItems,
} from '@frogbotai/richtext-lexical/client';
import { $isNodeSelection } from '@frogbotai/richtext-lexical/lexical';
import { createContext, type ReactNode } from 'react';

import { DividerIcon } from './components/DividerIcon';
import { DividerMarkdownTransformer } from './markdownTransformer';
import { $isDividerNode, DividerNode } from './nodes/DividerNode';
import { DividerPlugin, INSERT_DIVIDER_COMMAND } from './plugin';

export function dividerButtonGroup(items: ToolbarGroupItem[]): ToolbarGroup {
  return {
    items,
    key: 'dividerButtons',
    order: 30,
    type: 'buttons',
  };
}

export function dividerSlashMenuGroup(items: SlashMenuItem[]): SlashMenuGroup {
  return {
    items,
    key: 'layout',
    label: 'Layout',
  };
}

const dividerGroups = [
  toolbarAddDropdownGroupWithItems([
    {
      ChildComponent: DividerIcon,
      isActive: ({ selection }) => {
        if (!$isNodeSelection(selection)) {
          return false;
        }

        return selection.getNodes().some($isDividerNode);
      },
      key: 'divider',
      label: ({ i18n }) => i18n.t('lexical:divider:label'),
      onSelect: ({ editor }) => {
        editor.dispatchCommand(INSERT_DIVIDER_COMMAND, undefined);
      },
    },
  ]),
];

export const DividerStyleContext = createContext<'solid' | 'dashed'>('solid');

function DividerStyleProvider({ children }: { children: ReactNode }) {
  return <DividerStyleContext.Provider value="solid">{children}</DividerStyleContext.Provider>;
}

type DividerClientInput = {
  style?: 'solid' | 'dashed';
};

type DividerClientProps = {
  style: 'solid' | 'dashed';
};

export const DividerClientFeature = createClientFeature<DividerClientInput, DividerClientProps>(
  ({ props }) => {
    const sanitizedProps = {
      ...props,
      style: props.style ?? 'solid',
    };

    return {
      markdownTransformers: [DividerMarkdownTransformer],
      nodes: [DividerNode],
      plugins: [{ Component: DividerPlugin, position: 'normal' }],
      providers: [DividerStyleProvider],
      sanitizedClientFeatureProps: sanitizedProps,
      slashMenu: {
        groups: [
          slashMenuBasicGroupWithItems([
            {
              Icon: DividerIcon,
              key: 'divider',
              keywords: ['divider', 'line', 'separator'],
              label: ({ i18n }) => i18n.t('lexical:divider:label'),
              onSelect: ({ editor }) => {
                editor.dispatchCommand(INSERT_DIVIDER_COMMAND, undefined);
              },
            },
          ]),
        ],
      },
      toolbarFixed: { groups: dividerGroups },
      toolbarInline: { groups: dividerGroups },
    };
  },
);
