'use client';

import { Button, ChevronIcon, Popup, PopupList } from '@payloadcms/ui';

import { ROW_HEIGHTS, type RowHeight } from './grid.js';
import { useListGrid } from './ListGrid.client.js';

const labels: Record<RowHeight, string> = { compact: 'Compact', default: 'Default', tall: 'Tall' };

/** The list toolbar's "Row height" menu, built like Payload's group-by control. */
export function RowHeightControl() {
  const { rowHeight, setRowHeight } = useListGrid();

  return (
    <Popup
      className="fb-row-height"
      horizontalAlign="right"
      id="row-height"
      popupType="menu"
      render={({ close }) => (
        <PopupList.RadioGroup>
          {ROW_HEIGHTS.map((height) => (
            <PopupList.RadioGroupItem
              active={height === rowHeight}
              key={height}
              onClick={() => {
                setRowHeight(height);
                close();
              }}
            >
              {labels[height]}
            </PopupList.RadioGroupItem>
          ))}
        </PopupList.RadioGroup>
      )}
      renderButton={({ active, onClick, onKeyDown, ...ariaProps }) => (
        <Button
          buttonStyle="secondary"
          extraButtonProps={{ onKeyDown }}
          icon={<ChevronIcon direction={active ? 'up' : 'down'} size={16} />}
          id="toggle-row-height"
          onClick={onClick}
          selected={active || rowHeight !== 'default'}
          size="medium"
          {...ariaProps}
        >
          Row height
        </Button>
      )}
      verticalAlign="bottom"
    />
  );
}
