'use client';

import './index.css';

export type ChannelCellProps = {
  cellData?: unknown;
};

export function ChannelCell({ cellData }: ChannelCellProps) {
  if (typeof cellData !== 'string' || !cellData.trim()) return null;

  return <span className="channel-cell">{cellData}</span>;
}
