'use client';

import './mention.css';

import { createClientFeature } from '@payloadcms/richtext-lexical/client';

import { MentionNode } from '../node.js';
import type { MentionFeatureClientProps } from '../shared.js';
import { MentionPlugin } from './MentionPlugin.js';

/** The client half of `MentionFeature()`. */
export const MentionFeatureClient = createClientFeature<MentionFeatureClientProps>({
  nodes: [MentionNode],
  plugins: [{ Component: MentionPlugin, position: 'normal' }],
});
