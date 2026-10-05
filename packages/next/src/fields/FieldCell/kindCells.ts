import type { DefaultCellComponentProps } from 'payload';
import type { ComponentType } from 'react';

import { ChannelCell } from '../Channel/index.client.js';

export const kindCells: Record<string, ComponentType<DefaultCellComponentProps>> = {
  channel: ChannelCell,
};
