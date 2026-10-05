import type { DefaultCellComponentProps } from 'payload';
import type { ComponentType } from 'react';

import { AICell } from '../AI/index.client.js';
import { BarcodeCell } from '../Barcode/index.client.js';
import { ChannelCell } from '../Channel/index.client.js';
import { DurationCell } from '../Duration/index.client.js';
import { MoneyCell } from '../Money/index.client.js';
import { PercentCell } from '../Percent/index.client.js';
import { PhoneCell } from '../Phone/index.client.js';
import { RatingCell } from '../Rating/index.client.js';
import { UrlCell } from '../Url/index.client.js';

export const kindCells: Record<string, ComponentType<DefaultCellComponentProps>> = {
  ai: AICell,
  barcode: BarcodeCell,
  channel: ChannelCell,
  duration: DurationCell,
  money: MoneyCell,
  percent: PercentCell,
  phone: PhoneCell,
  rating: RatingCell,
  url: UrlCell,
};
