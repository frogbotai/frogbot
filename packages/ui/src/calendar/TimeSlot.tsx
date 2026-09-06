'use client';

import type { CSSProperties, PointerEvent } from 'react';

export function TimeSlot({
  label,
  onPointerDown,
  style,
}: {
  label?: string;
  onPointerDown?: (event: PointerEvent) => void;
  style?: CSSProperties;
}) {
  return (
    <div className="frog-calendar__slot" onPointerDown={onPointerDown} style={style}>
      {label ? <span className="frog-calendar__slot-label">{label}</span> : null}
    </div>
  );
}
